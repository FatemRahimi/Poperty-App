/**
 * Persistence for externally resolved UK properties (UPRN-keyed analysis subjects).
 */

const pool = require('../../models/db');

async function findSubjectById(subjectId) {
  const result = await pool.query(`SELECT * FROM intelligence_subjects WHERE id = $1`, [subjectId]);
  return result.rows[0] || null;
}

async function findSubjectByUprn(uprn) {
  if (!uprn) return null;
  const result = await pool.query(`SELECT * FROM intelligence_subjects WHERE uprn = $1`, [String(uprn)]);
  return result.rows[0] || null;
}

async function upsertSubject({
  uprn,
  normalizedAddress,
  postcode = null,
  latitude = null,
  longitude = null,
  propertyId = null,
  attributes = {},
  profileSnapshot = {},
  provider = 'PropertyData',
  matchConfidence = 'medium',
  matchMethod = 'address_match_uprn',
  createdBy = null,
}) {
  const existing = uprn ? await findSubjectByUprn(uprn) : null;

  if (existing) {
    const result = await pool.query(
      `UPDATE intelligence_subjects SET
         normalized_address = $2,
         postcode = COALESCE($3, postcode),
         latitude = COALESCE($4, latitude),
         longitude = COALESCE($5, longitude),
         property_id = COALESCE($6, property_id),
         attributes = attributes || $7::jsonb,
         profile_snapshot = CASE WHEN $8::jsonb = '{}'::jsonb THEN profile_snapshot ELSE $8::jsonb END,
         provider = $9,
         match_confidence = $10,
         match_method = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        normalizedAddress,
        postcode,
        latitude,
        longitude,
        propertyId,
        JSON.stringify(attributes),
        JSON.stringify(profileSnapshot),
        provider,
        matchConfidence,
        matchMethod,
      ]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO intelligence_subjects
      (uprn, normalized_address, postcode, latitude, longitude, property_id,
       attributes, profile_snapshot, provider, match_confidence, match_method, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      uprn ? String(uprn) : null,
      normalizedAddress,
      postcode,
      latitude,
      longitude,
      propertyId,
      JSON.stringify(attributes),
      JSON.stringify(profileSnapshot),
      provider,
      matchConfidence,
      matchMethod,
      createdBy,
    ]
  );
  return result.rows[0];
}

async function findEnrichmentBySubject(subjectId, enrichmentType, source) {
  const result = await pool.query(
    `SELECT * FROM property_enrichments
     WHERE subject_id = $1 AND enrichment_type = $2 AND source = $3
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [subjectId, enrichmentType, source]
  );
  return result.rows[0] || null;
}

async function upsertSubjectEnrichment({
  subjectId,
  enrichmentType,
  source,
  payload,
  provenance,
  observedAt = null,
  expiresAt = null,
}) {
  const existing = await pool.query(
    `SELECT id FROM property_enrichments
     WHERE subject_id = $1 AND enrichment_type = $2 AND source = $3`,
    [subjectId, enrichmentType, source]
  );

  if (existing.rows[0]) {
    const result = await pool.query(
      `UPDATE property_enrichments SET
         payload = $2, provenance = $3, observed_at = $4, expires_at = $5, retrieved_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [
        existing.rows[0].id,
        JSON.stringify(payload),
        JSON.stringify(provenance),
        observedAt,
        expiresAt,
      ]
    );
    return result.rows[0];
  }

  const result = await pool.query(
    `INSERT INTO property_enrichments
      (subject_id, enrichment_type, source, payload, provenance, observed_at, expires_at, retrieved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      subjectId,
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

async function listRecentSubjectsForUser(userId, limit = 12) {
  const result = await pool.query(
    `SELECT s.id, s.uprn, s.normalized_address, s.postcode, s.property_id,
            s.attributes, l.last_accessed_at, l.access_count
     FROM intelligence_subject_lookups l
     JOIN intelligence_subjects s ON s.id = l.subject_id
     WHERE l.user_id = $1
     ORDER BY l.last_accessed_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function userHasSubjectLookup(userId, subjectId) {
  const result = await pool.query(
    `SELECT 1 FROM intelligence_subject_lookups WHERE user_id = $1 AND subject_id = $2`,
    [userId, subjectId]
  );
  return Boolean(result.rows[0]);
}

async function unlinkSubjectFromListing(subjectId, userId, { isAdmin = false } = {}) {
  const subject = await findSubjectById(subjectId);
  if (!subject) {
    return { success: false, message: 'Analysis subject not found.', code: 'NOT_FOUND' };
  }
  if (!subject.property_id) {
    return { success: false, message: 'This property is not linked to a marketplace listing.' };
  }

  if (!isAdmin) {
    const allowed = await userHasSubjectLookup(userId, subjectId);
    if (!allowed) {
      return {
        success: false,
        message: 'You can only unlink listings for properties you have looked up.',
        code: 'FORBIDDEN',
      };
    }
  }

  const previousPropertyId = subject.property_id;
  await pool.query(
    `UPDATE intelligence_subjects SET property_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [subjectId]
  );

  return {
    success: true,
    subjectId,
    previousPropertyId,
    message: 'Marketplace listing unlinked. Future analyses use external PropertyData only.',
  };
}

async function recordSubjectLookup(userId, subjectId) {
  if (!userId || !subjectId) return;
  await pool.query(
    `INSERT INTO intelligence_subject_lookups (user_id, subject_id, last_accessed_at, access_count)
     VALUES ($1, $2, CURRENT_TIMESTAMP, 1)
     ON CONFLICT (user_id, subject_id) DO UPDATE SET
       last_accessed_at = CURRENT_TIMESTAMP,
       access_count = intelligence_subject_lookups.access_count + 1`,
    [userId, subjectId]
  );
}

module.exports = {
  findSubjectById,
  findSubjectByUprn,
  upsertSubject,
  findEnrichmentBySubject,
  upsertSubjectEnrichment,
  recordSubjectLookup,
  listRecentSubjectsForUser,
  userHasSubjectLookup,
  unlinkSubjectFromListing,
};
