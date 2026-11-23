# Customer email OTP setup — 18 November 2026

## Current status — 19 November (supersedes historical notes below)

Google send-only authorization has completed and the private grant was saved by
the local helper. Gmail welcome transport is now implemented locally; no real
welcome receipt has yet been confirmed. See `gmail-welcome-email.md`.

The actual customer UI is available at `http://127.0.0.1:4187/join?table=1`
through the ignored `customer-membership-preview.mjs` launcher. It creates an
isolated PostgreSQL cluster and a fictional Table 1, enables membership in that
local database only, and uses the hosted public Supabase Auth configuration for
real OTP. A user-requested signup sends real Gmail welcome mail. Arbitrary user
emails are allowed only in this loopback preview (email mode `live`); this does
not enable public production membership. Auth accounts can be created in the
hosted Supabase project, while DineOS member/visit data stays local. No passwords,
OTPs, Auth tokens or private OAuth contents are logged by the launcher.

The preview retains its isolated database privately on stop, pending user review;
it does not delete registration records automatically or connect to production
business data. No registration has been performed by the agent. Registration,
receipt and repeat login are awaiting the user's own interaction.

Release remains gated on that acceptance, Gmail Testing-mode token lifetime,
secure hosted credential provisioning, the pre-existing dependency advisory,
and full release regressions. No Git push or deployment has occurred.

## Gmail welcome authorization preparation — 19 November

The operator chose the dedicated Gmail sender for welcome mail as well as OTP.
They created the `dineos-email` Google Cloud project, enabled Gmail API, created
External/Testing OAuth configuration, added the sender as the only test user,
and saved only `gmail.send` (observed). They created a Web client, rotated a
secret exposed in a screenshot, reported saving the new JSON and disabling the
old secret, and reported saving the callback
`http://127.0.0.1:4186/oauth/callback`. Rotation and callback have not been
re-inspected because the credential page can expose secrets.

Installed Google's `google-auth-library` in the local backend dependency set.
Prepared `.local-tools/email-tests/gmail-authorization.mjs`: loopback-only,
fixed project/client/callback, same-origin/nonce/cookie checks, state and PKCE,
one-use callback, 30-minute listener lifetime, exact send-only scope validation,
no secret/code/request logging, private owner-only Git-ignored token file after
manual user consent, no mailbox read/send or database operations. Initial page
and pure rejection checks passed; real OAuth is still pending. User must select
their NEW secret JSON in the local page; never request its contents in chat.

Google's Testing-mode refresh tokens for this Gmail scope normally expire after
seven days. Do not call this a permanent unattended setup. No provider switch,
real welcome delivery, production env change, database edit or deployment has
been performed; the actual welcome sender still uses Resend until integration.

Dependency audit: existing `body-parser` 2.3.0 has high-severity advisory
GHSA-27r3-jxmh-p828. The previously committed lockfile also uses 2.3.0; it was not
introduced by the Google library. No automatic audit fix was run. Verify a
targeted fix and regressions before release.

## Hosted configuration

- The operator saved custom SMTP in the Dine-OS Supabase project. The enabled
  SMTP switch was observed afterwards. Credentials were not read or copied.
- Saved numeric-code templates for **Magic link or OTP** and **Confirm sign up**.
  Both use `{{ .Token }}` instead of a sign-in/confirmation URL. This changes
  project-wide templates, not just the local application. Staff password
  recovery and invitation templates were not edited.
- After explicitly explaining the code-length tradeoff, the operator approved
  six digits. Saved **Email OTP length = 6** and reopened the provider settings
  to confirm persistence. Kept the existing 3600-second expiry unchanged.
- Observed a 60-second minimum interval per recipient. No rate-limit settings
  were changed. Do not assume the application's membership feature flag limits
  requests sent directly to Supabase's public Auth endpoints.

## Local implementation

- Aligned member input, service validation and English/Chinese copy to 6 digits.
- Expanded regressions for exact length, nonnumeric rejection, input filtering,
  button state and preventing malformed codes from reaching Auth.
- Dedicated non-persistent member Auth client remains separate from staff Auth.
- Guest ordering, staff login, payment and membership ownership rules unchanged.
- Relevant OTP tests: 10 passed. ESLint and production build passed; build still
  reports the existing large-chunk warning. `git diff --check` passed.

## Still outstanding

- The operator approved a test to `dine.os.my@gmail.com`, including creation of
  a Supabase test Auth user if necessary. The initial sandbox request returned
  status 0 (no network response). A network-approved execution then returned
  success from Supabase for one OTP request. The operator subsequently confirmed
  inbox receipt. The local verification page subsequently displayed successful
  email verification and successful sign-out of its temporary test session.
  Only the status text was read; the OTP and session tokens were not inspected.
  No further sends scheduled.
- No restaurant/member business database edits, API feature-flag changes, Git
  push or app deployment were performed. The OTP request may create the approved
  test Auth user, but does not create a DineOS membership.
- A temporary loopback-only verification page is available on port 4185 via
  `.local-tools/email-tests/otp-verification-preview.mjs`. It sends no email,
  uses a separate non-persistent Auth client, never logs OTPs/tokens, sends the
  code directly from the browser to the intended Supabase project, and signs
  out only its test session after successful verification. It does not call
  the membership API. User enters the code personally, not in chat. Browser
  inspection confirmed the page loaded with an empty field and disabled submit.
  After successful verification, the exact local server process was checked and
  stopped on 19 November. The tiny scripts remain available locally; no browser
  page or script needs to be kept running for production email delivery.
- Do not open customer membership before end-to-end checks. Test both
  registration and subsequent login, expiry/errors, membership points/identity,
  API retry and preservation of the employee session.
- Review abuse protection before public launch. Gmail SMTP shows a transactional
  delivery warning in Supabase; delivery reliability remains unverified.
- Welcome email remains a separate feature; configuring SMTP does not configure
  the application's Resend welcome-email transport.

## Follow-up local regression — 19 November 2026

The operator subsequently deferred the real member program: stop live member
registration testing and provide an Admin-controlled switch, default off. See
`membership-program-switch.md`. That switch is implemented locally only; no
production member, table visit or points were created/changed for acceptance.

- 27 member/Auth/UI/welcome unit and mocked-boundary tests passed.
- Extended the opt-in, isolated PostgreSQL regression using actual member route
  SQL: register, repeat registration, subsequent login with the same identity
  and 29 fixture points, no duplicate member/outbox job, unknown identity,
  inactive member and completed table visit rejection. All passed (one additional
  integration test). The first attempt needed sandbox shared-memory permission;
  an initial test fixture used `closed` instead of schema-valid `completed`,
  which was corrected. No application defect was inferred from that fixture error.
- PostgreSQL was initialized in a new per-run temporary directory, never loaded
  `.env`/`DATABASE_URL`, listened on a local socket only, used a mocked mail
  provider, stopped afterwards and removed its generated temporary directory.
  Added this cleanup to the reusable integration test to avoid accumulating
  clusters. Previous unrelated test directories were not removed.
- ESLint and diff whitespace checks passed. The last frontend build passed on
  18 November; this follow-up changes only tests/documentation, not runtime code.
- This is not a full live customer registration test: the real OTP test stops
  after Auth verification, and PostgreSQL tests use a fixture identity and a
  mocked personal-session helper. Formal member creation, real table-session
  linkage, repeat email login and real employee-session coexistence still need
  coordinated end-to-end acceptance. No production member or table visit was
  created by this follow-up; no deployment or public membership enabling occurred.
