import { samples } from './samples.js';
const $ = id => document.getElementById(id);
const fields = ['brand', 'sender', 'website', 'message'];
let report = null; let loading = false; let sampleLoaded = false;
function escapeHtml(text = '') { return String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function updateCount() { $('char-count').textContent = `${$('message').value.length.toLocaleString()} / 12,000`; }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timeout); toast.timeout = setTimeout(() => $('toast').hidden = true, 2600); }
function setLoading(value) {
  loading = value; $('analyze-btn').disabled = value; document.querySelectorAll('.sample-btn').forEach(b => b.disabled = value);
  fields.forEach(id => $(id).disabled = value);
  $('button-label').textContent = value ? 'Checking your offer…' : 'Check this offer'; $('button-icon').textContent = value ? '◌' : '↗';
  $('loading-state').hidden = !value; $('empty-state').hidden = value || Boolean(report); $('results').hidden = value || !report;
}
function render(result) {
  const meta = {
    high: { badge: 'HIGH CAUTION', title: 'Pause before you proceed.', className: 'risk-high' },
    review: { badge: 'VERIFY FIRST', title: 'A few details need a closer look.', className: 'risk-review' },
    limited: { badge: 'FEW INDICATORS FOUND', title: 'Keep the verification step.', className: 'risk-limited' }
  }[result.risk];
  const e = escapeHtml;
  $('results').innerHTML = `<div class="report-top"><div class="step-label">02 / YOUR SECOND OPINION</div><div class="report-actions"><button class="icon-btn" id="copy-report" type="button">Copy</button><button class="icon-btn" id="download-report" type="button">Export ↓</button></div></div>
    <div class="risk-badge ${meta.className}"><span aria-hidden="true">●</span>${meta.badge}</div><h2 class="result-title">${meta.title}</h2><p class="result-summary">${e(result.summary)}</p>
    ${sampleLoaded ? '<p class="sample-notice">Live Gemini analysis of a fictional example. All .example domains are reserved sample addresses.</p>' : ''}
    <div class="stats-row"><span><b>${result.stats.evidenceCount}</b> evidence cards</span><span><b>${result.stats.linkCount}</b> links inspected as text</span><span>Gemini + code checks</span></div>
    <div class="domain-summary"><strong>Sender domain:</strong> ${e(result.context.senderDomain || 'Not provided')}<br><strong>Trusted domain:</strong> ${e(result.context.trustedDomain || 'Not provided')}</div>
    <div class="result-section-title">What needs attention <span>${result.findings.length ? 'Evidence from your offer' : 'No supported findings'}</span></div>
    ${result.findings.map(f => `<article class="finding"><div class="finding-heading"><span class="severity-dot ${f.severity}" aria-label="${f.severity} concern"></span><span>${e(f.title)}</span><span class="finding-source">${e(f.source)}</span></div><blockquote>${e(f.evidence)}</blockquote><p>${e(f.explanation)}</p></article>`).join('') || '<p class="empty-findings">We found no supported warning signs in the supplied text. This does not verify the sender or guarantee the offer is legitimate.</p>'}
    <div class="result-section-title">Your next move</div><ol class="steps">${result.steps.map(s => `<li>${e(s)}</li>`).join('')}</ol>
    ${result.reply ? `<div class="reply-head"><span>A verification reply you can adapt</span><button class="icon-btn" id="copy-reply" type="button">Copy draft</button></div><div class="reply-box">${e(result.reply)}</div>` : ''}
    <p class="limitation">${e(result.limitation)} ${result.stats.discardedAiClaims ? `${result.stats.discardedAiClaims} unsupported AI finding(s) were discarded.` : ''}</p>`;
  $('copy-report').addEventListener('click', () => copyText(markdownReport()));
  $('download-report').addEventListener('click', downloadReport);
  $('copy-reply')?.addEventListener('click', () => copyText(result.reply));
}
function markdownReport() {
  return `# Shieldio — Offer check\n\nDate: ${report.createdAt}\nBrand: ${report.context.brand || 'Not provided'}\nSender: ${report.context.sender || 'Not provided'}\nTrusted website: ${report.context.website || 'Not provided'}\n\nCaution level: ${report.risk}\n\n${report.summary}\n\n## Evidence\n\n${report.findings.map(f => `### ${f.title} (${f.severity})\nSource: ${f.source}\n\n> ${f.evidence.replace(/\n/g, '\n> ')}\n\n${f.explanation}`).join('\n\n') || 'No supported indicators found.'}\n\n## Verification steps\n\n${report.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Draft reply\n\n${report.reply}\n\n## Scope and limitations\n\n${report.limitation}\n\nAI model: ${report.model}\n`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); const success = document.execCommand('copy'); area.remove(); toast(success ? 'Copied to clipboard' : 'Clipboard unavailable. Use Export instead.'); }
}
function downloadReport() {
  const url = URL.createObjectURL(new Blob([markdownReport()], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `shieldio-report-${new Date().toISOString().slice(0, 10)}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Report exported');
}
$('message').addEventListener('input', () => { updateCount(); sampleLoaded = false; });
fields.filter(id => id !== 'message').forEach(id => $(id).addEventListener('input', () => { sampleLoaded = false; }));
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
  if (loading) return;
  const sample = samples[button.dataset.sample]; fields.forEach(id => $(id).value = sample[id]); updateCount(); sampleLoaded = true; $('error').hidden = true; toast('Fictional example loaded. Click “Check this offer”.');
}));
$('offer-form').addEventListener('submit', async event => {
  event.preventDefault(); if (loading) return;
  $('error').hidden = true; report = null; setLoading(true);
  const labels = ['Comparing the sender and link domains…', 'Reading the offer for concerning requests…', 'Matching findings to the original evidence…', 'Preparing your verification steps…'];
  let labelIndex = 0; $('loading-label').textContent = labels[0];
  const ticker = setInterval(() => { labelIndex = Math.min(labelIndex + 1, labels.length - 1); $('loading-label').textContent = labels[labelIndex]; }, 4000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(fields.map(id => [id, $(id).value]))), signal: AbortSignal.timeout(55000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The offer could not be checked. Please try again.');
    report = data; render(data);
  } catch (error) {
    $('error').textContent = error.name === 'TimeoutError' ? 'The check took too long. Please try again.' : error.message || 'Could not reach the server.'; $('error').hidden = false;
  } finally { clearInterval(ticker); setLoading(false); }
  if (report && window.innerWidth <= 720) $('output-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
updateCount();
