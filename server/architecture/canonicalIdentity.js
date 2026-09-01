/**
 * Canonical subject identity contract.
 * Extends identityModel. Does not equate LISTING / SUBJECT / PROPERTY / BUILDING / UNIT / TITLE.
 * UPRN is strong addressable-property evidence, not title identity.
 */

const { CANONICAL_IDENTITY_VERSION } = require('./versions');
const {
  IDENTITY_KIND,
  IDENTITY_NON_EQUIVALENCE,
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  createSubjectRef,
} = require('./identityModel');

function nonempty(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function selectUniqueUprnMatch(matches = []) {
  const list = Array.isArray(matches) ? matches : [];
  const withUprn = list.filter((row) => nonempty(row?.uprn));
  const distinct = [];
  const seen = new Set();
  withUprn.forEach((row) => {
    const uprn = String(row.uprn).trim();
    if (!seen.has(uprn)) {
      seen.add(uprn);
      distinct.push(uprn);
    }
  });
  if (distinct.length === 1) {
    return {
      unique: true,
      uprn: distinct[0],
      match: withUprn.find((row) => String(row.uprn).trim() === distinct[0]) || null,
      candidateCount: list.length,
      candidateUprns: distinct,
    };
  }
  return {
    unique: false,
    uprn: null,
    match: null,
    candidateCount: list.length,
    candidateUprns: distinct,
    reason: distinct.length === 0 ? 'NO_UPRN' : 'MULTIPLE_CANDIDATE_UPRNS',
  };
}

function createCanonicalIdentity(input = {}) {
  const verificationState =
    IDENTITY_VERIFICATION_STATE[input.verificationState] || IDENTITY_VERIFICATION_STATE.UNRESOLVED;
  const uprn = nonempty(input.uprn);
  return {
    contractVersion: CANONICAL_IDENTITY_VERSION,
    kind: input.kind && IDENTITY_KIND[input.kind] ? input.kind : IDENTITY_KIND.LISTING,
    listingId: input.listingId == null ? null : String(input.listingId),
    subjectId: input.subjectId == null || input.subjectId === '' ? null : String(input.subjectId),
    sourceAddress: input.sourceAddress || null,
    canonicalAddress: nonempty(input.canonicalAddress),
    postcode: nonempty(input.postcode),
    postcodeCompact: nonempty(input.postcodeCompact),
    paon: nonempty(input.paon),
    saon: nonempty(input.saon),
    uprn,
    latitude: input.latitude == null || input.latitude === '' ? null : Number(input.latitude),
    longitude: input.longitude == null || input.longitude === '' ? null : Number(input.longitude),
    identitySource: nonempty(input.identitySource),
    evidenceSourceType:
      IDENTITY_EVIDENCE_SOURCE_TYPE[input.evidenceSourceType]
      || IDENTITY_EVIDENCE_SOURCE_TYPE.UNKNOWN,
    retrievedAt: input.retrievedAt || null,
    asOf: input.asOf || input.retrievedAt || null,
    confidence: input.confidence || null,
    verificationState,
    uprnVerificationState:
      IDENTITY_VERIFICATION_STATE[input.uprnVerificationState]
      || (uprn ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED : IDENTITY_VERIFICATION_STATE.UNRESOLVED),
    paonVerificationState:
      IDENTITY_VERIFICATION_STATE[input.paonVerificationState]
      || (nonempty(input.paon)
        ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
        : IDENTITY_VERIFICATION_STATE.UNRESOLVED),
    saonVerificationState:
      IDENTITY_VERIFICATION_STATE[input.saonVerificationState]
      || (nonempty(input.saon)
        ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
        : IDENTITY_VERIFICATION_STATE.UNRESOLVED),
    limitations: Array.isArray(input.limitations) ? input.limitations : [],
    listingIsNotSubject: IDENTITY_NON_EQUIVALENCE.listingIsNotSubject,
    uprnIsNotTitleNumber: IDENTITY_NON_EQUIVALENCE.uprnIsNotTitleNumber,
    buildingIsNotUnit: IDENTITY_NON_EQUIVALENCE.buildingIsNotUnit,
    inferredIsNotVerified: verificationState !== IDENTITY_VERIFICATION_STATE.INFERRED
      ? true
      : verificationState !== IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT,
    unknownIsValid: true,
  };
}

function subjectRefFromCanonicalIdentity(identity = {}) {
  const kind = identity.kind && IDENTITY_KIND[identity.kind] ? identity.kind : IDENTITY_KIND.LISTING;
  const id = identity.listingId || identity.subjectId || identity.uprn || 'unknown';
  return createSubjectRef({
    kind,
    id,
    uprn: identity.uprn || null,
    listingId: identity.listingId || null,
    subjectId: identity.subjectId || null,
  });
}

module.exports = {
  CANONICAL_IDENTITY_VERSION,
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  selectUniqueUprnMatch,
  createCanonicalIdentity,
  subjectRefFromCanonicalIdentity,
};
