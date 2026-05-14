import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq, setAuthCookies } from "../auth";

const router = Router();
router.use(authRequired, requireRole("admin"));

router.get("/stock", async (_req, res) => {
  const rows = await q(
    `SELECT c.id AS category_id, c.name AS category_name, c.price_bdt, c.is_active,
       COUNT(*) FILTER (WHERE a.status='available')::int AS available,
       COUNT(*) FILTER (WHERE a.status='sold')::int AS sold,
       COUNT(*) FILTER (WHERE a.status='bad')::int AS bad,
       COUNT(a.id)::int AS total
     FROM categories c LEFT JOIN accounts a ON a.category_id = c.id
     GROUP BY c.id ORDER BY c.sort_order`
  );
  res.json({ stock: rows });
});

router.get("/topups", async (_req, res) => {
  const rows = await q(
    `SELECT t.*, u.email AS user_email FROM topup_requests t
     JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 200`
  );
  res.json({ topups: rows });
});

router.post("/topups/:id/approve", async (req: AuthedReq, res) => {
  const id = req.params.id;
  const [r] = await q(`SELECT * FROM topup_requests WHERE id=$1 FOR UPDATE`, [id]);
  if (!r) return res.status(404).json({ error: "not_found" });
  if (r.status !== "pending") return res.status(400).json({ error: "already_reviewed" });
  const [pre] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [r.user_id]);
  const balanceBefore = Number(pre?.balance_bdt ?? 0);
  await q(`UPDATE profiles SET balance_bdt = balance_bdt + $1 WHERE id=$2`, [r.amount_bdt, r.user_id]);
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
  const balanceAfter = Number(p.balance_bdt);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
     VALUES($1,'topup',$2,$3,$4,$5)`,
    [r.user_id, r.amount_bdt, p.balance_bdt, r.id, "Top-up approved"]
  );
  await q(
    `UPDATE topup_requests SET status='approved', reviewed_by=$2, reviewed_at=now(), approved_at=now() WHERE id=$1`,
    [id, req.user!.id]
  );
  res.json({
    ok: true,
    new_balance: balanceAfter,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    amount: Number(r.amount_bdt),
  });
});

router.post("/topups/:id/reject", async (req: AuthedReq, res) => {
  const [r] = await q(`SELECT user_id, amount_bdt FROM topup_requests WHERE id=$1`, [req.params.id]);
  await q(
    `UPDATE topup_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
     WHERE id=$1 AND status='pending'`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  let balance = 0;
  if (r) {
    const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
    balance = Number(p?.balance_bdt ?? 0);
  }
  // No balance change on reject; before === after
  res.json({
    ok: true,
    balance_before: balance,
    balance_after: balance,
    amount: r ? Number(r.amount_bdt) : 0,
  });
});

// ===== BULK PAYMENT ACTIONS =====
// All bulk endpoints process items sequentially and return a per-id result.
// They never throw on individual failures so the client always gets a summary.

type BulkRow = {
  id: string;
  ok: boolean;
  user_id?: string;
  amount?: number;
  balance_before?: number;
  balance_after?: number;
  error?: string;
};

const sanitizeIds = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .slice(0, 200)
    )
  );
};

router.post("/topups/bulk-approve", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: BulkRow[] = [];
  for (const id of ids) {
    try {
      const [r] = await q(`SELECT * FROM topup_requests WHERE id=$1 FOR UPDATE`, [id]);
      if (!r) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (r.status !== "pending") {
        results.push({ id, ok: false, user_id: r.user_id, amount: Number(r.amount_bdt), error: "already_reviewed" });
        continue;
      }
      const [pre] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [r.user_id]);
      const before = Number(pre?.balance_bdt ?? 0);
      await q(`UPDATE profiles SET balance_bdt = balance_bdt + $1 WHERE id=$2`, [r.amount_bdt, r.user_id]);
      const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
      const after = Number(p.balance_bdt);
      await q(
        `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
         VALUES($1,'topup',$2,$3,$4,$5)`,
        [r.user_id, r.amount_bdt, after, r.id, "Top-up approved (bulk)"]
      );
      await q(
        `UPDATE topup_requests SET status='approved', reviewed_by=$2, reviewed_at=now(), approved_at=now() WHERE id=$1`,
        [id, req.user!.id]
      );
      results.push({
        id, ok: true, user_id: r.user_id, amount: Number(r.amount_bdt),
        balance_before: before, balance_after: after,
      });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || "internal_error" });
    }
  }
  res.json({ results });
});

router.post("/topups/bulk-reject", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: BulkRow[] = [];
  for (const id of ids) {
    try {
      const [r] = await q(`SELECT user_id, amount_bdt, status FROM topup_requests WHERE id=$1`, [id]);
      if (!r) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (r.status !== "pending") {
        results.push({ id, ok: false, user_id: r.user_id, amount: Number(r.amount_bdt), error: "already_reviewed" });
        continue;
      }
      await q(
        `UPDATE topup_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
           WHERE id=$1 AND status='pending'`,
        [id, note, req.user!.id]
      );
      const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
      const bal = Number(p?.balance_bdt ?? 0);
      results.push({
        id, ok: true, user_id: r.user_id, amount: Number(r.amount_bdt),
        balance_before: bal, balance_after: bal,
      });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || "internal_error" });
    }
  }
  res.json({ results });
});

router.post("/withdraws/bulk-reject", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: BulkRow[] = [];
  for (const id of ids) {
    try {
      const [w] = await q(`SELECT user_id, amount_bdt, status FROM withdraw_requests WHERE id=$1`, [id]);
      if (!w) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (w.status !== "pending") {
        results.push({ id, ok: false, user_id: w.user_id, amount: Number(w.amount_bdt), error: "already_reviewed" });
        continue;
      }
      await q(
        `UPDATE withdraw_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
           WHERE id=$1 AND status='pending'`,
        [id, note, req.user!.id]
      );
      const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [w.user_id]);
      const bal = Number(p?.balance_bdt ?? 0);
      results.push({
        id, ok: true, user_id: w.user_id, amount: Number(w.amount_bdt),
        balance_before: bal, balance_after: bal,
      });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || "internal_error" });
    }
  }
  res.json({ results });
});

// USERS
router.get("/users", async (_req, res) => {
  const rows = await q(
    `SELECT u.id, u.email, u.created_at, p.display_name, p.balance_bdt, p.is_banned,
       COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles,
       COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id=u.id AND o.status='completed'),0) AS orders_count,
       COALESCE((SELECT SUM(total_bdt)::float FROM orders o WHERE o.buyer_id=u.id AND o.status='completed'),0) AS lifetime_spend_bdt,
       COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.buyer_id=u.id),0) AS replacements_filed,
       COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.buyer_id=u.id AND ri.outcome='rejected'),0) AS replacements_rejected
     FROM users u LEFT JOIN profiles p ON p.id=u.id
     LEFT JOIN user_roles r ON r.user_id=u.id
     GROUP BY u.id, p.display_name, p.balance_bdt, p.is_banned ORDER BY u.created_at DESC LIMIT 500`
  );
  // Risk: replacements_filed / max(orders_count,1); flag if >= 0.25 with at least 3 orders
  const enriched = rows.map((r: any) => {
    const oc = Number(r.orders_count || 0);
    const rf = Number(r.replacements_filed || 0);
    const rate = oc > 0 ? rf / oc : 0;
    let risk: "low" | "medium" | "high" = "low";
    if (oc >= 3 && rate >= 0.5) risk = "high";
    else if (oc >= 3 && rate >= 0.25) risk = "medium";
    else if (oc >= 5 && rf >= 4) risk = "medium";
    return { ...r, replacement_rate: rate, risk_level: risk };
  });
  res.json({ users: enriched });
});

router.post("/users/:id/ban", async (req: AuthedReq, res) => {
  await q(`UPDATE profiles SET is_banned=$2 WHERE id=$1`, [req.params.id, !!req.body?.banned]);
  res.json({ ok: true });
});

router.post("/users/:id/roles", async (req: AuthedReq, res) => {
  const { add, remove } = req.body || {};
  if (Array.isArray(add)) {
    for (const r of add)
      await q(`INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, r]);
  }
  if (Array.isArray(remove)) {
    for (const r of remove)
      await q(`DELETE FROM user_roles WHERE user_id=$1 AND role=$2`, [req.params.id, r]);
  }
  res.json({ ok: true });
});

router.post("/users/:id/balance", async (req: AuthedReq, res) => {
  const delta = Number(req.body?.delta_bdt);
  const note = req.body?.note || "Admin adjustment";
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "invalid_delta" });
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!p) return res.status(404).json({ error: "user_not_found" });
  const newBal = Number(p.balance_bdt) + delta;
  if (newBal < 0) return res.status(400).json({ error: "would_go_negative" });
  await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [newBal, req.params.id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, note)
     VALUES($1,'admin_adjustment',$2,$3,$4)`,
    [req.params.id, delta, newBal, note]
  );
  res.json({ ok: true, balance: newBal });
});

// CATEGORIES
router.get("/categories", async (_req, res) => {
  const rows = await q(`SELECT * FROM categories ORDER BY sort_order, name`);
  res.json({ categories: rows });
});

router.post("/categories", async (req, res) => {
  const { slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days } = req.body || {};
  if (!slug || !name || price_bdt == null) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO categories(slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days)
     VALUES($1,$2,COALESCE($3,'fb_account'),$4,$5,COALESCE($6,true),COALESCE($7,0),$8,$9) RETURNING *`,
    [slug, name, kind, description || null, price_bdt, is_active, sort_order, brand_id || null, duration_days || null]
  );
  res.json({ category: r });
});

router.patch("/categories/:id", async (req, res) => {
  const f = req.body || {};
  const [r] = await q(
    `UPDATE categories SET
       name=COALESCE($2,name), description=COALESCE($3,description),
       price_bdt=COALESCE($4,price_bdt), is_active=COALESCE($5,is_active),
       sort_order=COALESCE($6,sort_order), brand_id=COALESCE($7,brand_id),
       duration_days=COALESCE($8,duration_days), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [req.params.id, f.name, f.description, f.price_bdt, f.is_active, f.sort_order, f.brand_id, f.duration_days]
  );
  res.json({ category: r });
});

router.delete("/categories/:id", async (req, res) => {
  await q(`DELETE FROM categories WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// SELLER APPLICATIONS
router.get("/seller-applications", async (_req, res) => {
  const rows = await q(
    `SELECT a.*, u.email AS user_email FROM seller_applications a
     JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200`
  );
  res.json({ applications: rows });
});

router.post("/seller-applications/:id/approve", async (req: AuthedReq, res) => {
  const [a] = await q(`SELECT * FROM seller_applications WHERE id=$1`, [req.params.id]);
  if (!a) return res.status(404).json({ error: "not_found" });
  await q(`INSERT INTO user_roles(user_id, role) VALUES($1,'seller') ON CONFLICT DO NOTHING`, [a.user_id]);
  // Remove buyer role per business rule (sellers lose buyer access)
  await q(`DELETE FROM user_roles WHERE user_id=$1 AND role='buyer'`, [a.user_id]);
  await q(
    `UPDATE seller_applications SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
    [a.id, req.user!.id]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
       VALUES($1,$2,'seller_application_approved','seller_application',$3,$4,$5)`,
    [req.user!.id, req.user!.email, a.id, `Approved seller for ${a.email}`, JSON.stringify({ user_id: a.user_id })]
  );
  res.json({ ok: true });
});

router.post("/seller-applications/:id/reject", async (req: AuthedReq, res) => {
  await q(
    `UPDATE seller_applications SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  res.json({ ok: true });
});

// SELLER LIMITS
router.get("/seller-limits", async (_req, res) => {
  const rows = await q(
    `SELECT l.*, u.email FROM seller_daily_limits l JOIN users u ON u.id=l.seller_id ORDER BY u.email`
  );
  res.json({ limits: rows });
});

router.post("/seller-limits/:seller_id", async (req: AuthedReq, res) => {
  const { daily_limit, note } = req.body || {};
  if (!Number.isFinite(Number(daily_limit))) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO seller_daily_limits(seller_id, daily_limit, note, updated_by)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(seller_id) DO UPDATE SET daily_limit=EXCLUDED.daily_limit, note=EXCLUDED.note,
       updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`,
    [req.params.seller_id, Number(daily_limit), note || null, req.user!.id]
  );
  res.json({ limit: r });
});

// PAYMENT ACCOUNTS (admin-managed numbers shown to buyers)
router.get("/payment-accounts", async (_req, res) => {
  const rows = await q(`SELECT * FROM payment_accounts ORDER BY sort_order, method`);
  res.json({ accounts: rows });
});

router.post("/payment-accounts", async (req, res) => {
  const { method, label, account_number, account_type, instructions, is_active, sort_order } = req.body || {};
  if (!method || !label || !account_number) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO payment_accounts(method, label, account_number, account_type, instructions, is_active, sort_order)
     VALUES($1,$2,$3,$4,$5,COALESCE($6,true),COALESCE($7,0)) RETURNING *`,
    [method, label, account_number, account_type || null, instructions || null, is_active, sort_order]
  );
  res.json({ account: r });
});

router.delete("/payment-accounts/:id", async (req, res) => {
  await q(`DELETE FROM payment_accounts WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Toggle a single payment_account row on/off
router.put("/payment-accounts/:id/toggle", async (req: AuthedReq, res) => {
  const [r] = await q(
    `UPDATE payment_accounts SET is_active = NOT is_active, updated_at = now()
     WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (!r) return res.status(404).json({ error: "not_found" });
  res.json({ account: r });
});

// List crypto invoices (admin monitoring)
router.get("/crypto-invoices", async (_req, res) => {
  const rows = await q(
    `SELECT ci.*, u.email AS user_email
       FROM crypto_invoices ci
       LEFT JOIN users u ON u.id = ci.user_id
      ORDER BY ci.created_at DESC LIMIT 200`
  );
  res.json({ invoices: rows });
});

// AUDIT LOGS
router.get("/audit-logs", async (_req, res) => {
  const rows = await q(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`);
  res.json({ logs: rows });
});

// APP SETTINGS
router.get("/settings", async (_req, res) => {
  const rows = await q(`SELECT * FROM app_settings ORDER BY key`);
  res.json({ settings: rows });
});

router.put("/settings/:key", async (req: AuthedReq, res) => {
  const [prev] = await q<{ value: any }>(`SELECT value FROM app_settings WHERE key=$1`, [req.params.key]);
  const [r] = await q(
    `INSERT INTO app_settings(key, value, updated_by) VALUES($1,$2,$3)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()
     RETURNING *`,
    [req.params.key, req.body?.value || {}, req.user!.id]
  );
  // Audit-log selected keys for transparent change history
  if (["brand_credit", "payment_accounts", "min_deposit"].includes(req.params.key)) {
    const eventType = req.params.key === "brand_credit"
      ? "brand_credit_updated"
      : "payment_accounts_updated";
    await q(
      `INSERT INTO audit_logs(actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
         VALUES($1,$2,$3,'app_setting',NULL,$4,$5)`,
      [req.user!.id, req.user!.email, eventType,
       `Updated ${req.params.key}`,
       JSON.stringify({ key: req.params.key, old: prev?.value ?? null, new: req.body?.value ?? null })]
    );
  }
  res.json({ setting: r });
});

// OVERVIEW (dashboard KPIs)
router.get("/overview", async (_req, res) => {
  const today0 = `date_trunc('day', now())`;
  const [revToday] = await q<{ s: number }>(
    `SELECT COALESCE(SUM(total_bdt),0)::float AS s FROM orders WHERE status='completed' AND created_at >= ${today0}`
  );
  const [rev7] = await q<{ s: number }>(
    `SELECT COALESCE(SUM(total_bdt),0)::float AS s FROM orders WHERE status='completed' AND created_at >= ${today0} - interval '6 days'`
  );
  const [rev30] = await q<{ s: number }>(
    `SELECT COALESCE(SUM(total_bdt),0)::float AS s FROM orders WHERE status='completed' AND created_at >= ${today0} - interval '29 days'`
  );
  const [tpend] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c FROM topup_requests WHERE status='pending'`);
  const [wpend] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c FROM withdraw_requests WHERE status='pending'`);
  const [rpend] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c FROM replacement_items WHERE outcome='pending'`);
  const [users] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users`);
  const [signups] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c FROM users WHERE created_at >= ${today0}`);
  const [sellers] = await q<{ c: number }>(`SELECT COUNT(DISTINCT user_id)::int AS c FROM user_roles WHERE role='seller'`);
  const [admins] = await q<{ c: number }>(`SELECT COUNT(DISTINCT user_id)::int AS c FROM user_roles WHERE role='admin'`);
  const [ord] = await q<{ c: number; s: number }>(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(total_bdt),0)::float AS s FROM orders WHERE status='completed' AND created_at >= ${today0}`
  );
  const [bal] = await q<{ s: number }>(`SELECT COALESCE(SUM(balance_bdt),0)::float AS s FROM profiles`);
  res.json({
    revenue_today: revToday.s, revenue_7d: rev7.s, revenue_30d: rev30.s,
    pending_topups: tpend.c, pending_withdraws: wpend.c, pending_replacements: rpend.c,
    total_users: users.c, today_signups: signups.c,
    total_sellers: sellers.c, total_admins: admins.c,
    today_orders: ord.c, today_order_revenue: ord.s,
    total_platform_balance: bal.s,
  });
});

// USERS — search by query (email, name, id)
router.get("/users/search", async (req, res) => {
  const qs = String(req.query.q || "").trim();
  const wildcard = `%${qs.toLowerCase()}%`;
  const rows = await q(
    `SELECT u.id AS user_id, u.email, u.created_at, p.display_name, p.balance_bdt, p.is_banned,
       COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles,
       COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id=u.id AND o.status='completed'),0) AS orders_count,
       COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.buyer_id=u.id),0) AS replacements_filed
     FROM users u LEFT JOIN profiles p ON p.id=u.id
     LEFT JOIN user_roles r ON r.user_id=u.id
     ${qs ? `WHERE LOWER(u.email) LIKE $1 OR LOWER(COALESCE(p.display_name,'')) LIKE $1 OR u.id::text = $2` : ""}
     GROUP BY u.id, p.display_name, p.balance_bdt, p.is_banned ORDER BY u.created_at DESC LIMIT 200`,
    qs ? [wildcard, qs] : []
  );
  const enriched = rows.map((r: any) => {
    const oc = Number(r.orders_count || 0);
    const rf = Number(r.replacements_filed || 0);
    const rate = oc > 0 ? rf / oc : 0;
    let risk: "low" | "medium" | "high" = "low";
    if (oc >= 3 && rate >= 0.5) risk = "high";
    else if (oc >= 3 && rate >= 0.25) risk = "medium";
    else if (oc >= 5 && rf >= 4) risk = "medium";
    return { ...r, replacement_rate: rate, risk_level: risk };
  });
  res.json({ users: enriched });
});

// REPLACEMENTS
router.get("/replacement-items", async (_req, res) => {
  const rows = await q(
    `SELECT id, request_id, reported_uid, outcome, outcome_reason, in_window, window_hours,
            created_at, buyer_id, seller_id, account_id
       FROM replacement_items ORDER BY created_at DESC LIMIT 500`
  );
  res.json({ items: rows });
});

router.post("/replacement-items/:id/resolve", async (req: AuthedReq, res) => {
  // action: replace | refund | reject
  const { action, reason } = req.body || {};
  if (!["replace", "refund", "reject"].includes(action))
    return res.status(400).json({ error: "invalid_action" });
  const [item] = await q(`SELECT * FROM replacement_items WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!item) return res.status(404).json({ error: "not_found" });
  if (item.outcome !== "pending") return res.status(400).json({ error: "already_resolved" });

  if (action === "reject") {
    await q(
      `UPDATE replacement_items SET outcome='rejected', outcome_reason=$2,
         resolved_by=$3, resolved_at=now() WHERE id=$1`,
      [item.id, reason || null, req.user!.id]
    );
    return res.json({ ok: true });
  }

  if (action === "refund") {
    const [oi] = await q(
      `SELECT oi.unit_price_bdt, o.buyer_id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.account_id=$1 LIMIT 1`,
      [item.account_id]
    );
    if (!oi) return res.status(400).json({ error: "no_account" });
    await q(`UPDATE profiles SET balance_bdt = balance_bdt + $1 WHERE id=$2`, [oi.unit_price_bdt, oi.buyer_id]);
    const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [oi.buyer_id]);
    await q(
      `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
         VALUES($1,'refund',$2,$3,$4,$5)`,
      [oi.buyer_id, oi.unit_price_bdt, p.balance_bdt, item.id, "Replacement refund"]
    );
    if (item.account_id)
      await q(`UPDATE accounts SET status='replaced' WHERE id=$1`, [item.account_id]);
    await q(
      `UPDATE replacement_items SET outcome='refunded', outcome_reason=$2,
         resolved_by=$3, resolved_at=now() WHERE id=$1`,
      [item.id, reason || null, req.user!.id]
    );
    return res.json({ ok: true });
  }

  // action === "replace" — same category as the bad account
  if (!item.account_id) return res.status(400).json({ error: "no_account" });
  const [bad] = await q(`SELECT category_id FROM accounts WHERE id=$1`, [item.account_id]);
  if (!bad) return res.status(400).json({ error: "no_account" });
  const [fresh] = await q(
    `SELECT id FROM accounts WHERE category_id=$1 AND status='available'
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [bad.category_id]
  );
  if (!fresh) return res.status(400).json({ error: "no_stock" });
  await q(`UPDATE accounts SET status='replaced' WHERE id=$1`, [item.account_id]);
  await q(`UPDATE accounts SET status='sold', sold_at=now() WHERE id=$1`, [fresh.id]);
  await q(
    `UPDATE replacement_items SET outcome='replaced', outcome_reason=$2,
       replacement_account_id=$3, resolved_by=$4, resolved_at=now() WHERE id=$1`,
    [item.id, reason || null, fresh.id, req.user!.id]
  );
  res.json({ ok: true, replacement_account_id: fresh.id });
});

// Admin replace from a SPECIFIC category
router.post("/replacement-items/:id/replace-from", async (req: AuthedReq, res) => {
  const { category_id, reason } = req.body || {};
  if (!category_id) return res.status(400).json({ error: "invalid_input" });
  const [item] = await q(`SELECT * FROM replacement_items WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!item || item.outcome !== "pending") return res.status(400).json({ error: "not_pending" });
  const [fresh] = await q(
    `SELECT id FROM accounts WHERE category_id=$1 AND status='available'
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [category_id]
  );
  if (!fresh) return res.status(400).json({ error: "no_stock" });
  if (item.account_id) await q(`UPDATE accounts SET status='replaced' WHERE id=$1`, [item.account_id]);
  await q(`UPDATE accounts SET status='sold', sold_at=now() WHERE id=$1`, [fresh.id]);
  await q(
    `UPDATE replacement_items SET outcome='replaced', outcome_reason=$2,
       replacement_account_id=$3, resolved_by=$4, resolved_at=now() WHERE id=$1`,
    [item.id, reason || null, fresh.id, req.user!.id]
  );
  res.json({ ok: true });
});

// PAYMENTS — pending counts for tab badges
router.get("/payments/pending-counts", async (_req, res) => {
  const [tp] = await q<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM topup_requests WHERE status='pending'`
  );
  const [wd] = await q<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM withdraw_requests WHERE status='pending'`
  );
  res.json({ topups: tp.c, withdraws: wd.c });
});

// PAYMENTS — paginated list with filters
// Query: kind=topups|withdraws, q, status, from (ISO), to (ISO), page (1-based), page_size
router.get("/payments", async (req, res) => {
  const kind = String(req.query.kind || "topups") === "withdraws" ? "withdraws" : "topups";
  const search = (req.query.q ? String(req.query.q) : "").trim();
  const status = req.query.status ? String(req.query.status) : "";
  const from = req.query.from ? String(req.query.from) : "";
  const to = req.query.to ? String(req.query.to) : "";
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.page_size || "25"), 10) || 25));
  const offset = (page - 1) * pageSize;

  const isTopups = kind === "topups";
  const table = isTopups ? "topup_requests" : "withdraw_requests";
  const alias = isTopups ? "t" : "w";

  const where: string[] = [];
  const params: any[] = [];
  const add = (clause: string, ...vals: any[]) => {
    vals.forEach((v) => params.push(v));
    where.push(clause);
  };

  if (status) add(`${alias}.status = $${params.length + 1}`, status);
  if (from) add(`${alias}.created_at >= $${params.length + 1}`, from);
  if (to) add(`${alias}.created_at <= $${params.length + 1}`, to);
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    const idMatch = /^[0-9a-f-]{8,}$/i.test(search) ? search : null;
    if (isTopups) {
      const i = params.length;
      params.push(like, like, like, like);
      let clause = `(LOWER(p.display_name) LIKE $${i + 1}
        OR LOWER(p.email) LIKE $${i + 2}
        OR LOWER(t.txn_id) LIKE $${i + 3}
        OR LOWER(t.sender_number) LIKE $${i + 4})`;
      if (idMatch) {
        params.push(idMatch);
        clause = `(${clause} OR t.user_id::text = $${params.length} OR t.id::text = $${params.length})`;
      }
      where.push(clause);
    } else {
      const i = params.length;
      params.push(like, like, like, like);
      let clause = `(LOWER(p.display_name) LIKE $${i + 1}
        OR LOWER(p.email) LIKE $${i + 2}
        OR LOWER(w.payout_txn_id) LIKE $${i + 3}
        OR LOWER(w.receiver_number) LIKE $${i + 4})`;
      if (idMatch) {
        params.push(idMatch);
        clause = `(${clause} OR w.user_id::text = $${params.length} OR w.id::text = $${params.length})`;
      }
      where.push(clause);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseFrom = `FROM ${table} ${alias} LEFT JOIN profiles p ON p.id=${alias}.user_id ${whereSql}`;

  const [{ c: total }] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c ${baseFrom}`, params);

  const rows = await q(
    `SELECT ${alias}.*, p.display_name, p.email AS user_email,
            p.balance_bdt AS user_balance_bdt
       ${baseFrom}
       ORDER BY ${alias}.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );

  res.json({ rows, total, page, page_size: pageSize });
});

// Withdraws — pay
router.post("/withdraws/:id/pay", async (req: AuthedReq, res) => {
  const { payout_txn_id, note } = req.body || {};
  if (!payout_txn_id) return res.status(400).json({ error: "invalid_input" });
  const [w] = await q(`SELECT * FROM withdraw_requests WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!w) return res.status(404).json({ error: "not_found" });
  if (!["pending", "approved"].includes(w.status)) return res.status(400).json({ error: "already_paid" });
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [w.user_id]);
  if (Number(p.balance_bdt) < Number(w.amount_bdt)) return res.status(400).json({ error: "insufficient_balance" });
  const balanceBefore = Number(p.balance_bdt);
  const newBal = balanceBefore - Number(w.amount_bdt);
  await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [newBal, w.user_id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
       VALUES($1,'withdraw', -$2,$3,$4,$5)`,
    [w.user_id, w.amount_bdt, newBal, w.id, note || "Withdraw paid"]
  );
  await q(
    `UPDATE withdraw_requests SET status='paid', payout_txn_id=$2, admin_note=$3,
       reviewed_by=$4, reviewed_at=now() WHERE id=$1`,
    [w.id, payout_txn_id, note || null, req.user!.id]
  );
  res.json({
    ok: true,
    balance_before: balanceBefore,
    balance_after: newBal,
    amount: Number(w.amount_bdt),
  });
});

router.post("/withdraws/:id/reject", async (req: AuthedReq, res) => {
  const [w] = await q(`SELECT user_id, amount_bdt FROM withdraw_requests WHERE id=$1`, [req.params.id]);
  await q(
    `UPDATE withdraw_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
       WHERE id=$1 AND status='pending'`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  let balance = 0;
  if (w) {
    const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [w.user_id]);
    balance = Number(p?.balance_bdt ?? 0);
  }
  res.json({
    ok: true,
    balance_before: balance,
    balance_after: balance,
    amount: w ? Number(w.amount_bdt) : 0,
  });
});

// SELLER LIMITS — extended view + default + clear
router.get("/seller-limits/full", async (_req, res) => {
  const [setting] = await q<{ value: any }>(`SELECT value FROM app_settings WHERE key='default_seller_daily_limit'`);
  const defaultLimit = Number(setting?.value ?? 500);
  const sellers = await q(
    `SELECT u.id AS user_id, p.display_name, p.email, p.telegram_username,
            l.daily_limit
       FROM user_roles r
       JOIN users u ON u.id=r.user_id
       LEFT JOIN profiles p ON p.id=u.id
       LEFT JOIN seller_daily_limits l ON l.seller_id=u.id
       WHERE r.role='seller' ORDER BY p.email NULLS LAST`
  );
  const used = await q<{ seller_id: string; c: number }>(
    `SELECT seller_id, COUNT(*)::int AS c FROM accounts
       WHERE created_at >= date_trunc('day', now() at time zone 'UTC')
       GROUP BY seller_id`
  );
  const usedMap = new Map(used.map((r) => [r.seller_id, r.c]));
  const rows = sellers.map((s: any) => ({ ...s, used_today: usedMap.get(s.user_id) ?? 0 }));
  res.json({ default_limit: defaultLimit, sellers: rows });
});

router.put("/seller-limits/default", async (req: AuthedReq, res) => {
  const n = Number(req.body?.value);
  if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "invalid_input" });
  await q(
    `INSERT INTO app_settings(key, value, updated_by) VALUES('default_seller_daily_limit',$1,$2)
       ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [JSON.stringify(n), req.user!.id]
  );
  res.json({ ok: true });
});

router.delete("/seller-limits/:seller_id", async (req, res) => {
  await q(`DELETE FROM seller_daily_limits WHERE seller_id=$1`, [req.params.seller_id]);
  res.json({ ok: true });
});

// CATEGORIES upsert helper (single endpoint front-end can call with or without id)
router.post("/categories/upsert", async (req, res) => {
  try {
    const { id, slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days } = req.body || {};
    const cleanSlug = String(slug || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || price_bdt == null) return res.status(400).json({ error: "invalid_input" });
    if (id) {
      const [r] = await q(
        `UPDATE categories SET name=$2, slug=COALESCE($3,slug), kind=COALESCE($4,kind),
           description=$5, price_bdt=$6, is_active=$7, sort_order=$8,
           brand_id=$9, duration_days=$10, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [id, name, cleanSlug || null, kind || null, description || null, price_bdt,
         is_active ?? true, sort_order ?? 0, brand_id || null, duration_days || null]
      );
      if (!r) return res.status(404).json({ error: "category_not_found" });
      return res.json({ category: r });
    }
    if (!cleanSlug) return res.status(400).json({ error: "slug_required" });
    const [r] = await q(
      `INSERT INTO categories(slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days)
         VALUES($1,$2,COALESCE($3,'fb_account'),$4,$5,COALESCE($6,true),COALESCE($7,0),$8,$9) RETURNING *`,
      [cleanSlug, name, kind, description || null, price_bdt, is_active, sort_order, brand_id || null, duration_days || null]
    );
    res.json({ category: r });
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "category_slug_exists" });
    throw e;
  }
});

// VPN BRANDS upsert
router.post("/vpn-brands/upsert", async (req, res) => {
  const { id, slug, name, description, logo_url, is_active, sort_order } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: "invalid_input" });
  if (id) {
    const [r] = await q(
      `UPDATE vpn_brands SET name=$2, slug=$3, description=$4, logo_url=$5,
         is_active=$6, sort_order=$7, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, name, slug, description || null, logo_url || null, is_active ?? true, sort_order ?? 0]
    );
    return res.json({ brand: r });
  }
  const [r] = await q(
    `INSERT INTO vpn_brands(slug, name, description, logo_url, is_active, sort_order)
       VALUES($1,$2,$3,$4,COALESCE($5,true),COALESCE($6,0))
       ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
         logo_url=EXCLUDED.logo_url, is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order,
         updated_at=now() RETURNING *`,
    [slug, name, description || null, logo_url || null, is_active, sort_order]
  );
  res.json({ brand: r });
});

router.delete("/vpn-brands/:id", async (req, res) => {
  await q(`DELETE FROM vpn_brands WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Audit logs filtered (event_type optional)
router.get("/audit-logs/filtered", async (req, res) => {
  const event = String(req.query.event || "").trim();
  const rows = await q(
    event && event !== "all"
      ? `SELECT * FROM audit_logs WHERE event_type=$1 ORDER BY created_at DESC LIMIT 500`
      : `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500`,
    event && event !== "all" ? [event] : []
  );
  res.json({ logs: rows });
});

// Admin impersonation: log in as any user. Issues that user's auth cookies.
router.post("/users/:id/impersonate", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const targetId = req.params.id;
  const [u] = await q(`SELECT id, email FROM users WHERE id=$1`, [targetId]);
  if (!u) return res.status(404).json({ error: "user_not_found" });
  await q(
    `INSERT INTO audit_log(actor_id, event, target_id, meta)
     VALUES($1,'admin.impersonate',$2,$3)`,
    [req.user!.id, targetId, JSON.stringify({ target_email: u.email })]
  ).catch(() => {});
  setAuthCookies(res, u.id);
  res.json({ ok: true, user: { id: u.id, email: u.email } });
});

// ===== ORDERS — list + manual cancel & refund =====
// GET /api/admin/orders?q=&status=&page=&page_size=
router.get("/orders", async (req, res) => {
  const search = (req.query.q ? String(req.query.q) : "").trim().toLowerCase();
  const status = req.query.status ? String(req.query.status) : "";
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.page_size || "25"), 10) || 25));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: any[] = [];
  if (status) { params.push(status); where.push(`o.status = $${params.length}`); }
  if (search) {
    const like = `%${search}%`;
    const idMatch = /^[0-9a-f-]{8,}$/i.test(search) ? search : null;
    params.push(like, like);
    let clause = `(LOWER(p.email) LIKE $${params.length - 1} OR LOWER(COALESCE(p.display_name,'')) LIKE $${params.length})`;
    if (idMatch) { params.push(idMatch); clause = `(${clause} OR o.id::text = $${params.length} OR o.buyer_id::text = $${params.length})`; }
    where.push(clause);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseFrom = `FROM orders o LEFT JOIN profiles p ON p.id = o.buyer_id LEFT JOIN categories c ON c.id = o.category_id ${whereSql}`;
  const [{ c: total }] = await q<{ c: number }>(`SELECT COUNT(*)::int AS c ${baseFrom}`, params);
  const rows = await q(
    `SELECT o.id, o.buyer_id, o.category_id, o.quantity, o.unit_price_bdt, o.total_bdt,
            o.status, o.created_at, p.email AS buyer_email, p.display_name AS buyer_name,
            c.name AS category_name
       ${baseFrom}
       ORDER BY o.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  res.json({ rows, total, page, page_size: pageSize });
});

// Manual cancel & refund — reverses an order: refunds buyer, returns accounts to available, audits.
router.post("/orders/:id/cancel-refund", async (req: AuthedReq, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const [o] = await q(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!o) return res.status(404).json({ error: "not_found" });
  if (o.status === "cancelled" || o.status === "refunded")
    return res.status(400).json({ error: "already_reversed" });

  // Refund buyer wallet
  const [pre] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [o.buyer_id]);
  const before = Number(pre?.balance_bdt ?? 0);
  const after = before + Number(o.total_bdt);
  await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [after, o.buyer_id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
       VALUES($1,'refund',$2,$3,$4,$5)`,
    [o.buyer_id, o.total_bdt, after, o.id, note || "Admin cancel & refund"]
  );

  // Return accounts to available pool
  await q(
    `UPDATE accounts SET status='available', buyer_id=NULL, sold_at=NULL
       WHERE id IN (SELECT account_id FROM order_items WHERE order_id=$1)`,
    [o.id]
  );
  await q(`UPDATE orders SET status='cancelled', updated_at=now() WHERE id=$1`, [o.id]);

  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
       VALUES($1,$2,'order_cancel_refund','order',$3,$4,$5)`,
    [req.user!.id, req.user!.email, o.id,
     `Cancelled & refunded order ${o.id} (৳${Number(o.total_bdt).toFixed(2)})`,
     JSON.stringify({ buyer_id: o.buyer_id, amount: Number(o.total_bdt), note })]
  );
  res.json({ ok: true, balance_before: before, balance_after: after, amount: Number(o.total_bdt) });
});

// ===== BULK — replacement items reject =====
router.post("/replacement-items/bulk-reject", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      const [item] = await q(`SELECT outcome FROM replacement_items WHERE id=$1 FOR UPDATE`, [id]);
      if (!item) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (item.outcome !== "pending") { results.push({ id, ok: false, error: "already_resolved" }); continue; }
      await q(
        `UPDATE replacement_items SET outcome='rejected', outcome_reason=$2,
           resolved_by=$3, resolved_at=now() WHERE id=$1`,
        [id, reason, req.user!.id]
      );
      results.push({ id, ok: true });
    } catch (e: any) { results.push({ id, ok: false, error: e?.message || "internal_error" }); }
  }
  res.json({ results });
});

// ===== BULK — seller applications approve/reject =====
router.post("/seller-applications/bulk", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const action = req.body?.action === "reject" ? "reject" : "approve";
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      const [a] = await q(`SELECT * FROM seller_applications WHERE id=$1`, [id]);
      if (!a) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (a.status !== "pending") { results.push({ id, ok: false, error: "already_reviewed" }); continue; }
      if (action === "approve") {
        await q(`INSERT INTO user_roles(user_id, role) VALUES($1,'seller') ON CONFLICT DO NOTHING`, [a.user_id]);
        await q(`DELETE FROM user_roles WHERE user_id=$1 AND role='buyer'`, [a.user_id]);
        await q(
          `UPDATE seller_applications SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
          [a.id, req.user!.id]
        );
      } else {
        await q(
          `UPDATE seller_applications SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`,
          [a.id, note, req.user!.id]
        );
      }
      results.push({ id, ok: true });
    } catch (e: any) { results.push({ id, ok: false, error: e?.message || "internal_error" }); }
  }
  res.json({ results });
});

// ===== SELLER LEADERBOARD with badge tiers =====
// Tier rules (by completed sales count, lifetime):
//   bronze:   1+    silver: 50+   gold: 250+   platinum: 1000+
// Optional bonus_eligible flag for current month top performer.
router.get("/sellers/leaderboard", async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"), 10) || 30));
  const sellers = await q(
    `SELECT u.id AS seller_id, u.email, p.display_name, p.is_banned,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id), 0) AS sales_lifetime,
        COALESCE((SELECT SUM(oi.unit_price_bdt)::float FROM order_items oi WHERE oi.seller_id=u.id), 0) AS revenue_lifetime,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id
                  AND oi.created_at >= now() - ($1 || ' days')::interval), 0) AS sales_period,
        COALESCE((SELECT SUM(oi.unit_price_bdt)::float FROM order_items oi WHERE oi.seller_id=u.id
                  AND oi.created_at >= now() - ($1 || ' days')::interval), 0) AS revenue_period,
        COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.seller_id=u.id), 0) AS replacements_total,
        COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.seller_id=u.id
                  AND ri.outcome IN ('replaced','refunded')), 0) AS replacements_upheld
      FROM users u
      JOIN user_roles r ON r.user_id=u.id AND r.role='seller'
      LEFT JOIN profiles p ON p.id=u.id
      ORDER BY sales_period DESC NULLS LAST
      LIMIT 100`,
    [String(days)]
  );
  const tierFor = (n: number): "platinum" | "gold" | "silver" | "bronze" | "none" => {
    if (n >= 1000) return "platinum";
    if (n >= 250) return "gold";
    if (n >= 50) return "silver";
    if (n >= 1) return "bronze";
    return "none";
  };
  const enriched = sellers.map((s: any, i: number) => {
    const sales = Number(s.sales_lifetime || 0);
    const upheldRate = sales > 0 ? Number(s.replacements_upheld || 0) / sales : 0;
    let risk: "low" | "medium" | "high" = "low";
    if (sales >= 10 && upheldRate >= 0.15) risk = "high";
    else if (sales >= 10 && upheldRate >= 0.07) risk = "medium";
    return {
      ...s,
      rank: i + 1,
      tier: tierFor(sales),
      risk_level: risk,
      bonus_eligible: i < 3 && Number(s.sales_period) > 0,
    };
  });
  res.json({ sellers: enriched, period_days: days });
});

// Pay a discretionary bonus to a seller (top performer reward, etc.)
router.post("/sellers/:id/bonus", async (req: AuthedReq, res) => {
  const amount = Number(req.body?.amount_bdt);
  const note = typeof req.body?.note === "string" ? req.body.note : "Top seller bonus";
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "invalid_amount" });
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!p) return res.status(404).json({ error: "user_not_found" });
  const newBal = Number(p.balance_bdt) + amount;
  await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [newBal, req.params.id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, note)
       VALUES($1,'admin_adjustment',$2,$3,$4)`,
    [req.params.id, amount, newBal, note]
  );
  await q(
    `INSERT INTO notifications(user_id, kind, title, body)
       VALUES($1,'bonus',$2,$3)`,
    [req.params.id, `🎉 Bonus credited: ৳${amount.toFixed(2)}`, note]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
       VALUES($1,$2,'seller_bonus','user',$3,$4,$5)`,
    [req.user!.id, req.user!.email, req.params.id,
     `Paid bonus ৳${amount.toFixed(2)} to seller`, JSON.stringify({ amount, note })]
  );
  res.json({ ok: true, balance: newBal });
});

// ===== DASHBOARD TIMESERIES (daily revenue + order count) =====
router.get("/dashboard/timeseries", async (req, res) => {
  const days = Math.min(180, Math.max(1, parseInt(String(req.query.days || "30"), 10) || 30));
  const rows = await q<{ day: string; revenue: number; orders: number }>(
    `WITH days AS (
        SELECT generate_series(
          date_trunc('day', now()) - ($1 || ' days')::interval,
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total_bdt) FILTER (WHERE o.status='completed'), 0)::float AS revenue,
             COALESCE(COUNT(o.id) FILTER (WHERE o.status='completed'), 0)::int AS orders
        FROM days d
        LEFT JOIN orders o ON date_trunc('day', o.created_at)::date = d.day
        GROUP BY d.day
        ORDER BY d.day`,
    [String(days - 1)]
  );
  res.json({ series: rows, days });
});

// ===== GLOBAL SEARCH (Cmd-K) =====
// Searches across users, orders, accounts (UID), and replacement requests.
router.get("/search", async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (raw.length < 2) return res.json({ users: [], orders: [], accounts: [], replacements: [] });
  const like = `%${raw.toLowerCase()}%`;
  const isUuid = /^[0-9a-f-]{8,}$/i.test(raw);
  const [users, orders, accounts, replacements] = await Promise.all([
    q(
      `SELECT u.id, u.email, p.display_name, p.balance_bdt, p.is_banned
         FROM users u LEFT JOIN profiles p ON p.id=u.id
         WHERE LOWER(u.email) LIKE $1 OR LOWER(COALESCE(p.display_name,'')) LIKE $1
            ${isUuid ? "OR u.id::text = $2" : ""}
         ORDER BY u.email LIMIT 8`,
      isUuid ? [like, raw] : [like]
    ),
    q(
      `SELECT o.id, o.status, o.total_bdt, o.created_at, p.email AS buyer_email
         FROM orders o LEFT JOIN profiles p ON p.id=o.buyer_id
         WHERE LOWER(p.email) LIKE $1 ${isUuid ? "OR o.id::text=$2 OR o.buyer_id::text=$2" : ""}
         ORDER BY o.created_at DESC LIMIT 8`,
      isUuid ? [like, raw] : [like]
    ),
    q(
      `SELECT a.id, a.uid, a.status, a.category_id, c.name AS category_name
         FROM accounts a LEFT JOIN categories c ON c.id=a.category_id
         WHERE a.uid ILIKE $1
         ORDER BY a.created_at DESC LIMIT 8`,
      [`%${raw}%`]
    ),
    q(
      `SELECT ri.id, ri.reported_uid, ri.outcome, ri.created_at, ri.request_id
         FROM replacement_items ri
         WHERE ri.reported_uid ILIKE $1 ${isUuid ? "OR ri.id::text=$2 OR ri.request_id::text=$2" : ""}
         ORDER BY ri.created_at DESC LIMIT 8`,
      isUuid ? [`%${raw}%`, raw] : [`%${raw}%`]
    ),
  ]);
  res.json({ users, orders, accounts, replacements });
});

// ===== ORDERS — bulk cancel & refund =====
router.post("/orders/bulk-cancel-refund", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: { id: string; ok: boolean; amount?: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      const [o] = await q(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [id]);
      if (!o) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (o.status === "cancelled" || o.status === "refunded") {
        results.push({ id, ok: false, error: "already_reversed" }); continue;
      }
      const [pre] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [o.buyer_id]);
      const after = Number(pre?.balance_bdt ?? 0) + Number(o.total_bdt);
      await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [after, o.buyer_id]);
      await q(
        `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
           VALUES($1,'refund',$2,$3,$4,$5)`,
        [o.buyer_id, o.total_bdt, after, o.id, note || "Bulk cancel & refund"]
      );
      await q(
        `UPDATE accounts SET status='available', buyer_id=NULL, sold_at=NULL
           WHERE id IN (SELECT account_id FROM order_items WHERE order_id=$1)`,
        [o.id]
      );
      await q(`UPDATE orders SET status='cancelled', updated_at=now() WHERE id=$1`, [o.id]);
      await q(
        `INSERT INTO audit_logs(actor_id, actor_email, event_type, entity_type, entity_id, summary, details)
           VALUES($1,$2,'order_cancel_refund','order',$3,$4,$5)`,
        [req.user!.id, req.user!.email, o.id,
         `Bulk cancel & refund order ${o.id} (৳${Number(o.total_bdt).toFixed(2)})`,
         JSON.stringify({ buyer_id: o.buyer_id, amount: Number(o.total_bdt), note, bulk: true })]
      );
      results.push({ id, ok: true, amount: Number(o.total_bdt) });
    } catch (e: any) { results.push({ id, ok: false, error: e?.message || "internal_error" }); }
  }
  res.json({ results });
});

// ===== PAYOUT SCHEDULE =====
// Stored under app_settings key 'payout_schedule'
//   { day_of_week: 0-6 (0=Sun), min_payout_bdt: number, auto_approve: boolean }
router.get("/payouts/schedule", async (_req, res) => {
  const [s] = await q(`SELECT value FROM app_settings WHERE key='payout_schedule'`);
  const value = s?.value ?? { day_of_week: 5, min_payout_bdt: 100, auto_approve: false };
  // Pending withdraw queue with totals
  const pending = await q(
    `SELECT w.id, w.amount_bdt, w.method, w.receiver_number, w.created_at, w.status,
            u.email AS user_email, p.display_name, p.balance_bdt
       FROM withdraw_requests w
       JOIN users u ON u.id=w.user_id
       LEFT JOIN profiles p ON p.id=w.user_id
       WHERE w.status IN ('pending','approved')
       ORDER BY w.created_at ASC`
  );
  const totals = pending.reduce(
    (acc: any, r: any) => ({ count: acc.count + 1, amount: acc.amount + Number(r.amount_bdt) }),
    { count: 0, amount: 0 }
  );
  res.json({ schedule: value, pending, totals });
});

router.put("/payouts/schedule", async (req: AuthedReq, res) => {
  const dow = Math.min(6, Math.max(0, parseInt(String(req.body?.day_of_week ?? 5), 10) || 0));
  const minPayout = Math.max(100, Number(req.body?.min_payout_bdt) || 100);
  const autoApprove = Boolean(req.body?.auto_approve);
  const value = { day_of_week: dow, min_payout_bdt: minPayout, auto_approve: autoApprove };
  await q(
    `INSERT INTO app_settings(key, value, updated_by, updated_at)
       VALUES('payout_schedule', $1::jsonb, $2, now())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [JSON.stringify(value), req.user!.id]
  );
  res.json({ ok: true, schedule: value });
});

// ===== WITHDRAWS — bulk pay (by ids) =====
router.post("/withdraws/bulk-pay", async (req: AuthedReq, res) => {
  const ids = sanitizeIds(req.body?.ids);
  const txnPrefix = typeof req.body?.txn_prefix === "string" ? req.body.txn_prefix : "BULK";
  const note = typeof req.body?.note === "string" ? req.body.note : "Bulk payout";
  if (ids.length === 0) return res.status(400).json({ error: "no_ids" });
  const results: { id: string; ok: boolean; amount?: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      const [w] = await q(`SELECT * FROM withdraw_requests WHERE id=$1 FOR UPDATE`, [id]);
      if (!w) { results.push({ id, ok: false, error: "not_found" }); continue; }
      if (!["pending", "approved"].includes(w.status)) {
        results.push({ id, ok: false, error: "already_paid" }); continue;
      }
      const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [w.user_id]);
      if (Number(p?.balance_bdt ?? 0) < Number(w.amount_bdt)) {
        results.push({ id, ok: false, error: "insufficient_balance" }); continue;
      }
      const newBal = Number(p.balance_bdt) - Number(w.amount_bdt);
      await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [newBal, w.user_id]);
      await q(
        `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
           VALUES($1,'withdraw', -$2, $3, $4, $5)`,
        [w.user_id, w.amount_bdt, newBal, w.id, note]
      );
      const txn = `${txnPrefix}-${id.slice(0, 8)}`;
      await q(
        `UPDATE withdraw_requests SET status='paid', payout_txn_id=$2, admin_note=$3,
           reviewed_by=$4, reviewed_at=now() WHERE id=$1`,
        [w.id, txn, note, req.user!.id]
      );
      await q(
        `INSERT INTO notifications(user_id, kind, title, body)
           VALUES($1,'payout',$2,$3)`,
        [w.user_id, `💸 Withdraw paid — ৳${Number(w.amount_bdt).toFixed(2)}`,
         `Your withdrawal has been paid out (txn ${txn}).`]
      );
      results.push({ id, ok: true, amount: Number(w.amount_bdt) });
    } catch (e: any) { results.push({ id, ok: false, error: e?.message || "internal_error" }); }
  }
  res.json({ results });
});

// ===== BUYER RISK QUEUE =====
// Lists buyers with elevated replacement-to-order ratios.
// Defaults: min 3 orders, replacement_rate >= 0.20 = high, >= 0.10 = medium.
router.get("/buyers/risk-queue", async (req, res) => {
  const minOrders = Math.max(1, parseInt(String(req.query.min_orders || "3"), 10) || 3);
  const rows = await q(
    `WITH agg AS (
        SELECT u.id AS user_id, u.email, p.display_name, p.balance_bdt, p.is_banned,
               COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id=u.id AND o.status='completed'),0) AS orders_count,
               COALESCE((SELECT COUNT(*)::int FROM replacement_requests r WHERE r.buyer_id=u.id),0) AS replacements_filed,
               COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.buyer_id=u.id AND ri.outcome='rejected'),0) AS replacements_rejected,
               (SELECT MAX(r.created_at) FROM replacement_requests r WHERE r.buyer_id=u.id) AS last_replacement_at
          FROM users u
          LEFT JOIN profiles p ON p.id=u.id
      )
      SELECT * FROM agg
        WHERE orders_count >= $1 AND replacements_filed > 0
          AND (replacements_filed::float / NULLIF(orders_count,0)) >= 0.10
        ORDER BY (replacements_filed::float / NULLIF(orders_count,0)) DESC, replacements_filed DESC
        LIMIT 100`,
    [minOrders]
  );
  const enriched = rows.map((r: any) => {
    const rate = r.orders_count > 0 ? Number(r.replacements_filed) / Number(r.orders_count) : 0;
    let risk: "low" | "medium" | "high" = "low";
    if (rate >= 0.20) risk = "high";
    else if (rate >= 0.10) risk = "medium";
    return { ...r, replacement_rate: Number(rate.toFixed(3)), risk_level: risk };
  });
  res.json({ buyers: enriched });
});

// ===== ADMIN NOTES (CRM) =====
router.get("/users/:id/notes", async (req, res) => {
  const notes = await q(
    `SELECT id, body, pinned, author_email, created_at, updated_at
       FROM admin_notes WHERE subject_user_id=$1
       ORDER BY pinned DESC, created_at DESC LIMIT 200`,
    [req.params.id]
  );
  res.json({ notes });
});

router.post("/users/:id/notes", async (req: AuthedReq, res) => {
  const body = String(req.body?.body ?? "").trim();
  const pinned = Boolean(req.body?.pinned);
  if (body.length < 2) return res.status(400).json({ error: "body_required" });
  const [n] = await q(
    `INSERT INTO admin_notes(subject_user_id, author_id, author_email, body, pinned)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, req.user!.id, req.user!.email, body, pinned]
  );
  res.json({ note: n });
});

router.delete("/users/:id/notes/:noteId", async (req, res) => {
  await q(`DELETE FROM admin_notes WHERE id=$1 AND subject_user_id=$2`, [req.params.noteId, req.params.id]);
  res.json({ ok: true });
});

router.put("/users/:id/notes/:noteId", async (req, res) => {
  const pinned = req.body?.pinned;
  if (typeof pinned === "boolean") {
    await q(`UPDATE admin_notes SET pinned=$1, updated_at=now() WHERE id=$2 AND subject_user_id=$3`,
      [pinned, req.params.noteId, req.params.id]);
  }
  if (typeof req.body?.body === "string") {
    await q(`UPDATE admin_notes SET body=$1, updated_at=now() WHERE id=$2 AND subject_user_id=$3`,
      [req.body.body, req.params.noteId, req.params.id]);
  }
  res.json({ ok: true });
});

// ===== CSV EXPORTS =====
const csvEscape = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const sendCsv = (res: any, filename: string, headers: string[], rows: any[][]) => {
  const body = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(body);
};

router.get("/exports/users.csv", async (_req, res) => {
  const rows = await q(
    `SELECT u.id, u.email, p.display_name, p.balance_bdt, p.is_banned, u.created_at,
        ARRAY(SELECT role::text FROM user_roles WHERE user_id=u.id) AS roles,
        COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id=u.id),0) AS orders_count,
        COALESCE((SELECT COUNT(*)::int FROM replacement_requests r WHERE r.buyer_id=u.id),0) AS replacements_filed
      FROM users u LEFT JOIN profiles p ON p.id=u.id
      ORDER BY u.created_at DESC`
  );
  sendCsv(res, `users-${new Date().toISOString().slice(0,10)}.csv`,
    ["user_id","email","display_name","balance_bdt","is_banned","created_at","roles","orders_count","replacements_filed"],
    rows.map((r: any) => [r.id, r.email, r.display_name, r.balance_bdt, r.is_banned, r.created_at,
      (r.roles || []).join("|"), r.orders_count, r.replacements_filed])
  );
});

router.get("/exports/orders.csv", async (req, res) => {
  const status = String(req.query.status || "").trim();
  const where = status && status !== "all" ? `WHERE o.status=$1` : "";
  const params = status && status !== "all" ? [status] : [];
  const rows = await q(
    `SELECT o.id, o.status, o.quantity, o.unit_price_bdt, o.total_bdt, o.created_at,
        p.email AS buyer_email, p.display_name AS buyer_name,
        c.name AS category_name
      FROM orders o
      LEFT JOIN profiles p ON p.id=o.buyer_id
      LEFT JOIN categories c ON c.id=o.category_id
      ${where}
      ORDER BY o.created_at DESC LIMIT 10000`,
    params
  );
  sendCsv(res, `orders-${new Date().toISOString().slice(0,10)}.csv`,
    ["order_id","status","quantity","unit_price_bdt","total_bdt","created_at","buyer_email","buyer_name","category"],
    rows.map((r: any) => [r.id, r.status, r.quantity, r.unit_price_bdt, r.total_bdt, r.created_at,
      r.buyer_email, r.buyer_name, r.category_name])
  );
});

export default router;