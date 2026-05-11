import { Router } from "express";
import { q } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await q(
    `SELECT c.*, COALESCE(s.available, 0) AS available,
            b.name AS brand_name, b.slug AS brand_slug, b.logo_url AS brand_logo_url
     FROM categories c
     LEFT JOIN vpn_brands b ON b.id = c.brand_id
     LEFT JOIN (
       SELECT category_id, COUNT(*)::int AS available FROM accounts
       WHERE status='available' GROUP BY category_id
     ) s ON s.category_id = c.id
     WHERE c.is_active = true ORDER BY c.sort_order, c.name`
  );
  res.json({ categories: rows });
});

router.get("/stock", async (_req, res) => {
  const rows = await q(
    `SELECT category_id, COUNT(*)::int AS available FROM accounts
     WHERE status='available' GROUP BY category_id`
  );
  res.json({ stock: rows });
});

export default router;