/**
 * Apply Property Intelligence DB migrations (011–024).
 * Run: node scripts/migrate-intelligence-schema.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');

const MIGRATIONS = [
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

async function run() {
  const dir = path.join(__dirname, '../db/migrations');
  console.log('Applying Property Intelligence migrations...\n');

  for (const file of MIGRATIONS) {
    const sqlPath = path.join(dir, file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`  skip ${file} (file not found)`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`  → ${file}`);
    await pool.query(sql);
    console.log(`    done`);
  }

  const checks = [
    ['ai_requests', 'subject_id'],
    ['ai_requests', 'property_id'],
    ['intelligence_subjects', 'id'],
    ['property_identities', 'id'],
    ['pi_analyse_slots', 'user_id'],
    ['asset_classifications', 'asset_class'],
    ['evidence_documents', 'document_id'],
    ['official_sale_transactions', 'source_transaction_id'],
    ['official_sale_import_runs', 'status'],
    ['official_sale_lookup_links', 'identifier'],
    ['property_identities', 'paon'],
    ['property_identity_events', 'property_id'],
  ];

  console.log('\nVerification:');
  for (const [table, col] of checks) {
    const ok = await columnExists(table, col);
    console.log(`  ${ok ? '✓' : '✗'} ${table}.${col}`);
    if (!ok) {
      process.exitCode = 1;
    }
  }

  const indexResult = await pool.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN (
         'listing_events_one_listing_created',
         'listing_events_one_first_published',
         'listing_events_one_sold',
         'listing_events_one_let',
         'listing_events_one_under_offer',
         'listing_events_one_withdrawn'
       )`
  );
  const indexes = new Set(indexResult.rows.map((r) => r.indexname));
  for (const name of [
    'listing_events_one_listing_created',
    'listing_events_one_first_published',
    'listing_events_one_sold',
    'listing_events_one_let',
    'listing_events_one_under_offer',
    'listing_events_one_withdrawn',
  ]) {
    const ok = indexes.has(name);
    console.log(`  ${ok ? '✓' : '✗'} index ${name}`);
    if (!ok) process.exitCode = 1;
  }

  await pool.end();
  console.log('\nMigration complete.');
}

run().catch(async (err) => {
  console.error('Migration failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
