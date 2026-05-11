import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authRequired, AuthedReq } from "../auth";

const router = Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/nexusx-uploads";
const PUBLIC_BASE = process.env.UPLOAD_PUBLIC_BASE || "/uploads";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, "topups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext || ".bin"}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("invalid_file_type") as unknown as null, false);
  },
});

router.post("/screenshot", authRequired, upload.single("file"), (req: AuthedReq, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });
  const url = `${PUBLIC_BASE}/topups/${req.file.filename}`;
  res.json({ ok: true, url, path: req.file.filename, size: req.file.size });
});

export default router;