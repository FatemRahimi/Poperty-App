/**
 * PropertyData /uprns discovery mapping and named-unit safety.
 * Discovery only — not subject confirmation, not alias reconciliation.
 */

const UPRNS_STRICT = 'true';
const UPRNS_MAX_RESULTS = 200;

function nonempty(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text && text.toLowerCase() !== 'null' ? text : '';
}

function asUprnString(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function isShellClassification(code, desc) {
  const c = nonempty(code).toUpperCase();
  const d = nonempty(desc);
  if (c === 'P' || c === 'PP') return true;
  return /\b(parent\s+shell|property\s+shell)\b/i.test(d);
}

function isUnitLikeClassification(code, desc) {
  const d = nonempty(desc);
  const c = nonempty(code).toUpperCase();
  if (/\b(flat|apartment|maisonette|studio)\b/i.test(d)) return true;
  return c === 'RD06';
}

/**
 * Presentation kind from observed structure. Classification is never the sole signal.
 * UNIT: distinct UPRN + secondary and/or unit-like class.
 * SHELL: distinct UPRN + secondary absent + shell class.
 * ADDRESS: distinct UPRN that is neither (e.g. a house).
 */
function classifyDiscoveryKind(row) {
  const secondary = nonempty(row.secondary || row.addressParts?.secondary);
  const shell = isShellClassification(row.classificationCode, row.classificationCodeDesc);
  if (shell && !secondary) return 'shell';
  if (secondary || isUnitLikeClassification(row.classificationCode, row.classificationCodeDesc)) {
    return 'unit';
  }
  return 'address';
}

function mapProviderDiscoveryRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const parts = raw.addressParts && typeof raw.addressParts === 'object' ? raw.addressParts : {};
  const uprn = asUprnString(raw.uprn);
  if (!uprn) return null;
  const addressParts = {
    secondary: nonempty(parts.secondary) || null,
    primary: nonempty(parts.primary) || null,
    street: nonempty(parts.street) || null,
    town: nonempty(parts.town) || null,
    district: nonempty(parts.district) || null,
    postcode: nonempty(parts.postcode) || null,
  };
  const mapped = {
    uprn,
    address: nonempty(raw.address) || null,
    addressParts,
    secondary: addressParts.secondary,
    primary: addressParts.primary,
    street: addressParts.street,
    town: addressParts.town,
    district: addressParts.district,
    postcode: addressParts.postcode,
    classificationCode: nonempty(raw.classificationCode) || null,
    classificationCodeDesc: nonempty(raw.classificationCodeDesc) || null,
    latitude: raw.lat ?? raw.latitude ?? null,
    longitude: raw.lng ?? raw.longitude ?? null,
    source: 'uprns_discovery',
  };
  mapped.kind = classifyDiscoveryKind(mapped);
  return mapped;
}

function listFromProviderPayload(data) {
  if (!data) return [];
  const raw = data.data || data.results || data.uprns || data.properties || [];
  return Array.isArray(raw) ? raw : [];
}

function mapUprnDiscoveryResponse(data) {
  const rows = listFromProviderPayload(data)
    .map(mapProviderDiscoveryRow)
    .filter(Boolean);
  return {
    rows,
    returnedCount: rows.length,
    potentiallyTruncated: rows.length >= UPRNS_MAX_RESULTS,
    requestedResults: UPRNS_MAX_RESULTS,
    strict: true,
  };
}

function queryLooksLikeNamedUnit(query) {
  const text = String(query || '');
  if (
    /\b(?:flat|apartment|apt|unit|studio|maisonette|penthouse)\s+[a-z0-9]/i.test(text)
  ) {
    return true;
  }
  if (/\b(?:first|second|third|fourth|ground|top|lower|upper)\s+floor(?:\s+flat)?\b/i.test(text)) {
    return true;
  }
  return false;
}

function matcherRowLooksLikeShell(row) {
  if (!row) return false;
  const secondary = nonempty(row.secondary || row.addressParts?.secondary);
  if (secondary) return false;
  return isShellClassification(row.classificationCode, row.classificationCodeDesc);
}

/**
 * A typed named unit must never silently resolve to a shell.
 * Does not infer aliases (Flat E ↛ 30E, Flat B ↛ Flat 1).
 */
function shouldSuppressShellAsExactUnit(query, matcherRow) {
  return queryLooksLikeNamedUnit(query) && matcherRowLooksLikeShell(matcherRow);
}

function isPostcodeOnlyQuery(query, postcode) {
  if (!postcode) return false;
  const compactQ = String(query || '')
    .toUpperCase()
    .replace(/[\s,]+/g, '');
  const compactPc = String(postcode)
    .toUpperCase()
    .replace(/[\s,]+/g, '');
  return Boolean(compactQ) && compactQ === compactPc;
}

function tokeniseQuery(query, postcode) {
  let text = String(query || '');
  if (postcode) {
    text = text.replace(new RegExp(String(postcode).replace(/\s+/g, '\\s*'), 'ig'), '');
  }
  return text
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 1);
}

function discoveryRowScore(row, tokens) {
  if (!tokens.length) return 0;
  const hay = [
    row.address,
    row.secondary,
    row.primary,
    row.street,
    row.addressParts?.secondary,
    row.addressParts?.primary,
    row.addressParts?.street,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.filter((t) => hay.includes(t)).length;
}

/** Rank real rows only. Never drop, rewrite, or fabricate. */
function rankDiscoveryRows(rows, query, postcode) {
  const tokens = tokeniseQuery(query, postcode);
  const kindWeight = { unit: 0, address: 1, shell: 2 };
  return [...rows].sort((a, b) => {
    const scoreDelta = discoveryRowScore(b, tokens) - discoveryRowScore(a, tokens);
    if (scoreDelta) return scoreDelta;
    return (kindWeight[a.kind] || 0) - (kindWeight[b.kind] || 0);
  });
}

function mergeMatcherAndDiscovery({
  query,
  matcherRows = [],
  discoveryRows = [],
} = {}) {
  const byUprn = new Map();
  discoveryRows.forEach((row) => {
    if (!row?.uprn) return;
    byUprn.set(String(row.uprn), { ...row, uprn: String(row.uprn) });
  });
  matcherRows.forEach((row) => {
    if (!row?.uprn) return;
    const key = String(row.uprn);
    const existing = byUprn.get(key);
    if (existing) {
      byUprn.set(key, {
        ...existing,
        matchConfidence: row.matchConfidence || existing.matchConfidence,
        latitude: existing.latitude ?? row.latitude ?? null,
        longitude: existing.longitude ?? row.longitude ?? null,
        matcherHit: true,
      });
      return;
    }
    const mapped = {
      uprn: key,
      address: row.address || null,
      addressParts: row.addressParts || null,
      secondary: row.secondary || row.addressParts?.secondary || null,
      primary: row.primary || row.addressParts?.primary || null,
      street: row.street || row.addressParts?.street || null,
      classificationCode: row.classificationCode || null,
      classificationCodeDesc: row.classificationCodeDesc || null,
      latitude: row.latitude ?? row.lat ?? null,
      longitude: row.longitude ?? row.lng ?? null,
      matchConfidence: row.matchConfidence || 'medium',
      source: 'address_match',
      kind: classifyDiscoveryKind(row),
    };
    byUprn.set(key, mapped);
  });
  return [...byUprn.values()];
}

function creditsUsedFromProviderResponse(data, configuredCost) {
  const live = Number(data?.api_calls_cost);
  if (Number.isFinite(live) && live > 0) return live;
  const fallback = Number(configuredCost);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 6;
}

function isSafeIntegerPropertyIdQuery(query) {
  const q = String(query || '').trim();
  if (!/^\d+$/.test(q)) return false;
  if (q.length >= 10) return false;
  const n = Number(q);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
}

function looksLikeUprnDigitString(query) {
  return /^\d{10,12}$/.test(String(query || '').replace(/\s+/g, ''));
}

module.exports = {
  UPRNS_STRICT,
  UPRNS_MAX_RESULTS,
  classifyDiscoveryKind,
  mapProviderDiscoveryRow,
  mapUprnDiscoveryResponse,
  queryLooksLikeNamedUnit,
  matcherRowLooksLikeShell,
  shouldSuppressShellAsExactUnit,
  isPostcodeOnlyQuery,
  rankDiscoveryRows,
  mergeMatcherAndDiscovery,
  creditsUsedFromProviderResponse,
  isSafeIntegerPropertyIdQuery,
  looksLikeUprnDigitString,
  isShellClassification,
};
