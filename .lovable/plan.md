
# Basictrick ID Buy Sell — Marketplace + Telegram Bot

**Brand:** Logo "Nexus X" • Tagline "Part of Basictrick MarketPlace" • Platform name "Basictrick ID Buy Sell"
**Stack:** React + Tailwind (responsive, app-like) on Lovable → push to GitHub → you deploy to your VPS. Backend uses Lovable Cloud during build; we keep schema clean so you can migrate to self-hosted Postgres on your VPS later. No business data stays on Lovable in production.

---

## Phase 1 — Public Website (PC + Mobile, app-feel)

- Landing page with Nexus X branding, hero (Facebook ID marketplace + VPN), live stats (stock per category, today's price), how-it-works, FAQ, footer.
- Smooth transitions, bottom nav on mobile, sticky top bar on desktop. Dark/light theme.
- Auth: email + password signup/login. After signup, user gets a unique **Telegram link code**. Sending `/start <code>` to bot permanently links the account (one-time).
- Tutorial pages with embedded video links (admin-editable) — separate buyer & seller tutorials.

## Phase 2 — Buyer Experience

- **Buyer dashboard:** balance, recent orders, replacement status, "old account info" panel showing purchases for last 48h.
- **Browse & buy IDs:** two categories `61xxx` and `1000xxx`, live price + stock from admin. Choose quantity → pay from balance → instant delivery.
- **Delivery options:** Excel download, copy-one-by-one, copy-all button. Same delivery available in Telegram bot (Excel file + copy-all button).
- **Replacement system:**
  - 2h window if order qty 1–2; 6h window if 3+.
  - Buyer submits bad UID(s); system verifies UID belongs to their order (rejects mismatches).
  - Admin reviews → on approval, fresh ID auto-pulled from same seller's stock; seller notified instantly.
- **Wallet top-up:** manual bKash & Nagad — buyer submits trxID + screenshot → admin approves → balance credited.
- **VPN orders:** weekly/monthly plans, pay from balance → admin manually delivers credentials in dashboard → buyer + bot notified.

## Phase 3 — Seller Experience

- **Seller dashboard:** today's submissions, today's sell rate, stock count, paid/unpaid balance, withdraw button, live "report not arrived for 21 days" / pending-report indicators.
- **Excel upload to store:**
  - Drag & drop `.xlsx`, system parses, validates schema, **dedupes UIDs globally** (no UID can exist twice across all sellers ever).
  - Preview screen shows accepted vs duplicates → seller confirms → added to live stock.
  - Daily submit cutoff (admin-set, default 11:50 PM Bangladesh time). After cutoff, uploads blocked; today's reports release next day (admin can delay individual sellers).
- **Reports:** live "OK IDs" vs "Issue IDs" stats, per-day breakdown, replacement notifications when their ID gets replaced.
- **Withdrawals:** request payout → admin marks paid → balance deducted.
- **Tutorial videos** (admin-editable links).

## Phase 4 — Admin Control Panel

- **Settings:** category prices (change anytime, applies to new orders), submit cutoff time, replacement windows (2h/6h configurable), withdrawal minimums, bot on/off, all tutorial video links, branding text.
- **Users:** list all, adjust balance (logged), ban, view full history.
- **Operations:** approve/reject replacements, mark IDs as bad, approve top-ups & withdrawals, fulfill VPN orders, send balance to any user, broadcast message to bot users.
- **Live dashboards:** today's sales, submissions per seller, stock per category, pending reports/withdrawals/top-ups, revenue.

## Phase 5 — Telegram Bot (buyers only)

- Same menu structure as website: Buy IDs, My Orders, Wallet, Replacements, VPN, Tutorials, Balance.
- Linked via one-time `/start <code>` from website.
- Real-time sync — same balance, same orders, same stock on both sides.
- Excel delivery + copy-all button in chat.
- Notifications: order delivered, replacement approved/rejected, top-up approved, balance changes.
- Admins do NOT use the bot — admin work only on website.

## Phase 6 — Hardening & Handoff

- Balance integrity: every balance change is a ledger row (immutable), so users never lose history. Locks on order/replace/withdraw to prevent race conditions.
- Audit logs for all admin actions.
- Mobile responsive QA on iPhone/Android sizes; PWA-style polish (installable feel).
- README with VPS deploy steps (GitHub → pull → run on your VPS), environment variables, and migration notes from Lovable Cloud → self-hosted Postgres.

---

**What I need from you after approval:**
1. Telegram Bot token (we'll add as a secret).
2. Cryptomus credentials — *deferred*, you confirmed bKash/Nagad manual only for MVP. We can wire Cryptomus later.
3. Tutorial video links (or placeholders for now, you fill from admin panel).

We'll build in the order above so you see something usable early (website + auth + buyer browse) before deeper admin/bot work.
