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
       COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN profiles p ON p.id=u.id
     LEFT JOIN user_roles r ON r.user_id=u.id
     ${qs ? `WHERE LOWER(u.email) LIKE $1 OR LOWER(COALESCE(p.display_name,'')) LIKE $1 OR u.id::text = $2` : ""}
     GROUP BY u.id, p.display_name, p.balance_bdt, p.is_banned ORDER BY u.created_at DESC LIMIT 200`,
    qs ? [wildcard, qs] : []
  );
  res.json({ users: rows });
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
  const { id, slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days } = req.body || {};
  if (!name || price_bdt == null) return res.status(400).json({ error: "invalid_input" });
  if (id) {
    const [r] = await q(
      `UPDATE categories SET name=$2, slug=COALESCE($3,slug), kind=COALESCE($4,kind),
         description=$5, price_bdt=$6, is_active=$7, sort_order=$8,
         brand_id=$9, duration_days=$10, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [id, name, slug || null, kind || null, description || null, price_bdt,
       is_active ?? true, sort_order ?? 0, brand_id || null, duration_days || null]
    );
    return res.json({ category: r });
  }
  if (!slug) return res.status(400).json({ error: "slug_required" });
  const [r] = await q(
    `INSERT INTO categories(slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days)
       VALUES($1,$2,COALESCE($3,'fb_account'),$4,$5,COALESCE($6,true),COALESCE($7,0),$8,$9) RETURNING *`,
    [slug, name, kind, description || null, price_bdt, is_active, sort_order, brand_id || null, duration_days || null]
  );
  res.json({ category: r });
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

export default router;