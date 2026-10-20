/**
 * IoD 2025 File 10 v2 LAD observation store.
 * Memory for tests; Postgres for production shape.
 */

const {
  IOD2025_SOURCE,
  IOD2025_DATASET,
  IOD2025_SOURCE_PRODUCT,
  IOD2025_RELEASE_LABEL,
  IOD2025_PROVENANCE,
  IOD2025_GEOGRAPHY_VINTAGE,
} = require('../../architecture/officialAreaEconomicDataset');
const { classifyImportCoverage } = require('../../architecture/officialMarketDataset');
const { releaseLabelOrUnspecified } = require('./releaseSelection');

function observationKey(row) {
  return [
    row.source || IOD2025_SOURCE,
    row.geographyCode,
    row.geographyVintage || IOD2025_GEOGRAPHY_VINTAGE,
    releaseLabelOrUnspecified(row.releaseLabel || IOD2025_RELEASE_LABEL),
  ].join('|');
}

function createMemoryIod2025LadStore() {
  const byKey = new Map();
  const runs = [];
  return {
    kind: 'memory',
    async latestRun() {
      return runs.length ? runs[runs.length - 1] : null;
    },
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({ latestRun: await this.latestRun(), ...options });
      if (coverage.state === 'EMPTY' && byKey.size > 0) {
        return { ...coverage, state: 'AVAILABLE', acceptedCount: byKey.size };
      }
      return coverage;
    },
    async startRun(meta = {}) {
      const run = {
        id: runs.length + 1,
        status: 'STARTED',
        source: IOD2025_SOURCE,
        dataset: IOD2025_DATASET,
        source_product: IOD2025_SOURCE_PRODUCT,
        inserted_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        conflict_count: 0,
        rows_processed: 0,
        provenance: IOD2025_PROVENANCE,
        geographic_coverage: 'England',
        ...meta,
        release_label: releaseLabelOrUnspecified(meta.release_label || IOD2025_RELEASE_LABEL),
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
      const stored = {
        ...observation,
        recordKind: 'OFFICIAL_OBSERVATION',
        geographyVintage: observation.geographyVintage || IOD2025_GEOGRAPHY_VINTAGE,
        releaseLabel: releaseLabelOrUnspecified(observation.releaseLabel || IOD2025_RELEASE_LABEL),
      };
      const key = observationKey(stored);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, stored);
        return 'inserted';
      }
      if (existing.contentFingerprint === stored.contentFingerprint) return 'duplicate';
      return 'conflict';
    },
    snapshot() {
      return [...byKey.values()];
    },
    async queryByGeographyCode(geographyCode, { releaseLabel = IOD2025_RELEASE_LABEL } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (!geographyCode) {
        return {
          observations: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
        };
      }
      const code = String(geographyCode).trim();
      const release = releaseLabelOrUnspecified(releaseLabel);
      const observations = [...byKey.values()].filter((row) => (
        row.geographyCode === code
        && releaseLabelOrUnspecified(row.releaseLabel) === release
        && (row.geographyVintage || IOD2025_GEOGRAPHY_VINTAGE) === IOD2025_GEOGRAPHY_VINTAGE
      ));
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        matchStatus: observations.length ? 'MATCHED' : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
  };
}

function createPostgresIod2025LadStore(db = null) {
  const database = db || (() => {
    // Lazy require keeps memory tests offline.
    // eslint-disable-next-line global-require
    return require('../../models/db');
  })();

  const store = {
    kind: 'postgres',
    async latestRun() {
      const result = await database.query(
        'SELECT * FROM iod2025_lad_import_runs ORDER BY id DESC LIMIT 1'
      );
      return result.rows[0] || null;
    },
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({
        latestRun: await this.latestRun(),
        ...options,
      });
      if (coverage.state !== 'EMPTY') return coverage;
      const count = await database.query('SELECT COUNT(*)::int AS n FROM iod2025_lad_observations');
      const n = count.rows[0] ? Number(count.rows[0].n) : 0;
      return n > 0 ? { ...coverage, state: 'AVAILABLE', acceptedCount: n } : coverage;
    },
    async startRun(meta = {}) {
      const result = await database.query(
        `INSERT INTO iod2025_lad_import_runs
          (source, dataset, source_product, release_label, status, provenance, geographic_coverage)
         VALUES ($1, $2, $3, $4, 'STARTED', $5::jsonb, $6)
         RETURNING *`,
        [
          IOD2025_SOURCE,
          IOD2025_DATASET,
          IOD2025_SOURCE_PRODUCT,
          releaseLabelOrUnspecified(meta.release_label || IOD2025_RELEASE_LABEL),
          JSON.stringify(meta.provenance || IOD2025_PROVENANCE),
          meta.geographic_coverage || 'England',
        ]
      );
      return result.rows[0];
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE iod2025_lad_import_runs SET
          status = $2,
          rows_processed = COALESCE($3, rows_processed),
          inserted_count = COALESCE($4, inserted_count),
          unchanged_count = COALESCE($5, unchanged_count),
          rejected_count = COALESCE($6, rejected_count),
          conflict_count = COALESCE($7, conflict_count),
          failure_reason = $8,
          finished_at = CURRENT_TIMESTAMP,
          duration_ms = $9
         WHERE id = $1
         RETURNING *`,
        [
          id,
          stats.status || 'SUCCEEDED',
          stats.rows_processed,
          stats.inserted_count,
          stats.unchanged_count,
          stats.rejected_count,
          stats.conflict_count,
          stats.failure_reason || null,
          stats.duration_ms == null ? null : stats.duration_ms,
        ]
      );
      return result.rows[0] || null;
    },
    async upsert(observation) {
      const release = releaseLabelOrUnspecified(observation.releaseLabel || IOD2025_RELEASE_LABEL);
      const vintage = observation.geographyVintage || IOD2025_GEOGRAPHY_VINTAGE;
      const existing = await database.query(
        `SELECT content_fingerprint FROM iod2025_lad_observations
         WHERE source = $1 AND geography_code = $2 AND geography_vintage = $3 AND release_label = $4`,
        [observation.source || IOD2025_SOURCE, observation.geographyCode, vintage, release]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].content_fingerprint === observation.contentFingerprint) return 'duplicate';
        return 'conflict';
      }
      await database.query(
        `INSERT INTO iod2025_lad_observations (
          source, dataset, source_product, record_kind, geography_type, geography_vintage,
          geography_code, geography_name, imd_average_score, imd_rank_of_average_score,
          imd_proportion_most_deprived_10, release_label, content_fingerprint, provenance, limitations
        ) VALUES (
          $1,$2,$3,'OFFICIAL_OBSERVATION',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb
        )
        ON CONFLICT (source, geography_code, geography_vintage, release_label) DO NOTHING`,
        [
          observation.source || IOD2025_SOURCE,
          observation.dataset || IOD2025_DATASET,
          observation.sourceProduct || IOD2025_SOURCE_PRODUCT,
          observation.geographyType || 'LAD',
          vintage,
          observation.geographyCode,
          observation.geographyName || null,
          observation.imdAverageScore,
          observation.imdRankOfAverageScore,
          observation.imdProportionMostDeprived10,
          release,
          observation.contentFingerprint,
          JSON.stringify(observation.provenance || IOD2025_PROVENANCE),
          JSON.stringify(observation.limitations || []),
        ]
      );
      return 'inserted';
    },
    async queryByGeographyCode(geographyCode, { releaseLabel = IOD2025_RELEASE_LABEL } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (!geographyCode) {
        return {
          observations: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
        };
      }
      const result = await database.query(
        `SELECT * FROM iod2025_lad_observations
         WHERE geography_code = $1
           AND geography_vintage = $2
           AND release_label = $3`,
        [String(geographyCode).trim(), IOD2025_GEOGRAPHY_VINTAGE, releaseLabelOrUnspecified(releaseLabel)]
      );
      const observations = result.rows.map((row) => ({
        source: row.source,
        dataset: row.dataset,
        sourceProduct: row.source_product,
        recordKind: row.record_kind,
        geographyType: row.geography_type,
        geographyVintage: row.geography_vintage,
        geographyCode: row.geography_code,
        geographyName: row.geography_name,
        imdAverageScore: row.imd_average_score == null ? null : Number(row.imd_average_score),
        imdRankOfAverageScore: row.imd_rank_of_average_score == null ? null : Number(row.imd_rank_of_average_score),
        imdProportionMostDeprived10: row.imd_proportion_most_deprived_10 == null ? null : Number(row.imd_proportion_most_deprived_10),
        releaseLabel: row.release_label,
        contentFingerprint: row.content_fingerprint,
        ingestedAt: row.ingested_at,
        provenance: row.provenance,
        limitations: row.limitations,
      }));
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        matchStatus: observations.length ? 'MATCHED' : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
  };
  return store;
}

module.exports = {
  observationKey,
  createMemoryIod2025LadStore,
  createPostgresIod2025LadStore,
};
