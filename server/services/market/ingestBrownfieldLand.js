/**
 * Offline / supplied-payload brownfield-land ingest. No live network in tests.
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
} = {}) {
  const target = store || createMemoryBrownfieldLandStore();
  const started = Date.now();
  const run = await target.startRun({
    release_label: releaseLabel,
    retrieved_at: retrievedAt,
    ingested_at: ingestedAt,
  });
  const stats = {
    rows_processed: 0,
    inserted_count: 0,
    unchanged_count: 0,
    rejected_count: 0,
    conflict_count: 0,
  };
  try {
    const payload = entities != null ? entities : entitiesJson;
    if (payload == null) {
      throw new Error('brownfield_ingest_requires_entities');
    }
    const parsed = parseBrownfieldEntitiesPayload(payload, {
      releaseLabel,
      retrievedAt,
      ingestedAt,
    });
    stats.rejected_count += parsed.rejected.length;
    if (!parsed.rows.length && parsed.rejected.length) {
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
        rejected: parsed.rejected,
      };
    }
    for (const observation of parsed.rows) {
      stats.rows_processed += 1;
      const outcome = await target.upsert({ ...observation, ingestedAt, retrievedAt });
      if (outcome === 'inserted') stats.inserted_count += 1;
      else if (outcome === 'duplicate') stats.unchanged_count += 1;
      else if (outcome === 'conflict') stats.conflict_count += 1;
    }
    await target.finishRun(run.id, {
      status: 'SUCCEEDED',
      ...stats,
      duration_ms: Date.now() - started,
    });
    return {
      store: target,
      runId: run.id,
      ...stats,
      status: 'SUCCEEDED',
      rejected: parsed.rejected,
      providerCount: parsed.providerCount,
    };
  } catch (error) {
    await target.finishRun(run.id, {
      status: 'FAILED',
      failure_reason: error.message,
      ...stats,
      duration_ms: Date.now() - started,
    });
    throw error;
  }
}

module.exports = {
  ingestBrownfieldLand,
};
