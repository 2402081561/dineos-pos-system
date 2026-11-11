# Employee portal appearance

Admin, Cashier, Kitchen, Staff and the employee login page offer a moon/sun button for light or dark mode. Light is the default. The choice is saved on that browser/device and shared between employee areas; it is not a staff-account or restaurant-wide setting.

The customer site has no theme switch and does not inherit the employee preference. Receipt and kitchen-ticket paper previews stay white with black text; all theme overrides are screen-only and do not change printed output or printer payloads. Food photos, QR images and brand assets are not inverted.

Implementation:

- `src/hooks/usePortalTheme.js`: browser preference and document-attribute lifecycle; accepts an explicit opt-out for customer areas sharing the portal shell.
- `src/components/common/PortalLayout.jsx`: enables the feature only for the four employee areas.
- `src/pages/admin/Login.jsx`: standalone employee login.
- `src/styles/portal-theme.css`: scoped surface, text, form, status and selection colors, including body-mounted dialogs.
- `tests/portalTheme.test.mjs`: preference, legacy Admin-preview migration, customer exclusion, cleanup and print-style regressions.

New UI colors must be reviewed in both modes. Keep status labels as well as colors, preserve selected/focus states, and avoid hard-coded light surfaces outside intentional paper/image previews.

This feature does not require database changes or an API request. A build does not publish it; release remains a separate approval step.
