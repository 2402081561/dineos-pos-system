# Counter order recovery

- Unfinished counter orders are saved in session storage, separately for each employee and browser tab. Refreshing the same tab restores the selected table, name, dishes, quantities, packing choices, options and notes. Closing the tab is not a long-term backup.
- A draft is bound to the selected table visit. A changed or unavailable visit requires explicit table reselection before a new submission. Prices and availability are rechecked.
- Before sending, the exact request body and request ID are saved. An unconfirmed submission locks editing; retry uses the same body and ID, including after refresh. A later rejection cannot unlock an already uncertain request.
- A confirmed response clears the draft. An explicit rejection on the first attempt allows review. Unavailable storage blocks submission; damaged saved data requires checking recent orders before discarding it.
- Service charge and SST rows are hidden when their configured rates are zero. Payment and serving/collection remain separate.

## Member email availability

Member email signup/login is off by default. Keep `MEMBER_EMAIL_OTP_ENABLED=false` while SMTP is postponed. The public configuration exposes only a boolean; both the UI and server reject email login while disabled, and Guest ordering remains available. Enabling the flag is an operator action, not an automatic SMTP health check. Follow `server/MEMBER_EMAIL_OTP.md` before enabling it.

## Local verification

`tests/counterDraftSafety.test.mjs` exercises refresh recovery, actor isolation, changed visits, storage failures, and a mocked committed order whose response is lost. It verifies that refresh and retry return one mocked order with the original request ID. No real orders, payments or emails are created by these tests.
