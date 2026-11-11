# Future features

## Telegram order alerts — deferred

Requested on 2026-11-11. Keep as a future option, not part of the current release.

- Send a staff/owner Telegram message after an order is confirmed by the backend.
- Start with new-order alerts and a link back to DineOS; no Telegram order edits,
  payment actions, automatic acceptance or customer registration requirement.
- Use an explicitly configured bot and recipient/group. Store its token only in
  backend secrets; never in browser code, Git or chat.
- Keep current Web Push. Telegram is an additional channel, not a fix for an
  unavailable backend and not a guaranteed notification-delivery mechanism.
- Before implementation: confirm recipients, message contents/privacy, delivery
  retries/deduplication and failure isolation from order submission.
