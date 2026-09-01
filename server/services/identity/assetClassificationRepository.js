/**
 * Persistence for canonical asset classification.
 * Fail-soft when the additive table has not been migrated yet.
 */

const pool = require('../../models/db');

function isMissingTable(error) {
  return error && (error.code === '42P01' || /asset_classifications/i.test(error.message || ''));
}

function rowToSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    subjectId: row.subject_id,
    assetClass: row.asset_class,
    subtype: row.subtype || null,
    subtypeRegistered: Boolean(row.subtype_registered),
    state: row.classification_state,
    method: row.classification_method,
    confidence: row.confidence || null,
    provenance: row.provenance || null,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByListingId(listingId, client = pool) {
  if (listingId == null) return null;
  try {
    const result = await client.query(
      `SELECT * FROM asset_classifications WHERE listing_id = $1`,
      [listingId]
    );
    return rowToSnapshot(result.rows[0]);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function findBySubjectId(subjectId, client = pool) {
  if (subjectId == null) return null;
  try {
    const result = await client.query(
      `SELECT * FROM asset_classifications WHERE subject_id = $1`,
      [subjectId]
    );
    return rowToSnapshot(result.rows[0]);
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function upsertClassification({ snapshot, listingId = null, subjectId = null, actorUserId = null }, client = pool) {
  const params = [
    listingId,
    subjectId,
    snapshot.assetClass,
    snapshot.subtype,
    Boolean(snapshot.subtypeRegistered),
    snapshot.state,
    snapshot.method || snapshot.state,
    snapshot.confidence,
    JSON.stringify(snapshot.provenance || {}),
    snapshot.version,
    actorUserId,
  ];
  const conflict = listingId != null
    ? `ON CONFLICT (listing_id) WHERE listing_id IS NOT NULL`
    : `ON CONFLICT (subject_id) WHERE subject_id IS NOT NULL`;
  const result = await client.query(
    `INSERT INTO asset_classifications (
        listing_id, subject_id, asset_class, subtype, subtype_registered,
        classification_state, classification_method, confidence, provenance,
        version, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, CURRENT_TIMESTAMP)
     ${conflict}
     DO UPDATE SET
        asset_class = EXCLUDED.asset_class,
        subtype = EXCLUDED.subtype,
        subtype_registered = EXCLUDED.subtype_registered,
        classification_state = EXCLUDED.classification_state,
        classification_method = EXCLUDED.classification_method,
        confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance,
        version = EXCLUDED.version,
        updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    params
  );
  return rowToSnapshot(result.rows[0]);
}

async function recordEvent(event, client = pool) {
  try {
    await client.query(
      `INSERT INTO asset_classification_events (
          classification_id, listing_id, subject_id,
          previous_asset_class, next_asset_class, previous_state, next_state,
          action, reason, actor_user_id, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        event.classificationId || null,
        event.listingId || null,
        event.subjectId || null,
        event.previousAssetClass || null,
        event.nextAssetClass || null,
        event.previousState || null,
        event.nextState || null,
        event.action,
        event.reason || null,
        event.actorUserId || null,
        JSON.stringify(event.payload || {}),
      ]
    );
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return true;
}

async function countByClass(client = pool) {
  try {
    const result = await client.query(
      `SELECT asset_class, classification_state,
              COALESCE(provenance->>'sourceType', 'none') AS source_type,
              COUNT(*)::int AS n
         FROM asset_classifications
        GROUP BY 1, 2, 3
        ORDER BY 1, 2, 3`
    );
    return result.rows;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

async function countProperties(client = pool) {
  const result = await client.query(`SELECT COUNT(*)::int AS n FROM properties`);
  return result.rows[0]?.n || 0;
}

async function listListingTypeFrequencies(client = pool) {
  const result = await client.query(
    `SELECT
        COALESCE(property_category, '') AS property_category,
        COALESCE(property_type, '') AS property_type,
        COUNT(*)::int AS n
       FROM properties
      GROUP BY 1, 2
      ORDER BY n DESC, property_category, property_type`
  );
  return result.rows;
}

module.exports = {
  findByListingId,
  findBySubjectId,
  upsertClassification,
  recordEvent,
  countByClass,
  countProperties,
  listListingTypeFrequencies,
  rowToSnapshot,
  isMissingTable,
};
