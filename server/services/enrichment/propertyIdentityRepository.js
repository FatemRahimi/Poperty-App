const pool = require('../../models/db');
const { buildAddressFromProperty, normalisePostcode } = require('../../utils/ukAddress');
const { CANONICAL_IDENTITY_VERSION } = require('../../architecture/canonicalIdentity');
const { extractCanonicalAddress } = require('../identity/canonicalAddress');

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
  source = null,
  payload = {},
} = {}) {
  if (!propertyId) return null;
  try {
    const result = await pool.query(
      `INSERT INTO property_identity_events
        (property_id, identity_state, verification_state, uprn, paon, saon, source, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        propertyId,
        identityState,
        verificationState,
        uprn,
        paon,
        saon,
        source,
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
       identity_contract_version, identity_limitations, source_address, updated_at)
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11, $12, $13, $14, $15, $16, $17, COALESCE($18::timestamptz, CURRENT_TIMESTAMP),
       $19, $20, $21::jsonb, $22::jsonb, CURRENT_TIMESTAMP
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
    source: identitySource || provider,
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
  return upsertIdentity({
    propertyId: property.id,
    uprn: null,
    uprnMode: 'preserve',
    normalizedAddress: canonical.canonicalAddress || buildAddressFromProperty(property),
    postcode: canonical.postcode || normalisePostcode(property.zip_code || property.postcode) || null,
    latitude: property.latitude,
    longitude: property.longitude,
    matchConfidence: canonical.paon && canonical.postcodeCompact ? 'medium' : 'low',
    matchMethod: 'listing_fields',
    provider: 'InternalListing',
    providerPayload: { source: 'application_database' },
    paon: canonical.paon,
    saon: canonical.saon,
    postcodeCompact: canonical.postcodeCompact,
    identityState: canonical.identityState,
    identitySource: 'InternalListing',
    evidenceSourceType: canonical.evidenceSourceType,
    verificationState: canonical.verificationState,
    retrievedAt: canonical.retrievedAt,
    identityLimitations: {
      notes: canonical.limitations,
    },
    sourceAddress: canonical.sourceAddress,
  });
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
     ON CONFLICT (property_id, enrichment_type, source) DO UPDATE SET
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
  findEnrichment,
  upsertEnrichment,
  listEnrichmentsForProperty,
};
