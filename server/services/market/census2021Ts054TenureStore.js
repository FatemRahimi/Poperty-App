/**
 * Census 2021 TS054 LAD tenure observation store.
 * Raw category rows only. Aggregates are computed at evidence time.
 */

const {
  CENSUS2021_TS054_SOURCE,
  CENSUS2021_TS054_DATASET,
  CENSUS2021_TS054_SOURCE_PRODUCT,
  CENSUS2021_TS054_RELEASE_LABEL,
  CENSUS2021_TS054_PROVENANCE,
  CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
  CENSUS2021_TS054_REFERENCE_PERIOD,
} = require('../../architecture/officialAreaEconomicDataset');
const { classifyImportCoverage } = require('../../architecture/officialMarketDataset');
const { releaseLabelOrUnspecified } = require('./releaseSelection');

function observationKey(row) {
  return [
    row.source || CENSUS2021_TS054_SOURCE,
    row.geographyCode,
    row.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
    row.referencePeriod || CENSUS2021_TS054_REFERENCE_PERIOD,
    String(row.categoryCode),
    releaseLabelOrUnspecified(row.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL),
  ].join('|');
}

function createMemoryCensus2021Ts054TenureStore() {
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
        source: CENSUS2021_TS054_SOURCE,
        dataset: CENSUS2021_TS054_DATASET,
        source_product: CENSUS2021_TS054_SOURCE_PRODUCT,
        inserted_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        conflict_count: 0,
        rows_processed: 0,
        provenance: CENSUS2021_TS054_PROVENANCE,
        geographic_coverage: 'England and Wales lower tier local authorities',
        ...meta,
        release_label: releaseLabelOrUnspecified(meta.release_label || CENSUS2021_TS054_RELEASE_LABEL),
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
        geographyVintage: observation.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
        referencePeriod: observation.referencePeriod || CENSUS2021_TS054_REFERENCE_PERIOD,
        releaseLabel: releaseLabelOrUnspecified(observation.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL),
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
    async queryByGeographyCode(geographyCode, {
      releaseLabel = CENSUS2021_TS054_RELEASE_LABEL,
      referencePeriod = CENSUS2021_TS054_REFERENCE_PERIOD,
    } = {}) {
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
      const period = String(referencePeriod).slice(0, 10);
      const observations = [...byKey.values()].filter((row) => (
        row.geographyCode === code
        && releaseLabelOrUnspecified(row.releaseLabel) === release
        && (row.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE) === CENSUS2021_TS054_GEOGRAPHY_VINTAGE
        && String(row.referencePeriod).slice(0, 10) === period
      )).sort((a, b) => String(a.categoryCode).localeCompare(String(b.categoryCode), undefined, { numeric: true }));
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        matchStatus: observations.length ? 'MATCHED' : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
  };
}

function createPostgresCensus2021Ts054TenureStore(db = null) {
  const database = db || (() => {
    // eslint-disable-next-line global-require
    return require('../../models/db');
  })();

  return {
    kind: 'postgres',
    async latestRun() {
      const result = await database.query(
        'SELECT * FROM census2021_lad_tenure_import_runs ORDER BY id DESC LIMIT 1'
      );
      return result.rows[0] || null;
    },
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({
        latestRun: await this.latestRun(),
        ...options,
      });
      if (coverage.state !== 'EMPTY') return coverage;
      const count = await database.query('SELECT COUNT(*)::int AS n FROM census2021_lad_tenure_observations');
      const n = count.rows[0] ? Number(count.rows[0].n) : 0;
      return n > 0 ? { ...coverage, state: 'AVAILABLE', acceptedCount: n } : coverage;
    },
    async startRun(meta = {}) {
      const result = await database.query(
        `INSERT INTO census2021_lad_tenure_import_runs
          (source, dataset, source_product, release_label, status, provenance, geographic_coverage)
         VALUES ($1, $2, $3, $4, 'STARTED', $5::jsonb, $6)
         RETURNING *`,
        [
          CENSUS2021_TS054_SOURCE,
          CENSUS2021_TS054_DATASET,
          CENSUS2021_TS054_SOURCE_PRODUCT,
          releaseLabelOrUnspecified(meta.release_label || CENSUS2021_TS054_RELEASE_LABEL),
          JSON.stringify(meta.provenance || CENSUS2021_TS054_PROVENANCE),
          meta.geographic_coverage || 'England and Wales lower tier local authorities',
        ]
      );
      return result.rows[0];
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE census2021_lad_tenure_import_runs SET
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
      const release = releaseLabelOrUnspecified(observation.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL);
      const vintage = observation.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE;
      const period = String(observation.referencePeriod || CENSUS2021_TS054_REFERENCE_PERIOD).slice(0, 10);
      const categoryCode = String(observation.categoryCode);
      const existing = await database.query(
        `SELECT content_fingerprint FROM census2021_lad_tenure_observations
         WHERE source = $1 AND geography_code = $2 AND geography_vintage = $3
           AND reference_period = $4::date AND category_code = $5 AND release_label = $6`,
        [
          observation.source || CENSUS2021_TS054_SOURCE,
          observation.geographyCode,
          vintage,
          period,
          categoryCode,
          release,
        ]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].content_fingerprint === observation.contentFingerprint) return 'duplicate';
        return 'conflict';
      }
      await database.query(
        `INSERT INTO census2021_lad_tenure_observations (
          source, dataset, dataset_id, edition, version, source_product, record_kind,
          geography_type, geography_vintage, geography_code, geography_name,
          category_code, category_label, household_count, reference_period, release_label,
          content_fingerprint, provenance, limitations
        ) VALUES (
          $1,$2,$3,$4,$5,$6,'OFFICIAL_OBSERVATION',$7,$8,$9,$10,$11,$12,$13,$14::date,$15,$16,$17::jsonb,$18::jsonb
        )
        ON CONFLICT (source, geography_code, geography_vintage, reference_period, category_code, release_label)
        DO NOTHING`,
        [
          observation.source || CENSUS2021_TS054_SOURCE,
          observation.dataset || CENSUS2021_TS054_DATASET,
          observation.datasetId || 'TS054',
          observation.edition || '2021',
          observation.version == null ? 4 : observation.version,
          observation.sourceProduct || CENSUS2021_TS054_SOURCE_PRODUCT,
          observation.geographyType || 'LAD',
          vintage,
          observation.geographyCode,
          observation.geographyName || null,
          categoryCode,
          observation.categoryLabel,
          observation.householdCount,
          period,
          release,
          observation.contentFingerprint,
          JSON.stringify(observation.provenance || CENSUS2021_TS054_PROVENANCE),
          JSON.stringify(observation.limitations || []),
        ]
      );
      return 'inserted';
    },
    async queryByGeographyCode(geographyCode, {
      releaseLabel = CENSUS2021_TS054_RELEASE_LABEL,
      referencePeriod = CENSUS2021_TS054_REFERENCE_PERIOD,
    } = {}) {
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
        `SELECT * FROM census2021_lad_tenure_observations
         WHERE geography_code = $1
           AND geography_vintage = $2
           AND reference_period = $3::date
           AND release_label = $4
         ORDER BY category_code`,
        [
          String(geographyCode).trim(),
          CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
          String(referencePeriod).slice(0, 10),
          releaseLabelOrUnspecified(releaseLabel),
        ]
      );
      const observations = result.rows.map((row) => ({
        source: row.source,
        dataset: row.dataset,
        datasetId: row.dataset_id,
        edition: row.edition,
        version: row.version == null ? null : Number(row.version),
        sourceProduct: row.source_product,
        recordKind: row.record_kind,
        geographyType: row.geography_type,
        geographyVintage: row.geography_vintage,
        geographyCode: row.geography_code,
        geographyName: row.geography_name,
        categoryCode: row.category_code,
        categoryLabel: row.category_label,
        householdCount: row.household_count == null ? null : Number(row.household_count),
        referencePeriod: row.reference_period ? String(row.reference_period).slice(0, 10) : null,
        releaseLabel: row.release_label,
        contentFingerprint: row.content_fingerprint,
        ingestedAt: row.ingested_at,
        provenance: row.provenance,
        limitations: row.limitations,
        historicalCensusContext: true,
      }));
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        matchStatus: observations.length ? 'MATCHED' : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
  };
}

module.exports = {
  observationKey,
  createMemoryCensus2021Ts054TenureStore,
  createPostgresCensus2021Ts054TenureStore,
};
