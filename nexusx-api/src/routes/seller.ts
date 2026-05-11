import { Router } from "express";
import { z } from "zod";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

// Apply to become a seller
router.post("/apply", authRequired, async (req: AuthedReq, res) => {
  const schema = z.object({
    display_name: z.string().min(1).max(120).optional(),
    contact_handle: z.string().max(120).optional(),
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

  const [app] = await q(
    `INSERT INTO seller_applications(user_id, email, display_name, contact_handle, reason)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.user!.id, req.user!.email, parsed.data.display_name || null, parsed.data.contact_handle || null, parsed.data.reason || null]
  );
  res.json({ application: app });
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

export default router;