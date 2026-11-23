# Membership and points: Admin master switch

Implemented locally on 19 November 2026. Not deployed or saved to production.

Admin → Shop settings → **Membership and rewards** → **Enable membership and
points**. Uses the existing revision-checked, admin-only settings save and JSON
configuration; no schema migration is required. Missing settings default off.

When off:

- Customer entry hides membership registration/login; More keeps its reserved
  future-account placeholder. Direct profile/rewards URLs do not mount member
  pages. Guest ordering is retained.
- API registration/login, customer points/rewards reads and both customer and
  cashier redemption are blocked. Write transactions recheck the setting under
  the existing shop-settings shared lock to serialize against Admin saves.
- Cashier member/reward controls are hidden. A payment for previously linked
  member orders still succeeds with unchanged money calculations, but earns no
  new points. No bank/payment-method or order rule was changed.
- No member, point balance, history, order or receipt is deleted. Admin record
  management remains accessible. Historical refund point reversals remain intact
  so turning the program off cannot make already-awarded points immune to refunds.

Re-enabling does not backfill missed points or send welcomes to old members.
Customer email login additionally requires the existing backend mail readiness
flags; the switch does not bypass those gates. SMTP stays configured for project
Auth emails, including staff password recovery. The switch does not disable
Supabase's direct public Auth endpoints or cancel previously queued mail; review
provider abuse limits and any existing mail queue separately before public launch.

No new polling was added. The member-auth config response now reads the shop
setting; other displays reuse the existing settings provider. A member-linked
payment adds one settings read in its existing transaction. Staff authentication
and session handling are untouched.

Checks: full automated suite, isolated temporary PostgreSQL test, ESLint,
production build and whitespace checks. Some integration tests remain opt-in;
automated success is not a live deployment or an end-to-end production test.
