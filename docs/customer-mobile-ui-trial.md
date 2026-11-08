# Customer mobile UI trial — 2026-10-30

Local-only trial requested by the user; **not committed, pushed or deployed**. Baseline commit: `072a9b98714ecbed3919251adcd656caa8385ada`.

## Scope

- Below the existing desktop breakpoint (1024px), show menu categories on the left and compact dish rows on the right. Keep the existing category/search filtering and original dish order; unavailable dishes remain visible but cannot be added.
- Fix the four customer navigation links to the mobile bottom edge. Desktop navigation remains the existing left sidebar and menu cards remain unchanged.
- Show cart quantity and **items subtotal**, not a misleading tax-inclusive total, in a fixed cart bar. Retain an empty-cart shortcut. The existing cart still checks current availability/prices, computes charges, supports per-line dine-in/takeaway and submits through the unchanged idempotent flow.
- Simple dishes use the existing add-cart hook. Menu minus adjusts only an unambiguous plain dine-in line; takeaway/customized/multiple variants go to the existing cart instead of silently deleting a portion.
- Preserve the uncertain-order lock. No changes to order APIs, authentication, database schema, kitchen/printing, staff workflows, membership or fees.
- Keep detail-page add controls above the new bottom navigation, with its cart shortcut above those controls. Fixed controls remain outside the animated main.

## Preview

`node .local-tools/create-mobile-preview.mjs` prepares an isolated preview on `http://localhost:4178/`. It uses a read-only snapshot of the public menu, a synthetic table visit and the actual customer UI/cart components. All customer API methods are stubbed and external fetch is blocked; no real orders or payments can be sent. Two extra dishes are explicitly named as preview fixtures for option/sold-out checks. Preview code and data stay in ignored/private locations and are not part of the production build.

The wrapper offers 320px/390px/430px and desktop views, plus Chinese/English. This localhost URL works on this Mac only; phone access is not configured.

## Verification

- `npm run lint` and `npm run build` passed (only the existing large-chunk warning).
- Full suite: 279 tests, 262 passed, 17 optional database tests skipped, zero failures. This includes the unrelated paused iPhone tests that were already local.
- Browser checks at 320×640, 390×844 and 430×932 showed no horizontal page or menu-control overflow. The cart bar stayed above the bottom navigation; the last noodle dish could scroll fully above the cart bar.
- Verified category/search filters, added quantities/subtotal, switching a cart line to takeaway, returning to the menu, safe minus routing to cart, and cart survival across preview reload/language changes.
- At 1280px, mobile layout/navigation/amount text were hidden, the original four-column food cards and left sidebar remained visible.
- Preview interactions never sent production orders, payments, emails or database writes. Actual phone hardware/Safari keyboard/safe-area acceptance still needs user feedback.

## Reverting this trial

Before the trial, all existing local changes were unrelated paused iPhone receipt work and `.DS_Store` files. The trial's existing tracked files were clean at the baseline. To reject the trial, reverse **only** its path-scoped diff; do not reset the repository or touch the iPhone files, generated APKs, environment files, or production data. Trial-created files: `src/components/customer/CustomerMobileNavigation.jsx`, `src/components/customer/MobileMenuItem.jsx`, `tests/customerMobileMenu.test.mjs`, and this note. The ignored preview builder and saved review images can be retained separately.

## Cart and confirmation extension — 2026-10-31

User approved borrowing the compact cart/clear confirmation structure from supplied screenshots, keeping the orange theme and existing ordering behaviour. Still local only; no commit, push, deployment or schema change.

- Cart rows now use smaller photos, aligned line totals and compact dining controls. Notes, option snapshots, per-line dine-in/takeaway, split-one, removal, quantity limits and uncertain-order locks remain wired to the existing handlers.
- Phone checkout total/action stays fixed above bottom navigation, portalled outside the animated main. Desktop uses the normal summary action. No new packaging fees, rounding rules or payment methods.
- Confirmation/tracking puts received/payment status first, followed by table/date/paid/balance, compact live kitchen progress and item/bill summary. Received is not payment confirmation; paid-but-ready still asks for collection. Cancellation remains a separate terminal screen without preparation progress.
- Detailed paid/served/collected quantities remain available in an expandable section and the existing order-details dialog. Recent orders stay clickable. Historical fees/discounts use stored order values; zero charges stay hidden.
- New files: `CartItemRow.jsx`, `CartCheckoutBar.jsx`, `CustomerOrderTotals.jsx` under `src/components/customer/`, and `tests/customerCheckoutUi.test.mjs`. Additional tracked changes: `src/pages/customer/Cart.jsx`, `src/pages/customer/Tracking.jsx`, plus the trial's translations/CSS.
- Preview now simulates order submission locally and renders the real Tracking component; simulated orders live only in that tab's localhost session storage. External API writes remain blocked. No customer order/payment/email is created.
- Regression checks: 147 frontend tests passed, including four new focused UI tests and existing lost-response/idempotency tests. Lint/build passed (existing bundle-size warning only). Browser visual acceptance for this extension was initially blocked because the old preview tab was on a browser-generated error page; user was asked to open the restarted localhost preview manually. The earlier menu-only screenshot is not evidence of this extension.

### Browser follow-up

- After the user opened the restarted preview, a fresh isolated test tab verified the real cart and Tracking components at 390px, 320px, 430px and 1280px. No horizontal overflow; mobile controls fit, fixed checkout stays above navigation, and desktop retains its 224px sidebar.
- Found and fixed inherited menu scroll on entering `/cart` or `/tracking`: these routes now reset to the top only when the route changes, not on line/quantity/dining updates. Added a focused regression test (five extension tests total).
- Verified a 3-portion mixed order, switching a line to takeaway, splitting one of two identical dishes, stable row order and unchanged RM27 total. Local simulated submission cleared the cart, rendered received/unpaid status at the top, and retained separate serving/collection quantities and the existing details modal.
- New screenshots: `.local-tools/customer-cart-ui-trial-390.png` and `.local-tools/customer-confirmation-ui-trial-430.png`. Tests use synthetic local orders only; no production writes or deployment.

## Continuous category navigation — 2026-11-01

- User requested that available food have no redundant availability badge and that mobile category highlighting follow the right-hand menu while scrolling. Available customer detail badges and the redundant available status above admin/cashier availability buttons are hidden. Sold-out labels/actions/guards are preserved; availability editor fields are not removed.
- Mobile menu now has continuous category sections rather than filtering to one category on selection. Category order follows existing menu settings; food order within each category is stable. Popular remains a separate view without duplicate items. Search filters sections/navigation together, retaining sold-out dishes and an uncategorised fallback without dropping food.
- Scroll-driven highlighting works in both directions, including a short last section at the bottom. Clicking jumps to the corresponding section under the sticky search field, respects reduced motion, and protects the selected highlight during smooth scrolling; wheel/touch/keyboard input cancels that protection. Category rail scrolls only itself to keep its active button visible. Scroll work is coalesced by animation frames and all listeners are removed on unmount. Desktop filtering remains unchanged.
- Browser checks verified initial click alignment (rice section top ~144px below the 132px header/search), manual down/up highlight changes, popular-to-category jumps, no horizontal overflow and active rail button visibility at 320px. Screenshot: `.local-tools/customer-menu-scroll-category-390.png`.
- New files: `src/components/customer/MobileMenuSections.jsx`, `src/utils/mobileMenuSections.js`, `tests/mobileMenuSections.test.mjs`. Also includes scoped availability changes in `src/components/common/MenuAvailabilityControl.jsx` and `src/pages/customer/FoodDetails.jsx`; all are captured in the ignored trial patch/manifest. No API, database, deployed site, print helper or email changes.
- Final checks: 289 total tests, 272 passed, 17 optional database tests skipped, zero failures; lint/build and whitespace checks passed (existing bundle-size warning only). Browser also verified global search with only matching category targets and an available dish detail without the availability badge. Preview needs a refresh to load the rebuilt bundle.

## Description cleanup and footer inspection — 2026-11-02

- User requested description cleanup first, followed by inspection of the floating cart bar. Added `src/utils/menuDescription.js` to hide blank/non-text/dash-only descriptions at render time. Mobile menu rows, desktop `FoodCard` and customer food details omit the description paragraph entirely for those values; meaningful descriptions (including punctuation) are preserved. No saved menu data or search fields are rewritten.
- Added `tests/menuDescription.test.mjs` for normalization and real component output across all three customer views. Final suite: 291 tests, 274 passed, 17 optional DB tests skipped, zero failures. Lint/build passed with the pre-existing chunk-size warning.
- No footer CSS changes were needed. Actual browser scroll-to-bottom checks: at 390×844, last row bottom 596.03px and cart bar top 700px; at 320×640 with an item added, last row bottom 392.14px and bar top 496px; at 430×932 in English, last row bottom 684.06px and bar top 788px. Prices and all last-row quantity buttons are fully above the bar in each case; no horizontal overflow. Mid-scroll coverage is expected for fixed overlays and does not mean the final dish is inaccessible.
- Screenshot `.local-tools/customer-menu-description-footer-390.png` shows the actual final dish and quantity controls clear above the cart bar after scrolling to the bottom. Only local simulated cart additions were used; no real orders, payments, emails, DB updates or deployment.

## Browse continuity and cart safeguards — 2026-11-03

User approved all four suggested improvements. Still local only: no commit, push, deployment, API/schema change or production write.

- The same browser tab/visit retains menu search, desktop category, mobile popular mode and the visible dish/scroll anchor when returning from detail or cart, including refresh. New/cleared table visits discard the snapshot and late old-page writes are ignored. Menu polling does not repeatedly restore scroll. Menu entrance movement is disabled to avoid a 6px anchor offset. Browser direct-tap check: before and after detail, scrollY=2862 and first noodle row top=180.046875px, with the noodle category selected.
- Cart rows have an Edit action for current options, notes, quantity and dining type. Save replaces the exact stable row; identical variants merge without duplicate portions. It rechecks current availability/options/price, required selections and the 50-portion limit. Changed rows, changed visits and uncertain submissions reject stale saves. Removed/sold-out options can be reset and chosen again. Chinese/English validation is included; dish/group names remain store-defined.
- Clear cart requires confirmation and checks that the draft has not changed before deletion. It affects unsubmitted items only. Removing a line shows a four-second Undo action, including when removing the last item. The one-use token expires after eight seconds and is invalidated by later cart mutations, submissions or visit changes, so Undo cannot overwrite later work. Toast actions dismiss the old toast before running, preserving any new failure message.
- Empty-cart shortcut remains visible as a small pill; nonempty carts retain the full quantity/subtotal bar. Existing bottom clearance and uncertain-order/fee logic remain intact.
- Browser verified 320×640, 390×844, 430×932 Chinese/English and desktop1280×900: no horizontal page overflow; editor can scroll on short screens; Close stays on one line. Checked direct editing (1 to 2 takeaway portions with notes), option price change (RM9 to RM11 without adding another portion), last-line removal/undo, clear cancel/confirm, preserved search after reload, popular and desktop category return. These were isolated local preview data only; no real orders were sent.
- Screenshot: `.local-tools/customer-cart-edit-390.png`. Preview remains `http://localhost:4178/?width=390&language=zh` and must be refreshed for the new bundle.
- Final suite: **303 tests, 286 passed, 17 optional database tests skipped, zero failures**. Lint/build and whitespace checks passed; the pre-existing large-chunk warning remains. Native phone Safari keyboard/safe-area acceptance is still for the user's physical-device testing.
- Additional files: `CartItemEditor.jsx`, `useMenuBrowse.js`, `cartItemEdit.js`, `menuBrowseState.js`, `customerCartEdits.test.mjs`, `menuBrowseState.test.mjs`. Scoped trial capture also includes `CartProvider.jsx`, `ToastViewport.jsx`, `customerVisitStorage.js` and the hook-test harness; unrelated paused iPhone work remains excluded.
