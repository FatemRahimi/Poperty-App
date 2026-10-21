/**
 * Brownfield coverage store.
 * Latest successful snapshot per family replaces that family's rows.
 * A failed retrieval does not delete the previous snapshot; callers must
 * honour the latest run status and must not treat a failure as absence.
 */

const {
  COVERAGE_SOURCE,
  COVERAGE_FAMILY,
  COVERAGE_RUN_STATUS,
  BROWNFIELD_COVERAGE_STATE,
  LPA_DATASET,
  LPA_DATASET_LABEL,
  LPA_SOURCE_URL,
  LPA_IDENTITY_PROVENANCE,
  PROVIDER_INDEX_DATASET,
  PROVIDER_INDEX_URL,
  PROVIDER_INDEX_PROVENANCE,
  ORGANISATION_ENTITY_URL_PREFIX,
  ORGANISATION_RECORD_PROVENANCE,
  COVERAGE_LIMITATIONS,
} = require('../../architecture/officialBrownfieldCoverage');

function lpaMap(rows) {
  const byReference = new Map();
  (rows || []).forEach((row) => {
    byReference.set(row.reference, row);
  });
  return byReference;
}

function applyOrganisationMapping(organisation, byReference) {
  const code = organisation.localPlanningAuthorityCode || null;
  const match = code ? byReference.get(code) : null;
  if (code && match && match.reference === code) {
    return {
      ...organisation,
      mappingStatus: BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED,
      matchedLpaReference: match.reference,
      matchedLpaEntityId: match.sourceEntityId,
    };
  }
  return {
    ...organisation,
    localPlanningAuthorityCode: code,
    mappingStatus: BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_UNMAPPED,
    matchedLpaReference: null,
    matchedLpaEntityId: null,
  };
}

function remapOrganisations(organisations, lpaRows) {
  const byReference = lpaMap(lpaRows);
  const next = new Map();
  organisations.forEach((row, id) => {
    next.set(id, applyOrganisationMapping(row, byReference));
  });
  return next;
}

function createMemoryBrownfieldCoverageStore() {
  const runs = [];
  let lpas = new Map();
  let providers = new Map();
  let organisations = new Map();

  function latestRunSync(family) {
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      if (runs[index].source_family === family) return runs[index];
    }
    return null;
  }

  function pushRun(family, status, meta = {}) {
    const run = {
      id: runs.length + 1,
      source: COVERAGE_SOURCE,
      source_family: family,
      status,
      source_url: meta.sourceUrl || meta.source_url || null,
      retrieved_at: meta.retrievedAt || meta.retrieved_at || null,
      failure_reason: meta.failureReason || meta.failure_reason || null,
      rows_accepted: meta.rowsAccepted == null ? 0 : meta.rowsAccepted,
      rows_rejected: meta.rowsRejected == null ? 0 : meta.rowsRejected,
      provenance: meta.provenance || null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
    runs.push(run);
    return run;
  }

  return {
    kind: 'memory',
    async latestRun(family) {
      return latestRunSync(family);
    },
    async recordRun(family, status, meta = {}) {
      return pushRun(family, status, meta);
    },
    async replaceLpaIdentities(rows, meta = {}) {
      const next = new Map();
      rows.forEach((row) => {
        next.set(row.reference, {
          ...row,
          source: COVERAGE_SOURCE,
          dataset: LPA_DATASET,
          datasetLabel: LPA_DATASET_LABEL,
          sourceUrl: meta.sourceUrl || LPA_SOURCE_URL,
          retrievedAt: meta.retrievedAt || null,
          provenance: meta.provenance || LPA_IDENTITY_PROVENANCE,
          limitations: COVERAGE_LIMITATIONS.slice(),
        });
      });
      lpas = next;
      organisations = remapOrganisations(organisations, [...lpas.values()]);
      return pushRun(COVERAGE_FAMILY.LPA_IDENTITY, COVERAGE_RUN_STATUS.SUCCEEDED, {
        ...meta,
        rowsAccepted: rows.length,
        provenance: meta.provenance || LPA_IDENTITY_PROVENANCE,
      });
    },
    async replaceProviderIndex(rows, meta = {}) {
      const next = new Map();
      rows.forEach((row) => {
        next.set(row.organisationEntity, {
          ...row,
          source: COVERAGE_SOURCE,
          dataset: PROVIDER_INDEX_DATASET,
          sourceUrl: meta.sourceUrl || PROVIDER_INDEX_URL,
          retrievedAt: meta.retrievedAt || null,
          provenance: meta.provenance || PROVIDER_INDEX_PROVENANCE,
          limitations: COVERAGE_LIMITATIONS.slice(),
        });
      });
      providers = next;
      return pushRun(COVERAGE_FAMILY.PROVIDER_INDEX, COVERAGE_RUN_STATUS.SUCCEEDED, {
        ...meta,
        rowsAccepted: rows.length,
        provenance: meta.provenance || PROVIDER_INDEX_PROVENANCE,
      });
    },
    async replaceOrganisations(rows, meta = {}) {
      const byReference = lpaMap([...lpas.values()]);
      const next = new Map();
      rows.forEach((row) => {
        const mapped = applyOrganisationMapping(row, byReference);
        next.set(row.organisationEntity, {
          ...mapped,
          source: COVERAGE_SOURCE,
          sourceUrl: meta.sourceUrl || `${ORGANISATION_ENTITY_URL_PREFIX}${row.organisationEntity}`,
          retrievedAt: meta.retrievedAt || null,
          provenance: meta.provenance || ORGANISATION_RECORD_PROVENANCE,
          limitations: COVERAGE_LIMITATIONS.slice(),
        });
      });
      organisations = next;
      return pushRun(COVERAGE_FAMILY.ORGANISATION_RECORD, COVERAGE_RUN_STATUS.SUCCEEDED, {
        ...meta,
        rowsAccepted: rows.length,
        provenance: meta.provenance || ORGANISATION_RECORD_PROVENANCE,
      });
    },
    async getLpaByReference(reference) {
      return lpas.get(reference) || null;
    },
    async getProvider(organisationEntity) {
      return providers.get(Number(organisationEntity)) || null;
    },
    async getOrganisation(organisationEntity) {
      return organisations.get(Number(organisationEntity)) || null;
    },
    async listOrganisationsMappedToReference(reference) {
      return [...organisations.values()]
        .filter((row) => row.mappingStatus === BROWNFIELD_COVERAGE_STATE.ORGANISATION_LPA_MAPPED
          && row.matchedLpaReference === reference)
        .sort((a, b) => a.organisationEntity - b.organisationEntity);
    },
  };
}

function mapLpaRow(row) {
  if (!row) return null;
  return {
    sourceEntityId: Number(row.source_entity_id),
    name: row.name,
    reference: row.reference,
    entryDate: row.entry_date ? String(row.entry_date).slice(0, 10) : null,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    source: row.source,
    dataset: row.dataset,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    provenance: row.provenance,
    limitations: row.limitations,
  };
}

function mapProviderRow(row) {
  if (!row) return null;
  return {
    organisationEntity: Number(row.organisation_entity),
    name: row.organisation_name,
    source: row.source,
    dataset: row.dataset,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    provenance: row.provenance,
    limitations: row.limitations,
  };
}

function mapOrganisationRow(row) {
  if (!row) return null;
  return {
    organisationEntity: Number(row.organisation_entity),
    name: row.organisation_name,
    localPlanningAuthorityCode: row.local_planning_authority_code,
    statisticalGeography: row.statistical_geography,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    mappingStatus: row.mapping_status,
    matchedLpaReference: row.matched_lpa_reference,
    matchedLpaEntityId: row.matched_lpa_entity_id == null ? null : Number(row.matched_lpa_entity_id),
    source: row.source,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    provenance: row.provenance,
    limitations: row.limitations,
  };
}

async function withTransaction(database, fn) {
  if (!database || typeof database.connect !== 'function') {
    throw new Error('brownfield_coverage_postgres_requires_connect');
  }
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback already failed */
    }
    throw error;
  } finally {
    client.release();
  }
}

function createPostgresBrownfieldCoverageStore(db = null) {
  const database = db || (() => {
    // eslint-disable-next-line global-require
    return require('../../models/db');
  })();

  async function insertRun(client, family, status, meta = {}) {
    const result = await client.query(
      `INSERT INTO brownfield_coverage_runs
        (source, source_family, status, source_url, retrieved_at, failure_reason,
         rows_accepted, rows_rejected, provenance, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        COVERAGE_SOURCE,
        family,
        status,
        meta.sourceUrl || meta.source_url || null,
        meta.retrievedAt || meta.retrieved_at || null,
        meta.failureReason || meta.failure_reason || null,
        meta.rowsAccepted == null ? 0 : meta.rowsAccepted,
        meta.rowsRejected == null ? 0 : meta.rowsRejected,
        JSON.stringify(meta.provenance || {}),
      ]
    );
    return result.rows[0];
  }

  return {
    kind: 'postgres',
    async latestRun(family) {
      const result = await database.query(
        `SELECT * FROM brownfield_coverage_runs
         WHERE source_family = $1
         ORDER BY id DESC
         LIMIT 1`,
        [family]
      );
      return result.rows[0] || null;
    },
    async recordRun(family, status, meta = {}) {
      const result = await database.query(
        `INSERT INTO brownfield_coverage_runs
          (source, source_family, status, source_url, retrieved_at, failure_reason,
           rows_accepted, rows_rejected, provenance, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          COVERAGE_SOURCE,
          family,
          status,
          meta.sourceUrl || null,
          meta.retrievedAt || null,
          meta.failureReason || null,
          meta.rowsAccepted == null ? 0 : meta.rowsAccepted,
          meta.rowsRejected == null ? 0 : meta.rowsRejected,
          JSON.stringify(meta.provenance || {}),
        ]
      );
      return result.rows[0];
    },
    async replaceLpaIdentities(rows, meta = {}) {
      return withTransaction(database, async (client) => {
        await client.query('DELETE FROM brownfield_lpa_identities WHERE source = $1', [COVERAGE_SOURCE]);
        for (const row of rows) {
          await client.query(
            `INSERT INTO brownfield_lpa_identities
              (source, dataset, source_entity_id, name, reference, entry_date, start_date, end_date,
               source_url, retrieved_at, provenance, limitations)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::date, $9, $10, $11::jsonb, $12::jsonb)`,
            [
              COVERAGE_SOURCE,
              LPA_DATASET,
              row.sourceEntityId,
              row.name,
              row.reference,
              row.entryDate,
              row.startDate,
              row.endDate,
              meta.sourceUrl || LPA_SOURCE_URL,
              meta.retrievedAt || null,
              JSON.stringify(meta.provenance || LPA_IDENTITY_PROVENANCE),
              JSON.stringify(COVERAGE_LIMITATIONS),
            ]
          );
        }
        await client.query(
          `UPDATE brownfield_organisation_lpa_links AS link
           SET mapping_status = 'ORGANISATION_LPA_UNMAPPED',
               matched_lpa_reference = NULL,
               matched_lpa_entity_id = NULL
           WHERE link.source = $1`,
          [COVERAGE_SOURCE]
        );
        await client.query(
          `UPDATE brownfield_organisation_lpa_links AS link
           SET mapping_status = 'ORGANISATION_LPA_MAPPED',
               matched_lpa_reference = lpa.reference,
               matched_lpa_entity_id = lpa.source_entity_id
           FROM brownfield_lpa_identities AS lpa
           WHERE link.source = $1
             AND lpa.source = $1
             AND link.local_planning_authority_code IS NOT NULL
             AND link.local_planning_authority_code = lpa.reference`,
          [COVERAGE_SOURCE]
        );
        return insertRun(client, COVERAGE_FAMILY.LPA_IDENTITY, COVERAGE_RUN_STATUS.SUCCEEDED, {
          ...meta,
          rowsAccepted: rows.length,
          provenance: meta.provenance || LPA_IDENTITY_PROVENANCE,
        });
      });
    },
    async replaceProviderIndex(rows, meta = {}) {
      return withTransaction(database, async (client) => {
        await client.query('DELETE FROM brownfield_provider_index WHERE source = $1', [COVERAGE_SOURCE]);
        for (const row of rows) {
          await client.query(
            `INSERT INTO brownfield_provider_index
              (source, dataset, organisation_entity, organisation_name, source_url, retrieved_at, provenance, limitations)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
            [
              COVERAGE_SOURCE,
              PROVIDER_INDEX_DATASET,
              row.organisationEntity,
              row.name,
              meta.sourceUrl || PROVIDER_INDEX_URL,
              meta.retrievedAt || null,
              JSON.stringify(meta.provenance || PROVIDER_INDEX_PROVENANCE),
              JSON.stringify(COVERAGE_LIMITATIONS),
            ]
          );
        }
        return insertRun(client, COVERAGE_FAMILY.PROVIDER_INDEX, COVERAGE_RUN_STATUS.SUCCEEDED, {
          ...meta,
          rowsAccepted: rows.length,
          provenance: meta.provenance || PROVIDER_INDEX_PROVENANCE,
        });
      });
    },
    async replaceOrganisations(rows, meta = {}) {
      return withTransaction(database, async (client) => {
        const lpaResult = await client.query(
          `SELECT source_entity_id, reference FROM brownfield_lpa_identities WHERE source = $1`,
          [COVERAGE_SOURCE]
        );
        const byReference = lpaMap(lpaResult.rows.map((row) => ({
          sourceEntityId: Number(row.source_entity_id),
          reference: row.reference,
        })));
        await client.query(
          'DELETE FROM brownfield_organisation_lpa_links WHERE source = $1',
          [COVERAGE_SOURCE]
        );
        for (const row of rows) {
          const mapped = applyOrganisationMapping(row, byReference);
          await client.query(
            `INSERT INTO brownfield_organisation_lpa_links
              (source, organisation_entity, organisation_name, local_planning_authority_code,
               statistical_geography, start_date, end_date, mapping_status, matched_lpa_reference,
               matched_lpa_entity_id, source_url, retrieved_at, provenance, limitations)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)`,
            [
              COVERAGE_SOURCE,
              mapped.organisationEntity,
              mapped.name,
              mapped.localPlanningAuthorityCode,
              mapped.statisticalGeography,
              mapped.startDate,
              mapped.endDate,
              mapped.mappingStatus,
              mapped.matchedLpaReference,
              mapped.matchedLpaEntityId,
              meta.sourceUrl || `${ORGANISATION_ENTITY_URL_PREFIX}${mapped.organisationEntity}`,
              meta.retrievedAt || null,
              JSON.stringify(meta.provenance || ORGANISATION_RECORD_PROVENANCE),
              JSON.stringify(COVERAGE_LIMITATIONS),
            ]
          );
        }
        return insertRun(client, COVERAGE_FAMILY.ORGANISATION_RECORD, COVERAGE_RUN_STATUS.SUCCEEDED, {
          ...meta,
          rowsAccepted: rows.length,
          provenance: meta.provenance || ORGANISATION_RECORD_PROVENANCE,
        });
      });
    },
    async getLpaByReference(reference) {
      const result = await database.query(
        `SELECT * FROM brownfield_lpa_identities WHERE source = $1 AND reference = $2`,
        [COVERAGE_SOURCE, reference]
      );
      return mapLpaRow(result.rows[0]);
    },
    async getProvider(organisationEntity) {
      const result = await database.query(
        `SELECT * FROM brownfield_provider_index WHERE source = $1 AND organisation_entity = $2`,
        [COVERAGE_SOURCE, Number(organisationEntity)]
      );
      return mapProviderRow(result.rows[0]);
    },
    async getOrganisation(organisationEntity) {
      const result = await database.query(
        `SELECT * FROM brownfield_organisation_lpa_links WHERE source = $1 AND organisation_entity = $2`,
        [COVERAGE_SOURCE, Number(organisationEntity)]
      );
      return mapOrganisationRow(result.rows[0]);
    },
    async listOrganisationsMappedToReference(reference) {
      const result = await database.query(
        `SELECT * FROM brownfield_organisation_lpa_links
         WHERE source = $1 AND mapping_status = 'ORGANISATION_LPA_MAPPED' AND matched_lpa_reference = $2
         ORDER BY organisation_entity`,
        [COVERAGE_SOURCE, reference]
      );
      return result.rows.map(mapOrganisationRow);
    },
  };
}

module.exports = {
  applyOrganisationMapping,
  createMemoryBrownfieldCoverageStore,
  createPostgresBrownfieldCoverageStore,
};
