import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole } from "../auth";

const router = Router();

router.get("/brands", async (_req, res) => {
  const rows = await q(
    `SELECT * FROM vpn_brands WHERE is_active=true ORDER BY sort_order, name`
  );
  res.json({ brands: rows });
});

router.get("/brands/:slug/categories", async (req, res) => {
  const rows = await q(
    `SELECT c.*, COALESCE(s.available, 0) AS available FROM categories c
     JOIN vpn_brands b ON b.id = c.brand_id
     LEFT JOIN (
       SELECT category_id, COUNT(*)::int AS available FROM accounts
       WHERE status='available' GROUP BY category_id
     ) s ON s.category_id = c.id
     WHERE b.slug=$1 AND c.kind='vpn' AND c.is_active=true
     ORDER BY c.sort_order, c.duration_days`,
    [req.params.slug]
  );
  res.json({ categories: rows });
});

// Admin manage
router.post("/brands", authRequired, requireRole("admin"), async (req, res) => {
  const { slug, name, description, logo_url, is_active, sort_order } = req.body || {};
  if (!slug || !name) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO vpn_brands(slug, name, description, logo_url, is_active, sort_order)
     VALUES($1,$2,$3,$4,COALESCE($5,true),COALESCE($6,0))
     ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
       logo_url=EXCLUDED.logo_url, is_active=EXCLUDED.is_active, sort_order=EXCLUDED.sort_order,
       updated_at=now()
     RETURNING *`,
    [slug, name, description || null, logo_url || null, is_active, sort_order]
  );
  res.json({ brand: r });
});

router.delete("/brands/:id", authRequired, requireRole("admin"), async (req, res) => {
  await q(`DELETE FROM vpn_brands WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;