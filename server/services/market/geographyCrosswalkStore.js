/**
 * Postcode to official geography codes.
 * Lookup is by normalised postcode only. Names, coordinates, and map fallbacks are not used.
 */

const {
  GEOGRAPHY_LIMITATIONS,
  ONS_POSTCODE_DIRECTORY_PROVENANCE,
  classifyImportCoverage,
} = require('../../architecture/officialMarketDataset');
const { canonicalPostcode } = require('./canonicalPostcode');
const { releaseLabelOrUnspecified, selectEffectiveRecords, EFFECTIVE_SELECTION } = require('./releaseSelection');

const IDENTITY_FIELDS = ['source', 'normalizedPostcode'];

function releaseKey(row) {
  return [
    row.source || 'ONS_POSTCODE_DIRECTORY',
    row.normalizedPostcode,
    releaseLabelOrUnspecified(row.releaseLabel),
  ].join('|');
}

function succeededLabels(runs) {
  return runs
    .filter((run) => run.status === 'SUCCEEDED')
    .map((run) => releaseLabelOrUnspecified(run.release_label));
}

function rowFromDb(row) {
  if (!row) return null;
  const provenance = typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance;
  const limitations = typeof row.limitations === 'string' ? JSON.parse(row.limitations) : row.limitations;
  return {
    id: row.id,
    source: row.source,
    dataset: row.dataset,
    recordKind: row.record_kind || 'GEOGRAPHY_CROSSWALK',
    normalizedPostcode: row.normalized_postcode,
    postcodeCompact: row.postcode_compact,
    countryCode: row.country_code,
    countryName: row.country_name,
    localAuthorityCode: row.local_authority_code,
    localAuthorityName: row.local_authority_name,
    ukhpiGeographyCode: row.ukhpi_geography_code,
    ukhpiGeographyName: row.ukhpi_geography_name,
    releaseLabel: row.release_label,
    contentFingerprint: row.content_fingerprint == null ? null : String(row.content_fingerprint).trim(),
    ingestedAt: row.ingested_at,
    provenance: provenance || null,
    limitations: limitations || GEOGRAPHY_LIMITATIONS.slice(),
  };
}

function coverageWithRows(coverage, rowCount) {
  if (coverage.state === 'EMPTY' && Number(rowCount) > 0) {
    return { ...coverage, state: 'AVAILABLE', acceptedCount: Number(rowCount) };
  }
  return coverage;
}

function lookupResult({
  input,
  parsed,
  coverage,
  matchStatus,
  geography = null,
  effectiveSelection = null,
  ambiguousReleases = [],
}) {
  return {
    input: input == null ? null : String(input),
    normalizedPostcode: parsed && parsed.ok ? parsed.normalized : null,
    matched: matchStatus === 'MATCHED',
    matchStatus,
    effectiveSelection,
    ambiguousReleases,
    geography,
    datasetCoverage: coverage,
    provenance: geography?.provenance || ONS_POSTCODE_DIRECTORY_PROVENANCE,
    limitations: GEOGRAPHY_LIMITATIONS.slice(),
    coordinates: null,
  };
}

function applyEffectiveGeography(rows, succeededReleaseLabels) {
  const selected = selectEffectiveRecords(rows, {
    identityFields: IDENTITY_FIELDS,
    succeededReleaseLabels,
  });
  if (selected.status === EFFECTIVE_SELECTION.AMBIGUOUS) {
    return {
      matchStatus: 'AMBIGUOUS',
      effectiveSelection: EFFECTIVE_SELECTION.AMBIGUOUS,
      geography: null,
      ambiguousReleases: selected.ambiguous.flatMap((group) => group.releases),
    };
  }
  const geography = selected.records[0] || null;
  if (!geography) {
    return {
      matchStatus: 'NO_MATCH',
      effectiveSelection: EFFECTIVE_SELECTION.NONE,
      geography: null,
      ambiguousReleases: [],
    };
  }
  return {
    matchStatus: 'MATCHED',
    effectiveSelection: EFFECTIVE_SELECTION.RESOLVED,
    geography,
    ambiguousReleases: [],
  };
}

function createMemoryGeographyStore() {
  const byKey = new Map();
  const runs = [];
  const api = {
    kind: 'memory',
    async latestRun() {
      return runs.length ? runs[runs.length - 1] : null;
    },
    async succeededRuns() {
      return runs.filter((run) => run.status === 'SUCCEEDED');
    },
    async datasetCoverage(options = {}) {
      return coverageWithRows(
        classifyImportCoverage({ latestRun: await this.latestRun(), ...options }),
        byKey.size
      );
    },
    async startRun(meta = {}) {
      const run = {
        id: runs.length + 1,
        status: 'STARTED',
        source: 'ONS_POSTCODE_DIRECTORY',
        dataset: 'ONS Postcode Directory',
        inserted_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        conflict_count: 0,
        rows_processed: 0,
        provenance: ONS_POSTCODE_DIRECTORY_PROVENANCE,
        ...meta,
        release_label: releaseLabelOrUnspecified(meta.release_label),
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
    async upsert(row) {
      const stored = {
        ...row,
        releaseLabel: releaseLabelOrUnspecified(row.releaseLabel),
      };
      const key = releaseKey(stored);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, stored);
        return 'inserted';
      }
      if (existing.contentFingerprint === stored.contentFingerprint) return 'duplicate';
      return 'conflict';
    },
    async findByPostcode(normalized) {
      return [...byKey.values()].filter((row) => row.normalizedPostcode === normalized);
    },
    snapshot() {
      return [...byKey.values()];
    },
    async lookupByPostcode(postcode) {
      const parsed = canonicalPostcode(postcode);
      const coverage = await this.datasetCoverage();
      if (!parsed.ok) {
        return lookupResult({ input: postcode, parsed, coverage, matchStatus: 'INVALID' });
      }
      if (coverage.state === 'NOT_IMPORTED' || coverage.state === 'ERROR' || coverage.state === 'EMPTY') {
        return lookupResult({
          input: postcode,
          parsed,
          coverage,
          matchStatus: coverage.state,
        });
      }
      const chosen = applyEffectiveGeography(
        await this.findByPostcode(parsed.normalized),
        succeededLabels(await this.succeededRuns())
      );
      return lookupResult({
        input: postcode,
        parsed,
        coverage,
        ...chosen,
      });
    },
    async historyByPostcode(postcode) {
      const parsed = canonicalPostcode(postcode);
      if (!parsed.ok) return [];
      return this.findByPostcode(parsed.normalized);
    },
  };
  return api;
}

const INSERT_CROSSWALK_SQL = `
INSERT INTO official_geography_crosswalk (
  source, dataset, record_kind, normalized_postcode, postcode_compact,
  country_code, country_name, local_authority_code, local_authority_name,
  ukhpi_geography_code, ukhpi_geography_name, release_label,
  content_fingerprint, ingested_at, provenance, limitations
) VALUES (
  $1, $2, 'GEOGRAPHY_CROSSWALK', $3, $4,
  $5, $6, $7, $8,
  $9, $10, $11,
  $12, $13, $14::jsonb, $15::jsonb
)
ON CONFLICT (source, normalized_postcode, release_label)
DO NOTHING
RETURNING id, content_fingerprint`;

function createPostgresGeographyStore(db) {
  const database = db || require('../../models/db');
  return {
    kind: 'postgres',
    async latestRun() {
      const result = await database.query(
        `SELECT * FROM official_geography_import_runs
         ORDER BY id DESC
         LIMIT 1`
      );
      return result.rows[0] || null;
    },
    async succeededRuns() {
      const result = await database.query(
        `SELECT id, release_label, status, finished_at
         FROM official_geography_import_runs
         WHERE status = 'SUCCEEDED'
         ORDER BY id ASC`
      );
      return result.rows || [];
    },
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({ latestRun: await this.latestRun(), ...options });
      const count = await database.query('SELECT COUNT(*)::int AS n FROM official_geography_crosswalk');
      return coverageWithRows(coverage, count.rows[0] ? count.rows[0].n : 0);
    },
    async startRun(meta = {}) {
      const provenance = {
        ...ONS_POSTCODE_DIRECTORY_PROVENANCE,
        releaseDate: meta.release_label || null,
        datasetVersion: meta.release_label || null,
        geographicCoverage: meta.geographic_coverage || null,
      };
      const result = await database.query(
        `INSERT INTO official_geography_import_runs
          (source, dataset, release_label, status, geographic_coverage, provenance)
         VALUES ('ONS_POSTCODE_DIRECTORY', 'ONS Postcode Directory', $1, 'STARTED', $2, $3::jsonb)
         RETURNING *`,
        [
          releaseLabelOrUnspecified(meta.release_label),
          meta.geographic_coverage || null,
          JSON.stringify(provenance),
        ]
      );
      return result.rows[0] || null;
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE official_geography_import_runs SET
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
    async upsert(row) {
      const release = releaseLabelOrUnspecified(row.releaseLabel);
      const inserted = await database.query(INSERT_CROSSWALK_SQL, [
        row.source || 'ONS_POSTCODE_DIRECTORY',
        row.dataset || 'ONS Postcode Directory',
        row.normalizedPostcode,
        row.postcodeCompact,
        row.countryCode || null,
        row.countryName || null,
        row.localAuthorityCode || null,
        row.localAuthorityName || null,
        row.ukhpiGeographyCode || null,
        row.ukhpiGeographyName || null,
        release,
        row.contentFingerprint,
        row.ingestedAt || new Date().toISOString(),
        JSON.stringify(row.provenance || ONS_POSTCODE_DIRECTORY_PROVENANCE),
        JSON.stringify(row.limitations || GEOGRAPHY_LIMITATIONS),
      ]);
      if ((inserted.rows || []).length) return 'inserted';
      const existing = await database.query(
        `SELECT content_fingerprint
         FROM official_geography_crosswalk
         WHERE source = $1 AND normalized_postcode = $2 AND release_label = $3`,
        [row.source || 'ONS_POSTCODE_DIRECTORY', row.normalizedPostcode, release]
      );
      const stored = existing.rows[0];
      if (stored && String(stored.content_fingerprint).trim() === String(row.contentFingerprint).trim()) {
        return 'duplicate';
      }
      return 'conflict';
    },
    async findByPostcode(normalized) {
      const result = await database.query(
        `SELECT *
         FROM official_geography_crosswalk
         WHERE normalized_postcode = $1
         ORDER BY release_label ASC, id ASC`,
        [normalized]
      );
      return (result.rows || []).map(rowFromDb);
    },
    async lookupByPostcode(postcode) {
      const parsed = canonicalPostcode(postcode);
      const coverage = await this.datasetCoverage();
      if (!parsed.ok) {
        return lookupResult({ input: postcode, parsed, coverage, matchStatus: 'INVALID' });
      }
      if (coverage.state === 'NOT_IMPORTED' || coverage.state === 'ERROR' || coverage.state === 'EMPTY') {
        return lookupResult({ input: postcode, parsed, coverage, matchStatus: coverage.state });
      }
      const chosen = applyEffectiveGeography(
        await this.findByPostcode(parsed.normalized),
        succeededLabels(await this.succeededRuns())
      );
      return lookupResult({
        input: postcode,
        parsed,
        coverage,
        ...chosen,
      });
    },
    async historyByPostcode(postcode) {
      const parsed = canonicalPostcode(postcode);
      if (!parsed.ok) return [];
      return this.findByPostcode(parsed.normalized);
    },
  };
}

module.exports = {
  createMemoryGeographyStore,
  createPostgresGeographyStore,
  INSERT_CROSSWALK_SQL,
  releaseKey,
};
