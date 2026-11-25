# DineOS

DineOS is a restaurant ordering and point-of-sale (POS) system developed as a final-year project.

It helps customers order food through a QR code and helps restaurant staff handle orders, kitchen preparation and payments in one place.

## Why I built it

Handwritten orders can be hard to read, and staff may need to repeat food choices or special requests to the kitchen. Group payments can also be difficult to track.

DineOS provides a digital way to handle these tasks while keeping counter ordering available for customers who need staff assistance.

## Main features

- **QR ordering:** customers scan a table QR code, browse the menu and place an order.
- **Separate carts at the same table:** each customer chooses food on their own phone. Their submitted orders are linked to the same table visit.
- **Counter ordering:** cashiers can order for customers, including walk-in customers without an assigned table.
- **Dine-in and takeaway:** staff and customers can choose how each item should be prepared for collection or serving.
- **Split bills:** cashiers select the unpaid items and quantities a customer wants to pay for. The rest stays unpaid.
- **Kitchen screen:** kitchen staff can view orders, read notes and update preparation status.
- **Admin tools:** administrators can manage food, categories, tables, memberships and rewards, and view order history and sales reports.
- **Chinese and English:** users can switch the interface language.

Order notifications and Bluetooth printing need additional setup and compatible devices.

## Who uses it?

| User | What they do |
| --- | --- |
| Customer | Browse food, customise items, order and check order status |
| Cashier | Take orders, record payments, split bills and view receipts |
| Kitchen staff | View orders and update preparation status |
| Administrator | Manage the restaurant's menu, tables and records |

## Technologies used

| Technology | What it does in DineOS |
| --- | --- |
| React | Builds the pages and buttons people use |
| Tailwind CSS | Styles the layout, colours and spacing |
| Node.js and Express | Run the backend that processes requests and checks business rules |
| Supabase PostgreSQL | Stores menus, orders, payments and other restaurant records |
| Supabase Auth | Handles staff sign-in |
| Netlify and Render | Host the frontend and backend |

## Run it locally

You need Node.js, npm, a development PostgreSQL database and a Supabase project configured for staff login.

1. Install the frontend and backend packages:

   ```sh
   npm ci
   npm --prefix server ci
   ```

2. Configure the local environment files and set up a separate development database and Supabase project. Installing packages alone does not create staff accounts.

3. Start the backend and frontend in two terminals:

   ```sh
   npm --prefix server run dev
   ```

   ```sh
   npm run dev
   ```

4. Open the local address shown in the terminal, usually `http://localhost:5173`.

Do not use real restaurant data or production passwords for local testing.
