/**
 * Read-only private evidence security audit.
 * Prints counts and states only — no filenames, title numbers, hashes,
 * storage keys, owners, or document contents.
 *
 * Run: node scripts/audit-private-evidence-security.js
 */
require('dotenv').config();
const pool = require('../models/db');
const { getPrivateEvidenceCapability } = require('../services/evidence/privateEvidenceConfig');
const repository = require('../services/evidence/evidenceDocumentRepository');
const storage = require('../services/evidence/privateEvidenceStorage');
const {
  classifyStorageReconcile,
  buildSafeAuditReport,
} = require('../services/evidence/privateEvidenceAudit');

async function tableExists(name) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function count(sql) {
  const result = await pool.query(sql);
  return Number(result.rows[0]?.n || 0);
}

async function run() {
  if (!(await tableExists('evidence_documents'))) {
    console.log('PRIVATE EVIDENCE SECURITY AUDIT: NOT VERIFIED (evidence_documents missing)');
    return;
  }

  let counts = {
    active: 0,
    archived: 0,
    legal: 0,
    scan_unavailable: 0,
    delete_failed: 0,
  };
  try {
    counts = await repository.safeCounts();
  } catch {
    console.log('PRIVATE EVIDENCE SECURITY AUDIT: NOT VERIFIED (counts unavailable)');
    return;
  }

  let reconcile = classifyStorageReconcile({ dbRows: [], diskKeys: [] });
  try {
    const dbRows = await repository.listStorageKeys({ includeArchived: true });
    let diskKeys = [];
    let listingSupported = true;
    try {
      diskKeys = await storage.listKeys();
    } catch (error) {
      if (error && error.code === 'OBJECT_LISTING_UNSUPPORTED') listingSupported = false;
      else throw error;
    }
    reconcile = classifyStorageReconcile({ dbRows, diskKeys, listingSupported });
  } catch {
    reconcile = { ...reconcile, missingStoredObjects: 'NOT VERIFIED', orphanStoredObjects: 'NOT VERIFIED' };
  }

  let analysesWithLegalEvidence = 'NOT VERIFIED';
  let analysesWithoutLegalEvidence = 'NOT VERIFIED';
  if (await tableExists('ai_requests')) {
    try {
      analysesWithLegalEvidence = await count(
        `SELECT COUNT(*)::int AS n FROM ai_requests
         WHERE request_type = 'property_intelligence'
           AND output_data ? 'legalTitleDomain'
           AND COALESCE((output_data->'legalTitleDomain'->'assessment'->>'documentsPresent')::boolean, false) = true`
      );
      analysesWithoutLegalEvidence = await count(
        `SELECT COUNT(*)::int AS n FROM ai_requests
         WHERE request_type = 'property_intelligence'
           AND (
             NOT (output_data ? 'legalTitleDomain')
             OR COALESCE((output_data->'legalTitleDomain'->'assessment'->>'documentsPresent')::boolean, false) = false
           )`
      );
    } catch {
      analysesWithLegalEvidence = 'NOT VERIFIED';
      analysesWithoutLegalEvidence = 'NOT VERIFIED';
    }
  }

  const report = buildSafeAuditReport({
    counts,
    reconcile,
    analysesWithLegalEvidence,
    analysesWithoutLegalEvidence,
    capability: getPrivateEvidenceCapability(),
  });
  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((err) => {
    console.log('PRIVATE EVIDENCE SECURITY AUDIT: NOT VERIFIED');
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
