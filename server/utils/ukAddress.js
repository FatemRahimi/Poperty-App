/**
 * UK address normalization helpers for property identity resolution.
 */

function normalisePostcode(postcode) {
  if (!postcode) return '';
  const cleaned = String(postcode).toUpperCase().replace(/[\s\u00A0\u2007\u202F]+/g, '').trim();
  if (cleaned.length <= 3) return cleaned;

  // UK inward code is always digit + 2 letters (e.g. 2UJ in B1 2UJ)
  const inward = cleaned.slice(-3);
  if (/^\d[A-Z]{2}$/.test(inward) && cleaned.length >= 5 && cleaned.length <= 8) {
    const outward = cleaned.slice(0, -3);
    if (/^[A-Z]{1,2}\d[A-Z0-9]?$/.test(outward) || /^[A-Z]{1,2}\d{1,2}$/.test(outward)) {
      return `${outward} ${inward}`;
    }
  }

  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`.trim();
}

function buildAddressFromProperty(property) {
  const parts = [
    property.house_number,
    property.street_name,
    property.address_line1,
    property.address_line2,
    property.city,
    normalisePostcode(property.zip_code || property.postcode),
  ].filter(Boolean);

  const seen = new Set();
  const unique = parts.filter((p) => {
    const key = String(p).toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.join(', ') || property.title || 'Unknown address';
}

/**
 * PropertyData recommends comma-separated address with full postcode.
 * @see https://propertydata.co.uk/api/documentation/address-match-uprn
 */
function buildPropertyDataSearchAddress(property) {
  const postcode = normalisePostcode(property.zip_code || property.postcode);
  const lineParts = [property.house_number, property.street_name || property.address_line1]
    .filter(Boolean)
    .join(' ')
    .trim();

  const segments = [lineParts, property.address_line2, property.city, postcode].filter(Boolean);
  return segments.join(', ');
}

/**
 * Build PropertyData search string from free-text user input (UK intelligence lookup).
 * Handles compact postcodes (B12UJ → B1 2UJ) and removes duplicate postcode segments.
 */
function buildPropertyDataSearchAddressFromQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return '';

  const postcode = extractPostcodeFromAddress(raw);
  if (!postcode) return raw;

  const compact = postcode.replace(/\s+/g, '');
  let body = raw;
  const stripPatterns = [
    new RegExp(`\\b${postcode.replace(' ', '\\s*')}\\s*$`, 'i'),
    new RegExp(`\\b${compact}\\s*$`, 'i'),
  ];
  stripPatterns.forEach((re) => {
    body = body.replace(re, '').replace(/,\s*$/, '').trim();
  });

  return body ? `${body}, ${postcode}` : postcode;
}

/**
 * Identity cache key / provider address: collapse case and whitespace.
 * Postcode stays canonically spaced/uppercased. Does not invent missing parts.
 */
function normalizeIdentitySearchAddress(query) {
  const search = buildPropertyDataSearchAddressFromQuery(query);
  if (!search) return '';
  const postcode = extractPostcodeFromAddress(search);
  const collapsed = search.replace(/\s+/g, ' ').trim();
  if (!postcode) return collapsed.toLowerCase();
  const compact = postcode.replace(/\s+/g, '');
  let body = collapsed
    .replace(new RegExp(`\\b${postcode.replace(' ', '\\s*')}\\s*$`, 'i'), '')
    .replace(new RegExp(`\\b${compact}\\s*$`, 'i'), '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return body ? `${body}, ${postcode}` : postcode;
}

function inferMatchConfidenceFromRank(rank, total) {
  if (rank === 0 && total === 1) return 'high';
  if (rank === 0 && total > 1) return 'medium';
  if (rank <= 2) return 'medium';
  return 'low';
}

function extractPostcodeFromAddress(address) {
  if (!address) return '';
  const upper = String(address).toUpperCase();

  const spaced = upper.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2})\b/);
  if (spaced) return normalisePostcode(spaced[1]);

  const compactTail = upper.match(/\b([A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2})\s*$/);
  if (compactTail) return normalisePostcode(compactTail[1]);

  const compact = upper.match(/\b([A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2})\b/);
  if (compact) return normalisePostcode(compact[1]);

  const legacy = upper.match(/([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})/);
  return legacy ? normalisePostcode(legacy[1]) : '';
}

function parseCityFromAddress(address) {
  if (!address) return '';
  const postcode = extractPostcodeFromAddress(address);
  const compact = postcode ? postcode.replace(/\s+/g, '') : '';
  let withoutPostcode = String(address);
  if (postcode) {
    withoutPostcode = withoutPostcode
      .replace(new RegExp(`\\b${postcode.replace(' ', '\\s*')}\\b`, 'i'), '')
      .replace(new RegExp(`\\b${compact}\\b`, 'i'), '')
      .replace(/,\s*$/, '');
  }
  const parts = withoutPostcode.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

module.exports = {
  normalisePostcode,
  buildAddressFromProperty,
  buildPropertyDataSearchAddress,
  buildPropertyDataSearchAddressFromQuery,
  normalizeIdentitySearchAddress,
  inferMatchConfidenceFromRank,
  extractPostcodeFromAddress,
  parseCityFromAddress,
};
