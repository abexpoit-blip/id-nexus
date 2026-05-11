import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

// ===== USER-FACING: own thread with admins =====
router.get("/me", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT id, sender_is_admin, body, read_at, created_at
       FROM admin_messages WHERE thread_user_id=$1 ORDER BY created_at ASC LIMIT 200`,
    [req.user!.id]
  );
  const [u] = await q(
    `SELECT COUNT(*)::int AS c FROM admin_messages
       WHERE thread_user_id=$1 AND sender_is_admin=true AND read_at IS NULL`,
    [req.user!.id]
  );
  res.json({ messages: rows, unread: u.c });
});

router.post("/me", authRequired, async (req: AuthedReq, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (body.length < 1) return res.status(400).json({ error: "body_required" });
  const [m] = await q(
    `INSERT INTO admin_messages(thread_user_id, sender_id, sender_is_admin, body)
       VALUES($1,$1,false,$2) RETURNING *`,
    [req.user!.id, body]
  );
  res.json({ message: m });
});

router.post("/me/read", authRequired, async (req: AuthedReq, res) => {
  await q(
    `UPDATE admin_messages SET read_at=now()
       WHERE thread_user_id=$1 AND sender_is_admin=true AND read_at IS NULL`,
    [req.user!.id]
  );
  res.json({ ok: true });
});

// ===== ADMIN-FACING =====
router.get("/admin/threads", authRequired, requireRole("admin"), async (_req, res) => {
  const rows = await q(
    `WITH last AS (
        SELECT DISTINCT ON (thread_user_id) thread_user_id, body, created_at, sender_is_admin
          FROM admin_messages ORDER BY thread_user_id, created_at DESC
      )
      SELECT u.id AS user_id, u.email, p.display_name,
             l.body AS last_body, l.created_at AS last_at, l.sender_is_admin AS last_from_admin,
             COALESCE((SELECT COUNT(*)::int FROM admin_messages m
                WHERE m.thread_user_id=u.id AND m.sender_is_admin=false AND m.read_at IS NULL),0) AS unread
        FROM last l
        JOIN users u ON u.id=l.thread_user_id
        LEFT JOIN profiles p ON p.id=u.id
        ORDER BY l.created_at DESC LIMIT 200`
  );
  res.json({ threads: rows });
});

router.get("/admin/thread/:userId", authRequired, requireRole("admin"), async (req, res) => {
  const rows = await q(
    `SELECT id, sender_is_admin, body, read_at, created_at
       FROM admin_messages WHERE thread_user_id=$1 ORDER BY created_at ASC LIMIT 500`,
    [req.params.userId]
  );
  await q(
    `UPDATE admin_messages SET read_at=now()
       WHERE thread_user_id=$1 AND sender_is_admin=false AND read_at IS NULL`,
    [req.params.userId]
  );
  res.json({ messages: rows });
});

router.post("/admin/thread/:userId", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const body = String(req.body?.body ?? "").trim();
  if (body.length < 1) return res.status(400).json({ error: "body_required" });
  const [m] = await q(
    `INSERT INTO admin_messages(thread_user_id, sender_id, sender_is_admin, body)
       VALUES($1,$2,true,$3) RETURNING *`,
    [req.params.userId, req.user!.id, body]
  );
  await q(
    `INSERT INTO notifications(user_id, kind, title, body)
       VALUES($1,'message','📬 New message from admin', $2)`,
    [req.params.userId, body.slice(0, 140)]
  );
  res.json({ message: m });
});

// ===== BROADCAST ANNOUNCEMENTS =====
router.post("/admin/broadcast", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  const audience = String(req.body?.audience ?? "all"); // all | sellers | buyers
  if (title.length < 2 || body.length < 2) return res.status(400).json({ error: "title_body_required" });
  let where = "";
  if (audience === "sellers") where = `WHERE EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller')`;
  else if (audience === "buyers") where = `WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','admin'))`;
  const inserted = await q(
    `INSERT INTO notifications(user_id, kind, title, body)
       SELECT u.id, 'announcement', $1, $2 FROM users u ${where}
     RETURNING id`,
    [title, body]
  );
  await q(
    `INSERT INTO audit_logs(actor_id, actor_email, event_type, summary, details)
       VALUES($1,$2,'broadcast',$3,$4)`,
    [req.user!.id, req.user!.email, `Broadcast to ${audience} (${inserted.length} users)`,
     JSON.stringify({ title, body, audience, count: inserted.length })]
  );
  res.json({ ok: true, count: inserted.length });
});

export default router;