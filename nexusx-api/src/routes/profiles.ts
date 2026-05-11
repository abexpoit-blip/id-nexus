import { Router } from "express";
import { z } from "zod";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

router.get("/me", authRequired, async (req: AuthedReq, res) => {
  const [p] = await q(`SELECT * FROM profiles WHERE id=$1`, [req.user!.id]);
  res.json({ profile: p, roles: req.user!.roles });
});

// Buyer dashboard stats (orders, pending replacements, lifetime spent)
router.get("/me/stats", authRequired, async (req: AuthedReq, res) => {
  const [{ orders }] = await q<{ orders: number }>(
    `SELECT COUNT(*)::int AS orders FROM orders WHERE buyer_id=$1`,
    [req.user!.id]
  );
  const [{ pending }] = await q<{ pending: number }>(
    `SELECT COUNT(*)::int AS pending FROM replacement_items WHERE buyer_id=$1 AND outcome='pending'`,
    [req.user!.id]
  );
  const [{ lifetime }] = await q<{ lifetime: number }>(
    `SELECT COALESCE(SUM(ABS(amount_bdt)),0)::float AS lifetime
       FROM balance_ledger WHERE user_id=$1 AND kind='purchase'`,
    [req.user!.id]
  );
  res.json({ orders, pending_replacements: pending, lifetime_spent: lifetime });
});

router.patch("/me", authRequired, async (req: AuthedReq, res) => {
  const schema = z.object({
    display_name: z.string().min(1).max(120).optional(),
    contact_handle: z.string().max(120).optional(),
    buyer_settings: z.record(z.any()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { display_name, contact_handle, buyer_settings } = parsed.data;
  const [p] = await q(
    `UPDATE profiles SET
        display_name = COALESCE($2, display_name),
        contact_handle = COALESCE($3, contact_handle),
        buyer_settings = COALESCE($4, buyer_settings),
        updated_at = now()
     WHERE id=$1 RETURNING *`,
    [req.user!.id, display_name ?? null, contact_handle ?? null, buyer_settings ?? null]
  );
  res.json({ profile: p });
});

export default router;