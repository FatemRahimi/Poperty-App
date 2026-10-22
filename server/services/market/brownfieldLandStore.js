/**
 * Brownfield land observation store.
 * Retains revisions; never silently overwrites changed fingerprints.
 * Effective selection uses source entry-date only (see brownfieldLandRevisionSelection).
 */

const {
  BROWNFIELD_SOURCE,
  BROWNFIELD_DATASET_LABEL,
  BROWNFIELD_SOURCE_PRODUCT,
  BROWNFIELD_RELEASE_LABEL,
  BROWNFIELD_PROVENANCE,
  BROWNFIELD_GEOGRAPHIC_SCOPE,
} = require('../../architecture/officialBrownfieldLandDataset');
const { classifyImportCoverage } = require('../../architecture/officialMarketDataset');
const { releaseLabelOrUnspecified } = require('./releaseSelection');
const {
  BROWNFIELD_SELECTION,
  selectEffectiveBrownfieldObservation,
  compareRevisions,
} = require('./brownfieldLandRevisionSelection');

function observationKey(row) {
  return [
    row.source || BROWNFIELD_SOURCE,
    String(row.sourceEntityId),
    releaseLabelOrUnspecified(row.releaseLabel || BROWNFIELD_RELEASE_LABEL),
    String(row.contentFingerprint || ''),
  ].join('|');
}

function compareObservations(a, b) {
  const idDiff = Number(a.sourceEntityId) - Number(b.sourceEntityId);
  if (idDiff !== 0) return idDiff;
  const rev = compareRevisions(a, b);
  if (rev !== 0) return rev;
  return String(a.reference || '').localeCompare(String(b.reference || ''));
}

function groupByEntityId(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const id = Number(row.sourceEntityId);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  });
  return groups;
}

function effectiveFromRows(rows) {
  const revisions = rows.slice().sort(compareRevisions);
  const selection = selectEffectiveBrownfieldObservation(revisions);
  return {
    revisions,
    selection,
    effectiveObservation: selection.effectiveObservation,
  };
}

/** rowCount from INSERT ... ON CONFLICT DO NOTHING RETURNING. Zero rows is not an insert. */
function classifyObservationInsert(rowCount) {
  return Number(rowCount) > 0 ? 'inserted' : 'duplicate';
}

/**
 * Usable evidence follows the latest SUCCEEDED run.
 * A newer STARTED or FAILED attempt stays visible and does not hide that run.
 */
function describeBrownfieldCoverage({
  latestAttempt = null,
  latestSuccess = null,
  observationCount = 0,
  options = {},
} = {}) {
  const coverage = latestSuccess
    ? classifyImportCoverage({ latestRun: latestSuccess, ...options })
    : classifyImportCoverage({ latestRun: latestAttempt, ...options });
  const withRows = latestSuccess && coverage.state === 'EMPTY' && observationCount > 0
    ? { ...coverage, state: 'AVAILABLE', acceptedCount: observationCount }
    : coverage;
  const attemptStatus = latestAttempt ? String(latestAttempt.status || '') : null;
  return {
    ...withRows,
    latestAttemptStatus: attemptStatus,
    latestAttemptId: latestAttempt ? latestAttempt.id : null,
    latestSuccessfulRunId: latestSuccess ? latestSuccess.id : null,
    failureReason: latestAttempt && attemptStatus !== 'SUCCEEDED'
      ? (latestAttempt.failure_reason || latestAttempt.failureReason || null)
      : null,
  };
}

function createMemoryBrownfieldLandStore() {
  const byKey = new Map();
  const runs = [];
  return {
    kind: 'memory',
    async latestRun() {
      return runs.length ? runs[runs.length - 1] : null;
    },
    async latestSuccessfulRun() {
      for (let index = runs.length - 1; index >= 0; index -= 1) {
        if (String(runs[index].status || '') === 'SUCCEEDED') return runs[index];
      }
      return null;
    },
    async datasetCoverage(options = {}) {
      return describeBrownfieldCoverage({
        latestAttempt: await this.latestRun(),
        latestSuccess: await this.latestSuccessfulRun(),
        observationCount: byKey.size,
        options,
      });
    },
    async startRun(meta = {}) {
      const run = {
        id: runs.length + 1,
        status: 'STARTED',
        source: BROWNFIELD_SOURCE,
        dataset: BROWNFIELD_DATASET_LABEL,
        source_product: BROWNFIELD_SOURCE_PRODUCT,
        inserted_count: 0,
        updated_count: 0,
        unchanged_count: 0,
        rejected_count: 0,
        conflict_count: 0,
        rows_processed: 0,
        provenance: BROWNFIELD_PROVENANCE,
        geographic_coverage: BROWNFIELD_GEOGRAPHIC_SCOPE,
        retrieved_at: meta.retrieved_at || meta.retrievedAt || null,
        ...meta,
        release_label: releaseLabelOrUnspecified(meta.release_label || BROWNFIELD_RELEASE_LABEL),
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
        releaseLabel: releaseLabelOrUnspecified(observation.releaseLabel || BROWNFIELD_RELEASE_LABEL),
      };
      if (!stored.contentFingerprint) return 'rejected';
      const key = observationKey(stored);
      if (byKey.has(key)) return 'duplicate';
      byKey.set(key, stored);
      return 'inserted';
    },
    async importAcceptedBatch({
      rows = [],
      rejectedCount = 0,
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
      retrievedAt = null,
      failAtIndex = null,
    } = {}) {
      const snapshot = new Map(byKey);
      const started = Date.now();
      const run = await this.startRun({
        release_label: releaseLabel,
        retrieved_at: retrievedAt,
      });
      const stats = {
        rows_processed: 0,
        inserted_count: 0,
        unchanged_count: 0,
        rejected_count: rejectedCount,
        conflict_count: 0,
      };
      try {
        for (let index = 0; index < rows.length; index += 1) {
          if (failAtIndex != null && index === failAtIndex) {
            throw new Error('injected_database_failure');
          }
          const outcome = await this.upsert(rows[index]);
          if (outcome === 'rejected') {
            throw new Error('brownfield_observation_missing_fingerprint');
          }
          stats.rows_processed += 1;
          if (outcome === 'inserted') stats.inserted_count += 1;
          else stats.unchanged_count += 1;
        }
        await this.finishRun(run.id, {
          status: 'SUCCEEDED',
          ...stats,
          duration_ms: Date.now() - started,
        });
        return { runId: run.id, status: 'SUCCEEDED', ...stats };
      } catch (error) {
        byKey.clear();
        snapshot.forEach((value, key) => byKey.set(key, value));
        await this.finishRun(run.id, {
          status: 'FAILED',
          failure_reason: error.message,
          rows_processed: 0,
          inserted_count: 0,
          unchanged_count: 0,
          rejected_count: rejectedCount,
          conflict_count: 0,
          duration_ms: Date.now() - started,
        });
        return {
          runId: run.id,
          status: 'FAILED',
          failure_reason: error.message,
          rows_processed: 0,
          inserted_count: 0,
          unchanged_count: 0,
          rejected_count: rejectedCount,
          conflict_count: 0,
        };
      }
    },
    snapshot() {
      return [...byKey.values()].sort(compareObservations);
    },
    async listRevisionsBySourceEntityId(sourceEntityId, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (sourceEntityId == null || sourceEntityId === '') {
        return {
          revisions: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
          selection: selectEffectiveBrownfieldObservation([]),
        };
      }
      const id = Number(sourceEntityId);
      const release = releaseLabelOrUnspecified(releaseLabel);
      const revisions = [...byKey.values()].filter((row) => (
        Number(row.sourceEntityId) === id
        && releaseLabelOrUnspecified(row.releaseLabel) === release
      )).sort(compareRevisions);
      const selection = selectEffectiveBrownfieldObservation(revisions);
      return {
        revisions,
        datasetCoverage,
        matched: revisions.length > 0,
        matchStatus: revisions.length
          ? 'MATCHED'
          : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
        selection,
      };
    },
    async queryBySourceEntityId(sourceEntityId, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const listed = await this.listRevisionsBySourceEntityId(sourceEntityId, { releaseLabel });
      const effective = listed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED
        ? [listed.selection.effectiveObservation]
        : [];
      return {
        observations: effective,
        revisions: listed.revisions,
        selection: listed.selection,
        datasetCoverage: listed.datasetCoverage,
        matched: listed.matched,
        matchStatus: listed.matchStatus,
        effectiveResolved: listed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED,
      };
    },
    async queryByOrganisationEntity(organisationEntity, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (organisationEntity == null || organisationEntity === '') {
        return {
          observations: [],
          revisions: [],
          selections: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
        };
      }
      const org = Number(organisationEntity);
      const release = releaseLabelOrUnspecified(releaseLabel);
      const rows = [...byKey.values()].filter((row) => (
        Number(row.organisationEntity) === org
        && releaseLabelOrUnspecified(row.releaseLabel) === release
      ));
      const groups = groupByEntityId(rows);
      const observations = [];
      const revisions = [];
      const selections = [];
      [...groups.keys()].sort((a, b) => a - b).forEach((id) => {
        const packed = effectiveFromRows(groups.get(id));
        revisions.push(...packed.revisions);
        selections.push({
          sourceEntityId: id,
          ...packed.selection,
        });
        if (packed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED) {
          observations.push(packed.effectiveObservation);
        }
      });
      observations.sort(compareObservations);
      return {
        observations,
        revisions: revisions.sort(compareObservations),
        selections,
        datasetCoverage,
        matched: rows.length > 0,
        matchStatus: rows.length
          ? 'MATCHED'
          : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
    async listObservations({
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      const release = releaseLabelOrUnspecified(releaseLabel);
      const rows = [...byKey.values()]
        .filter((row) => releaseLabelOrUnspecified(row.releaseLabel) === release);
      const groups = groupByEntityId(rows);
      const observations = [];
      const selections = [];
      [...groups.keys()].sort((a, b) => a - b).forEach((id) => {
        const packed = effectiveFromRows(groups.get(id));
        selections.push({
          sourceEntityId: id,
          ...packed.selection,
        });
        if (packed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED) {
          observations.push(packed.effectiveObservation);
        }
      });
      return {
        observations: observations.sort(compareObservations),
        revisions: rows.sort(compareObservations),
        selections,
        datasetCoverage,
      };
    },
  };
}

function mapPostgresRow(row) {
  return {
    source: row.source,
    dataset: row.dataset,
    datasetLabel: row.dataset_label || row.dataset,
    sourceProduct: row.source_product,
    recordKind: row.record_kind,
    geographyType: row.geography_type,
    geographicScope: row.geographic_scope,
    sourceEntityId: row.source_entity_id == null ? null : Number(row.source_entity_id),
    organisationEntity: row.organisation_entity == null ? null : Number(row.organisation_entity),
    reference: row.reference,
    name: row.name,
    siteAddress: row.site_address,
    ownershipStatus: row.ownership_status,
    planningPermissionStatus: row.planning_permission_status,
    planningPermissionType: row.planning_permission_type,
    planningPermissionDate: row.planning_permission_date
      ? String(row.planning_permission_date).slice(0, 10)
      : null,
    minimumNetDwellings: row.minimum_net_dwellings == null ? null : Number(row.minimum_net_dwellings),
    maximumNetDwellings: row.maximum_net_dwellings == null ? null : Number(row.maximum_net_dwellings),
    dwellingNature: row.dwelling_nature,
    deliverable: row.deliverable,
    hectares: row.hectares,
    pointWkt: row.point_wkt,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    geometryWkt: row.geometry_wkt,
    coordinateReferenceSystem: row.coordinate_reference_system,
    entryDate: row.entry_date ? String(row.entry_date).slice(0, 10) : null,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    notes: row.notes,
    sitePlanUrl: row.site_plan_url,
    releaseLabel: row.release_label,
    contentFingerprint: row.content_fingerprint,
    retrievedAt: row.retrieved_at,
    ingestedAt: row.ingested_at,
    provenance: row.provenance,
    limitations: row.limitations,
  };
}

const OBSERVATION_INSERT_SQL = `INSERT INTO brownfield_land_observations (
          source, dataset, dataset_label, source_product, record_kind,
          geography_type, geographic_scope, source_entity_id, organisation_entity,
          reference, name, site_address, ownership_status, planning_permission_status,
          planning_permission_type, planning_permission_date, minimum_net_dwellings,
          maximum_net_dwellings, dwelling_nature, deliverable, hectares,
          point_wkt, latitude, longitude, geometry_wkt, coordinate_reference_system,
          entry_date, start_date, end_date, notes, site_plan_url, release_label,
          content_fingerprint, retrieved_at, provenance, limitations
        ) VALUES (
          $1,$2,$3,$4,'OFFICIAL_OBSERVATION',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          $15::date,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::date,$27::date,$28::date,
          $29,$30,$31,$32,$33,$34::jsonb,$35::jsonb
        )
        ON CONFLICT (source, source_entity_id, release_label, content_fingerprint) DO NOTHING
        RETURNING id`;

function observationInsertParams(observation, release) {
  return [
    observation.source || BROWNFIELD_SOURCE,
    observation.dataset || 'brownfield-land',
    observation.datasetLabel || BROWNFIELD_DATASET_LABEL,
    observation.sourceProduct || BROWNFIELD_SOURCE_PRODUCT,
    observation.geographyType || 'SITE',
    observation.geographicScope || BROWNFIELD_GEOGRAPHIC_SCOPE,
    observation.sourceEntityId,
    observation.organisationEntity,
    observation.reference,
    observation.name,
    observation.siteAddress,
    observation.ownershipStatus,
    observation.planningPermissionStatus,
    observation.planningPermissionType,
    observation.planningPermissionDate,
    observation.minimumNetDwellings,
    observation.maximumNetDwellings,
    observation.dwellingNature,
    observation.deliverable,
    observation.hectares,
    observation.pointWkt,
    observation.latitude,
    observation.longitude,
    observation.geometryWkt,
    observation.coordinateReferenceSystem,
    observation.entryDate,
    observation.startDate,
    observation.endDate,
    observation.notes,
    observation.sitePlanUrl,
    release,
    observation.contentFingerprint,
    observation.retrievedAt || null,
    JSON.stringify(observation.provenance || BROWNFIELD_PROVENANCE),
    JSON.stringify(observation.limitations || []),
  ];
}

async function insertBrownfieldObservation(queryable, observation) {
  const release = releaseLabelOrUnspecified(observation.releaseLabel || BROWNFIELD_RELEASE_LABEL);
  if (!observation.contentFingerprint) {
    throw new Error('brownfield_observation_missing_fingerprint');
  }
  const result = await queryable.query(
    OBSERVATION_INSERT_SQL,
    observationInsertParams(observation, release)
  );
  return classifyObservationInsert(result.rowCount);
}

function createPostgresBrownfieldLandStore(db = null) {
  const database = db || (() => {
    // eslint-disable-next-line global-require
    return require('../../models/db');
  })();

  return {
    kind: 'postgres',
    async latestRun() {
      const result = await database.query(
        'SELECT * FROM brownfield_land_import_runs ORDER BY id DESC LIMIT 1'
      );
      return result.rows[0] || null;
    },
    async latestSuccessfulRun() {
      const result = await database.query(
        `SELECT * FROM brownfield_land_import_runs
         WHERE status = 'SUCCEEDED'
         ORDER BY id DESC
         LIMIT 1`
      );
      return result.rows[0] || null;
    },
    async datasetCoverage(options = {}) {
      const count = await database.query('SELECT COUNT(*)::int AS n FROM brownfield_land_observations');
      const n = count.rows[0] ? Number(count.rows[0].n) : 0;
      return describeBrownfieldCoverage({
        latestAttempt: await this.latestRun(),
        latestSuccess: await this.latestSuccessfulRun(),
        observationCount: n,
        options,
      });
    },
    async startRun(meta = {}) {
      const result = await database.query(
        `INSERT INTO brownfield_land_import_runs
          (source, dataset, source_product, release_label, status, provenance, geographic_coverage, retrieved_at)
         VALUES ($1, $2, $3, $4, 'STARTED', $5::jsonb, $6, $7)
         RETURNING *`,
        [
          BROWNFIELD_SOURCE,
          BROWNFIELD_DATASET_LABEL,
          BROWNFIELD_SOURCE_PRODUCT,
          releaseLabelOrUnspecified(meta.release_label || BROWNFIELD_RELEASE_LABEL),
          JSON.stringify(meta.provenance || BROWNFIELD_PROVENANCE),
          meta.geographic_coverage || BROWNFIELD_GEOGRAPHIC_SCOPE,
          meta.retrieved_at || meta.retrievedAt || null,
        ]
      );
      return result.rows[0];
    },
    async finishRun(id, stats = {}) {
      const result = await database.query(
        `UPDATE brownfield_land_import_runs SET
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
      return insertBrownfieldObservation(database, observation);
    },
    async importAcceptedBatch({
      rows = [],
      rejectedCount = 0,
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
      retrievedAt = null,
      failAtIndex = null,
    } = {}) {
      if (!database || typeof database.connect !== 'function') {
        throw new Error('brownfield_postgres_import_requires_connect');
      }
      const client = await database.connect();
      const started = Date.now();
      const release = releaseLabelOrUnspecified(releaseLabel);
      try {
        await client.query('BEGIN');
        const startedRun = await client.query(
          `INSERT INTO brownfield_land_import_runs
            (source, dataset, source_product, release_label, status, provenance, geographic_coverage, retrieved_at)
           VALUES ($1, $2, $3, $4, 'STARTED', $5::jsonb, $6, $7)
           RETURNING *`,
          [
            BROWNFIELD_SOURCE,
            BROWNFIELD_DATASET_LABEL,
            BROWNFIELD_SOURCE_PRODUCT,
            release,
            JSON.stringify(BROWNFIELD_PROVENANCE),
            BROWNFIELD_GEOGRAPHIC_SCOPE,
            retrievedAt || null,
          ]
        );
        const runId = startedRun.rows[0].id;
        const stats = {
          rows_processed: 0,
          inserted_count: 0,
          unchanged_count: 0,
          rejected_count: rejectedCount,
          conflict_count: 0,
        };
        for (let index = 0; index < rows.length; index += 1) {
          if (failAtIndex != null && index === failAtIndex) {
            throw new Error('injected_database_failure');
          }
          const outcome = await insertBrownfieldObservation(client, rows[index]);
          stats.rows_processed += 1;
          if (outcome === 'inserted') stats.inserted_count += 1;
          else stats.unchanged_count += 1;
        }
        await client.query(
          `UPDATE brownfield_land_import_runs SET
            status = 'SUCCEEDED',
            rows_processed = $2,
            inserted_count = $3,
            unchanged_count = $4,
            rejected_count = $5,
            conflict_count = 0,
            failure_reason = NULL,
            finished_at = CURRENT_TIMESTAMP,
            duration_ms = $6
           WHERE id = $1`,
          [
            runId,
            stats.rows_processed,
            stats.inserted_count,
            stats.unchanged_count,
            stats.rejected_count,
            Date.now() - started,
          ]
        );
        await client.query('COMMIT');
        return { runId, status: 'SUCCEEDED', ...stats };
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* the transaction is already closed */
        }
        const failed = await database.query(
          `INSERT INTO brownfield_land_import_runs
            (source, dataset, source_product, release_label, status, provenance, geographic_coverage,
             retrieved_at, failure_reason, rows_processed, inserted_count, unchanged_count,
             rejected_count, conflict_count, finished_at, duration_ms)
           VALUES ($1, $2, $3, $4, 'FAILED', $5::jsonb, $6, $7, $8, 0, 0, 0, $9, 0, CURRENT_TIMESTAMP, $10)
           RETURNING id`,
          [
            BROWNFIELD_SOURCE,
            BROWNFIELD_DATASET_LABEL,
            BROWNFIELD_SOURCE_PRODUCT,
            release,
            JSON.stringify(BROWNFIELD_PROVENANCE),
            BROWNFIELD_GEOGRAPHIC_SCOPE,
            retrievedAt || null,
            error.message,
            rejectedCount,
            Date.now() - started,
          ]
        );
        return {
          runId: failed.rows[0] ? failed.rows[0].id : null,
          status: 'FAILED',
          failure_reason: error.message,
          rows_processed: 0,
          inserted_count: 0,
          unchanged_count: 0,
          rejected_count: rejectedCount,
          conflict_count: 0,
        };
      } finally {
        client.release();
      }
    },
    async listRevisionsBySourceEntityId(sourceEntityId, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (sourceEntityId == null || sourceEntityId === '') {
        return {
          revisions: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
          selection: selectEffectiveBrownfieldObservation([]),
        };
      }
      const result = await database.query(
        `SELECT * FROM brownfield_land_observations
         WHERE source_entity_id = $1 AND release_label = $2
         ORDER BY entry_date NULLS LAST, content_fingerprint`,
        [Number(sourceEntityId), releaseLabelOrUnspecified(releaseLabel)]
      );
      const revisions = result.rows.map(mapPostgresRow).sort(compareRevisions);
      const selection = selectEffectiveBrownfieldObservation(revisions);
      return {
        revisions,
        datasetCoverage,
        matched: revisions.length > 0,
        matchStatus: revisions.length
          ? 'MATCHED'
          : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
        selection,
      };
    },
    async queryBySourceEntityId(sourceEntityId, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const listed = await this.listRevisionsBySourceEntityId(sourceEntityId, { releaseLabel });
      const effective = listed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED
        ? [listed.selection.effectiveObservation]
        : [];
      return {
        observations: effective,
        revisions: listed.revisions,
        selection: listed.selection,
        datasetCoverage: listed.datasetCoverage,
        matched: listed.matched,
        matchStatus: listed.matchStatus,
        effectiveResolved: listed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED,
      };
    },
    async queryByOrganisationEntity(organisationEntity, {
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      if (organisationEntity == null || organisationEntity === '') {
        return {
          observations: [],
          revisions: [],
          selections: [],
          datasetCoverage,
          matched: false,
          matchStatus: 'INVALID_INPUT',
        };
      }
      const result = await database.query(
        `SELECT * FROM brownfield_land_observations
         WHERE organisation_entity = $1 AND release_label = $2
         ORDER BY source_entity_id, entry_date NULLS LAST, content_fingerprint`,
        [Number(organisationEntity), releaseLabelOrUnspecified(releaseLabel)]
      );
      const rows = result.rows.map(mapPostgresRow);
      const groups = groupByEntityId(rows);
      const observations = [];
      const revisions = [];
      const selections = [];
      [...groups.keys()].sort((a, b) => a - b).forEach((id) => {
        const packed = effectiveFromRows(groups.get(id));
        revisions.push(...packed.revisions);
        selections.push({
          sourceEntityId: id,
          ...packed.selection,
        });
        if (packed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED) {
          observations.push(packed.effectiveObservation);
        }
      });
      return {
        observations: observations.sort(compareObservations),
        revisions: revisions.sort(compareObservations),
        selections,
        datasetCoverage,
        matched: rows.length > 0,
        matchStatus: rows.length
          ? 'MATCHED'
          : (datasetCoverage.state === 'NOT_IMPORTED' ? 'NOT_IMPORTED' : 'NO_MATCH'),
      };
    },
    async listObservations({
      releaseLabel = BROWNFIELD_RELEASE_LABEL,
    } = {}) {
      const datasetCoverage = await this.datasetCoverage();
      const result = await database.query(
        `SELECT * FROM brownfield_land_observations
         WHERE release_label = $1
         ORDER BY source_entity_id, entry_date NULLS LAST, content_fingerprint`,
        [releaseLabelOrUnspecified(releaseLabel)]
      );
      const rows = result.rows.map(mapPostgresRow);
      const groups = groupByEntityId(rows);
      const observations = [];
      const selections = [];
      [...groups.keys()].sort((a, b) => a - b).forEach((id) => {
        const packed = effectiveFromRows(groups.get(id));
        selections.push({
          sourceEntityId: id,
          ...packed.selection,
        });
        if (packed.selection.selectionStatus === BROWNFIELD_SELECTION.RESOLVED) {
          observations.push(packed.effectiveObservation);
        }
      });
      return {
        observations: observations.sort(compareObservations),
        revisions: rows.sort(compareObservations),
        selections,
        datasetCoverage,
      };
    },
  };
}

module.exports = {
  observationKey,
  classifyObservationInsert,
  createMemoryBrownfieldLandStore,
  createPostgresBrownfieldLandStore,
  BROWNFIELD_SELECTION,
};
