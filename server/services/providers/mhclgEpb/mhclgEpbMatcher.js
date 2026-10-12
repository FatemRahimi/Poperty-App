/**
 * Deterministic exact EPB subject matching.
 * Uses first-party listing identity in memory. Does not persist EPC addresses.
 * Postcode-only never attaches. Wrong unit is worse than no attachment.
 */

const {
  compactPostcode,
  extractFromAddressLine,
  canonicalHouseToken,
} = require('../../identity/canonicalAddress');
const { selectUniqueUprnMatch } = require('../../../architecture/canonicalIdentity');
const { EPB_ATTACHMENT } = require('../../../architecture/epbEvidenceContract');
const { asUprn } = require('./mhclgEpbParser');

const UNIT_PREFIX = /^(FLAT|APARTMENT|APPARTMENT|APT|UNIT|STUDIO|PENTHOUSE|ROOM|SUITE|MAISONETTE)\s+(.+)$/i;
const UNIT_TYPE = /\b(flat|maisonette|apartment|apt|studio|penthouse|beds?it|hmo)\b/i;
const UNIT_IN_TEXT = /\b(flat|apartment|maisonette|suite|unit|studio|penthouse)\s+\S/i;
const MIXED_USE = /\bmixed/;

function upperToken(value) {
  if (value == null) return null;
  const text = String(value).replace(/[\u00A0\u2007\u202F]/g, ' ').trim().replace(/\s+/g, ' ');
  return text ? text.toUpperCase() : null;
}

function canonicalPaon(value) {
  const token = upperToken(value);
  if (!token) return null;
  return canonicalHouseToken(token) ? String(canonicalHouseToken(token)).toUpperCase() : token;
}

function parseUnit(value) {
  const token = upperToken(value);
  if (!token) return null;
  const prefixed = token.match(UNIT_PREFIX);
  if (prefixed) {
    return { prefix: 'UNIT', ident: prefixed[2].replace(/\s+/g, ' ') };
  }
  return { prefix: null, ident: token };
}

function unitsEqual(left, right) {
  const a = parseUnit(left);
  const b = parseUnit(right);
  if (!a || !b) return false;
  return a.ident === b.ident;
}

function paonEqual(left, right) {
  const a = canonicalPaon(left);
  const b = canonicalPaon(right);
  if (!a || !b) return false;
  return a === b;
}

function joinAddressLines(address = {}) {
  return [address.addressLine1, address.addressLine2, address.addressLine3, address.addressLine4]
    .filter(Boolean)
    .join(', ');
}

function extractCandidateIdentity(candidate = {}) {
  const address = candidate.address || {};
  const line1 = extractFromAddressLine(address.addressLine1);
  const line2 = extractFromAddressLine(address.addressLine2);
  const line3 = extractFromAddressLine(address.addressLine3);
  const line4 = extractFromAddressLine(address.addressLine4);
  const joined = extractFromAddressLine(joinAddressLines(address));
  const numericPaons = [...new Set(
    [line1, line2, line3, line4]
      .map((row) => canonicalPaon(row.paon) || (row.paon ? upperToken(row.paon) : null))
      .filter(Boolean)
  )];
  let paon = numericPaons.length === 1 ? numericPaons[0] : null;
  let saon = line1.saon || null;
  if (!saon && line1.paon && UNIT_PREFIX.test(upperToken(address.addressLine1) || '')) {
    saon = address.addressLine1;
  }
  if (!saon && line1.saon) saon = line1.saon;
  if (!paon && numericPaons.length === 0) {
    paon = joined.paon || null;
  }

  const line1Token = upperToken(address.addressLine1);
  if (line1Token && UNIT_PREFIX.test(line1Token)) {
    saon = address.addressLine1;
    if (!paon && numericPaons.length === 1) paon = numericPaons[0];
    if (!paon) paon = line2.paon || line3.paon || joined.paon;
  }

  if (!paon && numericPaons.length === 0) {
    const named = upperToken(address.addressLine1);
    if (named && !/^\d/.test(named) && !UNIT_PREFIX.test(named)) {
      paon = address.addressLine1;
    }
  }

  return {
    postcodeCompact: compactPostcode(address.postcode),
    paon: canonicalPaon(paon) || (paon ? upperToken(paon) : null),
    saon: saon ? upperToken(saon) : null,
    uprn: asUprn(candidate.uprn),
    rawPaon: paon,
    rawSaon: saon,
  };
}

function listingAppearsUnitSpecific(listing = {}) {
  if (listing.saon) return true;
  const type = String(listing.propertyType || listing.property_type || '');
  const category = String(listing.propertyCategory || listing.property_category || '');
  if (UNIT_TYPE.test(type)) return true;
  if (MIXED_USE.test(type.toLowerCase()) || MIXED_USE.test(category.toLowerCase())) return true;
  const blob = [
    listing.addressLine1,
    listing.address_line1,
    listing.houseNumber,
    listing.house_number,
    listing.title,
  ].filter(Boolean).join(' ');
  if (UNIT_IN_TEXT.test(blob)) return true;
  const house = upperToken(listing.houseNumber || listing.house_number);
  return Boolean(house && UNIT_PREFIX.test(house));
}

function listingHasUnitIntent(listing = {}) {
  return listingAppearsUnitSpecific(listing);
}

function namedBuildingEqual(listingPaon, candidate) {
  const listing = upperToken(listingPaon);
  if (!listing || /^\d/.test(listing)) return false;
  const candidatePaon = upperToken(candidate?.identity?.paon || candidate?.address?.addressLine1);
  if (!candidatePaon) return false;
  return candidatePaon === listing;
}

function evaluateEpbCandidates(listingIdentity = {}, candidates = []) {
  const listingPostcode = compactPostcode(
    listingIdentity.postcodeCompact || listingIdentity.postcode
  );
  const listingPaon = canonicalPaon(listingIdentity.paon) || upperToken(listingIdentity.paon);
  const listingSaon = listingIdentity.saon ? upperToken(listingIdentity.saon) : null;

  if (!listingPostcode) {
    return {
      status: EPB_ATTACHMENT.UNRESOLVED_IDENTITY,
      reason: 'MISSING_POSTCODE',
      matches: [],
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    };
  }
  if (!listingPaon) {
    return {
      status: EPB_ATTACHMENT.UNRESOLVED_IDENTITY,
      reason: 'POSTCODE_ONLY',
      matches: [],
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    };
  }

  if (listingAppearsUnitSpecific(listingIdentity) && !listingSaon) {
    return {
      status: EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY,
      reason: 'MISSING_SAON',
      matches: [],
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
    };
  }

  const rows = (Array.isArray(candidates) ? candidates : []).map((row) => ({
    ...row,
    identity: extractCandidateIdentity(row),
  }));

  const samePostcode = rows.filter((row) => row.identity.postcodeCompact === listingPostcode);
  if (!samePostcode.length) {
    return {
      status: EPB_ATTACHMENT.NO_MATCH_FOUND,
      reason: 'NO_POSTCODE_MATCH',
      matches: [],
      candidateCount: rows.length,
    };
  }

  const paonMatched = samePostcode.filter((row) => {
    if (row.identity.paon && paonEqual(row.identity.paon, listingPaon)) return true;
    if (namedBuildingEqual(listingIdentity.paon, row)) return true;
    return false;
  });
  if (!paonMatched.length) {
    return {
      status: EPB_ATTACHMENT.NO_MATCH_FOUND,
      reason: 'NO_PAON_MATCH',
      matches: [],
      candidateCount: rows.length,
    };
  }

  let working = paonMatched;
  if (listingSaon) {
    working = paonMatched.filter((row) => row.identity.saon && unitsEqual(row.identity.saon, listingSaon));
    if (!working.length) {
      return {
        status: EPB_ATTACHMENT.NO_MATCH_FOUND,
        reason: 'NO_SAON_MATCH',
        matches: [],
        candidateCount: rows.length,
      };
    }
  } else {
    const distinctUnits = [...new Set(paonMatched.map((row) => row.identity.saon || ''))];
    const hasUnits = distinctUnits.some(Boolean);
    if (hasUnits && (distinctUnits.filter(Boolean).length > 1 || listingHasUnitIntent(listingIdentity))) {
      return {
        status: EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY,
        reason: 'MULTIPLE_UNITS',
        matches: [],
        candidateCount: rows.length,
        unitCount: distinctUnits.filter(Boolean).length,
      };
    }
    if (hasUnits && !listingSaon) {
      return {
        status: EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY,
        reason: 'BUILDING_VS_UNIT',
        matches: [],
        candidateCount: rows.length,
      };
    }
  }

  const distinctSubjectKeys = [...new Set(working.map((row) => `${row.identity.paon}|${row.identity.saon || ''}`))];
  if (distinctSubjectKeys.length > 1) {
    return {
      status: EPB_ATTACHMENT.UNRESOLVED_IDENTITY,
      reason: 'MULTIPLE_SUBJECTS',
      matches: [],
      candidateCount: rows.length,
    };
  }

  const uniqueUprn = selectUniqueUprnMatch(working.map((row) => ({ uprn: row.identity.uprn })));
  if (!uniqueUprn.unique && uniqueUprn.reason === 'MULTIPLE_CANDIDATE_UPRNS') {
    return {
      status: EPB_ATTACHMENT.UNRESOLVED_IDENTITY,
      reason: 'MULTIPLE_UPRNS',
      matches: [],
      candidateCount: rows.length,
      candidateUprns: uniqueUprn.candidateUprns,
    };
  }

  return {
    status: EPB_ATTACHMENT.UNIQUE_ATTACH,
    reason: 'UNIQUE_EXACT',
    matches: working,
    candidateCount: rows.length,
    uprn: uniqueUprn.unique ? uniqueUprn.uprn : null,
    uprnMissing: !uniqueUprn.unique,
  };
}

module.exports = {
  upperToken,
  canonicalPaon,
  parseUnit,
  unitsEqual,
  paonEqual,
  listingHasUnitIntent,
  listingAppearsUnitSpecific,
  extractCandidateIdentity,
  evaluateEpbCandidates,
};
