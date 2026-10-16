/**
 * Offline geography crosswalk import. No network and no model.
 */

const { parseGeographyCsv } = require('./geographyCrosswalkParser');
const { createMemoryGeographyStore } = require('./geographyCrosswalkStore');
const { releaseLabelOrUnspecified } = require('./releaseSelection');

async function ingestGeographyCsv(text, {
  store = null,
  releaseLabel = null,
  ingestedAt = new Date().toISOString(),
  geographicCoverage = null,
} = {}) {
  const target = store || createMemoryGeographyStore();
  const started = Date.now();
  const release = releaseLabelOrUnspecified(releaseLabel);
  const run = await target.startRun({
    release_label: release,
    geographic_coverage: geographicCoverage,
  });
  const stats = {
    rows_processed: 0,
    inserted_count: 0,
    unchanged_count: 0,
    rejected_count: 0,
    conflict_count: 0,
  };
  try {
    const parsed = parseGeographyCsv(text, { releaseLabel: release, ingestedAt, geographicCoverage });
    stats.rejected_count += parsed.rejected.length;
    for (const row of parsed.rows) {
      stats.rows_processed += 1;
      const outcome = await target.upsert({ ...row, ingestedAt, releaseLabel: release });
      if (outcome === 'inserted') stats.inserted_count += 1;
      else if (outcome === 'duplicate') stats.unchanged_count += 1;
      else stats.conflict_count += 1;
    }
    stats.rows_processed += parsed.rejected.length;
    stats.status = 'SUCCEEDED';
    stats.duration_ms = Date.now() - started;
    await target.finishRun(run.id, stats);
    return { ok: true, runId: run.id, ...stats };
  } catch (error) {
    stats.status = 'FAILED';
    stats.failure_reason = error.message;
    stats.duration_ms = Date.now() - started;
    await target.finishRun(run.id, stats);
    return { ok: false, runId: run.id, ...stats };
  }
}

module.exports = {
  ingestGeographyCsv,
};
