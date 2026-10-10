import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import analyze from './api/analyze.js';

try { process.loadEnvFile(); } catch { /* Environment variables also work without a local .env file. */ }
const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/analyze') {
    if (req.method !== 'POST') return analyze(req, res);
    let chunks = []; let size = 0;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > 30000) { res.writeHead(413); return res.end(JSON.stringify({ error: 'The request is too large.' })); } chunks.push(chunk); }
      req.body = Buffer.concat(chunks).toString();
      return await analyze(req, res);
    } catch { res.writeHead(400); return res.end(JSON.stringify({ error: 'The request could not be read.' })); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const file = path.resolve(publicDir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Shieldio ready at http://localhost:${process.env.PORT || 3000}`));
