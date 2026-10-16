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

function numericOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sqlDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function parseJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  return value;
}

function sameFingerprint(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function observationFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    dataset: row.dataset,
    geographyCode: row.geography_code,
    geographyName: row.geography_name,
    geographyType: row.geography_type,
    observationDate: sqlDate(row.observation_date),
    indexValue: numericOrNull(row.index_value),
    averagePrice: numericOrNull(row.average_price),
    annualChange: numericOrNull(row.annual_change),
    monthlyChange: numericOrNull(row.monthly_change),
    propertyCategory: row.property_category,
    releaseLabel: row.release_label,
    contentFingerprint: row.content_fingerprint == null ? null : String(row.content_fingerprint).trim(),
    ingestedAt: row.ingested_at,
    provenance: parseJson(row.provenance),
  };
}

const INSERT_OBSERVATION_SQL = `
INSERT INTO ukhpi_observations (
  source, dataset, geography_code, geography_name, geography_type,
  observation_date, index_value, average_price, annual_change, monthly_change,
  property_category, release_label, content_fingerprint, ingested_at, provenance
) VALUES (
  $1, $2, $3, $4, $5,
  $6::date, $7, $8, $9, $10,
  $11, $12, $13, $14, $15::jsonb
)
ON CONFLICT (source, geography_code, observation_date, property_category)
DO NOTHING
RETURNING id, content_fingerprint`;

const QUERY_OBSERVATIONS_SQL = `
SELECT *
FROM ukhpi_observations
WHERE source = $1
  AND geography_code = $2
  AND ($3::text IS NULL OR property_category = $3)
  AND ($4::date IS NULL OR observation_date >= $4::date)
  AND ($5::date IS NULL OR observation_date <= $5::date)
ORDER BY observation_date ASC, property_category ASC, id ASC`;

function createPostgresUkhpiStore(db) {
  const database = db || require('../../models/db');
  return {
    kind: 'postgres',
    async startRun(meta = {}) {
      const provenance = {
        ...UKHPI_PROVENANCE,
        releaseDate: meta.release_label || null,
        datasetVersion: meta.release_label || null,
        ingestedAt: meta.ingested_at || null,
      };
      const result = await database.query(
        `INSERT INTO ukhpi_import_runs
          (source, dataset, release_label, status, provenance)
         VALUES ('UK_HOUSE_PRICE_INDEX', 'UK House Price Index', $1, 'STARTED', $2::jsonb)
         RETURNING *`,
        [meta.release_label || null, JSON.stringify(provenance)]
      );
      return result.rows[0] || null;
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE ukhpi_import_runs SET
           status = $2,
           rows_processed = $3,
           inserted_count = $4,
           unchanged_count = $5,
           rejected_count = $6,
           conflict_count = $7,
           failure_reason = $8,
           finished_at = CURRENT_TIMESTAMP,
           duration_ms = $9
         WHERE id = $1
         RETURNING *`,
        [
          id,
          stats.status || 'FAILED',
          stats.rows_processed || 0,
          stats.inserted_count || 0,
          stats.unchanged_count || 0,
          stats.rejected_count || 0,
          stats.conflict_count || 0,
          stats.failure_reason || null,
          stats.duration_ms || null,
        ]
      );
      return result.rows[0] || null;
    },
    async latestRun() {
      const result = await database.query(
        `SELECT * FROM ukhpi_import_runs
         ORDER BY id DESC
         LIMIT 1`
      );
      return result.rows[0] || null;
    },
    async datasetCoverage(options = {}) {
      const { classifyImportCoverage } = require('../../architecture/officialMarketDataset');
      return classifyImportCoverage({
        latestRun: await this.latestRun(),
        ...options,
      });
    },
    async upsert(observation) {
      const source = observation.source || 'UK_HOUSE_PRICE_INDEX';
      const category = observation.propertyCategory || 'all';
      const date = sqlDate(observation.observationDate);
      const inserted = await database.query(INSERT_OBSERVATION_SQL, [
        source,
        observation.dataset || 'UK House Price Index',
        observation.geographyCode,
        observation.geographyName || null,
        observation.geographyType || null,
        date,
        numericOrNull(observation.indexValue),
        numericOrNull(observation.averagePrice),
        numericOrNull(observation.annualChange),
        numericOrNull(observation.monthlyChange),
        category,
        observation.releaseLabel || null,
        observation.contentFingerprint,
        observation.ingestedAt || new Date().toISOString(),
        JSON.stringify(observation.provenance || UKHPI_PROVENANCE),
      ]);
      if ((inserted.rows || []).length) return 'inserted';
      const existing = await database.query(
        `SELECT content_fingerprint
         FROM ukhpi_observations
         WHERE source = $1
           AND geography_code = $2
           AND observation_date = $3::date
           AND property_category = $4`,
        [source, observation.geographyCode, date, category]
      );
      const stored = existing.rows[0];
      if (stored && sameFingerprint(stored.content_fingerprint, observation.contentFingerprint)) {
        return 'duplicate';
      }
      return 'conflict';
    },
    async queryObservations({
      geographyCode = null,
      propertyCategory = null,
      fromDate = null,
      toDate = null,
    } = {}) {
      const { annualChangeFromObservation } = require('../../architecture/officialMarketDataset');
      const datasetCoverage = await this.datasetCoverage();
      if (!geographyCode) {
        return {
          observations: [],
          datasetCoverage,
          matched: false,
          annualChange: null,
          growthCalculated: false,
        };
      }
      const result = await database.query(QUERY_OBSERVATIONS_SQL, [
        'UK_HOUSE_PRICE_INDEX',
        geographyCode,
        propertyCategory || null,
        fromDate ? sqlDate(fromDate) : null,
        toDate ? sqlDate(toDate) : null,
      ]);
      const observations = (result.rows || []).map(observationFromRow);
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        annualChange: observations.length === 1
          ? annualChangeFromObservation(observations[0])
          : null,
        growthCalculated: false,
      };
    },
  };
}

module.exports = {
  observationKey,
  createMemoryUkhpiStore,
  createPostgresUkhpiStore,
  observationFromRow,
  numericOrNull,
  INSERT_OBSERVATION_SQL,
  QUERY_OBSERVATIONS_SQL,
};
