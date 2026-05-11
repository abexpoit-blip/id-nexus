import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import http from "http";
import { Server as IOServer } from "socket.io";

import auth from "./routes/auth";
import categories from "./routes/categories";
import orders from "./routes/orders";
import wallet from "./routes/wallet";
import admin from "./routes/admin";
import profiles from "./routes/profiles";
import withdraws from "./routes/withdraws";
import replacements from "./routes/replacements";
import seller from "./routes/seller";
import notifications from "./routes/notifications";
import vpn from "./routes/vpn";
import uploads from "./routes/uploads";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const ORIGIN = (process.env.CORS_ORIGIN || "https://buy.nexus-x.cloud").split(",");
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/nexusx-uploads";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(morgan("tiny"));
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", auth);
app.use("/api/categories", categories);
app.use("/api/orders", orders);
app.use("/api/wallet", wallet);
app.use("/api/admin", admin);
app.use("/api/profiles", profiles);
app.use("/api/withdraws", withdraws);
app.use("/api/replacements", replacements);
app.use("/api/seller", seller);
app.use("/api/notifications", notifications);
app.use("/api/vpn", vpn);
app.use("/api/uploads", uploads);
import settings from "./routes/settings";
app.use("/api/settings", settings);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "server_error", message: err?.message });
});

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: ORIGIN, credentials: true } });
io.on("connection", (s) => { s.on("join", (room: string) => s.join(room)); });
(global as any).io = io;

server.listen(PORT, () => console.log(`nexusx-api listening on :${PORT}`));