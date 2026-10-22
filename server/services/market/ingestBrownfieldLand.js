/**
 * Offline / supplied-payload brownfield-land ingest. No live network in tests.
 * Parsing finishes before the persistence transaction. A database failure
 * rolls back that attempt and does not remove earlier successful revisions.
 */

const { parseBrownfieldEntitiesPayload } = require('./brownfieldLandParser');
const { createMemoryBrownfieldLandStore } = require('./brownfieldLandStore');
const { BROWNFIELD_RELEASE_LABEL } = require('../../architecture/officialBrownfieldLandDataset');

async function ingestBrownfieldLand({
  store = null,
  entitiesJson = null,
  entities = null,
  releaseLabel = BROWNFIELD_RELEASE_LABEL,
  retrievedAt = null,
  ingestedAt = new Date().toISOString(),
  failAtIndex = null,
} = {}) {
  const target = store || createMemoryBrownfieldLandStore();
  const started = Date.now();
  const payload = entities != null ? entities : entitiesJson;
  if (payload == null) {
    throw new Error('brownfield_ingest_requires_entities');
  }
  const parsed = parseBrownfieldEntitiesPayload(payload, {
    releaseLabel,
    retrievedAt,
    ingestedAt,
  });
  if (!parsed.rows.length && parsed.rejected.length) {
    const run = await target.startRun({
      release_label: releaseLabel,
      retrieved_at: retrievedAt,
      ingested_at: ingestedAt,
    });
    const stats = {
      rows_processed: 0,
      inserted_count: 0,
      unchanged_count: 0,
      rejected_count: parsed.rejected.length,
      conflict_count: 0,
    };
    await target.finishRun(run.id, {
      status: 'FAILED',
      failure_reason: parsed.rejected[0]?.reason || 'no_valid_entities',
      ...stats,
      duration_ms: Date.now() - started,
    });
    return {
      store: target,
      runId: run.id,
      ...stats,
      status: 'FAILED',
      failure_reason: parsed.rejected[0]?.reason || 'no_valid_entities',
      rejected: parsed.rejected,
    };
  }
  const result = await target.importAcceptedBatch({
    rows: parsed.rows.map((row) => ({ ...row, ingestedAt, retrievedAt })),
    rejectedCount: parsed.rejected.length,
    releaseLabel,
    retrievedAt,
    failAtIndex,
  });
  return {
    store: target,
    ...result,
    rejected: parsed.rejected,
    providerCount: parsed.providerCount,
    duration_ms: Date.now() - started,
  };
}

module.exports = {
  ingestBrownfieldLand,
};
