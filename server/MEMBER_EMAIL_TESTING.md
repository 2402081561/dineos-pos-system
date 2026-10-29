# Member registration email — local implementation, 2026-10-27

## Current status

The intended flow is email → Supabase six-digit OTP → verified identity →
committed DineOS membership → a separate bilingual welcome email. The welcome
uses the current configured shop name and member ID. It is a transactional
confirmation, not a promotional subscription, and contains no OTP, auth token,
telephone, order history, or private session URL.

Code and isolated database/mock-provider tests are ready. On 2026-10-27, one
explicitly approved Resend delivery test using sample membership data was
accepted by the provider and the user confirmed it arrived directly in Gmail.
The secret was entered privately by the user into the ignored backend `.env`;
no credential was pasted into chat. Only the approved test recipient was set.
Normal OTP/welcome sending flags remain false. **Hosted Supabase settings,
production database, Netlify, Render and the Git remote have not been changed.**
Real OTP delivery and the complete membership flow remain unverified. A working
Resend welcome test is not proof that Gmail SMTP or Gmail API is configured.

## Gmail route approved for investigation (2026-10-28)

The user approved using their existing personal Gmail as the initial sender,
with the option to switch to a dedicated store Gmail or verified domain later.
No paid subscription, deployment or public signup was authorized.

- First establish Gmail SMTP eligibility for Supabase OTP delivery. The user
  must handle Google sign-in, two-step verification and app-password creation
  privately; never request their Google password, OTP or app password in chat.
  App-password access is broader than a send-only OAuth scope, so do not ask for
  one until confirming the account supports this method and explaining its use.
- Any eventual SMTP credential entry into hosted Supabase needs explicit
  confirmation naming that destination. It must not go into frontend variables
  or the repository. Auth SMTP changes also affect other Auth mail in the same
  project; capture existing non-secret settings and keep recovery templates.
- The existing backend welcome transport is **still Resend**, not Gmail. To
  send welcomes from Gmail on free Render, implement Gmail API with send-only
  OAuth authorization and an appropriate lost-response policy. Do not simply
  put Gmail SMTP credentials on Render or reuse Resend's idempotency assumption
  for Gmail. Gmail API has no equivalent supported send idempotency header.
- Gmail OAuth authorization, refresh-token expiry and project consent settings
  must be tested; do not claim permanent unattended delivery after a short test.
  Google OAuth projects in external Testing mode can have seven-day refresh
  token expiry for Gmail scopes.
- Ordinary Gmail's published daily limit is roughly 500 messages shared across
  SMTP/API/manual use, not an additional quota for each channel. Signup OTP plus
  one welcome consumes two messages; later OTP login consumes one. Supabase
  hourly/cooldown limits also apply. A dedicated sender separates personal and
  store mail; a different ordinary Gmail does not inherently raise its limit.
- Changing the outgoing sender does not change verified customer identities,
  member IDs, points or orders. Pending jobs need provider-specific review
  before any sender/provider switch; never bulk-replay accepted mail.

Gmail setup/credentials and Gmail integration tests are not complete. The
Resend implementation is preserved while this alternative is evaluated.

## Test delivery without a purchased domain

1. Use an inbox you control that is already an authorized Supabase project-team
   recipient. Supabase's default Auth mailer cannot send OTPs to arbitrary
   customers and has strict limits (currently 2/hour; verify before testing).
2. Create a Resend account using **that same inbox**. The `onboarding@resend.dev`
   test sender is restricted to the Resend account owner's email. It cannot be
   used as the restaurant's public customer mail service.
3. Keep secrets out of chat, screenshots, Git, frontend code and all `VITE_`
   variables. Store a send-only Resend API key in backend environment settings.
   Supabase publishable keys are not Resend keys. Do not request Gmail passwords
   or give this project mailbox-reading access.
4. Before any real end-to-end test, separately confirm the target database and
   obtain approval for its backup/schema changes. Current localhost uses a
   remote database; running localhost does NOT isolate its writes. Migration
   033 is additive and independent of pending 032, but the **general schema
   runner applies every pending migration**, including 032. Do not run that
   command without approval for its full scope.
5. Review the `email-templates/member-code.html` draft before pasting it into
   hosted Supabase templates. Ensure the registration and later sign-in email
   paths both produce a numeric code. Keep confirmation on and use a six-digit
   OTP with a short expiry/cooldown. Do not disable verification to make a test
   pass. Hosted template edits are cloud changes requiring confirmation.
6. The eventual backend test configuration is below. It is a **setup example**,
   not an instruction to enable it against the current remote database now:

   ```dotenv
   MEMBER_EMAIL_MODE=test
   MEMBER_EMAIL_TEST_RECIPIENT=your-authorized-test-inbox@example.com
   MEMBER_EMAIL_OTP_ENABLED=true
   MEMBER_WELCOME_EMAIL_ENABLED=true
   MEMBER_EMAIL_FROM=DineOS <onboarding@resend.dev>
   RESEND_API_KEY=store-your-real-key-privately-here
   ```

   Keep existing Supabase project URL/publishable key; do not use service-role
   keys. Restart the API only after the DB and sender are ready. Missing/invalid
   test recipient disables member email auth. Test mode rejects other verified
   identities at the API, and the welcome transport also rejects every other
   recipient before making a network request. The test inbox is not published
   in public configuration. Supabase Auth itself must still be configured with
   the appropriate recipient/rate limits; the application flag does not disable
   that provider's public Auth endpoint.
7. Send one OTP, complete verification/registration, then check the same inbox
   (including Spam/Junk) for the separate welcome. A provider `accepted` result
   is not proof of inbox delivery. Confirm it manually before claiming success.

The initial test setup deliberately leaves Supabase's existing SMTP unchanged.
When a verified domain is available, configure custom SMTP for Auth delivery
and a verified sender for welcome messages, then review limits/CAPTCHA before
explicitly enabling live mode. Render free services block common SMTP ports,
so the backend welcome sender uses Resend's HTTPS API; OTP mail is sent by
Supabase, not by opening SMTP connections from Render.

## Reliability / data scope

- Migration `033_member_welcome_emails.sql` adds one RLS-protected private
  outbox table with a unique member ID. It does not edit orders, payments,
  receipts, points or existing memberships, and does not mass-email old members.
- The registration route adds a job only for a newly inserted member, in the
  same transaction; an API retry reads that job. Login never adds welcome mail.
- An email-outbox SQL error rolls back to a savepoint, preserving the valid
  membership. Its response says email is unavailable, not registration failed.
  Such a missing job is not silently backfilled to old members; an operator
  should inspect it before explicitly repairing it.
- Only committed jobs are visible to workers. An atomic database claim and
  lease coordinate multiple API instances. No delivery is performed by a
  browser or held open in the registration HTTP response.
- Provider request body is frozen in the job; retry always uses the same
  `member-welcome/<job UUID>` key. A lost response/DB acknowledgment can retry
  safely within the provider's 24-hour deduplication period. After 23 hours it
  blocks for operator review rather than risk sending twice. Keep the same
  provider account while jobs are pending; do not reset timestamps, replace
  keys, delete jobs or manually resend ambiguous messages.
- Known permanent errors stop. Transient/uncertain errors retry at five-minute
  intervals, at most six normal attempts. Leases recover after process restarts.
  `accepted` means provider accepted, not delivered. Rejected/expired jobs require
  checking the provider dashboard before any manual resend; there is no public
  resend endpoint.
- Render free-service sleep can pause the in-process worker. Pending jobs resume
  when the API wakes; this is best-effort test delivery, not a guaranteed delivery
  time. A production launch should review hosting/worker availability as well.
- When disabled (the default), the worker does not read its table, queue mail
  or send HTTP. Logs contain error codes only, not recipients/provider bodies.
- Guest ordering remains available; failed welcome mail never blocks ordering.
- This is a registration-email implementation, not an announcement that the
  currently disabled membership feature is ready for unrestricted public use.

## Verification commands

```sh
node --test server/tests/member-welcome.test.js server/tests/member-email-auth.test.js tests/memberEmailOtp.test.mjs
DINEOS_LOCAL_WELCOME_TEST=1 node --test server/tests/member-welcome-local.test.js
```

The opt-in PostgreSQL test creates and stops a private empty local cluster,
applies schema files, and uses only a mocked HTTPS provider. It deliberately
does not load `.env` or `DATABASE_URL`; it sends no real messages. It verifies
atomic registration, duplicate signup, savepoint recovery, multiple workers,
fixed retry payload/key, restart lease recovery, lost DB acknowledgments,
expiry blocking, and private-table permissions.

Official references:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://render.com/docs/free
