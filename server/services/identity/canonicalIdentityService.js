/**
 * Persist canonical listing identity and resolve UPRN only when unique.
 * Listing-field canonicalisation never pays a provider.
 */

const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  CANONICAL_IDENTITY_VERSION,
  selectUniqueUprnMatch,
  createCanonicalIdentity,
} = require('../../architecture/canonicalIdentity');
const { extractCanonicalAddress } = require('./canonicalAddress');
const {
  upsertIdentity,
  createListingFallbackIdentity,
} = require('../enrichment/propertyIdentityRepository');

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToCanonical(row, property = {}) {
  if (!row) return extractCanonicalAddress(property);
  const listing = extractCanonicalAddress(property);
  const limitations = parseJson(row.identity_limitations, {});
  return createCanonicalIdentity({
    kind: 'LISTING',
    listingId: row.property_id || property.id,
    sourceAddress: parseJson(row.source_address, listing.sourceAddress),
    canonicalAddress: row.normalized_address || listing.canonicalAddress,
    postcode: row.postcode || listing.postcode,
    postcodeCompact: row.postcode_compact || listing.postcodeCompact,
    paon: row.paon || listing.paon,
    saon: row.saon || listing.saon,
    uprn: row.uprn,
    latitude: row.latitude,
    longitude: row.longitude,
    identitySource: row.identity_source || row.provider || listing.identitySource,
    evidenceSourceType: row.evidence_source_type || listing.evidenceSourceType,
    retrievedAt: row.retrieved_at || row.updated_at,
    confidence: row.match_confidence,
    verificationState: row.verification_state || row.identity_state || listing.verificationState,
    uprnVerificationState: row.uprn
      ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
      : IDENTITY_VERIFICATION_STATE.UNRESOLVED,
    paonVerificationState: row.paon
      ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
      : listing.paonVerificationState,
    saonVerificationState: row.saon
      ? IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED
      : listing.saonVerificationState,
    limitations: Array.isArray(limitations.notes) ? limitations.notes : listing.limitations,
  });
}

async function persistListingCanonicalIdentity(property, deps = {}) {
  const upsert = deps.upsertIdentity || upsertIdentity;
  const createFallback = deps.createListingFallbackIdentity || createListingFallbackIdentity;
  if (!property?.id) {
    return { success: true, identity: extractCanonicalAddress(property), persisted: false };
  }
  try {
    const identity = await createFallback(property);
    return { success: true, identity, persisted: true };
  } catch (error) {
    const canonical = extractCanonicalAddress(property);
    try {
      const identity = await upsert({
        propertyId: property.id,
        normalizedAddress: canonical.canonicalAddress,
        postcode: canonical.postcode,
        paon: canonical.paon,
        saon: canonical.saon,
        postcodeCompact: canonical.postcodeCompact,
        identityState: canonical.identityState,
        identitySource: 'InternalListing',
        evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.FIRST_PARTY_LISTING,
        verificationState: canonical.verificationState,
        matchMethod: 'listing_fields',
        provider: 'InternalListing',
        uprnMode: 'preserve',
        sourceAddress: canonical.sourceAddress,
        identityLimitations: { notes: canonical.limitations },
      });
      return { success: true, identity, persisted: true };
    } catch (inner) {
      return {
        success: false,
        identity: canonical,
        persisted: false,
        error: inner.message || error.message,
      };
    }
  }
}

function hasReusableUprn(identity) {
  if (!identity?.uprn) return false;
  const confidence = identity.match_confidence || identity.matchConfidence;
  if (confidence === 'low') return false;
  return true;
}

function uprnResolutionAlreadyAttempted(identity) {
  if (!identity) return false;
  if (identity.uprn_retrieved_at || identity.uprnRetrievedAt) return true;
  const limitations = parseJson(
    identity.identity_limitations || identity.identityLimitations,
    {}
  );
  return Boolean(limitations.uprnResolutionAttempted);
}

async function persistUniqueUprn(property, resolved, existing, deps = {}) {
  const upsert = deps.upsertIdentity || upsertIdentity;
  const listing = extractCanonicalAddress(property);
  const unique = selectUniqueUprnMatch(
    resolved.alternativeMatches
      ? [resolved, ...resolved.alternativeMatches]
      : (resolved.uprn ? [resolved] : [])
  );
  const candidates = unique.candidateUprns || [];
  const now = new Date().toISOString();
  if (!unique.unique) {
    return upsert({
      propertyId: property.id,
      uprn: null,
      uprnMode: 'clear',
      normalizedAddress: listing.canonicalAddress || existing?.normalized_address,
      postcode: listing.postcode || existing?.postcode,
      latitude: existing?.latitude || property.latitude,
      longitude: existing?.longitude || property.longitude,
      matchConfidence: 'low',
      matchMethod: unique.reason === 'MULTIPLE_CANDIDATE_UPRNS'
        ? 'unresolved_multiple_uprn'
        : 'unresolved_no_uprn',
      provider: resolved.provider || 'propertydata',
      providerPayload: {
        candidateCount: unique.candidateCount,
        candidateUprnCount: candidates.length,
      },
      paon: listing.paon,
      saon: listing.saon,
      postcodeCompact: listing.postcodeCompact,
      identityState: listing.identityState,
      identitySource: listing.identitySource,
      evidenceSourceType: listing.evidenceSourceType,
      verificationState: listing.verificationState,
      retrievedAt: now,
      uprnRetrievedAt: now,
      identityLimitations: {
        notes: [
          ...(listing.limitations || []),
          unique.reason === 'MULTIPLE_CANDIDATE_UPRNS'
            ? 'Multiple UPRN candidates; none persisted.'
            : 'No unique UPRN returned.',
        ],
        uprnResolutionAttempted: true,
        candidateUprnCount: candidates.length,
      },
      sourceAddress: listing.sourceAddress,
    });
  }

  const uprnState = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
  const overall = IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED;
  return upsert({
    propertyId: property.id,
    uprn: unique.uprn,
    uprnMode: 'set',
    normalizedAddress: resolved.address || listing.canonicalAddress,
    postcode: listing.postcode,
    latitude: resolved.latitude || property.latitude,
    longitude: resolved.longitude || property.longitude,
    matchConfidence: 'high',
    matchMethod: 'propertydata_unique_uprn',
    provider: resolved.provider || 'propertydata',
    providerPayload: {
      uniqueUprn: true,
      classificationCode: resolved.classificationCode || null,
    },
    paon: listing.paon,
    saon: listing.saon,
    postcodeCompact: listing.postcodeCompact,
    identityState: overall,
    identitySource: 'PropertyData',
    evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.LICENSED_PROVIDER,
    verificationState: overall,
    retrievedAt: now,
    uprnRetrievedAt: now,
    identityLimitations: {
      notes: [
        ...(listing.limitations || []),
        'UPRN is licensed matcher evidence, not title identity, and is not VERIFIED_EXACT.',
      ],
      uprnResolutionAttempted: true,
      uprnVerificationState: uprnState,
    },
    sourceAddress: listing.sourceAddress,
  });
}

module.exports = {
  CANONICAL_IDENTITY_VERSION,
  persistListingCanonicalIdentity,
  rowToCanonical,
  hasReusableUprn,
  uprnResolutionAlreadyAttempted,
  persistUniqueUprn,
  selectUniqueUprnMatch,
};
