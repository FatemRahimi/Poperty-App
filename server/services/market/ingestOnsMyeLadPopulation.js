/**
 * Offline ONS mid-year LAD population ingest. No network and no model.
 * Stores official observations only — does not compute population growth.
 */

const { parseOnsMyeLadPopulationCsv } = require('./onsMyeLadPopulationParser');
const { createMemoryOnsMyeLadPopulationStore } = require('./onsMyeLadPopulationStore');
const { ONS_MYE_RELEASE_LABEL } = require('../../architecture/officialAreaEconomicDataset');

async function ingestOnsMyeLadPopulation({
  store = null,
  csvText = null,
  releaseLabel = ONS_MYE_RELEASE_LABEL,
  ingestedAt = new Date().toISOString(),
} = {}) {
  const target = store || createMemoryOnsMyeLadPopulationStore();
  const started = Date.now();
  const run = await target.startRun({
    release_label: releaseLabel,
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
    if (csvText == null) {
      throw new Error('ons_mye_ingest_requires_csv');
    }
    const parsed = parseOnsMyeLadPopulationCsv(csvText, { releaseLabel, ingestedAt });
    if (!parsed.header) {
      stats.rejected_count += parsed.rejected.length || 1;
      await target.finishRun(run.id, {
        status: 'FAILED',
        failure_reason: parsed.rejected[0]?.reason || 'invalid_header',
        ...stats,
        duration_ms: Date.now() - started,
      });
      return { store: target, runId: run.id, ...stats, status: 'FAILED', rejected: parsed.rejected };
    }
    stats.rejected_count += parsed.rejected.length;
    for (const observation of parsed.rows) {
      stats.rows_processed += 1;
      const outcome = await target.upsert({ ...observation, ingestedAt });
      if (outcome === 'inserted') stats.inserted_count += 1;
      else if (outcome === 'duplicate') stats.unchanged_count += 1;
      else if (outcome === 'conflict') stats.conflict_count += 1;
    }
    await target.finishRun(run.id, {
      status: 'SUCCEEDED',
      ...stats,
      duration_ms: Date.now() - started,
    });
    return { store: target, runId: run.id, ...stats, status: 'SUCCEEDED', rejected: parsed.rejected };
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
  ingestOnsMyeLadPopulation,
};
