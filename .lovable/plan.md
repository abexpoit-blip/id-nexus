# Full VPS Migration + Feature Roadmap

**Goal:** Move the entire stack off Lovable Cloud (Supabase) to the user's VPS.
- Frontend: `https://buy.nexus-x.cloud`
- API:      `https://api.nexus-x.cloud`
- DB:       Postgres on VPS (already running, used by `nexusx-api`)
- Storage:  Local disk on VPS (`/var/www/nexusx-uploads`, served via nginx + `/uploads/*`)
- Auth:     JWT cookies issued by `nexusx-api` (already partially built)

After migration is done, ship features #1 (bulk tiers), #5 (SLA timer), #9 (analytics).

---

## Current state audit

- **VPS API today (`nexusx-api/`)** — 234 lines, 5 routes:
  `auth`, `categories`, `orders`, `wallet`, `admin` (only stock + topup approve/reject).
- **Frontend Supabase usage** — **33 files** importing `@/integrations/supabase/client`.
- **Tables not yet covered by VPS API:**
  profiles, replacement_requests, replacement_items, withdraw_requests,
  topup_requests (with screenshot upload), seller_applications, seller_daily_limits,
  seller_upload_audits, vpn_brands, notifications, audit_logs, app_settings,
  user_roles management, accounts (seller upload + admin manage).
- **Edge functions to port:** `seller-signup`, `upload-screenshot`, `cleanup-screenshots`.

---

## Phased plan

### Phase 1 — VPS API completion (backend-only, no UI changes)
Add the missing route files in `nexusx-api/src/routes/`:
- `profiles.ts` — me/get, update display_name, balance read
- `topups.ts`   — list mine, create (with `multer` screenshot upload), admin approve/reject
- `withdraws.ts` — list mine, create, admin approve/reject
- `replacements.ts` — buyer create + list, admin review
- `seller.ts`   — apply, my-application, daily-limits, upload accounts (CSV), upload audits
- `accounts.ts` — seller list/upload, admin manage
- `vpn.ts`      — brands list, vpn order create + detail
- `notifications.ts` — list mine, mark read (long-poll for now, socket.io later)
- `admin-extras.ts` — users list, role grant/revoke, audit logs, app_settings, seller-applications review, payment-accounts CRUD

Add a `migrate.ts` script that creates any missing tables on VPS Postgres
(mirroring the current Supabase schema 1:1, minus `telegram_*` tables).

### Phase 2 — Data migration
- One-off Node script: `pg_dump` from Supabase → restore to VPS Postgres
  for: profiles, accounts, categories, orders, order_items, balance_ledger,
  topup_requests, withdraw_requests, replacement_*, seller_*, vpn_brands,
  user_roles, app_settings.
- Re-hash passwords? **No** — Supabase auth.users passwords cannot be exported.
  Force-reset: send all users a one-time password reset link on first VPS login.
  (Or: keep admin + seed accounts manually, others sign up fresh.)
- Move screenshots from Supabase Storage `topup_screenshots` bucket → `/var/www/nexusx-uploads/topups/`.

### Phase 3 — Frontend API client + refactor
- New file: `src/lib/api.ts` — typed fetch wrapper with cookie auth, base = `VITE_API_BASE`.
- New file: `src/hooks/useAuth.tsx` rewrite — call `/api/auth/me`, `/login`, `/logout`, `/register`.
- Refactor each of the 33 files: replace `supabase.from('x').select()` with `api.x.list()` etc.
  Done in batches by feature area:
  1. Auth + Login/Register/AdminLogin/ClaimAdmin
  2. Wallet + Deposit + Topup screenshots
  3. Browse + OrderDetail + Vpn
  4. Seller (Apply, Onboarding, Dashboard)
  5. Replacements
  6. Admin (Overview, Users, Categories, Brands, Sellers, Payments, Stock, Audits)
  7. Notifications
- Delete `src/integrations/supabase/` and `supabase/` directory.
- Remove all `@supabase/*` deps; remove Lovable Cloud config.

### Phase 4 — Hosting + DNS
- Build frontend → static files → upload to VPS at `/var/www/buy.nexus-x.cloud/`.
- nginx vhost: `buy.nexus-x.cloud` (frontend) + `api.nexus-x.cloud` (proxy → :8080).
- Certbot SSL on both.
- DNS A records → VPS IP.
- CI: GitHub Actions workflow for both frontend build+deploy and API restart.

### Phase 5 — Features
1. **#1 Bulk tiers** — schema: `pricing_tiers (category_id, min_qty, discount_pct)`.
   Order endpoint applies tier discount; checkout UI shows live discount.
2. **#5 SLA timer** — already have `accounts.sold_at`. Add `replacement_window_hours`
   to category. Show countdown badge on order detail; expire visually after window.
3. **#9 Analytics** — new admin page `/admin/analytics` with revenue/day chart,
   top categories, top sellers, conversion funnel. Recharts. SQL aggregations
   exposed via `/api/admin/analytics/*`.

---

## Time estimate

| Phase | Effort | Sessions |
|---|---|---|
| 1 — API completion | ~1500 lines of route code + tests | 3-4 |
| 2 — Data migration | scripts + dry runs | 1-2 |
| 3 — Frontend refactor | 33 files, batched | 4-5 |
| 4 — Hosting / DNS | nginx + CI | 1 |
| 5 — Features 1/5/9 | medium per feature | 2-3 |
| **Total** | | **~12-15 sessions** |

---

## Starting now

**Phase 1, batch A:** scaffold `profiles`, `topups`, `withdraws`, `notifications`, `seller`
route files in `nexusx-api/`, plus the `migrate.ts` script with the missing tables.
No frontend changes yet — site keeps working on current Supabase backend until
Phase 3.

## Open questions to confirm before phase 2
- **Password migration:** force-reset everyone, or keep only admin + re-onboard the rest?
- **Topup screenshots:** keep on local disk (simple, backed up via VPS snapshot), or use
  S3-compatible storage like Backblaze B2 for redundancy?
- **Realtime:** the current app uses Supabase realtime in a couple of places —
  switch to socket.io (already imported in `server.ts`) or polling?