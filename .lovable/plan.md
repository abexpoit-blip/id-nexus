
# Implementation Plan

This is a large change — roughly 4 phases. I'll ship them in order so each phase is testable on the live site before moving on.

---

## Phase 1 — Two separate login pages

**Frontend (`src/`)**
- Add `src/pages/SellerLogin.tsx` mirroring `AdminLogin.tsx`:
  - Email + password form
  - On submit: sign in → check role; if not `seller` → sign out, show "seller access required"
- Add route `/seller-login` in `App.tsx`
- Update normal `/login` (Auth page) so successful login of a *seller-role* user is allowed but the Seller menu is **hidden** unless they came through `/seller-login` is overkill — instead: hide all "Seller" UI from buyers. Only role check matters.
- In `AppShell` / nav: show "Seller area" link only when `roles.includes('seller')`. Buyers never see it.
- Add `<ProtectedRoute requiredRole="seller">` guard around `/seller/*` routes; non-sellers → redirect to `/dashboard` with toast.
- Update `SellerApply` page CTA to point buyers there; once approved, give them the `/seller-login` URL.

**Backend (`nexusx-api/`)**
- No new routes needed; `/api/auth/me` already returns roles.

---

## Phase 2 — Manual admin overrides

**Backend new endpoints (`nexusx-api/src/routes/admin.ts`)**
- `POST /api/admin/orders/:id/cancel-refund` — set order status `cancelled`, refund buyer wallet, mark accounts back to `available`, write ledger + audit
- `POST /api/admin/replacements/:itemId/manual-replace` — body `{ account_id }`. Admin picks any available account to fulfill replacement
- `POST /api/admin/bulk` — body `{ entity: 'orders'|'topups'|'withdraws'|'seller_apps'|'replacements', ids: [], action: 'approve'|'reject'|'delete', note? }`
- All wrapped in DB transactions; all write to `audit_logs`

**Frontend `src/pages/Admin.tsx` (or split into tabs)**
- Each table row: kebab menu with new actions (Cancel & Refund, Manual Replace, Force Reject)
- Manual-replace dialog: searchable account picker (by category, available stock)
- Bulk: row checkboxes + sticky action bar at bottom (Approve N / Reject N / Delete N)

---

## Phase 3 — Upgraded admin dashboard

Redesign `Admin.tsx` shell into a sidebar + content layout (shadcn `Sidebar`):

```text
┌──────────┬─────────────────────────────────────┐
│ Sidebar  │  Topbar: GlobalSearch | Notif | Me  │
│ Overview ├─────────────────────────────────────┤
│ Orders   │  KPI cards row                      │
│ Stock    │  Charts row (revenue, orders/day)   │
│ Topups   ├──────────────┬──────────────────────┤
│ Withdraw │  Main panel  │  Activity feed       │
│ Sellers  │              │  (live updates)      │
│ Reports  │              │                      │
└──────────┴──────────────┴──────────────────────┘
```

**Components**
- `AdminSidebar.tsx` — collapsible icon sidebar, sections per area
- `AdminTopbar.tsx` — `GlobalSearch` (cmd-k style) querying `/api/admin/search?q=` across users/orders/accounts/txns
- `KpiCards.tsx` — today's revenue, pending topups, pending withdraws, low-stock alerts
- `RevenueChart.tsx` + `OrdersChart.tsx` — using existing `recharts` (already in `charts-*.js` bundle)
- `ActivityFeed.tsx` — Supabase Realtime channel on `audit_logs` table; live new-event toasts
- `SellerLeaderboard.tsx` — top-10 sellers by 30-day revenue, with risk badge if replacement-rate > 5%

**Backend additions**
- `GET /api/admin/dashboard/kpis` — aggregate counts/sums
- `GET /api/admin/dashboard/timeseries?days=30` — daily revenue + order count
- `GET /api/admin/dashboard/leaderboard` — top sellers + risk metrics
- `GET /api/admin/search?q=` — fuzzy across users.email, orders.id, accounts.uid, ledger.note

---

## Phase 4 — Seller payout schedule

**DB migration on VPS postgres** (NOT Supabase — backend uses its own DB):
```sql
CREATE TABLE seller_payout_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|approved|paid
  created_at timestamptz DEFAULT now(),
  approved_by uuid, approved_at timestamptz, paid_at timestamptz
);
CREATE TABLE seller_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES seller_payout_runs(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL,
  gross_bdt numeric NOT NULL,
  refunds_bdt numeric NOT NULL DEFAULT 0,
  net_bdt numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|approved|paid|skipped
  payout_txn_id text, note text
);
```

**Backend**
- `POST /api/admin/payouts/generate?from&to` — creates a run + per-seller items
- `POST /api/admin/payouts/:runId/approve`
- `POST /api/admin/payouts/items/:id/mark-paid` — body `{ txn_id }` → credits seller wallet
- Cron-style endpoint protected by `X-Cron-Secret` header for weekly auto-generation (you'd hit it from a system cron)

**Frontend**
- New tab in admin: "Payouts" — list of runs, drill into items, approve / mark paid

---

## Phase 5 — Systemd already covered

Done in chat — `/etc/systemd/system/nexusx-api.service`. No code change needed.

---

## Suggested rollout

1. Start with **Phase 1** (small, isolated, immediate UX win).
2. Then **Phase 2** (high-value admin power, no schema change).
3. Then **Phase 3** (visual upgrade, builds on phase 2 endpoints).
4. **Phase 4** last (touches new tables, deploy carefully).

---

## What I need from you to proceed

1. **Confirm rollout order** above, or reorder.
2. **Authorize Phase 1 start** — I'll implement seller-login + role guards immediately, you redeploy with the standard command and we test before moving on.
3. For Phase 2/3, I'll need to know: do you want **email notifications** to sellers/buyers for these admin actions, or **in-app only**?

Reply "go" + any changes and I'll start with Phase 1.
