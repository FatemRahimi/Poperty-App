const pool = require('../../models/db');
const { buildAddressFromProperty, normalisePostcode } = require('../../utils/ukAddress');
const { CANONICAL_IDENTITY_VERSION } = require('../../architecture/canonicalIdentity');
const { extractCanonicalAddress } = require('../identity/canonicalAddress');
const { listingFieldsRespectingDeclaration } = require('../identity/userDeclaredIdentity');

async function findIdentityByPropertyId(propertyId) {
  const result = await pool.query(
    `SELECT * FROM property_identities WHERE property_id = $1`,
    [propertyId]
  );
  return result.rows[0] || null;
}

function jsonValue(value, fallback = {}) {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function recordIdentityEvent({
  propertyId,
  identityState = null,
  verificationState = null,
  uprn = null,
  paon = null,
  saon = null,
  buildingName = null,
  source = null,
  actorUserId = null,
  payload = {},
} = {}) {
  if (!propertyId) return null;
  try {
    const result = await pool.query(
      `INSERT INTO property_identity_events
        (property_id, identity_state, verification_state, uprn, paon, saon, building_name, source, actor_user_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        propertyId,
        identityState,
        verificationState,
        uprn,
        paon,
        saon,
        buildingName,
        source,
        actorUserId || null,
        jsonValue(payload, {}),
      ]
    );
    return result.rows[0];
  } catch {
    return null;
  }
}

async function upsertIdentity({
  propertyId,
  uprn = null,
  normalizedAddress,
  postcode = null,
  latitude = null,
  longitude = null,
  matchConfidence = 'low',
  matchMethod = 'listing_fields',
  provider = null,
  providerPayload = {},
  paon = null,
  saon = null,
  buildingName = null,
  postcodeCompact = null,
  identityState = null,
  identitySource = null,
  evidenceSourceType = null,
  verificationState = null,
  retrievedAt = null,
  uprnRetrievedAt = null,
  identityContractVersion = CANONICAL_IDENTITY_VERSION,
  identityLimitations = {},
  sourceAddress = {},
  componentStates = {},
  actorUserId = null,
  uprnMode = 'preserve',
} = {}) {
  const uprnClear = uprnMode === 'clear';
  const uprnSet = uprnMode === 'set';
  const result = await pool.query(
    `INSERT INTO property_identities
      (property_id, uprn, normalized_address, postcode, latitude, longitude,
       match_confidence, match_method, provider, provider_payload,
       paon, saon, postcode_compact, identity_state, identity_source,
       evidence_source_type, verification_state, retrieved_at, uprn_retrieved_at,
       identity_contract_version, identity_limitations, source_address,
       building_name, component_states, updated_at)
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11, $12, $13, $14, $15, $16, $17, COALESCE($18::timestamptz, CURRENT_TIMESTAMP),
       $19, $20, $21::jsonb, $22::jsonb, $24, $25::jsonb, CURRENT_TIMESTAMP
     )
     ON CONFLICT (property_id) DO UPDATE SET
       uprn = CASE
         WHEN $23 = 'clear' THEN NULL
         WHEN $23 = 'set' THEN EXCLUDED.uprn
         ELSE COALESCE(EXCLUDED.uprn, property_identities.uprn)
       END,
       normalized_address = EXCLUDED.normalized_address,
       postcode = COALESCE(EXCLUDED.postcode, property_identities.postcode),
       latitude = COALESCE(EXCLUDED.latitude, property_identities.latitude),
       longitude = COALESCE(EXCLUDED.longitude, property_identities.longitude),
       match_confidence = EXCLUDED.match_confidence,
       match_method = EXCLUDED.match_method,
       provider = COALESCE(EXCLUDED.provider, property_identities.provider),
       provider_payload = EXCLUDED.provider_payload,
       paon = COALESCE(EXCLUDED.paon, property_identities.paon),
       saon = COALESCE(EXCLUDED.saon, property_identities.saon),
       postcode_compact = COALESCE(EXCLUDED.postcode_compact, property_identities.postcode_compact),
       identity_state = COALESCE(EXCLUDED.identity_state, property_identities.identity_state),
       identity_source = COALESCE(EXCLUDED.identity_source, property_identities.identity_source),
       evidence_source_type = COALESCE(EXCLUDED.evidence_source_type, property_identities.evidence_source_type),
       verification_state = COALESCE(EXCLUDED.verification_state, property_identities.verification_state),
       retrieved_at = COALESCE(EXCLUDED.retrieved_at, property_identities.retrieved_at),
       uprn_retrieved_at = CASE
         WHEN $23 IN ('set', 'clear') THEN COALESCE(EXCLUDED.uprn_retrieved_at, CURRENT_TIMESTAMP)
         ELSE COALESCE(property_identities.uprn_retrieved_at, EXCLUDED.uprn_retrieved_at)
       END,
       identity_contract_version = COALESCE(EXCLUDED.identity_contract_version, property_identities.identity_contract_version),
       identity_limitations = EXCLUDED.identity_limitations,
       source_address = EXCLUDED.source_address,
       building_name = COALESCE(EXCLUDED.building_name, property_identities.building_name),
       component_states = CASE
         WHEN EXCLUDED.component_states IS NULL OR EXCLUDED.component_states = '{}'::jsonb
         THEN property_identities.component_states
         ELSE EXCLUDED.component_states
       END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      propertyId,
      uprnClear ? null : uprn,
      normalizedAddress,
      postcode,
      latitude,
      longitude,
      matchConfidence,
      matchMethod,
      provider,
      jsonValue(providerPayload, {}),
      paon,
      saon,
      postcodeCompact,
      identityState,
      identitySource,
      evidenceSourceType,
      verificationState,
      retrievedAt,
      uprnSet || uprnClear ? (uprnRetrievedAt || new Date().toISOString()) : uprnRetrievedAt,
      identityContractVersion,
      jsonValue(identityLimitations, {}),
      jsonValue(sourceAddress, {}),
      uprnMode,
      buildingName || null,
      jsonValue(componentStates, {}),
    ]
  );
  const row = result.rows[0];
  await recordIdentityEvent({
    propertyId,
    identityState: row?.identity_state || identityState,
    verificationState: row?.verification_state || verificationState,
    uprn: row?.uprn || null,
    paon: row?.paon || paon,
    saon: row?.saon || saon,
    buildingName: row?.building_name || buildingName,
    source: identitySource || provider,
    actorUserId,
    payload: {
      matchMethod,
      uprnMode,
      contractVersion: identityContractVersion,
    },
  });
  return row;
}

async function createListingFallbackIdentity(property) {
  const canonical = extractCanonicalAddress(property);
  const existing = property.id ? await findIdentityByPropertyId(property.id) : null;
  const merged = listingFieldsRespectingDeclaration(canonical, existing || {});
  return upsertIdentity({
    propertyId: property.id,
    uprn: null,
    uprnMode: 'preserve',
    normalizedAddress: canonical.canonicalAddress || buildAddressFromProperty(property),
    postcode: merged.postcode || canonical.postcode || normalisePostcode(property.zip_code || property.postcode) || null,
    latitude: property.latitude,
    longitude: property.longitude,
    matchConfidence: (merged.paon || canonical.paon) && (merged.postcodeCompact || canonical.postcodeCompact) ? 'medium' : 'low',
    matchMethod: 'listing_fields',
    provider: existing?.provider || 'InternalListing',
    providerPayload: existing?.provider_payload || { source: 'application_database' },
    paon: merged.paon,
    saon: merged.saon,
    buildingName: merged.buildingName,
    postcodeCompact: merged.postcodeCompact || canonical.postcodeCompact,
    identityState: existing?.identity_state || canonical.identityState,
    identitySource: existing?.identity_source || 'InternalListing',
    evidenceSourceType: existing?.evidence_source_type || canonical.evidenceSourceType,
    verificationState: existing?.verification_state || canonical.verificationState,
    retrievedAt: canonical.retrievedAt,
    identityLimitations: {
      notes: canonical.limitations,
    },
    sourceAddress: canonical.sourceAddress,
    componentStates: merged.componentStates,
  });
}

async function listIdentityEvents(propertyId, { limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT id, property_id, identity_state, verification_state, uprn, paon, saon,
            building_name, source, actor_user_id, payload, created_at
     FROM property_identity_events
     WHERE property_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [propertyId, Math.min(Number(limit) || 50, 100)]
  );
  return result.rows;
}

async function findEnrichment(propertyId, enrichmentType, source) {
  const result = await pool.query(
    `SELECT * FROM property_enrichments
     WHERE property_id = $1 AND enrichment_type = $2 AND source = $3
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [propertyId, enrichmentType, source]
  );
  return result.rows[0] || null;
}

async function upsertEnrichment({
  propertyId,
  enrichmentType,
  source,
  payload,
  provenance,
  observedAt = null,
  expiresAt = null,
}) {
  const result = await pool.query(
    `INSERT INTO property_enrichments
      (property_id, enrichment_type, source, payload, provenance, observed_at, expires_at, retrieved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (property_id, enrichment_type, source) WHERE (property_id IS NOT NULL) DO UPDATE SET
       payload = EXCLUDED.payload,
       provenance = EXCLUDED.provenance,
       observed_at = COALESCE(EXCLUDED.observed_at, property_enrichments.observed_at),
       expires_at = EXCLUDED.expires_at,
       retrieved_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      propertyId,
      enrichmentType,
      source,
      JSON.stringify(payload),
      JSON.stringify(provenance),
      observedAt,
      expiresAt,
    ]
  );
  return result.rows[0];
}

async function listEnrichmentsForProperty(propertyId) {
  const result = await pool.query(
    `SELECT * FROM property_enrichments
     WHERE property_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY retrieved_at DESC`,
    [propertyId]
  );
  return result.rows;
}

module.exports = {
  findIdentityByPropertyId,
  upsertIdentity,
  createListingFallbackIdentity,
  recordIdentityEvent,
  listIdentityEvents,
  findEnrichment,
  upsertEnrichment,
  listEnrichmentsForProperty,
};
