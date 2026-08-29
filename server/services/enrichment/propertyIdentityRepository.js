const pool = require('../../models/db');
const { buildAddressFromProperty, normalisePostcode } = require('../../utils/ukAddress');

async function findIdentityByPropertyId(propertyId) {
  const result = await pool.query(
    `SELECT * FROM property_identities WHERE property_id = $1`,
    [propertyId]
  );
  return result.rows[0] || null;
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
}) {
  const result = await pool.query(
    `INSERT INTO property_identities
      (property_id, uprn, normalized_address, postcode, latitude, longitude,
       match_confidence, match_method, provider, provider_payload, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
     ON CONFLICT (property_id) DO UPDATE SET
       uprn = COALESCE(EXCLUDED.uprn, property_identities.uprn),
       normalized_address = EXCLUDED.normalized_address,
       postcode = COALESCE(EXCLUDED.postcode, property_identities.postcode),
       latitude = COALESCE(EXCLUDED.latitude, property_identities.latitude),
       longitude = COALESCE(EXCLUDED.longitude, property_identities.longitude),
       match_confidence = EXCLUDED.match_confidence,
       match_method = EXCLUDED.match_method,
       provider = COALESCE(EXCLUDED.provider, property_identities.provider),
       provider_payload = EXCLUDED.provider_payload,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      propertyId,
      uprn,
      normalizedAddress,
      postcode,
      latitude,
      longitude,
      matchConfidence,
      matchMethod,
      provider,
      JSON.stringify(providerPayload),
    ]
  );
  return result.rows[0];
}

async function createListingFallbackIdentity(property) {
  return upsertIdentity({
    propertyId: property.id,
    uprn: null,
    normalizedAddress: buildAddressFromProperty(property),
    postcode: normalisePostcode(property.zip_code || property.postcode),
    latitude: property.latitude,
    longitude: property.longitude,
    matchConfidence: 'low',
    matchMethod: 'listing_fields',
    provider: 'InternalListing',
    providerPayload: { source: 'application_database' },
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
  findEnrichment,
  upsertEnrichment,
  listEnrichmentsForProperty,
};
