/**
 * Persistence for private evidence documents.
 * Hash uniqueness is owner-scoped. Cross-user duplicates stay isolated.
 */

const pool = require('../../models/db');

function rowToRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    ownerUserId: row.owner_user_id,
    domain: row.domain,
    documentType: row.document_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    contentHash: row.content_hash,
    storageKey: row.storage_key,
    sourceType: row.source_type,
    source: row.source,
    documentDate: row.document_date,
    uploadedAt: row.uploaded_at,
    evidenceAsOf: row.evidence_as_of,
    verificationState: row.verification_state,
    extractionState: row.extraction_state,
    privacy: row.privacy,
    provenance: row.provenance || {},
    declaredTitleNumber: row.declared_title_number,
    declaredTenure: row.declared_tenure,
    supersededDocumentId: row.superseded_document_id,
    archivedAt: row.archived_at,
    scanState: row.scan_state || 'SCAN_UNAVAILABLE',
    availabilityState: row.availability_state || 'AVAILABLE',
    lifecycleState: row.lifecycle_state || (row.archived_at ? 'ARCHIVED' : 'ACTIVE'),
    durabilityState: row.durability_state || 'DEVELOPMENT_LOCAL',
    storageProvider: row.storage_provider || 'LOCAL_PRIVATE',
    bytesRemoved: row.bytes_removed === true,
    lastIntegrityOk: row.last_integrity_ok,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subjects: row.subjects || [],
  };
}

async function findActiveByOwnerHash(ownerUserId, contentHash, domain) {
  const result = await pool.query(
    `SELECT * FROM evidence_documents
     WHERE owner_user_id = $1 AND content_hash = $2 AND domain = $3 AND archived_at IS NULL
     LIMIT 1`,
    [ownerUserId, contentHash, domain]
  );
  return rowToRecord(result.rows[0]);
}

async function findByDocumentId(documentId) {
  const result = await pool.query(
    `SELECT * FROM evidence_documents WHERE document_id = $1 LIMIT 1`,
    [documentId]
  );
  return rowToRecord(result.rows[0]);
}

async function insertDocument(record, subjects = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO evidence_documents (
         document_id, owner_user_id, domain, document_type, original_filename,
         mime_type, byte_size, content_hash, storage_key, source_type, source,
         document_date, uploaded_at, evidence_as_of, verification_state,
         extraction_state, privacy, provenance, declared_title_number,
         declared_tenure, superseded_document_id, scan_state, availability_state,
         lifecycle_state, durability_state, storage_provider, bytes_removed
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,false
       ) RETURNING *`,
      [
        record.documentId,
        record.ownerUserId,
        record.domain,
        record.documentType,
        record.originalFilename,
        record.mimeType,
        record.byteSize,
        record.contentHash,
        record.storageKey,
        record.sourceType,
        record.source,
        record.documentDate,
        record.uploadedAt,
        record.evidenceAsOf,
        record.verificationState,
        record.extractionState,
        record.privacy,
        JSON.stringify(record.provenance || {}),
        record.declaredTitleNumber,
        record.declaredTenure,
        record.supersededDocumentId || null,
        record.scanState || 'SCAN_UNAVAILABLE',
        record.availabilityState || 'AVAILABLE',
        record.lifecycleState || 'ACTIVE',
        record.durabilityState || 'DEVELOPMENT_LOCAL',
        record.storageProvider || 'LOCAL_PRIVATE',
      ]
    );
    const doc = inserted.rows[0];
    for (const subject of subjects) {
      await client.query(
        `INSERT INTO evidence_document_subjects (
           document_id, subject_kind, subject_key, property_id, subject_id,
           title_number, relationship, legal_relationship_proven
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
        [
          doc.document_id,
          subject.kind,
          String(subject.id),
          subject.propertyId || null,
          subject.intelligenceSubjectId || null,
          subject.titleNumber || null,
          subject.relationship || 'CLAIMED_REFERENCE',
        ]
      );
    }
    await client.query('COMMIT');
    return rowToRecord({ ...doc, subjects });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function attachSubjects(documentId, subjects = []) {
  const result = await pool.query(
    `SELECT * FROM evidence_document_subjects WHERE document_id = $1`,
    [documentId]
  );
  const existing = new Set(result.rows.map((row) => `${row.subject_kind}:${row.subject_key}`));
  for (const subject of subjects) {
    const key = `${subject.kind}:${subject.id}`;
    if (existing.has(key)) continue;
    await pool.query(
      `INSERT INTO evidence_document_subjects (
         document_id, subject_kind, subject_key, property_id, subject_id,
         title_number, relationship, legal_relationship_proven
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
      [
        documentId,
        subject.kind,
        String(subject.id),
        subject.propertyId || null,
        subject.intelligenceSubjectId || null,
        subject.titleNumber || null,
        subject.relationship || 'CLAIMED_REFERENCE',
      ]
    );
  }
}

async function listSubjects(documentId) {
  const result = await pool.query(
    `SELECT * FROM evidence_document_subjects WHERE document_id = $1`,
    [documentId]
  );
  return result.rows.map((row) => ({
    kind: row.subject_kind,
    id: row.subject_key,
    propertyId: row.property_id,
    intelligenceSubjectId: row.subject_id,
    titleNumber: row.title_number,
    relationship: row.relationship,
    legalRelationshipProven: false,
  }));
}

async function listForOwnerScope({
  ownerUserId,
  propertyId = null,
  subjectId = null,
  domain = 'LEGAL_TITLE',
  includeArchived = false,
} = {}) {
  const clauses = ['d.domain = $1'];
  const params = [domain];
  if (ownerUserId != null) {
    params.push(ownerUserId);
    clauses.push(`d.owner_user_id = $${params.length}`);
  }
  if (!includeArchived) clauses.push('d.archived_at IS NULL');
  if (propertyId != null) {
    params.push(Number(propertyId));
    clauses.push(`EXISTS (
      SELECT 1 FROM evidence_document_subjects s
      WHERE s.document_id = d.document_id AND s.property_id = $${params.length}
    )`);
  }
  if (subjectId != null) {
    params.push(Number(subjectId));
    clauses.push(`EXISTS (
      SELECT 1 FROM evidence_document_subjects s
      WHERE s.document_id = d.document_id AND s.subject_id = $${params.length}
    )`);
  }
  const result = await pool.query(
    `SELECT d.* FROM evidence_documents d
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.uploaded_at DESC`,
    params
  );
  const rows = [];
  for (const row of result.rows) {
    const subjects = await listSubjects(row.document_id);
    rows.push(rowToRecord({ ...row, subjects }));
  }
  return rows;
}

async function archiveDocument(documentId, { lifecycleState = 'ARCHIVED', bytesRemoved = false } = {}) {
  const result = await pool.query(
    `UPDATE evidence_documents
     SET archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
         lifecycle_state = $2,
         bytes_removed = $3,
         availability_state = 'UNAVAILABLE',
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = $1
     RETURNING *`,
    [documentId, lifecycleState, bytesRemoved]
  );
  return rowToRecord(result.rows[0]);
}

async function markIntegrity(documentId, ok) {
  const result = await pool.query(
    `UPDATE evidence_documents
     SET last_integrity_ok = $2, updated_at = CURRENT_TIMESTAMP
     WHERE document_id = $1
     RETURNING *`,
    [documentId, ok]
  );
  return rowToRecord(result.rows[0]);
}

async function listStorageKeys({ includeArchived = true } = {}) {
  const result = await pool.query(
    includeArchived
      ? `SELECT storage_key, document_id, archived_at, lifecycle_state, bytes_removed,
                scan_state, availability_state, last_integrity_ok
         FROM evidence_documents`
      : `SELECT storage_key, document_id, archived_at, lifecycle_state, bytes_removed,
                scan_state, availability_state, last_integrity_ok
         FROM evidence_documents WHERE archived_at IS NULL`
  );
  return result.rows.map((row) => ({
    storageKey: row.storage_key,
    documentId: row.document_id,
    archivedAt: row.archived_at,
    lifecycleState: row.lifecycle_state,
    bytesRemoved: row.bytes_removed === true,
    scanState: row.scan_state,
    availabilityState: row.availability_state,
    lastIntegrityOk: row.last_integrity_ok,
  }));
}

async function listDeleteFailed() {
  const result = await pool.query(
    `SELECT * FROM evidence_documents WHERE lifecycle_state = 'DELETE_FAILED'`
  );
  return result.rows.map(rowToRecord);
}

async function recordAccessEvent({ documentId, actorUserId, action, authorizationClass }) {
  await pool.query(
    `INSERT INTO evidence_access_events (document_id, actor_user_id, action, authorization_class)
     VALUES ($1,$2,$3,$4)`,
    [documentId, actorUserId, action, authorizationClass]
  );
}

async function safeCounts() {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE archived_at IS NULL)::int AS active,
       COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
       COUNT(*) FILTER (WHERE domain = 'LEGAL_TITLE')::int AS legal,
       COUNT(*) FILTER (WHERE scan_state = 'SCAN_UNAVAILABLE')::int AS scan_unavailable,
       COUNT(*) FILTER (WHERE scan_state = 'CLEAN')::int AS scan_clean,
       COUNT(*) FILTER (WHERE availability_state = 'QUARANTINED')::int AS quarantined,
       COUNT(*) FILTER (WHERE scan_state IN ('ERROR', 'REJECTED', 'SCAN_PENDING'))::int AS scan_failures,
       COUNT(*) FILTER (WHERE last_integrity_ok = false)::int AS integrity_mismatch,
       COUNT(*) FILTER (WHERE lifecycle_state = 'DELETE_FAILED')::int AS delete_failed
     FROM evidence_documents`
  );
  return result.rows[0];
}

module.exports = {
  rowToRecord,
  findActiveByOwnerHash,
  findByDocumentId,
  insertDocument,
  attachSubjects,
  listSubjects,
  listForOwnerScope,
  archiveDocument,
  markIntegrity,
  listStorageKeys,
  listDeleteFailed,
  recordAccessEvent,
  safeCounts,
};
