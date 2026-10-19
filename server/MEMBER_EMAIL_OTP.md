# Member email OTP deployment checklist

The implementation supports Gmail and other email inboxes. It is **not Google
OAuth**, does not read Gmail, and does not require access to customers' mailboxes.
Never paste SMTP passwords, service-role keys, OTPs or access tokens into chat.

## Required before enabling this version

Email membership is **off by default**. Keep `MEMBER_EMAIL_OTP_ENABLED=false`
while SMTP is postponed. The public config endpoint contains only an availability
boolean; the UI disables signup/login, and the API rejects member identity
exchanges without calling the email provider. Guest ordering remains available.
Do not restore legacy Member ID + phone login as a bypass.

1. Review and apply migration `029_member_email_otp.sql` using the normal schema
   runner: `npm --prefix server run db:schema` from the repository root. It keeps
   existing members, points, orders and payments. Do not run against a production
   database without confirming its target and taking the usual backup.
2. API environment: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` must refer to the
   same Supabase project as the frontend. The key is public/publishable, **not** a
   service-role or SMTP key. Restart the API after configuring it.
3. Frontend environment: existing `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`. No new frontend secret.
4. Supabase Dashboard → Authentication → Email provider: enable email auth and
   signup for new members. Keep email confirmation enabled. Set OTP length to 6.
5. Authentication → Email Templates → Magic Link: use the template below to send
   a numeric OTP, not a clickable magic link. This project intentionally does not
   consume magic links or URL sessions.
6. Configure custom SMTP for delivery to actual customers. Supabase's default
   mail service is restricted to authorized team recipients and is not a
   production sender. Follow your chosen provider's sender/domain verification.
   Store SMTP credentials **only in Supabase**. Configure Auth rate limits and
   use a supported CAPTCHA integration before opening high-volume public signup.
7. Configure a short OTP expiry (e.g. 10 minutes) and at least a 60-second resend
   cooldown in Supabase. Expiry also affects other Supabase email links (including
   staff password recovery); check that impact before changing it.
8. Coordinate backend and frontend deployment. Old Member ID + phone requests are
   deliberately rejected; do not deploy only half of the change.
9. Only after the checks below pass, explicitly set
   `MEMBER_EMAIL_OTP_ENABLED=true` in the API environment and restart/redeploy the
   API. This flag is an operator confirmation, not an automatic SMTP health check.

Example Magic Link email template:

```html
<h2>Your DineOS membership code</h2>
<p>Enter this code to verify your email:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>If you did not request this code, ignore this email. Do not share it.</p>
```

The UI's resend timer is convenience, not a security limit. Supabase enforces
token verification, one-time use, expiry and sending/verification rate limits.
No mock OTP, bypass, or console-displayed code exists in production code.

## Existing members: preserve points without account takeover

Legacy email and phone fields were never verified. They are not enough to claim
an account, and duplicate email/phone registration does not auto-merge records.
Current active visits are not mass-deleted by this migration.

An administrator must confirm the person's ownership of the **old membership**
(not merely their knowledge of a member ID/phone). The customer then uses the
registration screen to verify their email. A legacy collision prevents creating
a duplicate membership but leaves the confirmed Supabase Auth user available.
Find its UUID in Supabase Authentication → Users, confirm the exact email, then
the authorized database operator may run:

```sh
npm --prefix server run members:link-email -- \
  'MEM-00001' 'CONFIRMED-SUPABASE-AUTH-USER-UUID' 'customer@example.com' \
  --confirmed-owner
```

The placeholder UUID must be replaced. This command requires authorized database
access to `auth.users`; it fails closed if that access is unavailable. It checks
the email confirmation, rejects relinking someone else's account, updates only
identity/contact metadata, and records an audit event. Points and transaction
history are untouched. Unique conflicts roll back the whole transaction. The
customer can then use Member Login → email code. Do not run this in bulk based
only on matching legacy emails.

## Checks before release

- Real test inbox receives 6 digits; expiry, invalid code, cooldown and delivery
  failure work. Do not claim real delivery verified until this is tested.
- Register, then login on a later table visit with the same email: same member and
  points. Retrying a lost API response never creates a second membership.
- Staff remains signed in when a member verifies email in the same browser.
- Guest ordering and existing receipts/points still work.
- Backend rejects missing/invalid/unverified auth; rejects inactive members and
  legacy ID + phone login. No public API can bind a legacy account.

Official references:
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
