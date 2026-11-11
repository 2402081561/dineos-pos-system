# Kitchen ticket printing (local implementation, 2026-10-19)

Kitchen and Admin → Kitchen order cards provide **Print kitchen ticket**. Active received/preparing/ready orders can be printed without payment. Cancelled or incomplete snapshots are rejected. Print does not change preparation, fulfilment, payment, or table state.

The preview accepts optional **Table / seat** and **Phone suffix / car plate** (80 characters each). The local 032 implementation saves these to the order with a revision check (see `table-visits-and-identifiers.md`); migration 032 is not yet applied to production. Printed identifiers appear as entered, without field-name prefixes or an extra system-table row; the table number is used when no seat override is entered. At the user's request, the order number is omitted from paper (retained internally for helper duplicate warnings). Identifier text does not renumber or move a table; actual visit moves use a separate confirmed operation. Automatic kitchen printing is not enabled.

For the 2026-10-29 release, the user declined database upgrades. Production therefore defaults `VITE_SAVED_TABLE_VISITS_ENABLED` to off: preview identifiers are temporary editable inputs and kitchen printing does **not** require the saved-identifier endpoint. The counter saved-identifier, order identifier editor and table move/merge UI are hidden. Local development retains those prepared tools; `VITE_SAVED_TABLE_VISITS_ENABLED=false` can also disable them locally. Enable the production flag only after separately approved migration 032 and verification.

Admin → Menu → Edit provides **Kitchen short name** (40 characters), for example 奶油鸡饭 or `cont kt`. No machine translation or truncation is applied; missing aliases fall back to the full original name. Only the kitchen queue and kitchen ticket use this live alias. Customer names, order items and paid receipt snapshots remain unchanged. Migration `031_kitchen_short_names.sql` must run before the updated menu write API is deployed. Do not automatically bulk-populate aliases: the restaurant must confirm its own vocabulary.

Items print in a dine-in group followed by a takeaway group, omitting empty groups. Each dining designation appears once above its items, not on every dish line. Relative item order within each group, quantities, options and notes are preserved; identical dishes with different packing are never combined. Order dates/times, print timestamps and additional-order boilerplate are omitted from paper at the user's request; actual revision warnings remain visible. The kitchen queue keeps its additional-order warning. Prices and payment totals are omitted. Queue polling supplies the current visible snapshot; confirm it before printing/reprinting.

Android Chrome requires DineOS Print Helper **v0.3.0** or later, with the existing application ID/signing key. The new `kitchen_ticket` document kind is distinct from `paid_receipt`; both require explicit confirmation in the helper. Previous helper versions do not support kitchen tickets. Browser printing/PDF remains available; print CSS isolates the ticket from the dashboard and controls. No raw ESC/POS commands are accepted from the webpage.

Hardware acceptance after deploying frontend and installing the updated APK:

1. Open Kitchen, select an active mixed order and Print kitchen ticket.
2. Enter a seat label and phone suffix/car plate; verify order number is absent from paper.
3. On Android, hand off to the helper, connect the existing paired printer, and confirm printing.
4. Check quantities, Unicode names, per-item packing, notes, and absence of prices.
5. Reprint deliberately, then verify a paid customer receipt still prints normally.

On 2026-10-20, with user approval, migration 031 was applied to the configured Supabase database after a new private local backup. Signatures of all 23 existing application tables (excluding the new alias field) were unchanged. A rollback-only alias round-trip verified the actual kitchen SELECT and print payload, leaving no test alias behind. The local API was restarted using `npm --prefix server run dev` to enable code watching. No Netlify/Render deployment or Git push was performed. Actual new kitchen-ticket hardware output still requires user testing.
# Kitchen paper readability — local revision, 11 November 2026

The browser preview/print layout separates quantity and dish name into aligned
columns. Options and notes are smaller, indented below their own dish. Chinese
UI prints `备注` rather than `Notes`. Names are never automatically shortened:
an explicit saved kitchen name takes precedence; otherwise the full original
name is preserved. Remarks, including ambiguous remarks, are not reinterpreted.

The dialog keeps its order number outside the printed paper, shows optional
print labels in a disclosure, and keeps print controls below the scrollable
preview. Existing saved-identifier readiness checks still apply when enabled;
the label editor does not assign/move a table.

Android Print Helper v0.3.0 remains supported through the unchanged v1 row
protocol. It still renders its own inline quantity/name layout, not the browser's
CSS columns; note rows now use normal rather than bold type. No helper APK was
rebuilt in this revision. Browser preview checks and tests are not a physical
printer acceptance test. This local revision is not a deployment record.
