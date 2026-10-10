import { validateInput, inspectOffer, assembleReport, AppError } from '../lib/checks.js';
import { analyzeWithGemini } from '../lib/gemini.js';

// Best-effort per-instance throttling. A production service should use a shared rate-limit store.
const buckets = new Map();
function throttled(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const now = Date.now();
  for (const [key, entry] of buckets) if (now - entry.start > 60000) buckets.delete(key);
  const entry = buckets.get(ip) || { start: now, count: 0 };
  entry.count++; buckets.set(ip, entry);
  return entry.count > 8;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.statusCode = 405; return res.end(JSON.stringify({ error: 'Use POST to analyze an offer.' })); }
  try {
    if (throttled(req)) throw new AppError('Too many checks in a minute. Please wait a moment.', 429);
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new AppError('Send the offer as JSON.');
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new AppError('The submitted request is not valid JSON.'); }
    const input = validateInput(body);
    const checks = inspectOffer(input);
    const { ai, model } = await analyzeWithGemini(input, checks);
    const report = assembleReport(input, checks, ai, model);
    res.statusCode = 200; res.end(JSON.stringify(report));
  } catch (error) {
    res.statusCode = error instanceof AppError ? error.status : 500;
    res.end(JSON.stringify({ error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' }));
  }
}
