/**
 * Deterministic listing address canonicalisation.
 * Preserves source values. Does not approximate or merge distinct subjects.
 * Building identity is not unit identity. 12 is not 12A. Flat 5 is not Flat 6.
 */

const { normalisePostcode, buildAddressFromProperty } = require('../../utils/ukAddress');
const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  createCanonicalIdentity,
} = require('../../architecture/canonicalIdentity');

const UNIT_PREFIX = /^(flat|apartment|appartment|apt|unit|studio|penthouse|room)\s+(.+)$/i;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}$/i;
const HOUSE_TOKEN = /^(\d+[A-Z]?)$/i;
const HOUSE_RANGE = /^(\d+)\s*[-–—]\s*(\d+[A-Z]?)$/i;
const ADDRESS_LABEL = /^(address|postcode)\s*:?\s+/i;

function sourceTrim(value) {
  if (value == null) return { source: null, canonical: null };
  const source = String(value);
  const canonical = source.replace(/[\u00A0\u2007\u202F]/g, ' ').trim().replace(/\s+/g, ' ');
  return { source, canonical: canonical || null };
}

function compactPostcode(value) {
  const normalised = normalisePostcode(
    String(value || '').replace(/[\u00A0\u2007\u202F]/g, ' ')
  );
  if (!normalised) return null;
  const compact = normalised.replace(/\s+/g, '');
  return compact || null;
}

function looksLikePostcode(value) {
  if (!value) return false;
  return POSTCODE_RE.test(String(value).replace(/[\u00A0\u2007\u202F]/g, ' ').trim());
}

function canonicalHouseToken(value) {
  if (!value) return null;
  const range = String(value).match(HOUSE_RANGE);
  if (range) return `${range[1]}-${range[2]}`;
  const house = String(value).match(HOUSE_TOKEN);
  return house ? house[1] : String(value);
}

function stripLeadingPostcode(line) {
  if (!line) return line;
  const match = String(line).match(/^([A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2})\s+(.+)$/i);
  if (!match) return line;
  return match[2];
}

function extractFromAddressLine(line) {
  let text = sourceTrim(line).canonical;
  if (!text) return { paon: null, saon: null, ambiguous: false };
  text = text.replace(ADDRESS_LABEL, '');
  text = stripLeadingPostcode(text);

  const range = text.match(/^(\d+)\s*[-–—]\s*(\d+[A-Z]?)\b/);
  if (range) {
    const rest = text.slice(range[0].length).trim();
    if (/^\d/.test(rest)) return { paon: null, saon: null, ambiguous: true };
    return { paon: `${range[1]}-${range[2]}`, saon: null, ambiguous: false };
  }

  const unitFirst = text.match(/^(flat|apartment|appartment|apt|unit)\s+([^,]+)/i);
  if (unitFirst) {
    return { paon: null, saon: `${unitFirst[1]} ${unitFirst[2]}`.trim(), ambiguous: false };
  }

  const numberThenUnit = text.match(/^(\d+[A-Z]?)\s+(flat|apartment|appartment|apt|unit)\b/i);
  if (numberThenUnit) {
    return { paon: null, saon: null, ambiguous: true };
  }

  const twoNumbers = text.match(/^(\d+[A-Z]?)\s+(\d+)/);
  if (twoNumbers) return { paon: null, saon: null, ambiguous: true };

  const one = text.match(/^(\d+[A-Z]?)\b/);
  if (one) return { paon: one[1], saon: null, ambiguous: false };

  return { paon: null, saon: null, ambiguous: false };
}

function extractCanonicalAddress(property = {}) {
  const house = sourceTrim(property.house_number);
  const street = sourceTrim(property.street_name);
  const line1 = sourceTrim(property.address_line1);
  const line2 = sourceTrim(property.address_line2);
  const explicitSaon = sourceTrim(property.saon || property.flat_number || property.flat);
  const postcodeSource = property.zip_code || property.postcode || null;
  const postcode = normalisePostcode(
    String(postcodeSource || '').replace(/[\u00A0\u2007\u202F]/g, ' ')
  ) || null;
  const postcodeCompact = compactPostcode(postcodeSource);

  let paon = null;
  let saon = explicitSaon.canonical;
  let paonState = IDENTITY_VERIFICATION_STATE.UNRESOLVED;
  let saonState = saon
    ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
    : IDENTITY_VERIFICATION_STATE.UNRESOLVED;
  const limitations = [];

  if (house.canonical) {
    if (looksLikePostcode(house.canonical)) {
      limitations.push('house_number contained a postcode and was not used as PAON.');
    } else {
      const unit = house.canonical.match(UNIT_PREFIX);
      if (unit) {
        if (!saon) {
          saon = house.canonical;
          saonState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
        }
        const fromLine = extractFromAddressLine(line2.canonical || line1.canonical);
        if (fromLine.paon && !fromLine.ambiguous) {
          paon = fromLine.paon;
          paonState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
        } else {
          limitations.push('Unit/flat token present without a distinct building PAON.');
        }
      } else {
        paon = canonicalHouseToken(house.canonical);
        paonState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
      }
    }
  } else {
    const fromLine = extractFromAddressLine(line1.canonical);
    if (fromLine.ambiguous) {
      limitations.push('Address line contained multiple number tokens; PAON left unresolved.');
    } else if (fromLine.paon) {
      paon = fromLine.paon;
      paonState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
    }
    if (fromLine.saon && !saon) {
      saon = fromLine.saon;
      saonState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
    }
  }

  const verificationState = paon && postcodeCompact
    ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
    : IDENTITY_VERIFICATION_STATE.UNRESOLVED;

  const sourceAddress = {
    house_number: house.source,
    street_name: street.source,
    address_line1: line1.source,
    address_line2: line2.source,
    postcode: postcodeSource,
  };

  const record = createCanonicalIdentity({
    kind: 'LISTING',
    listingId: property.id == null ? null : String(property.id),
    sourceAddress,
    canonicalAddress: buildAddressFromProperty({
      ...property,
      house_number: paon || house.canonical,
      street_name: street.canonical,
      address_line1: line1.canonical,
      zip_code: postcode,
    }),
    postcode,
    postcodeCompact,
    paon,
    saon,
    uprn: null,
    latitude: property.latitude,
    longitude: property.longitude,
    identitySource: 'InternalListing',
    evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.FIRST_PARTY_LISTING,
    retrievedAt: null,
    confidence: null,
    verificationState,
    uprnVerificationState: IDENTITY_VERIFICATION_STATE.UNRESOLVED,
    paonVerificationState: paonState,
    saonVerificationState: saonState,
    limitations,
  });

  return {
    ...record,
    sourceAddress,
    identityState: verificationState,
  };
}

function exactAddressKeysEqual(left, right) {
  const a = {
    postcode: compactPostcode(left?.postcode || left?.postcodeCompact),
    paon: left?.paon ? String(left.paon).trim().toUpperCase() : null,
    saon: left?.saon ? String(left.saon).trim().toUpperCase() : null,
  };
  const b = {
    postcode: compactPostcode(right?.postcode || right?.postcodeCompact),
    paon: right?.paon ? String(right.paon).trim().toUpperCase() : null,
    saon: right?.saon ? String(right.saon).trim().toUpperCase() : null,
  };
  return a.postcode === b.postcode && a.paon === b.paon && a.saon === b.saon
    && Boolean(a.postcode) && Boolean(a.paon);
}

module.exports = {
  sourceTrim,
  compactPostcode,
  extractCanonicalAddress,
  extractFromAddressLine,
  exactAddressKeysEqual,
  looksLikePostcode,
};
