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

function createMemoryBrownfieldLandStore() {
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
    async datasetCoverage(options = {}) {
      const coverage = classifyImportCoverage({
        latestRun: await this.latestRun(),
        ...options,
      });
      if (coverage.state !== 'EMPTY') return coverage;
      const count = await database.query('SELECT COUNT(*)::int AS n FROM brownfield_land_observations');
      const n = count.rows[0] ? Number(count.rows[0].n) : 0;
      return n > 0 ? { ...coverage, state: 'AVAILABLE', acceptedCount: n } : coverage;
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
      const release = releaseLabelOrUnspecified(observation.releaseLabel || BROWNFIELD_RELEASE_LABEL);
      const existing = await database.query(
        `SELECT content_fingerprint FROM brownfield_land_observations
         WHERE source = $1 AND source_entity_id = $2 AND release_label = $3
           AND content_fingerprint = $4`,
        [
          observation.source || BROWNFIELD_SOURCE,
          observation.sourceEntityId,
          release,
          observation.contentFingerprint,
        ]
      );
      if (existing.rows[0]) return 'duplicate';
      await database.query(
        `INSERT INTO brownfield_land_observations (
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
        ON CONFLICT (source, source_entity_id, release_label, content_fingerprint) DO NOTHING`,
        [
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
        ]
      );
      return 'inserted';
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
  createMemoryBrownfieldLandStore,
  createPostgresBrownfieldLandStore,
  BROWNFIELD_SELECTION,
};
