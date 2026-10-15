/**
 * Rejects LLM text that introduces numbers or factual claims absent from
 * the sanctioned input. Does not calculate, and does not replace the
 * Decision Intelligence or Why-engine validators.
 */

const ALWAYS_REJECT = [
  /\byou should (?:buy|purchase|proceed)\b/i,
  /\brecommended to buy\b/i,
  /\bstrong buy\b/i,
  /\bunmortgageable\b/i,
  /\bguaranteed admission\b/i,
  /\bwill let quickly\b/i,
  /\bwill sell quickly\b/i,
  /\btenant demand is (?:high|strong|low)\b/i,
  /\bdemand is high\b/i,
];

const UNGROUNDED_PHRASES = [
  'modern finishes',
  'natural light',
  'high-spec',
  'high spec',
  'ready to move in',
  'desirable location',
  'buyer appeal',
  'stunning interior',
  'prime location',
  'thoughtfully presented',
  'stylish interior',
  'excellent condition',
  'newly renovated',
  'sought-after',
  'sought after',
  'outstanding school',
  'good school',
  'catchment',
  'ofsted',
  'price growth',
  'future value',
  'capital growth',
];

const SMALL_ALLOWLIST = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);

function extractNumbers(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const found = new Set();
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  let match;
  while ((match = re.exec(text))) {
    const n = Number(String(match[0]).replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    found.add(n);
    found.add(Math.round(n));
    found.add(Math.round(n * 100) / 100);
  }
  return found;
}

function sanctionedText(sanctioned) {
  return typeof sanctioned === 'string' ? sanctioned : JSON.stringify(sanctioned ?? '');
}

function walkCounts(node, kind, target, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return false;
  seen.add(node);
  const keys = Object.keys(node);
  for (const key of keys) {
    const value = node[key];
    if (kind === 'bedroom' && /bed/i.test(key) && Number(value) === target) return true;
    if (kind === 'bathroom' && /bath/i.test(key) && Number(value) === target) return true;
    if (value && typeof value === 'object' && walkCounts(value, kind, target, seen)) return true;
  }
  return false;
}

function validateLlmText(text, sanctioned) {
  const reasons = [];
  const body = typeof text === 'string' ? text : '';
  if (!body.trim()) {
    return { ok: false, reasons: ['empty LLM text'] };
  }
  const facts = sanctionedText(sanctioned);
  const factsLower = facts.toLowerCase();

  ALWAYS_REJECT.forEach((pattern) => {
    if (pattern.test(body)) reasons.push(`forbidden claim (${pattern})`);
  });

  UNGROUNDED_PHRASES.forEach((phrase) => {
    if (body.toLowerCase().includes(phrase) && !factsLower.includes(phrase)) {
      reasons.push(`ungrounded phrase (${phrase})`);
    }
  });

  const bedBath = /(\d+(?:\.\d+)?)\s*-?\s*(bed(?:room)?s?|bath(?:room)?s?)/gi;
  let match;
  while ((match = bedBath.exec(body))) {
    const n = Number(match[1]);
    const kind = /bath/i.test(match[2]) ? 'bathroom' : 'bedroom';
    const phrase = match[0].toLowerCase();
    if (!walkCounts(sanctioned, kind, n) && !factsLower.includes(phrase)) {
      reasons.push(`unsupported ${kind} count ${n}`);
    }
  }

  const currency = /£\s*(\d[\d,]*(?:\.\d+)?)/g;
  while ((match = currency.exec(body))) {
    const n = Number(match[1].replace(/,/g, ''));
    const allowed = extractNumbers(sanctioned);
    if (!allowed.has(n) && !allowed.has(Math.round(n))) {
      reasons.push(`unsupported amount ${n}`);
    }
  }

  const metric = /(\d+(?:\.\d+)?)\s*%/g;
  while ((match = metric.exec(body))) {
    const n = Number(match[1]);
    const window = body.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).toLowerCase();
    const financial = /yield|growth|appreciat|ltv|dscr|vacancy|interest|service charge|ground rent/.test(window);
    if (financial && !extractNumbers(sanctioned).has(n)) {
      reasons.push(`unsupported financial percent ${n}`);
    }
  }

  const allowed = extractNumbers(sanctioned);
  extractNumbers(body).forEach((n) => {
    if (allowed.has(n) || allowed.has(Math.round(n)) || SMALL_ALLOWLIST.has(n)) return;
    reasons.push(`number not in sanctioned facts (${n})`);
  });

  return { ok: reasons.length === 0, reasons };
}

function validateLlmFields(fields, sanctioned) {
  const text = Object.values(fields || {})
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string')
    .join('\n');
  return validateLlmText(text, sanctioned);
}

function suppliedCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeListingCopy(input = {}) {
  const address = input.address || 'Address not supplied';
  const propertyType = input.propertyType || 'property';
  const bedrooms = suppliedCount(input.bedrooms);
  const bathrooms = suppliedCount(input.bathrooms);
  const price = suppliedCount(input.price);
  const features = [...(input.features || []), ...(input.keyFeatures || [])].filter((item) => typeof item === 'string' && item.trim());
  const notes = typeof input.descriptionNotes === 'string' ? input.descriptionNotes.trim() : '';
  const priceText = price != null
    ? `Listed price supplied: £${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(price)}.`
    : 'No price was supplied.';
  const roomText = [
    bedrooms != null ? `${bedrooms} bedrooms supplied.` : null,
    bathrooms != null ? `${bathrooms} bathrooms supplied.` : null,
  ].filter(Boolean).join(' ');
  const featureText = features.length
    ? `Supplied features: ${features.join(', ')}.`
    : 'No features were supplied.';
  const description = [`${propertyType} at ${address}.`, priceText, roomText, notes, featureText]
    .filter(Boolean)
    .join(' ');
  const title = [bedrooms != null ? `${bedrooms} bed` : null, propertyType, address].filter(Boolean).join(' ');
  return {
    seoTitle: title,
    description,
    keySellingPoints: features.slice(0, 5),
    socialMediaAdvert: description,
    emailMarketing: description,
    evidenceClass: 'listing_copy',
    notDecisionEvidence: true,
  };
}

module.exports = {
  validateLlmText,
  validateLlmFields,
  safeListingCopy,
  extractNumbers,
};
