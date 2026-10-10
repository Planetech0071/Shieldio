import test from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, domainMatches, validateInput, inspectOffer, assembleReport } from '../lib/checks.js';
import { samples } from '../public/samples.js';

test('domain matching rejects deceptive suffixes and accepts real subdomains', () => {
  assert.equal(domainMatches('brand.com.attacker.example', 'brand.com'), false);
  assert.equal(domainMatches('fakebrand.com', 'brand.com'), false);
  assert.equal(domainMatches('partnerships.brand.com', 'brand.com'), true);
  assert.equal(domainOf('https://brand.com@attacker.example/login'), 'attacker.example');
  assert.equal(domainOf('Alex <alex@brand.com>', true), 'brand.com');
});
test('suspicious sample raises domain and executable checks, ordinary sample does not', () => {
  const bad = inspectOffer(samples.suspicious); const good = inspectOffer(samples.ordinary);
  assert.ok(bad.findings.some(f => f.id === 'executable' && f.severity === 'high'));
  assert.ok(bad.findings.some(f => f.id === 'sender-domain'));
  assert.equal(good.findings.length, 0);
});
test('fabricated AI evidence is discarded and cannot elevate caution', () => {
  const input = samples.ordinary;
  const result = assembleReport(input, inspectOffer(input), { summary: 'Review the offer.', findings: [{ title: 'Invented payment request', severity: 'high', evidence: 'Pay us a deposit now', explanation: 'Invented' }], steps: ['Verify independently.'], reply: '' }, 'test');
  assert.equal(result.findings.length, 0); assert.equal(result.risk, 'limited'); assert.equal(result.stats.discardedAiClaims, 1);
});
test('supported AI evidence is retained verbatim and high concern drives caution', () => {
  const input = samples.suspicious;
  const result = assembleReport(input, inspectOffer(input), { summary: 'Pause.', findings: [{ title: 'Upfront fee', severity: 'high', evidence: '€49 refundable verification fee', explanation: 'Verify the fee request.' }], steps: ['Verify independently.'], reply: '' }, 'test');
  assert.equal(result.risk, 'high'); assert.ok(result.findings.some(f => f.evidence === '€49 refundable verification fee'));
});
test('input limits and invalid context fail before an API request', () => {
  assert.throws(() => validateInput({ message: 'short' }));
  assert.throws(() => validateInput({ message: 'x'.repeat(12001) }));
  assert.throws(() => validateInput({ message: 'x'.repeat(50), sender: 'not an email' }));
  assert.throws(() => validateInput({ message: 'x'.repeat(50), website: 'not a domain' }));
  assert.equal(validateInput(samples.ordinary).brand, samples.ordinary.brand);
});

test('a normal .com website is not mistaken for an executable file', () => {
  const input = { brand: 'Brand', sender: 'team@brand.com', website: 'https://brand.com', message: 'Please visit our company website https://brand.com and contact us to discuss a written sponsorship agreement.' };
  assert.equal(inspectOffer(input).findings.length, 0);
});
