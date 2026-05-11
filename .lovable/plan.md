## Scope

Five things in one batch:

1. Landing pricing card — strip the price numbers (3rd screenshot)
2. Premium "PART OF BASICTRICK MARKETPLACE" badge (glass + gold accent)
3. Deploy fix for the `k.roles.map` admin crash (already coded, just needs ship)
4. Payment toggles — method-level (bKash / Nagad / Binance) AND per-account (rows in `payment_accounts`)
5. New Plisio crypto auto-deposit gateway, **hidden from users by default**, full create-invoice + webhook flow

---

## 1. Pricing card (`src/pages/Index.tsx`)

In the "Today's pricing" hero card, drop `৳ 120 / 180 / 99 / 299` and the `/ PC` unit. Keep product name, tag (Standard / Premium / Subscription), and stock count. Replace the right-side price column with a small "Live" pulse + stock count, so the card still looks dense.

## 2. Premium brand badge (`src/components/BrandTagline.tsx`)

Rebuild as a glass-pill with a subtle **gold gradient border** (HSL tokens) and a thin gold inner shimmer:

- Border: gradient `hsl(45 90% 60%) → hsl(35 80% 45%) → hsl(45 90% 60%)` masked onto the rounded outline (use `padding-box` + `border-box` background trick)
- Backdrop: `backdrop-blur-2xl` + 8% white overlay
- Type: existing display font, tighter tracking `0.28em`, gold text-shadow
- Sparkle icons → `Crown` icon on the left only, gold-tinted
- Add gold tokens `--brand-gold`, `--brand-gold-soft` to `index.css`

## 3. Ship the admin crash fix

Already in `src/components/admin/UsersManager.tsx` (defensive `roles` array). VPS deploy commands at the end.

## 4. Payment method on/off — two layers

### DB migration (additive, in `nexusx-api/sql/schema.sql` + new migration script)

```sql
ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
-- already exists actually; just ensures presence

-- Method-level toggles stored under app_settings key 'payment_methods_enabled'
-- value JSON: { "bkash": true, "nagad": true, "binance": true, "plisio": false }
```

### Backend (`nexusx-api/src/routes/admin.ts` + `settings.ts`)

- Already has `PUT /api/admin/settings/:key` — whitelist `payment_methods_enabled`
- `PUT /api/admin/payment-accounts/:id/toggle` → flip `is_active`
- `GET /api/settings` → expose `payment_methods_enabled` publicly

### Frontend

- `PaymentAccountsManager.tsx`: per-method **switch** at the top of each method card
- `PaymentAccountsManager.tsx`: per-account row toggle in the existing accounts list section
- `usePaymentAccounts.tsx`: load `payment_methods_enabled`, expose `enabledMethods`
- `DepositWizard.tsx`: hide methods where enabled === false

## 5. Plisio crypto auto-deposit (full integration, hidden from users initially)

### Secret

Request `PLISIO_SECRET_KEY` via add_secret. Stored on the VPS env (will need to be added to `nexusx-api/.env` after the user pastes it).

### DB migration

```sql
CREATE TABLE IF NOT EXISTS crypto_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'plisio',
  invoice_id text NOT NULL UNIQUE,        -- Plisio txn_id
  order_number text NOT NULL UNIQUE,      -- our local ref
  amount_bdt numeric NOT NULL,
  amount_usd numeric,
  currency text,                          -- e.g. USDT_TRX
  status text NOT NULL DEFAULT 'new',     -- new|pending|completed|expired|cancelled|error
  invoice_url text,
  raw jsonb,
  topup_id uuid REFERENCES topup_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crypto_invoices_user_idx ON crypto_invoices(user_id, created_at DESC);
```

Also add row to `app_settings`: `plisio_enabled = false`, `bdt_to_usd_rate = 0.0085` (admin-editable).

### Backend — new file `nexusx-api/src/routes/plisio.ts`

- `POST /api/wallet/plisio/create` (auth required)
  1. Validate amount ≥ min
  2. Convert BDT → USD with admin rate
  3. Generate `order_number = NX-<userId-prefix>-<ts>`
  4. `GET https://api.plisio.net/api/v1/invoices/new?api_key=…&source_currency=USD&source_amount=…&order_number=…&order_name=Wallet+topup&callback_url=…&email=…&currency=USDT_TRX`
  5. Insert `crypto_invoices` row (status=`new`)
  6. Return `{ invoice_url, invoice_id, order_number }`
- `POST /api/webhooks/plisio` (no auth, HMAC-verified)
  1. Verify `verify_hash` per Plisio spec (sort params, JSON-stringify, HMAC SHA1 with secret)
  2. Find invoice by `txn_id`
  3. Update status; on `completed` & not yet credited:
     - Create `topup_requests` row already-approved with `source='plisio'`, `method='binance'` (closest existing), `txn_id=invoice_id`, `screenshot_url=null`
     - Insert `balance_ledger` topup
     - `UPDATE profiles SET balance_bdt += amount`
     - Insert user notification
  4. Return `{ status: 'success' }` (Plisio expects this exact body)

Wire in `server.ts`. Add `verify_jwt = false` equivalent — since Express, just no `authRequired` on webhook.

### Frontend (admin only — hidden from users until enabled)

- `PaymentAccountsManager.tsx` → new "Auto crypto gateways" section with **Plisio toggle** + BDT→USD rate input
- `DepositWizard.tsx` → adds Plisio as a 4th method ONLY if `plisio_enabled` AND `payment_methods_enabled.plisio`. Different flow: button "Generate crypto invoice" → calls `/api/wallet/plisio/create` → opens `invoice_url` in new tab → shows pending status. No screenshot step.
- New "Crypto deposits" admin tab (lightweight) listing `crypto_invoices` for monitoring

**Default state**: both `plisio_enabled = false` AND `payment_methods_enabled.plisio = false`, so users see nothing; admin sees the toggles greyed-on.

---

## Deploy commands (after I push)

You'll need to run on VPS once code is merged:

```bash
cd /var/www/nexusx/nexusx-api
git pull
npm install
echo "PLISIO_SECRET_KEY=…" >> .env   # I'll prompt you for it
echo "PUBLIC_API_BASE=https://api.nexus-x.cloud" >> .env
npm run migrate                       # runs the new SQL
npm run build
pm2 restart nexusx-api

# frontend
cd /var/www/nexusx
git pull && npm install && npm run build
rsync -a --delete dist/ /var/www/buy.nexus-x.cloud/
```

And in Plisio dashboard set callback URL → `https://api.nexus-x.cloud/api/webhooks/plisio`.

---

## Order of implementation

1. Migration SQL (Plisio table + new app_settings keys) — needs your approval first
2. Backend routes (plisio.ts, settings whitelist update, payment_accounts toggle)
3. Frontend (Logo card, BrandTagline, PaymentAccountsManager, DepositWizard, hook)
4. Request `PLISIO_SECRET_KEY`
5. Hand you the deploy block

Confirm and I'll execute.
