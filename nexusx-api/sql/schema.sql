-- NexusX self-hosted schema (ports Supabase tables to plain Postgres)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ENUMS
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin','seller','buyer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('available','sold','replacement_pending','replaced','bad','withheld');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE category_kind AS ENUM ('fb_account','vpn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending','completed','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'cancelled';
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('bkash','nagad','binance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE topup_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE withdraw_status AS ENUM ('pending','approved','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ledger_kind AS ENUM ('topup','purchase','refund','withdraw','admin_adjustment','seller_payout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE seller_application_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notice_severity AS ENUM ('info','success','warning','danger');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE notice_audience AS ENUM ('all','buyer','seller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open','pending','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE support_ticket_status ADD VALUE IF NOT EXISTS 'resolved';
DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM ('general','order','payment','seller','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE support_ticket_category ADD VALUE IF NOT EXISTS 'account';
ALTER TYPE support_ticket_category ADD VALUE IF NOT EXISTS 'technical';

-- USERS (replaces auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  contact_handle TEXT,
  balance_bdt NUMERIC NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  buyer_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind category_kind NOT NULL DEFAULT 'fb_account',
  description TEXT,
  price_bdt NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  buyer_id UUID REFERENCES users(id),
  uid TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT,
  email_password TEXT,
  two_fa TEXT,
  cost_bdt NUMERIC,
  status account_status NOT NULL DEFAULT 'available',
  extra JSONB,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_cat_status ON accounts(category_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_seller ON accounts(seller_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_uid_active ON accounts(uid) WHERE status IN ('available','sold','replacement_pending');

-- Cookies blob captured from raw seller uploads (61xxx / 1000xxx formats).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cookies TEXT;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  quantity INT NOT NULL,
  unit_price_bdt NUMERIC NOT NULL,
  total_bdt NUMERIC NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  unit_price_bdt NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  kind ledger_kind NOT NULL,
  amount_bdt NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  method payment_method NOT NULL,
  amount_bdt NUMERIC NOT NULL,
  sender_number TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  note TEXT,
  screenshot_url TEXT,
  screenshot_path TEXT,
  status topup_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdraw_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  method payment_method NOT NULL,
  amount_bdt NUMERIC NOT NULL,
  receiver_number TEXT NOT NULL,
  note TEXT,
  payout_txn_id TEXT,
  status withdraw_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  reference_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  display_name TEXT,
  contact_handle TEXT,
  reason TEXT,
  status seller_application_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE seller_applications ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE TABLE IF NOT EXISTS seller_daily_limits (
  seller_id UUID PRIMARY KEY REFERENCES users(id),
  daily_limit INT NOT NULL,
  note TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VPN brands
CREATE TABLE IF NOT EXISTS vpn_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES vpn_brands(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS duration_days INT;

-- Replacement requests
DO $$ BEGIN
  CREATE TYPE replacement_status AS ENUM ('pending','approved','rejected','partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE replacement_item_outcome AS ENUM ('pending','replaced','rejected','out_of_window');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE replacement_item_outcome ADD VALUE IF NOT EXISTS 'refunded';

CREATE TABLE IF NOT EXISTS replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id),
  raw_input TEXT NOT NULL,
  parsed_uid_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  status replacement_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replacement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES replacement_requests(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  account_id UUID REFERENCES accounts(id),
  reported_uid TEXT NOT NULL,
  in_window BOOLEAN NOT NULL DEFAULT false,
  window_hours INT,
  outcome replacement_item_outcome NOT NULL DEFAULT 'pending',
  outcome_reason TEXT,
  replacement_account_id UUID REFERENCES accounts(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seller upload audits
CREATE TABLE IF NOT EXISTS seller_upload_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  category_name TEXT,
  file_name TEXT,
  rows_in_file INT NOT NULL DEFAULT 0,
  rows_sent INT NOT NULL DEFAULT 0,
  rows_inserted INT NOT NULL DEFAULT 0,
  duplicates_in_file INT NOT NULL DEFAULT 0,
  duplicates_in_stock INT NOT NULL DEFAULT 0,
  duplicates_already_replaced INT NOT NULL DEFAULT 0,
  invalid_rows INT NOT NULL DEFAULT 0,
  over_limit_skipped INT NOT NULL DEFAULT 0,
  skip_duplicates_setting BOOLEAN NOT NULL DEFAULT true,
  server_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-managed payment accounts (bKash/Nagad/Binance numbers shown to buyers)
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method payment_method NOT NULL,
  label TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crypto invoices (Plisio + future auto-deposit gateways)
CREATE TABLE IF NOT EXISTS crypto_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'plisio',
  invoice_id TEXT NOT NULL UNIQUE,
  order_number TEXT NOT NULL UNIQUE,
  amount_bdt NUMERIC NOT NULL,
  amount_usd NUMERIC,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  invoice_url TEXT,
  raw JSONB,
  topup_id UUID REFERENCES topup_requests(id),
  credited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crypto_invoices_user_idx ON crypto_invoices(user_id, created_at DESC);

-- Seed default settings (idempotent)
INSERT INTO app_settings(key, value)
VALUES ('payment_methods_enabled', '{"bkash":true,"nagad":true,"binance":true,"plisio":false}'::jsonb)
ON CONFLICT(key) DO NOTHING;
INSERT INTO app_settings(key, value)
VALUES ('plisio_enabled', 'false'::jsonb)
ON CONFLICT(key) DO NOTHING;
INSERT INTO app_settings(key, value)
VALUES ('bdt_to_usd_rate', '0.0085'::jsonb)
ON CONFLICT(key) DO NOTHING;

-- ATOMIC place_order
CREATE OR REPLACE FUNCTION place_order(p_buyer UUID, p_category UUID, p_quantity INT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_price NUMERIC;
  v_total NUMERIC;
  v_balance NUMERIC;
  v_order_id UUID;
  v_acc RECORD;
  v_taken INT := 0;
BEGIN
  SELECT price_bdt INTO v_price FROM categories WHERE id = p_category AND is_active;
  IF v_price IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  v_total := v_price * p_quantity;

  SELECT balance_bdt INTO v_balance FROM profiles WHERE id = p_buyer FOR UPDATE;
  IF v_balance < v_total THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO orders(buyer_id, category_id, quantity, unit_price_bdt, total_bdt, status)
  VALUES (p_buyer, p_category, p_quantity, v_price, v_total, 'pending')
  RETURNING id INTO v_order_id;

  FOR v_acc IN
    SELECT id, seller_id FROM accounts
    WHERE category_id = p_category AND status = 'available'
    ORDER BY created_at LIMIT p_quantity FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE accounts SET status='sold', buyer_id=p_buyer, sold_at=now(), updated_at=now()
      WHERE id = v_acc.id;
    INSERT INTO order_items(order_id, account_id, seller_id, unit_price_bdt)
      VALUES (v_order_id, v_acc.id, v_acc.seller_id, v_price);
    v_taken := v_taken + 1;
  END LOOP;

  IF v_taken < p_quantity THEN
    UPDATE orders SET status='failed' WHERE id = v_order_id;
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  UPDATE profiles SET balance_bdt = balance_bdt - v_total, updated_at=now() WHERE id = p_buyer;
  INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
  VALUES (p_buyer, 'purchase', -v_total, v_balance - v_total, v_order_id, 'Order ' || v_order_id);

  UPDATE orders SET status='completed', updated_at=now() WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total, 'quantity', v_taken);
END $$;
-- ============ Messaging / Notices / Support (added) ============
CREATE TABLE IF NOT EXISTS admin_message_threads (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_is_admin BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread ON admin_messages(thread_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity notice_severity NOT NULL DEFAULT 'info',
  audience notice_audience NOT NULL DEFAULT 'all',
  pinned BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notices_active ON notices(is_active, audience, pinned, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category support_ticket_category NOT NULL DEFAULT 'general',
  subject TEXT NOT NULL,
  status support_ticket_status NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_is_admin BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);

-- ===== Seller upload review / payout columns =====
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS rejected_uids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS rejected_count INT NOT NULL DEFAULT 0;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS accepted_count INT NOT NULL DEFAULT 0;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS unit_price_bdt NUMERIC;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS payout_bdt NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS review_note TEXT;
CREATE INDEX IF NOT EXISTS idx_seller_upload_audits_review_status
  ON seller_upload_audits(review_status, created_at DESC);

-- Collected/downloaded tracking (admin downloaded the batch)
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;
ALTER TABLE seller_upload_audits ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES users(id);

-- ===== Performance indexes (hot paths) =====
CREATE INDEX IF NOT EXISTS idx_order_items_seller_created
  ON order_items(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replacement_items_seller_outcome
  ON replacement_items(seller_id, outcome);
CREATE INDEX IF NOT EXISTS idx_accounts_seller_created
  ON accounts(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounts_created
  ON accounts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_messages_thread_created
  ON admin_messages(thread_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_unread
  ON admin_messages(thread_user_id) WHERE sender_is_admin = true AND read_at IS NULL;
