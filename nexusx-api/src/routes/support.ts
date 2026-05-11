import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

const CATS = new Set(["order", "payment", "account", "technical", "other"]);
const STATUSES = new Set(["open", "pending", "resolved", "closed"]);

async function isEnabled(): Promise<boolean> {
  const [r] = await q(`SELECT value FROM app_settings WHERE key='support_enabled'`);
  if (!r) return true;
  return r.value === true || r.value === "true";
}

// ===== USER ENDPOINTS =====
router.get("/enabled", async (_req, res) => {
  res.json({ enabled: await isEnabled() });
});

router.get("/tickets", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT id, category, subject, status, last_message_at, created_at, closed_at
       FROM support_tickets WHERE user_id=$1 ORDER BY last_message_at DESC LIMIT 100`,
    [req.user!.id]
  );
  res.json({ tickets: rows });
});

router.get("/tickets/:id", authRequired, async (req: AuthedReq, res) => {
  const [t] = await q(
    `SELECT * FROM support_tickets WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user!.id]
  );
  if (!t) return res.status(404).json({ error: "not_found" });
  const messages = await q(
    `SELECT id, sender_is_admin, body, created_at
       FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at ASC`,
    [t.id]
  );
  res.json({ ticket: t, messages });
});

router.post("/tickets", authRequired, async (req: AuthedReq, res) => {
  if (!(await isEnabled())) return res.status(403).json({ error: "support_disabled" });
  const category = String(req.body?.category || "");
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!CATS.has(category)) return res.status(400).json({ error: "bad_category" });
  if (subject.length < 3 || body.length < 3) return res.status(400).json({ error: "too_short" });
  const [t] = await q(
    `INSERT INTO support_tickets(user_id, category, subject) VALUES($1,$2,$3) RETURNING *`,
    [req.user!.id, category, subject]
  );
  await q(
    `INSERT INTO support_ticket_messages(ticket_id, sender_id, sender_is_admin, body)
       VALUES($1,$2,false,$3)`,
    [t.id, req.user!.id, body]
  );
  res.json({ ticket: t });
});

router.post("/tickets/:id/messages", authRequired, async (req: AuthedReq, res) => {
  if (!(await isEnabled())) return res.status(403).json({ error: "support_disabled" });
  const body = String(req.body?.body || "").trim();
  if (body.length < 1) return res.status(400).json({ error: "body_required" });
  const [t] = await q(
    `SELECT id, status FROM support_tickets WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user!.id]
  );
  if (!t) return res.status(404).json({ error: "not_found" });
  if (t.status === "closed") return res.status(400).json({ error: "closed" });
  await q(
    `INSERT INTO support_ticket_messages(ticket_id, sender_id, sender_is_admin, body)
       VALUES($1,$2,false,$3)`,
    [t.id, req.user!.id, body]
  );
  await q(
    `UPDATE support_tickets SET status='open', last_message_at=now(), updated_at=now() WHERE id=$1`,
    [t.id]
  );
  res.json({ ok: true });
});

// ===== ADMIN ENDPOINTS =====
router.get("/admin/tickets", authRequired, requireRole("admin"), async (req, res) => {
  const status = String(req.query.status || "");
  const where = STATUSES.has(status) ? `WHERE t.status=$1` : "";
  const params = STATUSES.has(status) ? [status] : [];
  const rows = await q(
    `SELECT t.*, u.email, p.display_name,
            (SELECT COUNT(*)::int FROM support_ticket_messages m
              WHERE m.ticket_id=t.id AND m.sender_is_admin=false) AS user_msgs
       FROM support_tickets t
       JOIN users u ON u.id=t.user_id
       LEFT JOIN profiles p ON p.id=u.id
       ${where}
      ORDER BY (CASE WHEN t.status='open' THEN 0 WHEN t.status='pending' THEN 1
                     WHEN t.status='resolved' THEN 2 ELSE 3 END), t.last_message_at DESC
      LIMIT 200`,
    params
  );
  res.json({ tickets: rows });
});

router.get("/admin/tickets/:id", authRequired, requireRole("admin"), async (req, res) => {
  const [t] = await q(
    `SELECT t.*, u.email, p.display_name FROM support_tickets t
       JOIN users u ON u.id=t.user_id
       LEFT JOIN profiles p ON p.id=u.id WHERE t.id=$1`,
    [req.params.id]
  );
  if (!t) return res.status(404).json({ error: "not_found" });
  const messages = await q(
    `SELECT id, sender_is_admin, body, created_at
       FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at ASC`,
    [t.id]
  );
  res.json({ ticket: t, messages });
});

router.post("/admin/tickets/:id/messages", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const body = String(req.body?.body || "").trim();
  if (body.length < 1) return res.status(400).json({ error: "body_required" });
  const [t] = await q(`SELECT id, user_id FROM support_tickets WHERE id=$1`, [req.params.id]);
  if (!t) return res.status(404).json({ error: "not_found" });
  await q(
    `INSERT INTO support_ticket_messages(ticket_id, sender_id, sender_is_admin, body)
       VALUES($1,$2,true,$3)`,
    [t.id, req.user!.id, body]
  );
  await q(
    `UPDATE support_tickets SET status='pending', last_message_at=now(), updated_at=now() WHERE id=$1`,
    [t.id]
  );
  await q(
    `INSERT INTO notifications(user_id, kind, title, body)
       VALUES($1,'message','📬 Support replied to your ticket', $2)`,
    [t.user_id, body.slice(0, 140)]
  );
  res.json({ ok: true });
});

router.post("/admin/tickets/:id/status", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const status = String(req.body?.status || "");
  if (!STATUSES.has(status)) return res.status(400).json({ error: "bad_status" });
  const closed = status === "closed" ? "now()" : "NULL";
  const [t] = await q(
    `UPDATE support_tickets SET status=$1, closed_at=${closed}, updated_at=now()
        WHERE id=$2 RETURNING id, user_id, status`,
    [status, req.params.id]
  );
  if (!t) return res.status(404).json({ error: "not_found" });
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary, entity_type, entity_id)
       VALUES($1,$2,'support_status',$3,'support_ticket',$4)`,
    [req.user!.id, req.user!.email, `Set ticket to ${status}`, t.id]
  );
  res.json({ ok: true });
});

router.post("/admin/toggle", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const enabled = !!req.body?.enabled;
  await q(
    `INSERT INTO app_settings(key, value, updated_by, updated_at)
       VALUES('support_enabled', to_jsonb($1::boolean), $2, now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
    [enabled, req.user!.id]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary)
       VALUES($1,$2,'support_toggle',$3)`,
    [req.user!.id, req.user!.email, `Support system ${enabled ? "enabled" : "disabled"}`]
  );
  res.json({ ok: true, enabled });
});

export default router;
