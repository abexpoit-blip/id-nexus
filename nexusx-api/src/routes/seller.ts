import { Router } from "express";
import { z } from "zod";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

const normalizeUid = (value: unknown) => String(value ?? "").trim();
const categoryBaseFrom = (cat: { slug?: string; name?: string }) => {
  const source = `${cat.slug || ""} ${cat.name || ""}`.toLowerCase();
  const match = source.match(/(?:^|[^\d])((?:61|1000)\d*)x{2,}/i);
  return match ? match[1] : null;
};

const uidMatchesCategory = (uid: string, categoryBase: string | null) => {
  if (!categoryBase) return true;
  return new RegExp(`^${categoryBase}\\d+$`).test(uid);
};

async function applicationsEnabled(): Promise<boolean> {
  const [r] = await q<{ value: any }>(
    `SELECT value FROM app_settings WHERE key='seller_applications_enabled'`
  );
  if (!r) return true;
  return r.value === true || r.value === "true";
}

// Public — current status of seller-application intake
router.get("/apply-enabled", async (_req, res) => {
  res.json({ enabled: await applicationsEnabled() });
});

// Admin — toggle seller-application intake on/off
router.post("/admin/applications-toggle", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const enabled = !!req.body?.enabled;
  await q(
    `INSERT INTO app_settings(key, value, updated_by, updated_at)
       VALUES('seller_applications_enabled', to_jsonb($1::boolean), $2, now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [enabled, req.user!.id]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary)
       VALUES($1,$2,'seller_applications_toggle',$3)`,
    [req.user!.id, req.user!.email, `Seller applications ${enabled ? "enabled" : "disabled"}`]
  );
  res.json({ ok: true, enabled });
});

// Apply to become a seller
router.post("/apply", authRequired, async (req: AuthedReq, res) => {
  if (!(await applicationsEnabled()))
    return res.status(403).json({ error: "applications_disabled" });
  const schema = z.object({
    display_name: z.string().min(1).max(120).optional(),
    telegram_username: z.string().max(120).optional(),
    reason: z.string().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

  const existing = await q(
    `SELECT id, status FROM seller_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [req.user!.id]
  );
  if (existing[0] && existing[0].status === "pending")
    return res.status(409).json({ error: "application_pending" });

  // Upsert: re-applies after rejection update existing row (unique on user_id)
  const [app] = await q(
    `INSERT INTO seller_applications(user_id, email, display_name, telegram_username, reason, status)
     VALUES($1,$2,$3,$4,$5,'pending')
     ON CONFLICT(user_id) DO UPDATE SET
        telegram_username = EXCLUDED.telegram_username,
        reason = EXCLUDED.reason,
        display_name = COALESCE(EXCLUDED.display_name, seller_applications.display_name),
        status = 'pending', admin_note = NULL, reviewed_at = NULL, reviewed_by = NULL,
        updated_at = now()
     RETURNING *`,
    [req.user!.id, req.user!.email, parsed.data.display_name || null, parsed.data.telegram_username || null, parsed.data.reason || null]
  );
  res.json({ application: app });
});

// Mark current user onboarded (clears any onboarding flag in buyer_settings)
router.post("/onboarded", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  await q(
    `UPDATE profiles
        SET buyer_settings = COALESCE(buyer_settings,'{}'::jsonb)
                             || jsonb_build_object('seller_onboarded', true,
                                                   'seller_onboarded_at', to_jsonb(now())),
            updated_at = now()
      WHERE id=$1`,
    [req.user!.id]
  );
  res.json({ ok: true });
});

// Aggregated seller dashboard overview
router.get("/overview", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  const sellerId = req.user!.id;
  const [categories, myAccounts, recent, [todayRow], [weekRow], replacements, [limitRow], [usedRow]] = await Promise.all([
    q(`SELECT id, name, slug, price_bdt FROM categories
         WHERE is_active=true AND kind='fb_account' ORDER BY sort_order, name`),
    q(`SELECT id, category_id, status FROM accounts WHERE seller_id=$1`, [sellerId]),
    q(`SELECT uid, status, sold_at, created_at, category_id FROM accounts
         WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 20`, [sellerId]),
    q<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM accounts
         WHERE seller_id=$1 AND status='sold' AND sold_at >= date_trunc('day', now())`, [sellerId]),
    q<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM accounts
         WHERE seller_id=$1 AND status='sold' AND sold_at >= date_trunc('day', now()) - interval '6 days'`, [sellerId]),
    q(`SELECT id, reported_uid, outcome, outcome_reason, in_window, created_at, account_id
         FROM replacement_items WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100`, [sellerId]),
    q<{ daily_limit: number }>(`SELECT daily_limit FROM seller_daily_limits WHERE seller_id=$1`, [sellerId]),
    q<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM accounts
         WHERE seller_id=$1 AND created_at >= date_trunc('day', now() at time zone 'UTC')`, [sellerId]),
  ]);
  res.json({
    categories,
    my_accounts: myAccounts,
    recent,
    sold_today: todayRow?.c ?? 0,
    sold_week: weekRow?.c ?? 0,
    replacements,
    daily_limit: Number(limitRow?.daily_limit ?? 0),
    used_today: usedRow?.c ?? 0,
  });
});

// Check a batch of UIDs against the global accounts table
// Returns { in_stock_other_or_self: string[], in_file_dups: handled client side, replaced: string[], owned_in_stock: string[] }
router.post("/check-uids", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  const { uids, category_id } = req.body || {};
  if (!Array.isArray(uids) || uids.length === 0) return res.json({ rows: [] });
  if (uids.length > 5000) return res.status(400).json({ error: "too_many" });
  const normalized = uids.map(normalizeUid).filter(Boolean);
  let invalid_category_uids: string[] = [];
  if (category_id) {
    const [cat] = await q<{ id: string; name: string; slug: string; is_active: boolean; kind: string }>(
      `SELECT id, name, slug, is_active, kind FROM categories WHERE id=$1`,
      [category_id]
    );
    if (!cat || !cat.is_active || cat.kind !== "fb_account") return res.status(404).json({ error: "category_not_found" });
    const base = categoryBaseFrom(cat);
    invalid_category_uids = normalized.filter((uid) => !uidMatchesCategory(uid, base));
  }
  const rows = await q<{ uid: string; status: string; seller_id: string }>(
    `SELECT uid, status, seller_id FROM accounts WHERE uid = ANY($1)`,
    [normalized]
  );
  res.json({ rows, self_id: req.user!.id, invalid_category_uids });
});

router.get("/application", authRequired, async (req: AuthedReq, res) => {
  const [app] = await q(
    `SELECT * FROM seller_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [req.user!.id]
  );
  res.json({ application: app || null });
});

// Seller: my daily limit
router.get("/limit", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  const [row] = await q(`SELECT * FROM seller_daily_limits WHERE seller_id=$1`, [req.user!.id]);
  res.json({ limit: row || null });
});

// Seller: my upload audits
router.get("/uploads", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT * FROM seller_upload_audits WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  res.json({ audits: rows });
});

// Seller: bulk upload accounts (uid:password lines)
router.post("/accounts", authRequired, requireRole("seller"), async (req: AuthedReq, res) => {
  const schema = z.object({
    category_id: z.string().uuid(),
    rows: z.array(z.object({
      uid: z.string().min(1),
      password: z.string().min(1),
      email: z.string().optional(),
      email_password: z.string().optional(),
      two_fa: z.string().optional(),
      cost_bdt: z.number().optional(),
    })).min(1).max(5000),
    file_name: z.string().optional(),
    skip_duplicates: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input", detail: parsed.error.flatten() });
  const { category_id, rows, file_name, skip_duplicates } = parsed.data;

  const [cat] = await q(`SELECT id, name FROM categories WHERE id=$1`, [category_id]);
  if (!cat) return res.status(404).json({ error: "category_not_found" });

  // Daily limit
  const [limit] = await q(`SELECT daily_limit FROM seller_daily_limits WHERE seller_id=$1`, [req.user!.id]);
  let allowedRemaining = Infinity;
  if (limit?.daily_limit) {
    const [used] = await q(
      `SELECT COUNT(*)::int AS c FROM accounts WHERE seller_id=$1 AND created_at >= now() - interval '24 hours'`,
      [req.user!.id]
    );
    allowedRemaining = Math.max(0, limit.daily_limit - used.c);
  }

  // Dedup within file
  const seen = new Set<string>();
  const fileDupes: string[] = [];
  const unique = rows.filter((r) => {
    if (seen.has(r.uid)) { fileDupes.push(r.uid); return false; }
    seen.add(r.uid); return true;
  });

  // Existing in stock
  const uids = unique.map((r) => r.uid);
  const existing = await q<{ uid: string; status: string }>(
    `SELECT uid, status FROM accounts WHERE uid = ANY($1)`,
    [uids]
  );
  const inStock = new Set(existing.filter((e) => e.status !== "replaced").map((e) => e.uid));
  const alreadyReplaced = new Set(existing.filter((e) => e.status === "replaced").map((e) => e.uid));

  let inserted = 0;
  let overLimit = 0;
  for (const r of unique) {
    if (skip_duplicates && (inStock.has(r.uid) || alreadyReplaced.has(r.uid))) continue;
    if (inserted >= allowedRemaining) { overLimit++; continue; }
    try {
      await q(
        `INSERT INTO accounts(category_id, seller_id, uid, password, email, email_password, two_fa, cost_bdt)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [category_id, req.user!.id, r.uid, r.password, r.email || null, r.email_password || null, r.two_fa || null, r.cost_bdt || null]
      );
      inserted++;
    } catch { /* unique conflict — skip silently */ }
  }

  const summary = {
    rows_in_file: rows.length,
    rows_sent: unique.length,
    rows_inserted: inserted,
    duplicates_in_file: fileDupes.length,
    duplicates_in_stock: [...inStock].length,
    duplicates_already_replaced: [...alreadyReplaced].length,
    invalid_rows: 0,
    over_limit_skipped: overLimit,
    skip_duplicates_setting: skip_duplicates,
  };

  await q(
    `INSERT INTO seller_upload_audits(seller_id, category_id, category_name, file_name,
        rows_in_file, rows_sent, rows_inserted, duplicates_in_file, duplicates_in_stock,
        duplicates_already_replaced, invalid_rows, over_limit_skipped, skip_duplicates_setting,
        server_response)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [req.user!.id, category_id, cat.name, file_name || null,
     summary.rows_in_file, summary.rows_sent, summary.rows_inserted, summary.duplicates_in_file,
     summary.duplicates_in_stock, summary.duplicates_already_replaced, summary.invalid_rows,
     summary.over_limit_skipped, summary.skip_duplicates_setting, JSON.stringify(summary)]
  );

  res.json({ ok: true, ...summary });
});

// ===== PUBLIC: top sellers + tier badges =====
// No auth — used to publicly showcase trusted sellers on the storefront.
router.get("/top", async (_req, res) => {
  const rows = await q(
    `SELECT u.id AS seller_id, COALESCE(p.display_name, split_part(u.email,'@',1)) AS name,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id), 0) AS sales_lifetime,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id
                  AND oi.created_at >= now() - interval '30 days'), 0) AS sales_30d
      FROM users u
      JOIN user_roles r ON r.user_id=u.id AND r.role='seller'
      LEFT JOIN profiles p ON p.id=u.id
      WHERE COALESCE(p.is_banned,false)=false
      ORDER BY sales_30d DESC, sales_lifetime DESC
      LIMIT 12`
  );
  const tierFor = (n: number) => n>=1000?"platinum":n>=250?"gold":n>=50?"silver":n>=1?"bronze":"none";
  res.json({ sellers: rows.map((s:any)=>({ ...s, tier: tierFor(Number(s.sales_lifetime||0)) })) });
});

// ===== PUBLIC: seller profile =====
router.get("/profile/:id", async (req, res) => {
  const id = req.params.id;
  const [s] = await q(
    `SELECT u.id AS seller_id, u.email,
        COALESCE(p.display_name, split_part(u.email,'@',1)) AS display_name,
        p.is_banned, u.created_at AS joined_at,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id),0) AS sales_lifetime,
        COALESCE((SELECT SUM(oi.unit_price_bdt)::float FROM order_items oi WHERE oi.seller_id=u.id),0) AS revenue_lifetime,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id
                 AND oi.created_at >= now() - interval '30 days'),0) AS sales_30d,
        COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.seller_id=u.id),0) AS replacements_total,
        COALESCE((SELECT COUNT(*)::int FROM replacement_items ri WHERE ri.seller_id=u.id
                  AND ri.outcome IN ('replaced','refunded')),0) AS replacements_upheld,
        COALESCE((SELECT COUNT(*)::int FROM accounts a WHERE a.seller_id=u.id AND a.status='available'),0) AS available_stock
      FROM users u
      JOIN user_roles r ON r.user_id=u.id AND r.role='seller'
      LEFT JOIN profiles p ON p.id=u.id
      WHERE u.id=$1`,
    [id]
  );
  if (!s) return res.status(404).json({ error: "not_found" });
  const sales = Number(s.sales_lifetime || 0);
  const tier = sales>=1000?"platinum":sales>=250?"gold":sales>=50?"silver":sales>=1?"bronze":"none";
  const upheldRate = sales > 0 ? Number(s.replacements_upheld) / sales : 0;
  const reliability = Math.max(0, Math.min(100, Math.round((1 - upheldRate) * 100)));
  res.json({ seller: { ...s, tier, reliability_pct: reliability, is_banned: Boolean(s.is_banned) } });
});

export default router;