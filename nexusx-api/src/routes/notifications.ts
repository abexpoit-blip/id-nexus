import { Router } from "express";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

router.get("/", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  const [unread] = await q(
    `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read_at IS NULL`,
    [req.user!.id]
  );
  res.json({ notifications: rows, unread: unread.c });
});

router.post("/:id/read", authRequired, async (req: AuthedReq, res) => {
  await q(
    `UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2 AND read_at IS NULL`,
    [req.params.id, req.user!.id]
  );
  res.json({ ok: true });
});

router.post("/read-all", authRequired, async (req: AuthedReq, res) => {
  await q(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [req.user!.id]);
  res.json({ ok: true });
});

export default router;