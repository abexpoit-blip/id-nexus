// ============================================================
//  VPS Upload Endpoint for Top-up Screenshots
//  Single-file Node.js server. No external dependencies needed.
//
//  WHAT IT DOES
//  - POST /upload   (multipart/form-data with field "file")
//      → Saves the image under /var/www/uploads/<user_id>/<timestamp>.<ext>
//      → Returns JSON: { url, filename }
//  - DELETE /upload (JSON body: { "url": "https://..." })
//      → Deletes the file from disk (used by 6h cleanup job)
//  - GET /uploads/<user_id>/<file>  → serves the image (so admin can view)
//
//  AUTH
//  - Every request must have:  Authorization: Bearer <VPS_UPLOAD_TOKEN>
//
//  SETUP (run once on your VPS, see chat for full guide)
//    sudo mkdir -p /var/www/uploads
//    sudo chown -R $USER:$USER /var/www/uploads
//    export VPS_UPLOAD_TOKEN="paste-your-long-random-token-here"
//    export PUBLIC_BASE_URL="https://yourdomain.com"   # or http://YOUR_IP:8787
//    node vps-upload-server.js
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.VPS_UPLOAD_TOKEN;
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/www/uploads';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

if (!TOKEN) {
  console.error('FATAL: VPS_UPLOAD_TOKEN env var is required.');
  process.exit(1);
}
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(res, status, body) {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function authOk(req) {
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${TOKEN}`;
}

// ----- Tiny multipart parser (handles single small file) -----
function parseMultipart(buffer, boundary) {
  const result = { fields: {}, file: null };
  const delim = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(delim, start);
    if (idx === -1) break;
    if (parts.length > 0) parts[parts.length - 1].end = idx - 2; // strip \r\n
    if (buffer.slice(idx + delim.length, idx + delim.length + 2).toString() === '--') break;
    parts.push({ start: idx + delim.length + 2 });
    start = idx + delim.length;
  }
  for (const p of parts) {
    if (p.end == null) continue;
    const headerEnd = buffer.indexOf('\r\n\r\n', p.start);
    if (headerEnd === -1) continue;
    const headerStr = buffer.slice(p.start, headerEnd).toString();
    const body = buffer.slice(headerEnd + 4, p.end);
    const nameMatch = /name="([^"]+)"/.exec(headerStr);
    const fileMatch = /filename="([^"]*)"/.exec(headerStr);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (fileMatch) {
      result.file = {
        field: name,
        filename: fileMatch[1],
        contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
        data: body,
      };
    } else {
      result.fields[name] = body.toString();
    }
  }
  return result;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    const u = new URL(req.url, `http://${req.headers.host}`);

    // ---- Public file serving (no auth, only inside UPLOAD_DIR) ----
    if (req.method === 'GET' && u.pathname.startsWith('/uploads/')) {
      const safe = path.normalize(path.join(UPLOAD_DIR, u.pathname.replace('/uploads/', '')));
      if (!safe.startsWith(UPLOAD_DIR + path.sep)) return json(res, 403, { error: 'forbidden' });
      if (!fs.existsSync(safe)) return json(res, 404, { error: 'not found' });
      const ext = path.extname(safe).slice(1).toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { ...cors, 'Content-Type': mime, 'Cache-Control': 'public, max-age=300' });
      fs.createReadStream(safe).pipe(res);
      return;
    }

    // ---- Health check ----
    if (req.method === 'GET' && u.pathname === '/health') return json(res, 200, { ok: true });

    // ---- All other routes need bearer auth ----
    if (!authOk(req)) return json(res, 401, { error: 'Unauthorized' });

    // ---- Upload ----
    if (req.method === 'POST' && u.pathname === '/upload') {
      const ctype = req.headers['content-type'] || '';
      const m = /boundary=(.+)$/i.exec(ctype);
      if (!m) return json(res, 400, { error: 'multipart/form-data required' });
      const buf = await readBody(req, MAX_BYTES + 1024);
      const parsed = parseMultipart(buf, m[1].trim());
      if (!parsed.file) return json(res, 400, { error: '"file" field is required' });
      const ext = ALLOWED[parsed.file.contentType.toLowerCase()];
      if (!ext) return json(res, 415, { error: 'Only PNG/JPG/WEBP allowed' });
      if (parsed.file.data.length > MAX_BYTES) return json(res, 413, { error: 'File too large (max 5MB)' });

      const userId = (parsed.fields.user_id || 'anon').replace(/[^a-zA-Z0-9-]/g, '');
      const dir = path.join(UPLOAD_DIR, userId || 'anon');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const full = path.join(dir, filename);
      fs.writeFileSync(full, parsed.file.data);
      const url = `${PUBLIC_BASE_URL}/uploads/${encodeURIComponent(userId)}/${filename}`;
      console.log(`[upload] user=${userId} bytes=${parsed.file.data.length} → ${url}`);
      return json(res, 200, { url, filename });
    }

    // ---- Delete (used by 6h cleanup) ----
    if (req.method === 'DELETE' && u.pathname === '/upload') {
      const buf = await readBody(req, 4096);
      let body;
      try { body = JSON.parse(buf.toString() || '{}'); } catch { return json(res, 400, { error: 'invalid json' }); }
      const target = String(body.url || '');
      if (!target.startsWith(PUBLIC_BASE_URL + '/uploads/')) {
        return json(res, 400, { error: 'url not in this server' });
      }
      const rel = target.slice((PUBLIC_BASE_URL + '/uploads/').length);
      const safe = path.normalize(path.join(UPLOAD_DIR, decodeURIComponent(rel)));
      if (!safe.startsWith(UPLOAD_DIR + path.sep)) return json(res, 403, { error: 'forbidden' });
      if (fs.existsSync(safe)) {
        fs.unlinkSync(safe);
        console.log(`[delete] ${safe}`);
        return json(res, 200, { deleted: true });
      }
      return json(res, 200, { deleted: false, reason: 'not found (already gone)' });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('error', e);
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`Upload server listening on :${PORT}`);
  console.log(`Upload dir: ${UPLOAD_DIR}`);
  console.log(`Public base: ${PUBLIC_BASE_URL}`);
});