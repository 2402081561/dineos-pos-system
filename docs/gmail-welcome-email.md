# Gmail welcome email (local implementation, not deployed)

The Gmail transport uses only `gmail.send`. It does not read the inbox. OAuth
authorization alone is not proof of sender identity, delivery, or long-term access.
Testing-mode grants may expire; long-term operational readiness remains unverified.

On 20 November 2026, the operator completed registration through the actual
customer UI backed by an isolated local business database. The queue showed one
accepted send, and the operator confirmed receipt in the spam folder. This proves
receipt of that message, not reliable inbox placement or production readiness.
Repeat customer login remains unconfirmed. The hosted business database and
production membership flag were not changed by this acceptance.

Explicit server-only configuration is required:

- `MEMBER_EMAIL_PROVIDER=gmail`
- `MEMBER_GMAIL_CREDENTIALS_FILE`: absolute path to the private OAuth grant JSON
- `MEMBER_EMAIL_FROM`: the same mailbox as the grant's configured sender
- Existing OTP/welcome flags and test-recipient restriction still apply.

No flags or production settings were enabled by this implementation. Never commit
the grant, copy it into frontend assets, or include it in logs. The credential file
must have owner-only permissions. Deployment credential provisioning remains pending.

New queue payloads bind their delivery provider. Legacy payloads mean Resend;
provider-mismatched jobs are blocked rather than moved between providers. Gmail
jobs have one send attempt, without automatic retries. An uncertain response,
expired processing lease, or lost database acknowledgement requires manual review:
the email may already have been sent. This favors avoiding duplicate mail over
guaranteed delivery. Provider acceptance is not proof of inbox delivery.

Local mocked tests cover MIME encoding, recipient restrictions, header rejection,
credential mismatch, uncertain sends and blocked queue outcomes. No actual email
or membership is created by those tests. Live receipt and full registration flow
validation beyond the single confirmed receipt remain pending.
