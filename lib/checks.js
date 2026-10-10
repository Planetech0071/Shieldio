import { domainToASCII } from 'node:url';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function domainOf(value, email = false) {
  if (!value || typeof value !== 'string') return null;
  const input = value.trim();
  try {
    const candidate = email ? input.match(/(?:<)?([^\s<>@]+@[^\s<>@]+)(?:>)?/)?.[1]?.split('@')[1] : input;
    if (!candidate) return null;
    const url = new URL(/^[a-z]+:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = domainToASCII(url.hostname).toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    return host.includes('.') && !host.includes(' ') ? host : null;
  } catch { return null; }
}

export function domainMatches(actual, trusted) {
  return Boolean(actual && trusted && (actual === trusted || actual.endsWith(`.${trusted}`)));
}

export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Send an offer to analyze.');
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (message.length < 30) throw new AppError('Paste at least 30 characters from the offer.');
  if (message.length > 12000) throw new AppError('Keep the offer under 12,000 characters.');
  const sender = typeof input.sender === 'string' ? input.sender.trim() : '';
  const brand = typeof input.brand === 'string' ? input.brand.trim() : '';
  const website = typeof input.website === 'string' ? input.website.trim() : '';
  if ([sender, brand, website].some(s => s.length > 300)) throw new AppError('Keep each context field under 300 characters.');
  if (sender && !domainOf(sender, true)) throw new AppError('Enter a valid sender email, or leave it blank.');
  if (website && !domainOf(website)) throw new AppError('Enter a valid brand website, or leave it blank.');
  return { message, sender, brand, website };
}

export function inspectOffer(input) {
  const trustedDomain = domainOf(input.website);
  const senderDomain = domainOf(input.sender, true);
  const matches = [...input.message.matchAll(/https?:\/\/[^\s<>"']+/gi)].map(m => m[0].replace(/[),.;!?]+$/, ''));
  const links = [...new Set(matches)].map(url => ({ url, domain: domainOf(url) })).filter(l => l.domain);
  const findings = [];
  if (senderDomain && trustedDomain && !domainMatches(senderDomain, trustedDomain)) {
    findings.push({ id: 'sender-domain', severity: 'medium', title: 'Sender uses a different domain', evidence: input.sender, explanation: `The sender uses ${senderDomain}, while the brand website you supplied is ${trustedDomain}. Agencies can use a separate domain; confirm this partnership independently.`, source: 'Domain check' });
  }
  for (const link of links) {
    if (trustedDomain && !domainMatches(link.domain, trustedDomain)) findings.push({ id: `link-${findings.length}`, severity: 'low', title: 'Link leaves the supplied brand domain', evidence: link.url, explanation: `This link leads to ${link.domain}. A different domain is not proof of fraud; check its purpose before opening it.`, source: 'URL check' });
    if (link.domain.includes('xn--')) findings.push({ id: `unicode-${findings.length}`, severity: 'medium', title: 'Internationalized domain needs a closer look', evidence: link.url, explanation: 'This address contains an encoded internationalized domain. Such domains can be legitimate, but lookalike characters can also disguise impersonation.', source: 'URL check' });
  }
  const executable = input.message.match(/\b[^\s<>"']+\.(?:exe|scr|msi|bat|cmd|ps1|vbs|js|jar|com)(?:\b|[?#])/i);
  if (executable) findings.push({ id: 'executable', severity: 'high', title: 'An executable file is mentioned', evidence: executable[0], explanation: 'This filename can run code on your device. A sponsorship brief should not require running an unverified program.', source: 'File check' });
  const archive = input.message.match(/\b[^\s<>"']+\.(?:zip|rar|7z)\b/i);
  if (archive && !executable) findings.push({ id: 'archive', severity: 'low', title: 'An archive file is mentioned', evidence: archive[0], explanation: 'Archives are common and can contain many file types. Verify the sender and inspect the contents before running anything.', source: 'File check' });
  return { findings, links, senderDomain, trustedDomain };
}

const severityRank = { high: 3, medium: 2, low: 1 };
export function assembleReport(input, checks, ai, model) {
  if (!ai || typeof ai.summary !== 'string' || !Array.isArray(ai.findings) || !Array.isArray(ai.steps)) throw new AppError('The AI returned an incomplete report. Please try again.', 502);
  const verified = ai.findings.filter(f => typeof f.evidence === 'string' && f.evidence.trim().length >= 4 && input.message.includes(f.evidence.trim()) && ['high', 'medium', 'low'].includes(f.severity) && typeof f.title === 'string' && typeof f.explanation === 'string').map((f, index) => ({ id: `ai-${index}`, title: f.title.slice(0, 160), severity: f.severity, evidence: f.evidence.trim(), explanation: f.explanation.slice(0, 1000), source: 'AI interpretation' }));
  const seenTitles = new Set(checks.findings.map(f => f.title.toLowerCase()));
  const uniqueAi = verified.filter(f => { const title = f.title.toLowerCase(); if (seenTitles.has(title)) return false; seenTitles.add(title); return true; });
  const findings = [...checks.findings, ...uniqueAi].sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const risk = findings.some(f => f.severity === 'high') ? 'high' : findings.some(f => f.severity === 'medium') ? 'review' : 'limited';
  const steps = ai.steps.filter(s => typeof s === 'string' && s.trim()).slice(0, 5);
  if (!steps.length) steps.push('Confirm the offer using contact details from a brand website you already trust.');
  return {
    risk, summary: ai.summary.slice(0, 1200), findings, steps,
    reply: typeof ai.reply === 'string' ? ai.reply.slice(0, 2000) : '',
    context: { brand: input.brand, sender: input.sender, website: input.website, senderDomain: checks.senderDomain, trustedDomain: checks.trustedDomain },
    links: checks.links,
    stats: { evidenceCount: findings.length, linkCount: checks.links.length, discardedAiClaims: ai.findings.length - verified.length },
    model, createdAt: new Date().toISOString(),
    limitation: 'This is a check of the text and domains you supplied, not a verdict that an offer is safe or fraudulent. Sender identity, domain ownership, links and attachments have not been independently verified.'
  };
}
