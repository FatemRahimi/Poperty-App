/**
 * UKHPI observations. Separate from individual sale transactions.
 */

const { UKHPI_PROVENANCE } = require('../../architecture/officialMarketDataset');

function observationKey(row) {
  return [
    row.source || 'UK_HOUSE_PRICE_INDEX',
    row.geographyCode,
    row.observationDate,
    row.propertyCategory || 'all',
  ].join('|');
}

function createMemoryUkhpiStore() {
  const byKey = new Map();
  const runs = [];
  return {
    kind: 'memory',
    async latestRun() {
      return runs.length ? runs[runs.length - 1] : null;
    },
    async startRun(meta = {}) {
      const run = {
        id: runs.length + 1,
        status: 'STARTED',
        dataset: 'UK House Price Index',
        source: 'UK_HOUSE_PRICE_INDEX',
        inserted_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        rows_processed: 0,
        provenance: UKHPI_PROVENANCE,
        ...meta,
        started_at: new Date().toISOString(),
      };
      runs.push(run);
      return run;
    },
    async finishRun(id, stats = {}) {
      const run = runs.find((item) => item.id === id);
      if (run) Object.assign(run, stats, { finished_at: new Date().toISOString() });
      return run || null;
    },
    async upsert(observation) {
      const key = observationKey(observation);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...observation });
        return 'inserted';
      }
      if (existing.contentFingerprint === observation.contentFingerprint) return 'duplicate';
      return 'conflict';
    },
    snapshot() {
      return [...byKey.values()];
    },
  };
}

module.exports = {
  observationKey,
  createMemoryUkhpiStore,
};
