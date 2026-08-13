-- New DineOS PostgreSQL database. This migration never reads or modifies Firebase.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'cashier', 'kitchen', 'staff');
CREATE TYPE member_status AS ENUM ('active', 'inactive');
CREATE TYPE order_status AS ENUM ('received', 'preparing', 'ready', 'served', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid');
CREATE TYPE point_transaction_type AS ENUM ('earn', 'redeem');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  phone_normalized text NOT NULL UNIQUE,
  phone_display text NOT NULL,
  email text,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  status member_status NOT NULL DEFAULT 'active',
  email_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  image_url text,
  is_available boolean NOT NULL DEFAULT true,
  is_popular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number integer NOT NULL UNIQUE CHECK (table_number > 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES restaurant_tables(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id uuid NOT NULL REFERENCES table_sessions(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  nickname text NOT NULL DEFAULT 'Guest',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id uuid NOT NULL REFERENCES table_sessions(id) ON DELETE RESTRICT,
  customer_session_id uuid NOT NULL REFERENCES customer_sessions(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  status order_status NOT NULL DEFAULT 'received',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  service_charge numeric(12,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  sst numeric(12,2) NOT NULL DEFAULT 0 CHECK (sst >= 0),
  grand_total numeric(12,2) NOT NULL CHECK (grand_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  table_session_id uuid NOT NULL REFERENCES table_sessions(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_method text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  points_required integer NOT NULL CHECK (points_required > 0),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, points_required)
);

CREATE TABLE member_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  type point_transaction_type NOT NULL,
  points integer NOT NULL CHECK ((type = 'earn' AND points > 0) OR (type = 'redeem' AND points < 0)),
  eligible_spending numeric(12,2) CHECK (eligible_spending >= 0),
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  reward_id uuid REFERENCES rewards(id) ON DELETE RESTRICT,
  redemption_reference text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX member_point_transactions_member_created_idx ON member_point_transactions (member_id, created_at DESC);
CREATE INDEX orders_table_session_created_idx ON orders (table_session_id, created_at DESC);
CREATE INDEX orders_customer_session_created_idx ON orders (customer_session_id, created_at DESC);
