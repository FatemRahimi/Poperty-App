/**
 * ONS mid-year LAD population observation store.
 * Memory for tests; Postgres for production shape.
 * Identity includes observation_date so historical years remain distinct observations.
 */

const {
  ONS_MYE_SOURCE,
  ONS_MYE_DATASET,
  ONS_MYE_SOURCE_PRODUCT,
  ONS_MYE_RELEASE_LABEL,
  ONS_MYE_PROVENANCE,
  ONS_MYE_GEOGRAPHY_VINTAGE,
  ONS_MYE_REFERENCE_PERIOD,
} = require('../../architecture/officialAreaEconomicDataset');
const { classifyImportCoverage } = require('../../architecture/officialMarketDataset');
const { releaseLabelOrUnspecified } = require('./releaseSelection');

function observationKey(row) {
  return [
    row.source || ONS_MYE_SOURCE,
    row.geographyCode,
    row.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE,
    row.observationDate,
    releaseLabelOrUnspecified(row.releaseLabel || ONS_MYE_RELEASE_LABEL),
  ].join('|');
}

function createMemoryOnsMyeLadPopulationStore() {
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
        source: ONS_MYE_SOURCE,
        dataset: ONS_MYE_DATASET,
        source_product: ONS_MYE_SOURCE_PRODUCT,
        inserted_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        conflict_count: 0,
        rows_processed: 0,
        provenance: ONS_MYE_PROVENANCE,
        geographic_coverage: 'United Kingdom local authorities (ltla) as published in the selected extract',
        ...meta,
        release_label: releaseLabelOrUnspecified(meta.release_label || ONS_MYE_RELEASE_LABEL),
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
        geographyVintage: observation.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE,
        releaseLabel: releaseLabelOrUnspecified(observation.releaseLabel || ONS_MYE_RELEASE_LABEL),
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
      releaseLabel = ONS_MYE_RELEASE_LABEL,
      observationDate = null,
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
      let observations = [...byKey.values()].filter((row) => (
        row.geographyCode === code
        && releaseLabelOrUnspecified(row.releaseLabel) === release
        && (row.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE) === ONS_MYE_GEOGRAPHY_VINTAGE
      ));
      if (observationDate) {
        const period = String(observationDate).slice(0, 10);
        observations = observations.filter((row) => String(row.observationDate).slice(0, 10) === period);
      }
      observations.sort((a, b) => String(a.observationDate).localeCompare(String(b.observationDate)));
      return {
        observations,
        datasetCoverage,
        matched: observations.length > 0,
        matchStatus: observations.length ? 'MATCHED' : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
  };
}

function createPostgresOnsMyeLadPopulationStore(db = null) {
  const database = db || (() => {
    // Lazy require keeps memory tests offline.
    // eslint-disable-next-line global-require
    return require('../../models/db');
  })();

  const store = {
    kind: 'postgres',
    async latestRun() {
      const result = await database.query(
        'SELECT * FROM ons_lad_population_import_runs ORDER BY id DESC LIMIT 1'
      );
      return result.rows[0] || null;
    },
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({
        latestRun: await this.latestRun(),
        ...options,
      });
      if (coverage.state !== 'EMPTY') return coverage;
      const count = await database.query('SELECT COUNT(*)::int AS n FROM ons_lad_population_observations');
      const n = count.rows[0] ? Number(count.rows[0].n) : 0;
      return n > 0 ? { ...coverage, state: 'AVAILABLE', acceptedCount: n } : coverage;
    },
    async startRun(meta = {}) {
      const result = await database.query(
        `INSERT INTO ons_lad_population_import_runs
          (source, dataset, source_product, release_label, status, provenance, geographic_coverage)
         VALUES ($1, $2, $3, $4, 'STARTED', $5::jsonb, $6)
         RETURNING *`,
        [
          ONS_MYE_SOURCE,
          ONS_MYE_DATASET,
          ONS_MYE_SOURCE_PRODUCT,
          releaseLabelOrUnspecified(meta.release_label || ONS_MYE_RELEASE_LABEL),
          JSON.stringify(meta.provenance || ONS_MYE_PROVENANCE),
          meta.geographic_coverage
            || 'United Kingdom local authorities (ltla) as published in the selected extract',
        ]
      );
      return result.rows[0];
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE ons_lad_population_import_runs SET
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
      const release = releaseLabelOrUnspecified(observation.releaseLabel || ONS_MYE_RELEASE_LABEL);
      const vintage = observation.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE;
      const period = String(observation.observationDate).slice(0, 10);
      const existing = await database.query(
        `SELECT content_fingerprint FROM ons_lad_population_observations
         WHERE source = $1 AND geography_code = $2 AND geography_vintage = $3
           AND observation_date = $4::date AND release_label = $5`,
        [observation.source || ONS_MYE_SOURCE, observation.geographyCode, vintage, period, release]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].content_fingerprint === observation.contentFingerprint) return 'duplicate';
        return 'conflict';
      }
      await database.query(
        `INSERT INTO ons_lad_population_observations (
          source, dataset, source_product, record_kind, geography_type, geography_vintage,
          geography_code, geography_name, observation_date, total_usual_resident_population,
          release_label, content_fingerprint, provenance, limitations
        ) VALUES (
          $1,$2,$3,'OFFICIAL_OBSERVATION',$4,$5,$6,$7,$8::date,$9,$10,$11,$12::jsonb,$13::jsonb
        )
        ON CONFLICT (source, geography_code, geography_vintage, observation_date, release_label) DO NOTHING`,
        [
          observation.source || ONS_MYE_SOURCE,
          observation.dataset || ONS_MYE_DATASET,
          observation.sourceProduct || ONS_MYE_SOURCE_PRODUCT,
          observation.geographyType || 'LAD',
          vintage,
          observation.geographyCode,
          observation.geographyName || null,
          period,
          observation.totalUsualResidentPopulation,
          release,
          observation.contentFingerprint,
          JSON.stringify(observation.provenance || ONS_MYE_PROVENANCE),
          JSON.stringify(observation.limitations || []),
        ]
      );
      return 'inserted';
    },
    async queryByGeographyCode(geographyCode, {
      releaseLabel = ONS_MYE_RELEASE_LABEL,
      observationDate = null,
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
      const params = [
        String(geographyCode).trim(),
        ONS_MYE_GEOGRAPHY_VINTAGE,
        releaseLabelOrUnspecified(releaseLabel),
      ];
      let sql = `SELECT * FROM ons_lad_population_observations
         WHERE geography_code = $1
           AND geography_vintage = $2
           AND release_label = $3`;
      if (observationDate) {
        params.push(String(observationDate).slice(0, 10));
        sql += ' AND observation_date = $4::date';
      }
      sql += ' ORDER BY observation_date ASC';
      const result = await database.query(sql, params);
      const observations = result.rows.map((row) => ({
        source: row.source,
        dataset: row.dataset,
        sourceProduct: row.source_product,
        recordKind: row.record_kind,
        geographyType: row.geography_type,
        geographyVintage: row.geography_vintage,
        geographyCode: row.geography_code,
        geographyName: row.geography_name,
        observationDate: row.observation_date
          ? String(row.observation_date).slice(0, 10)
          : null,
        totalUsualResidentPopulation: row.total_usual_resident_population == null
          ? null
          : Number(row.total_usual_resident_population),
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
  createMemoryOnsMyeLadPopulationStore,
  createPostgresOnsMyeLadPopulationStore,
  ONS_MYE_REFERENCE_PERIOD,
};
