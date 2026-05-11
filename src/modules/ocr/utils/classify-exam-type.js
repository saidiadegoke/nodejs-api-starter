/**
 * Classify the exam body from the first chunk of OCR text.
 * Returns one of 'waec' | 'neco' | 'nabteb' | 'gce' | 'generic'.
 */

const HEADER_LOOKUP = [
  { type: 'waec', patterns: [/WEST\s+AFRICAN\s+EXAMINATIONS?\s+COUNCIL/i, /\bWAEC\b/i] },
  { type: 'neco', patterns: [/NATIONAL\s+EXAMINATIONS?\s+COUNCIL/i, /\bNECO\b/i] },
  { type: 'nabteb', patterns: [/NABTEB/i, /NATIONAL\s+BUSINESS\s+AND\s+TECHNICAL\s+EXAMINATIONS/i] },
  {
    type: 'gce',
    patterns: [
      /GENERAL\s+CERTIFICATE\s+OF\s+EDUCATION/i,
      /\bGCE\b/i,
      /CAMBRIDGE\s+(INTERNATIONAL\s+)?(GENERAL\s+CERTIFICATE|EXAMINATIONS)/i,
      /\bA-?\s*LEVEL\b/i
    ]
  }
];

function classifyExamType(text) {
  if (!text || typeof text !== 'string') return 'generic';
  const head = text.slice(0, 800);

  // Check WAEC first; then NECO; then NABTEB; then GCE.
  // (WAEC also operates a GCE programme — header for that says
  //  "WEST AFRICAN ... GENERAL CERTIFICATE EXAMINATION (GCE)" — we honor
  //  GCE in that case because the result format differs from SSCE.)
  const looksLikeGce = HEADER_LOOKUP.find((entry) => entry.type === 'gce')
    .patterns.some((p) => p.test(head));

  if (looksLikeGce) return 'gce';

  for (const { type, patterns } of HEADER_LOOKUP) {
    if (type === 'gce') continue;
    if (patterns.some((p) => p.test(head))) return type;
  }
  return 'generic';
}

module.exports = { classifyExamType };
