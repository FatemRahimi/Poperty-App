/**
 * Ensure Property Intelligence schema exists (safe to run on every server start).
 */
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');

const MIGRATION_FILES = [
  '011_ai_intelligence.sql',
  '012_property_intelligence_data.sql',
  '013_intelligence_subjects.sql',
  '014_intelligence_subject_history.sql',
  '015_confidence_level.sql',
  '016_listing_intelligence_events.sql',
  '017_listing_lifecycle_idempotency.sql',
  '018_listing_outcome_idempotency.sql',
  '019_pi_analyse_slots.sql',
  '020_asset_classifications.sql',
  '021_private_evidence_documents.sql',
  '022_private_evidence_hardening.sql',
  '023_official_sale_transactions.sql',
  '024_official_sale_lookup_links.sql',
  '025_canonical_subject_identity.sql',
];

async function columnExists(table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rows.length > 0;
}

async function tableExists(table) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

async function indexExists(name) {
  const result = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function applySql(file) {
  const sqlPath = path.join(__dirname, '../db/migrations', file);
  if (!fs.existsSync(sqlPath)) return;
  await pool.query(fs.readFileSync(sqlPath, 'utf8'));
}

async function ensureIntelligenceSchema() {
  const needsSubjectId = !(await columnExists('ai_requests', 'subject_id'));
  const needsPropertyId = !(await columnExists('ai_requests', 'property_id'));
  const needsConfidenceLevel = !(await columnExists('ai_requests', 'confidence_level'));
  const needsListingEvents = !(await tableExists('listing_events'));
  const needsGroundRent = !(await columnExists('properties', 'ground_rent'));
  const needsLifecycleIndexes = !(await indexExists('listing_events_one_listing_created'));
  const needsOutcomeIndexes = !(await indexExists('listing_events_one_sold'));
  const needsAnalyseSlots = !(await tableExists('pi_analyse_slots'));
  const needsAssetClassifications = !(await tableExists('asset_classifications'));
  const needsEvidenceDocuments = !(await tableExists('evidence_documents'));
  const needsEvidenceHardening = !(await columnExists('evidence_documents', 'scan_state'));
  const needsOfficialSales = !(await tableExists('official_sale_transactions'));
  const needsOfficialSaleLinks = !(await tableExists('official_sale_lookup_links'));
  const needsCanonicalIdentity = !(await columnExists('property_identities', 'paon'));

  if (
    !needsSubjectId &&
    !needsPropertyId &&
    !needsConfidenceLevel &&
    !needsListingEvents &&
    !needsGroundRent &&
    !needsLifecycleIndexes &&
    !needsOutcomeIndexes &&
    !needsAnalyseSlots &&
    !needsAssetClassifications &&
    !needsEvidenceDocuments &&
    !needsEvidenceHardening &&
    !needsOfficialSales &&
    !needsOfficialSaleLinks &&
    !needsCanonicalIdentity
  ) {
    return { applied: false, ok: true };
  }

  console.log('🔧 Property Intelligence schema update required — applying migrations...');

  if (needsSubjectId || needsPropertyId || needsConfidenceLevel) {
    for (const file of MIGRATION_FILES) {
      await applySql(file);
    }
  } else if (needsListingEvents || needsGroundRent) {
    await applySql('016_listing_intelligence_events.sql');
  }
  if (needsLifecycleIndexes) {
    await applySql('017_listing_lifecycle_idempotency.sql');
  }
  if (needsOutcomeIndexes) {
    await applySql('018_listing_outcome_idempotency.sql');
  }
  if (needsAnalyseSlots) {
    await applySql('019_pi_analyse_slots.sql');
  }
  if (needsAssetClassifications) {
    await applySql('020_asset_classifications.sql');
  }
  if (needsEvidenceDocuments) {
    await applySql('021_private_evidence_documents.sql');
  }
  if (needsEvidenceHardening) {
    await applySql('022_private_evidence_hardening.sql');
  }
  if (needsOfficialSales) {
    try {
      await applySql('023_official_sale_transactions.sql');
    } catch (err) {
      console.error('❌ Official sale transaction schema could not be applied:', err.message);
    }
  }
  if (needsOfficialSaleLinks) {
    try {
      await applySql('024_official_sale_lookup_links.sql');
    } catch (err) {
      console.error('❌ Official sale lookup links schema could not be applied:', err.message);
    }
  }
  if (needsCanonicalIdentity) {
    try {
      await applySql('025_canonical_subject_identity.sql');
    } catch (err) {
      console.error('❌ Canonical subject identity schema could not be applied:', err.message);
    }
  }

  const ok =
    (await columnExists('ai_requests', 'subject_id')) &&
    (await tableExists('listing_events')) &&
    (await tableExists('pi_analyse_slots')) &&
    (await tableExists('asset_classifications')) &&
    (await tableExists('evidence_documents'));
  if (ok) {
    console.log('✅ Property Intelligence listing event schema ready');
  } else {
    console.error('❌ Failed to apply listing intelligence schema — run: npm run migrate:intelligence');
  }
  return { applied: true, ok };
}

module.exports = { ensureIntelligenceSchema, columnExists, tableExists };
