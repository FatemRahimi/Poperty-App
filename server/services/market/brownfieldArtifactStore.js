/**
 * Durable identity for one downloaded Brownfield artifact.
 * SHA-256 is content identity. Database id is not chronology.
 */

const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
} = require('../../architecture/officialBrownfieldLandDataset');

function artifactRecord(fields) {
  return {
    source: fields.source || BROWNFIELD_SOURCE,
    dataset: fields.dataset || BROWNFIELD_DATASET_LABEL,
    source_product: fields.source_product || fields.sourceProduct || BROWNFIELD_SOURCE_PRODUCT,
    source_url: fields.source_url || fields.sourceUrl,
    resolved_url: fields.resolved_url || fields.resolvedUrl || null,
    artifact_filename: fields.artifact_filename || fields.artifactFilename,
    content_type: fields.content_type || fields.contentType || null,
    content_length: fields.content_length == null && fields.contentLength == null
      ? null
      : Number(fields.content_length != null ? fields.content_length : fields.contentLength),
    byte_length: Number(fields.byte_length != null ? fields.byte_length : fields.byteLength),
    etag: fields.etag || null,
    last_modified: fields.last_modified || fields.lastModified || null,
    sha256: fields.sha256,
    retrieved_at: fields.retrieved_at || fields.retrievedAt,
    status: fields.status || 'RETRIEVED',
  };
}

function createMemoryBrownfieldArtifactStore() {
  const bySha = new Map();
  const byId = new Map();
  let nextId = 1;
  return {
    kind: 'memory',
    async findBySha(sha256) {
      return bySha.get(sha256) || null;
    },
    async insertRetrieved(fields) {
      const existing = bySha.get(fields.sha256);
      if (existing) return { artifact: existing, created: false };
      const artifact = {
        id: nextId,
        created_at: new Date().toISOString(),
        ...artifactRecord(fields),
      };
      nextId += 1;
      bySha.set(artifact.sha256, artifact);
      byId.set(artifact.id, artifact);
      return { artifact, created: true };
    },
    async markStatus(id, status) {
      const artifact = byId.get(id);
      if (artifact) artifact.status = status;
      return artifact || null;
    },
  };
}

function createPostgresBrownfieldArtifactStore(db) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('brownfield_artifact_store_requires_query');
  }
  return {
    kind: 'postgres',
    async findBySha(sha256) {
      const result = await db.query(
        'SELECT * FROM brownfield_land_artifacts WHERE sha256 = $1',
        [sha256]
      );
      return result.rows[0] || null;
    },
    async insertRetrieved(fields) {
      const record = artifactRecord(fields);
      const inserted = await db.query(
        `INSERT INTO brownfield_land_artifacts (
           source, dataset, source_product, source_url, resolved_url, artifact_filename,
           content_type, content_length, byte_length, etag, last_modified, sha256,
           retrieved_at, status
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         )
         ON CONFLICT (sha256) DO NOTHING
         RETURNING *`,
        [
          record.source,
          record.dataset,
          record.source_product,
          record.source_url,
          record.resolved_url,
          record.artifact_filename,
          record.content_type,
          record.content_length,
          record.byte_length,
          record.etag,
          record.last_modified,
          record.sha256,
          record.retrieved_at,
          record.status,
        ]
      );
      if (inserted.rowCount > 0) return { artifact: inserted.rows[0], created: true };
      const existing = await this.findBySha(record.sha256);
      return { artifact: existing, created: false };
    },
    async markStatus(id, status) {
      const result = await db.query(
        'UPDATE brownfield_land_artifacts SET status = $2 WHERE id = $1 RETURNING *',
        [id, status]
      );
      return result.rows[0] || null;
    },
  };
}

module.exports = {
  createMemoryBrownfieldArtifactStore,
  createPostgresBrownfieldArtifactStore,
};
