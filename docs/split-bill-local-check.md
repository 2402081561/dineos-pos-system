# Split-bill usability check (local only)

This change requires no database migration and does not enable online customer payments.
No production orders or payments were created for this check.

## Customer flow

- Bill summary labels the amount as the whole table's remaining unpaid total, not the current phone user's personal balance.
- Shared-table summary no longer labels the shared session as “You”, “Individual total”, or a count of diners.
- Keep two choices: whole table, or choose dishes/portions with the cashier.
- Requesting a split bill notifies the counter; it does not pay or reserve items.
- Historical service/SST charges remain accessible in collapsed charge details; zero fees stay hidden.

## Counter flow

1. Open a table's payment screen and choose Split bill.
2. All quantities start at zero; collection is disabled until a valid selection is made.
3. Select dishes/portions, review amount and tender, then open confirmation.
4. Confirmation shows only the selected food, portions, options, packing and notes.
5. After recording payment, the shared serialized reader invalidates any pre-payment poll and loads a fresh unpaid snapshot.
6. The success screen shows amount paid, remaining unpaid amount, and Continue with next diner when there is a remaining balance.
7. Continue opens the same visit with empty split quantities, no carried-over discount or cash tender, and only remaining unpaid quantities available.

Explicit Select all selects only the items known at that instant. Later arriving items are not silently selected in split mode. Whole-table mode continues to follow the full live bill.

## Safety / failure cases

- Refreshing the remaining bill is GET-only and never retries a payment POST.
- A failed balance read preserves the confirmed receipt and blocks continuing; it never displays a guessed zero balance.
- Match balances by table-session ID, not the physical table number. An old receipt must not continue into a new customer's visit; independent walk-ins must not merge.
- Preserve existing payment idempotency, recovery storage, stale-version checks and server-side price/remaining-quantity validation.
- Confirmation food snapshots are UI-only; the payment API body and recovery body are unchanged.

## Automated checks

`node --test tests/splitBillUi.test.mjs` covers empty defaults, select-all/new-arrival behavior, exact confirmation portions, post-payment refresh wait/failure/retry, next diner reset, same-price order changes, visit isolation, shared customer wording and actual confirmation/success component rendering.

`node --test tests/*.test.mjs` covers the complete frontend regression suite, including historical charges and uncertain-payment recovery. Build and targeted ESLint should also pass.

## Preview

Use `http://127.0.0.1:4182/cashier` with the independent local API on port 4001 and local PostgreSQL on port 55434, as documented in `walk-in-local-preview.md`. The original port 5173 is not the independent walk-in test environment.

Browser check on 2026-11-07: opened an existing local walk-in bill for RM72.50, switched to split and verified all seven item rows start at zero with collection disabled. Selected one RM10 item, entered RM10 cash and verified the confirmation lists exactly that single item and RM10. Cancelled without submitting payment, then cleared the selection and cash. No payment POST was made during this browser check. The post-payment remainder/next-diner/failure paths were exercised in automated tests rather than by collecting a live bill.
