# DineOS

A QR ordering and point-of-sale system for a single restaurant, developed as a final-year project. DineOS brings customer ordering, counter service, kitchen preparation and payment records into one workflow.

## Main workflows

- **Customers:** scan a table or takeaway QR code, browse the menu, choose options, submit orders and track their status.
- **Counter staff:** place orders for customers, manage table visits and walk-in orders, collect payments and split bills.
- **Kitchen:** view incoming orders, update preparation status and print kitchen tickets.
- **Administrators:** manage the menu, categories, tables, staff access, receipts and reports.

The interface includes Chinese and English translations. Feature availability depends on the checked-out revision, database migrations and runtime configuration. Local work is not automatically part of the deployed website.

## Architecture

| Layer | Technology / responsibility |
| --- | --- |
| Web client | React, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Express; authentication checks and restaurant business rules |
| Database | PostgreSQL; versioned SQL migrations |
| Staff authentication | Supabase Auth |
| Hosting | Netlify frontend, Render backend |
| Optional integrations | Web Push notifications and print helpers |

The current web app uses the REST API rather than direct Firestore access. Firebase dependencies and command-line tools remain for historical data verification and migration.

## Repository layout

```text
src/                    Web application, routes, components and API clients
public/                 Public assets and notification service worker
server/src/             Express API and business logic
server/db/              Versioned PostgreSQL migrations
server/tests/           Backend tests
tests/                  Frontend logic and regression tests
scripts/                Legacy data maintenance tools
android-print-helper/   Android Bluetooth print helper
docs/                   Feature guides, test notes and release history
```

## Local development

Use a current Node.js version compatible with the package requirements, npm and a dedicated development PostgreSQL database. Use separate development authentication credentials; do not copy production secrets into the repository.

Install dependencies:

```sh
npm ci
npm --prefix server ci
```

Copy the root `.env.example` to `.env` and configure:

```dotenv
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-key
```

These browser values are public configuration, not backend secrets. Configure `server/.env` separately using [the backend setup guide](server/README.md). Review that guide before initializing a new database or provisioning staff access. Never run migrations or data maintenance scripts against production as a routine development step.

Start the backend and frontend in separate terminals:

```sh
npm --prefix server run dev
```

```sh
npm run dev
```

Open the frontend address printed by Vite (normally `http://localhost:5173`). This starts local development only; it does not publish the application.

## Checks

```sh
npm run lint
node --test tests/*.test.mjs server/tests/*.test.js
npm --prefix server run check
npm run build
```

Tests requiring an explicitly configured, isolated local database may be skipped by default. A passing local build does not establish that production credentials, infrastructure or physical printers are working.

## Integration and release notes

- [Documentation index](docs/README.md)
- [Android print helper](android-print-helper/README.md)
- [Order notification setup](docs/order-push-notifications.md): requires push configuration, a subscribed employee device and a real-device background test.
- [Kitchen ticket printing](docs/kitchen-ticket-printing.md): printer compatibility depends on the selected print method and device.
- [Connection recovery](docs/connection-recovery.md): hosting availability and idle wake-up behavior must be verified separately from UI checks.

Email verification and native iPhone printing are not assumed ready simply because related source code or documentation exists. Check the applicable setup and device-validation status before demonstrating them.

Deployment is a separate, reviewed action. A push to a connected branch can trigger hosting auto-deployment; do not push an unreviewed working tree just to save local progress. Do not include `.env` files, database backups, personal documents, build outputs or demo credentials in commits or screenshots.
