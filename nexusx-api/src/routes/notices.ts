import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

const AUDIENCES = new Set(["all", "buyer", "seller"]);
const SEVERITIES = new Set(["info", "warning", "success"]);

// ===== USER-FACING: get notices for current viewer =====
// audience filter by role: sellers see seller+all, buyers see buyer+all
router.get("/me", authRequired, async (req: AuthedReq, res) => {
  const [r] = await q(
    `SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='seller') AS is_seller`,
    [req.user!.id]
  );
  const isSeller = !!r?.is_seller;
  const aud = isSeller ? "seller" : "buyer";
  const rows = await q(
    `SELECT id, audience, severity, title, body, pinned, created_at, expires_at
       FROM notices
      WHERE is_active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND audience IN ('all', $1::notice_audience)
      ORDER BY pinned DESC, created_at DESC LIMIT 30`,
    [aud]
  );
  res.json({ notices: rows, audience: aud });
});

// ===== ADMIN =====
router.get("/admin", authRequired, requireRole("admin"), async (req, res) => {
  const aud = String(req.query.audience || "");
  const where = AUDIENCES.has(aud) ? `WHERE audience=$1` : "";
  const params = AUDIENCES.has(aud) ? [aud] : [];
  const rows = await q(
    `SELECT * FROM notices ${where} ORDER BY pinned DESC, created_at DESC LIMIT 200`,
    params
  );
  res.json({ notices: rows });
});

router.post("/admin", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const audience = String(req.body?.audience || "");
  const severity = String(req.body?.severity || "info");
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  const pinned = !!req.body?.pinned;
  const expires_at = req.body?.expires_at || null;
  if (!AUDIENCES.has(audience)) return res.status(400).json({ error: "bad_audience" });
  if (!SEVERITIES.has(severity)) return res.status(400).json({ error: "bad_severity" });
  if (title.length < 2 || body.length < 2) return res.status(400).json({ error: "too_short" });
  const [n] = await q(
    `INSERT INTO notices(audience, severity, title, body, pinned, expires_at, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [audience, severity, title, body, pinned, expires_at, req.user!.id]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary, entity_type, entity_id, details)
       VALUES($1,$2,'notice_create',$3,'notice',$4,$5)`,
    [req.user!.id, req.user!.email, `Created ${audience} notice`, n.id, JSON.stringify({ title, severity })]
  );
  res.json({ notice: n });
});

router.patch("/admin/:id", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const id = req.params.id;
  const fields: Record<string, any> = {};
  for (const k of ["audience", "severity", "title", "body", "is_active", "pinned", "expires_at"]) {
    if (req.body?.[k] !== undefined) fields[k] = req.body[k];
  }
  if (fields.audience && !AUDIENCES.has(fields.audience)) return res.status(400).json({ error: "bad_audience" });
  if (fields.severity && !SEVERITIES.has(fields.severity)) return res.status(400).json({ error: "bad_severity" });
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: "no_fields" });
  const sets = Object.keys(fields).map((k, i) => `${k}=$${i + 2}`).join(", ");
  const vals = Object.values(fields);
  const [n] = await q(
    `UPDATE notices SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, ...vals]
  );
  if (!n) return res.status(404).json({ error: "not_found" });
  res.json({ notice: n });
});

router.delete("/admin/:id", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  await q(`DELETE FROM notices WHERE id=$1`, [req.params.id]);
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary, entity_type, entity_id)
       VALUES($1,$2,'notice_delete','Deleted notice','notice',$3)`,
    [req.user!.id, req.user!.email, req.params.id]
  );
  res.json({ ok: true });
});

// Toggle / set pinned state
router.post("/admin/:id/pin", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const pinned = req.body?.pinned === undefined ? null : !!req.body.pinned;
  const [n] = pinned === null
    ? await q(`UPDATE notices SET pinned = NOT pinned, updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
    : await q(`UPDATE notices SET pinned=$2, updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, pinned]);
  if (!n) return res.status(404).json({ error: "not_found" });
  res.json({ notice: n });
});

// Expire a notice immediately (or set explicit expires_at)
router.post("/admin/:id/expire", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const when = req.body?.expires_at ? new Date(req.body.expires_at) : new Date();
  const [n] = await q(
    `UPDATE notices SET expires_at=$2, is_active=false, updated_at=now() WHERE id=$1 RETURNING *`,
    [req.params.id, when.toISOString()]
  );
  if (!n) return res.status(404).json({ error: "not_found" });
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary, entity_type, entity_id)
       VALUES($1,$2,'notice_expire','Expired notice','notice',$3)`,
    [req.user!.id, req.user!.email, req.params.id]
  );
  res.json({ notice: n });
});

// Reactivate (clear expiry, set active)
router.post("/admin/:id/activate", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const [n] = await q(
    `UPDATE notices SET is_active=true, expires_at=NULL, updated_at=now() WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (!n) return res.status(404).json({ error: "not_found" });
  res.json({ notice: n });
});

// Convenience: filtered admin lists for buyer/seller audiences
router.get("/admin/buyers", authRequired, requireRole("admin"), async (_req, res) => {
  const rows = await q(
    `SELECT * FROM notices WHERE audience IN ('all','buyer') ORDER BY pinned DESC, created_at DESC LIMIT 200`
  );
  res.json({ notices: rows });
});
router.get("/admin/sellers", authRequired, requireRole("admin"), async (_req, res) => {
  const rows = await q(
    `SELECT * FROM notices WHERE audience IN ('all','seller') ORDER BY pinned DESC, created_at DESC LIMIT 200`
  );
  res.json({ notices: rows });
});

export default router;
