/**
 * Offline UKHPI ingestion. No network and no model.
 */

const { parseUkhpiCsv } = require('./ukhpiParser');
const { createMemoryUkhpiStore } = require('./ukhpiStore');

async function ingestUkhpiCsv(text, {
  store = null,
  releaseLabel = null,
  ingestedAt = new Date().toISOString(),
  propertyCategory = null,
  geographyType = null,
} = {}) {
  const target = store || createMemoryUkhpiStore();
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
    const parsed = parseUkhpiCsv(text, {
      releaseLabel,
      ingestedAt,
      propertyCategory,
      geographyType,
    });
    stats.rejected_count += parsed.rejected.length;
    for (const observation of parsed.rows) {
      stats.rows_processed += 1;
      const outcome = await target.upsert({ ...observation, ingestedAt });
      if (outcome === 'inserted') stats.inserted_count += 1;
      else if (outcome === 'duplicate') stats.unchanged_count += 1;
      else stats.conflict_count += 1;
    }
    stats.rows_processed += parsed.rejected.length;
    stats.status = 'SUCCEEDED';
    stats.duration_ms = Date.now() - started;
    await target.finishRun(run.id, stats);
    return { ok: true, runId: run.id, ...stats, provenance: parsed.rows[0]?.provenance || null };
  } catch (error) {
    stats.status = 'FAILED';
    stats.failure_reason = error.message;
    stats.duration_ms = Date.now() - started;
    await target.finishRun(run.id, stats);
    return { ok: false, runId: run.id, ...stats };
  }
}

module.exports = {
  ingestUkhpiCsv,
};
