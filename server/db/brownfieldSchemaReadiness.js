/**
 * Read-only Brownfield schema readiness for migrations 035–039.
 * Shared by startup ensure and migrate:intelligence verification.
 */

async function tableExists(db, table) {
  const result = await db.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

async function columnExists(db, table, column) {
  const result = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rows.length > 0;
}

async function indexExists(db, name) {
  const result = await db.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function constraintExists(db, name) {
  const result = await db.query(
    'SELECT 1 FROM pg_constraint WHERE conname = $1',
    [name]
  );
  return result.rows.length > 0;
}

async function obsoleteBrownfieldUnique(db) {
  const result = await db.query(
    `SELECT 1
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'brownfield_land_observations'
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) LIKE '%source_entity_id%'
       AND pg_get_constraintdef(c.oid) LIKE '%release_label%'
       AND pg_get_constraintdef(c.oid) NOT LIKE '%content_fingerprint%'`
  );
  return result.rows.length > 0;
}

const REQUIRED_TABLES = [
  'brownfield_land_import_runs',
  'brownfield_land_observations',
  'brownfield_coverage_runs',
  'brownfield_lpa_identities',
  'brownfield_provider_index',
  'brownfield_organisation_lpa_links',
  'brownfield_land_artifacts',
];

const REQUIRED_INDEXES = [
  'idx_brownfield_land_entity_revisions',
  'idx_brownfield_land_import_runs_artifact',
];

/**
 * @returns {{ ok: boolean, missing: string[], details: object }}
 */
async function assessBrownfieldSchemaReadiness(db) {
  if (!db || typeof db.query !== 'function') {
    return {
      ok: false,
      missing: ['queryable_database'],
      details: { reason: 'missing_queryable_database' },
    };
  }

  const missing = [];
  const details = {};

  for (const table of REQUIRED_TABLES) {
    const exists = await tableExists(db, table);
    details[`table:${table}`] = exists;
    if (!exists) missing.push(`table:${table}`);
  }

  const hasRevisionIdentity = await constraintExists(
    db,
    'brownfield_land_observations_revision_identity'
  );
  details.revisionIdentity = hasRevisionIdentity;
  if (!hasRevisionIdentity) missing.push('constraint:brownfield_land_observations_revision_identity');

  const hasObsoleteUnique = await obsoleteBrownfieldUnique(db);
  details.obsoleteUnique = hasObsoleteUnique;
  if (hasObsoleteUnique) missing.push('obsolete_unique:brownfield_land_observations');

  for (const indexName of REQUIRED_INDEXES) {
    const exists = await indexExists(db, indexName);
    details[`index:${indexName}`] = exists;
    if (!exists) missing.push(`index:${indexName}`);
  }

  const hasArtifactId = await columnExists(db, 'brownfield_land_import_runs', 'artifact_id');
  details.artifactIdColumn = hasArtifactId;
  if (!hasArtifactId) missing.push('column:brownfield_land_import_runs.artifact_id');

  const hasArtifactSha = await constraintExists(db, 'brownfield_land_artifacts_sha256_key');
  details.artifactShaUnique = hasArtifactSha;
  if (!hasArtifactSha) missing.push('constraint:brownfield_land_artifacts_sha256_key');

  return {
    ok: missing.length === 0,
    missing,
    details,
  };
}

module.exports = {
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  tableExists,
  columnExists,
  indexExists,
  constraintExists,
  obsoleteBrownfieldUnique,
  assessBrownfieldSchemaReadiness,
};
