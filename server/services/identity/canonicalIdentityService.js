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
  findIdentityByPropertyId,
  recordIdentityEvent,
  listIdentityEvents,
} = require('../enrichment/propertyIdentityRepository');
const {
  parseDeclaredIdentityInput,
  listingFieldsRespectingDeclaration,
  existingUprnIsProtected,
  existingUprnIsUserDeclared,
  declaredOverallState,
  parseComponentStates,
} = require('./userDeclaredIdentity');

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
    buildingName: row.building_name || listing.buildingName,
    uprn: row.uprn,
    latitude: row.latitude,
    longitude: row.longitude,
    identitySource: row.identity_source || row.provider || listing.identitySource,
    evidenceSourceType: row.evidence_source_type || listing.evidenceSourceType,
    retrievedAt: row.retrieved_at || row.updated_at,
    confidence: row.match_confidence,
    verificationState: row.verification_state || row.identity_state || listing.verificationState,
    paonVerificationState: row.paon
      ? (parseComponentStates(row.component_states).paon
        || IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED)
      : listing.paonVerificationState,
    saonVerificationState: row.saon
      ? (parseComponentStates(row.component_states).saon
        || IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED)
      : listing.saonVerificationState,
    buildingNameVerificationState: row.building_name
      ? (parseComponentStates(row.component_states).buildingName
        || IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED)
      : IDENTITY_VERIFICATION_STATE.UNRESOLVED,
    uprnVerificationState: row.uprn
      ? (parseComponentStates(row.component_states).uprn
        || IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED)
      : IDENTITY_VERIFICATION_STATE.UNRESOLVED,
    componentStates: parseComponentStates(row.component_states),
    conflictStatus: parseComponentStates(row.component_states).conflict ? 'UPRN_CONFLICT' : 'NONE',
    limitations: Array.isArray(limitations.notes) ? limitations.notes : listing.limitations,
  });
}

async function persistListingCanonicalIdentity(property, deps = {}) {
  const upsert = deps.upsertIdentity || upsertIdentity;
  const createFallback = deps.createListingFallbackIdentity || createListingFallbackIdentity;
  const findIdentity = deps.findIdentityByPropertyId || findIdentityByPropertyId;
  if (!property?.id) {
    return { success: true, identity: extractCanonicalAddress(property), persisted: false };
  }
  try {
    const identity = await createFallback(property);
    return { success: true, identity, persisted: true };
  } catch (error) {
    const canonical = extractCanonicalAddress(property);
    try {
      const existing = await findIdentity(property.id);
      const merged = listingFieldsRespectingDeclaration(canonical, existing || {});
      const identity = await upsert({
        propertyId: property.id,
        normalizedAddress: canonical.canonicalAddress,
        postcode: merged.postcode || canonical.postcode,
        paon: merged.paon,
        saon: merged.saon,
        buildingName: merged.buildingName,
        postcodeCompact: merged.postcodeCompact || canonical.postcodeCompact,
        identityState: existing?.identity_state || canonical.identityState,
        identitySource: existing?.identity_source || 'InternalListing',
        evidenceSourceType: existing?.evidence_source_type || IDENTITY_EVIDENCE_SOURCE_TYPE.FIRST_PARTY_LISTING,
        verificationState: existing?.verification_state || canonical.verificationState,
        matchMethod: 'listing_fields',
        provider: existing?.provider || 'InternalListing',
        uprnMode: 'preserve',
        sourceAddress: canonical.sourceAddress,
        identityLimitations: { notes: canonical.limitations },
        componentStates: merged.componentStates,
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

async function persistOfficialEpbUprn(property, resolved = {}, existing = null, deps = {}) {
  const upsert = deps.upsertIdentity || upsertIdentity;
  const findIdentity = deps.findIdentityByPropertyId || findIdentityByPropertyId;
  const recordEvent = deps.recordIdentityEvent || recordIdentityEvent;
  if (!property?.id || !resolved.uprn) return existing;
  const current = existing || await findIdentity(property.id);
  const incoming = String(resolved.uprn).trim();
  if (!incoming) return current;
  if (current?.uprn && String(current.uprn).trim() !== incoming) {
    await recordEvent({
      propertyId: property.id,
      identityState: current.identity_state || current.identityState,
      verificationState: current.verification_state || current.verificationState,
      uprn: current.uprn,
      paon: current.paon,
      saon: current.saon,
      source: 'MHCLG_EPBD',
      payload: {
        conflict: true,
        existingUprn: current.uprn,
        incomingUprn: incoming,
        silentlyOverwritten: false,
        certificateNumber: resolved.certificateNumber || null,
        notVerifiedExact: true,
      },
    });
    return current;
  }

  const listing = extractCanonicalAddress(property);
  const merged = listingFieldsRespectingDeclaration(listing, current || {});
  const now = resolved.retrievedAt || new Date().toISOString();
  return upsert({
    propertyId: property.id,
    uprn: incoming,
    uprnMode: 'set',
    normalizedAddress: listing.canonicalAddress || current?.normalized_address,
    postcode: merged.postcode || listing.postcode || current?.postcode,
    latitude: current?.latitude || property.latitude,
    longitude: current?.longitude || property.longitude,
    matchConfidence: 'high',
    matchMethod: 'mhclg_epb_unique_certificate',
    provider: 'MHCLG_EPBD',
    providerPayload: {
      uniqueUprn: true,
      source: 'MHCLG_EPBD',
      certificateNumber: resolved.certificateNumber || null,
      uprnSource: resolved.uprnSource || null,
      notVerifiedExact: true,
    },
    paon: merged.paon || listing.paon || current?.paon,
    saon: merged.saon || listing.saon || current?.saon,
    buildingName: merged.buildingName || current?.building_name || current?.buildingName,
    postcodeCompact: merged.postcodeCompact || listing.postcodeCompact || current?.postcode_compact,
    componentStates: {
      ...parseComponentStates(current?.component_states || current?.componentStates),
      ...merged.componentStates,
      uprn: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
    },
    identityState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
    identitySource: 'MHCLG_EPBD',
    evidenceSourceType: IDENTITY_EVIDENCE_SOURCE_TYPE.OFFICIAL_OPEN,
    verificationState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
    retrievedAt: now,
    uprnRetrievedAt: now,
    identityLimitations: {
      notes: [
        ...(listing.limitations || []),
        'UPRN is official EPB source-asserted evidence, not VERIFIED_EXACT and not a title number.',
      ],
      uprnResolutionAttempted: true,
      uprnVerificationState: IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED,
      source: 'MHCLG_EPBD',
      certificateNumber: resolved.certificateNumber || null,
      uprnSource: resolved.uprnSource || null,
      notVerifiedExact: true,
    },
    sourceAddress: listing.sourceAddress,
  });
}

async function persistUserDeclaredIdentity({
  property,
  declared,
  actorUserId = null,
  deps = {},
} = {}) {
  const upsert = deps.upsertIdentity || upsertIdentity;
  const findIdentity = deps.findIdentityByPropertyId || findIdentityByPropertyId;
  const recordEvent = deps.recordIdentityEvent || recordIdentityEvent;
  if (!property?.id) {
    return { ok: false, error: 'MISSING_PROPERTY' };
  }
  const input = declared && declared.declaredFields
    ? declared
    : parseDeclaredIdentityInput(declared || {});
  if (input.uprnError) {
    return { ok: false, error: 'INVALID_UPRN' };
  }

  const existing = await findIdentity(property.id);
  const listing = extractCanonicalAddress(property);
  const now = new Date().toISOString();
  const previous = {
    paon: existing?.paon || null,
    saon: existing?.saon || null,
    buildingName: existing?.building_name || existing?.buildingName || null,
    uprn: existing?.uprn || null,
    postcode: existing?.postcode || null,
    verificationState: existing?.verification_state || existing?.verificationState || null,
    evidenceSourceType: existing?.evidence_source_type || existing?.evidenceSourceType || null,
  };
  const nextStates = parseComponentStates(existing?.component_states || existing?.componentStates);
  const fields = input.declaredFields || {};

  if (fields.paon) nextStates.paon = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
  if (fields.saon) nextStates.saon = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
  if (fields.buildingName) nextStates.buildingName = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
  if (fields.postcode) nextStates.postcode = IDENTITY_VERIFICATION_STATE.USER_DECLARED;

  let uprn = existing?.uprn || null;
  let uprnMode = 'preserve';
  let conflict = false;
  let conflictReason = null;

  if (fields.uprn) {
    const incoming = input.uprn;
    const current = existing?.uprn ? String(existing.uprn).trim() : null;
    if (!incoming) {
      nextStates.uprn = IDENTITY_VERIFICATION_STATE.UNRESOLVED;
    } else if (!current) {
      uprn = incoming;
      uprnMode = 'set';
      nextStates.uprn = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
    } else if (current === incoming) {
      if (!existingUprnIsProtected(existing)) {
        nextStates.uprn = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
      }
    } else if (existingUprnIsUserDeclared(existing) && !existingUprnIsProtected(existing)) {
      uprn = incoming;
      uprnMode = 'set';
      nextStates.uprn = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
    } else {
      conflict = true;
      conflictReason = 'UPRN_CONFLICT';
      nextStates.conflict = true;
      nextStates.conflictField = 'uprn';
      await recordEvent({
        propertyId: property.id,
        identityState: IDENTITY_VERIFICATION_STATE.UNRESOLVED,
        verificationState: IDENTITY_VERIFICATION_STATE.UNRESOLVED,
        uprn: current,
        paon: previous.paon,
        saon: previous.saon,
        buildingName: previous.buildingName,
        source: 'USER_DECLARED',
        actorUserId,
        payload: {
          conflict: true,
          field: 'uprn',
          previous: { uprn: current },
          incoming: { uprn: incoming },
          silentlyOverwritten: false,
          existingEvidenceSourceType: previous.evidenceSourceType,
          notVerifiedExact: true,
        },
      });
    }
  }

  const paon = fields.paon ? input.paon : (existing?.paon || listing.paon);
  const saon = fields.saon ? input.saon : (existing?.saon || listing.saon);
  const buildingName = fields.buildingName
    ? input.buildingName
    : (existing?.building_name || existing?.buildingName || null);
  const postcode = fields.postcode
    ? input.postcode
    : (existing?.postcode || listing.postcode);

  let overall = conflict
    ? IDENTITY_VERIFICATION_STATE.UNRESOLVED
    : (existingUprnIsProtected(existing)
      ? (existing?.verification_state || IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED)
      : declaredOverallState(input, false));
  if (overall === IDENTITY_VERIFICATION_STATE.VERIFIED_EXACT) {
    overall = IDENTITY_VERIFICATION_STATE.USER_DECLARED;
  }

  const row = await upsert({
    propertyId: property.id,
    uprn,
    uprnMode,
    normalizedAddress: listing.canonicalAddress || existing?.normalized_address,
    postcode,
    latitude: existing?.latitude || property.latitude,
    longitude: existing?.longitude || property.longitude,
    matchConfidence: existing?.match_confidence || 'medium',
    matchMethod: conflict ? (existing?.match_method || existing?.matchMethod || 'user_declared') : 'user_declared',
    provider: conflict ? (existing?.provider || 'UserDeclared') : (existing?.provider || 'UserDeclared'),
    providerPayload: conflict
      ? {
        ...(existing?.provider_payload && typeof existing.provider_payload === 'object' ? existing.provider_payload : {}),
        userDeclaredConflict: true,
        silentlyOverwritten: false,
        notVerifiedExact: true,
      }
      : {
        source: 'USER_DECLARED',
        notVerifiedExact: true,
        conflict: false,
      },
    paon,
    saon,
    buildingName,
    postcodeCompact: listing.postcodeCompact || existing?.postcode_compact,
    identityState: overall,
    identitySource: conflict || existingUprnIsProtected(existing)
      ? (existing?.identity_source || 'UserDeclared')
      : 'UserDeclared',
    evidenceSourceType: conflict || existingUprnIsProtected(existing)
      ? (existing?.evidence_source_type || IDENTITY_EVIDENCE_SOURCE_TYPE.USER_DECLARED)
      : IDENTITY_EVIDENCE_SOURCE_TYPE.USER_DECLARED,
    verificationState: overall,
    retrievedAt: now,
    uprnRetrievedAt: uprnMode === 'set' ? now : existing?.uprn_retrieved_at,
    identityLimitations: {
      notes: [
        ...(listing.limitations || []),
        'User-declared identity is first-party evidence, not VERIFIED_EXACT, and is not title identity.',
        conflict ? 'A UPRN conflict was recorded. Existing evidence was not overwritten.' : null,
      ].filter(Boolean),
      userDeclared: true,
      notVerifiedExact: true,
    },
    sourceAddress: listing.sourceAddress || existing?.source_address,
    componentStates: nextStates,
    actorUserId,
  });

  await recordEvent({
    propertyId: property.id,
    identityState: overall,
    verificationState: overall,
    uprn: row?.uprn || (conflict ? existing?.uprn : uprn),
    paon: row?.paon || paon,
    saon: row?.saon || saon,
    buildingName: row?.building_name || buildingName,
    source: 'USER_DECLARED',
    actorUserId,
    payload: {
      previous,
      incoming: {
        paon: fields.paon ? input.paon : null,
        saon: fields.saon ? input.saon : null,
        buildingName: fields.buildingName ? input.buildingName : null,
        uprn: fields.uprn ? input.uprn : null,
        postcode: fields.postcode ? input.postcode : null,
      },
      conflict,
      silentlyOverwritten: false,
      notVerifiedExact: true,
      userDeclaredIsNotVerified: true,
    },
  });

  return {
    ok: true,
    conflict,
    conflictReason,
    identity: row,
    previous,
    client: {
      listingId: property.id,
      sourceAddress: listing.sourceAddress,
      postcode: row?.postcode || postcode,
      paon: row?.paon || paon,
      saon: row?.saon || saon,
      buildingName: row?.building_name || buildingName,
      uprn: row?.uprn || (conflict ? existing?.uprn : uprn),
      verificationState: row?.verification_state || overall,
      conflict,
      conflictStatus: conflict ? 'UPRN_CONFLICT' : 'NONE',
      userDeclaredIsNotVerified: true,
      uprnIsNotTitleNumber: true,
      buildingIsNotUnit: true,
    },
  };
}

module.exports = {
  CANONICAL_IDENTITY_VERSION,
  persistListingCanonicalIdentity,
  persistOfficialEpbUprn,
  persistUserDeclaredIdentity,
  rowToCanonical,
  hasReusableUprn,
  uprnResolutionAlreadyAttempted,
  persistUniqueUprn,
  selectUniqueUprnMatch,
  listIdentityEvents,
};
