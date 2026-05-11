import { Router } from "express";
import { z } from "zod";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();
const DEFAULT_WINDOW_HOURS = Number(process.env.REPLACEMENT_WINDOW_HOURS || 24);

function parseUids(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,;\n\r\t]+/).map((s) => s.trim()).filter(Boolean)
  ));
}

router.post("/", authRequired, async (req: AuthedReq, res) => {
  const schema = z.object({ raw_input: z.string().min(1).max(20000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });

  const uids = parseUids(parsed.data.raw_input);
  if (!uids.length) return res.status(400).json({ error: "no_uids_parsed" });

  const [rr] = await q(
    `INSERT INTO replacement_requests(buyer_id, raw_input, parsed_uid_count)
     VALUES($1,$2,$3) RETURNING *`,
    [req.user!.id, parsed.data.raw_input, uids.length]
  );

  // Match each uid against the buyer's purchased accounts
  let matched = 0;
  for (const uid of uids) {
    const [acc] = await q(
      `SELECT a.id AS account_id, a.seller_id, a.sold_at, oi.order_id
       FROM accounts a
       LEFT JOIN order_items oi ON oi.account_id = a.id
       WHERE a.uid = $1 AND a.buyer_id = $2 LIMIT 1`,
      [uid, req.user!.id]
    );
    let inWindow = false;
    if (acc?.sold_at) {
      const ageHours = (Date.now() - new Date(acc.sold_at).getTime()) / 3600000;
      inWindow = ageHours <= DEFAULT_WINDOW_HOURS;
    }
    await q(
      `INSERT INTO replacement_items(request_id, buyer_id, seller_id, order_id, account_id, reported_uid, in_window, window_hours)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [rr.id, req.user!.id, acc?.seller_id || null, acc?.order_id || null, acc?.account_id || null, uid, inWindow, DEFAULT_WINDOW_HOURS]
    );
    if (acc) matched++;
  }
  await q(`UPDATE replacement_requests SET matched_count=$2 WHERE id=$1`, [rr.id, matched]);

  res.json({ request_id: rr.id, parsed: uids.length, matched });
});

router.get("/mine", authRequired, async (req: AuthedReq, res) => {
  const requests = await q(
    `SELECT * FROM replacement_requests WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  const items = await q(
    `SELECT * FROM replacement_items WHERE buyer_id=$1 ORDER BY created_at DESC LIMIT 500`,
    [req.user!.id]
  );
  res.json({ requests, items });
});

router.get("/:id", authRequired, async (req: AuthedReq, res) => {
  const [rr] = await q(`SELECT * FROM replacement_requests WHERE id=$1`, [req.params.id]);
  if (!rr) return res.status(404).json({ error: "not_found" });
  if (rr.buyer_id !== req.user!.id && !req.user!.roles.includes("admin"))
    return res.status(403).json({ error: "forbidden" });
  const items = await q(`SELECT * FROM replacement_items WHERE request_id=$1`, [rr.id]);
  res.json({ request: rr, items });
});

// Admin: list all
router.get("/", authRequired, requireRole("admin"), async (_req, res) => {
  const rows = await q(
    `SELECT r.*, u.email AS buyer_email FROM replacement_requests r
     JOIN users u ON u.id = r.buyer_id ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ requests: rows });
});

// Admin: resolve a single item (replace with a new account or reject)
router.post("/items/:id/resolve", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const schema = z.object({
    outcome: z.enum(["replaced", "rejected", "out_of_window"]),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { outcome, reason } = parsed.data;

  const [item] = await q(`SELECT * FROM replacement_items WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!item) return res.status(404).json({ error: "not_found" });

  let replacementId: string | null = null;
  if (outcome === "replaced" && item.account_id) {
    const [orig] = await q(`SELECT category_id FROM accounts WHERE id=$1`, [item.account_id]);
    if (orig) {
      const [next] = await q(
        `UPDATE accounts SET status='sold', buyer_id=$2, sold_at=now()
         WHERE id = (SELECT id FROM accounts WHERE category_id=$1 AND status='available'
                     ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
         RETURNING id`,
        [orig.category_id, item.buyer_id]
      );
      if (!next) return res.status(400).json({ error: "no_stock" });
      replacementId = next.id;
      await q(`UPDATE accounts SET status='replaced' WHERE id=$1`, [item.account_id]);
    }
  }

  await q(
    `UPDATE replacement_items SET outcome=$2, outcome_reason=$3, replacement_account_id=$4,
        resolved_by=$5, resolved_at=now() WHERE id=$1`,
    [item.id, outcome, reason || null, replacementId, req.user!.id]
  );
  res.json({ ok: true, replacement_account_id: replacementId });
});

export default router;