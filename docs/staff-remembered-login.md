# Staff remembered login — local implementation, not a release record

Admin, cashier, kitchen and staff sessions retain separate Supabase SDK storage
keys. A deliberate password login always uses a fresh key and disposes the old
client's listeners/timers without signing out its separately saved session.
No password is stored. Each saved session uses its own rotating access/refresh
tokens in this browser's localStorage; sessionStorage only chooses this tab's key.

- A sole saved account resumes automatically. Multiple saved sessions require a
  selection on the login screen; the app never guesses which employee to use.
- Account settings → Use another account opens the login/selection screen without
  signing out independent accounts in other tabs.
- Same saved session opened in several tabs shares the same SDK key and refresh
  coordination. Logging out that session affects those copies, not distinct keys.
- Server-verified identity/roles remain authoritative. Saved names and roles only
  label the chooser and suggest a destination, which remains role-protected.
- Existing same-tab credentials migrate once under their existing key. The first
  migration starts the local idle-retention period; no historical activity is inferred.

## Seven-day inactivity policy

Seven days means consecutive inactivity, not a fixed seven-day age. Visible staff
page entry/return and trusted pointer, keyboard or scroll interactions renew the
local timestamp (writes throttled to 30 seconds). Customer browsing, background
polling and automatic token refresh do not. Expiration is checked before restoring
or obtaining tokens, on visibility changes and by a local 30-second timer. Sleeping
tabs therefore check expiry before activity can renew it. No server keep-alive is
introduced. Expired records lose tokens/profile and retain a small tombstone to
reject delayed refresh writes. Saved-account enumeration also purges expired records.

This is browser-side retention, NOT a new server-enforced session security limit.
Supabase revocation, password/security changes or invalid refresh credentials may
require login sooner. JWT lifetimes and Supabase project settings are unchanged.
Private browsing, cleared site data and blocked browser storage cannot promise
cross-restart persistence. Denied storage falls back to isolated tab/memory state.

## Verification boundary

Automated tests use fake credentials, mocked SDK/API boundaries and an injected
clock; advancing seven days is not a real week-long device observation. Test
closing/reopening, independent admin/cashier tabs, re-selection, refresh rotation,
manual logout, offline recovery and an invalidated saved session on actual target
browsers before production acceptance. No production login/configuration/database
change is required or performed by the local tests.
