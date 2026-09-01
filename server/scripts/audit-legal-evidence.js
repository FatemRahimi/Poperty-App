/**
 * Read-only Phase 9 legal evidence audit. Does not print document contents.
 */
require('dotenv').config();
const pool = require('../models/db');

async function count(sql, params = []) {
  const result = await pool.query(sql, params);
  return Number(result.rows[0]?.n || 0);
}

async function grouped(sql) {
  const result = await pool.query(sql);
  return result.rows;
}

async function tableExists(name) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function run() {
  if (!(await tableExists('evidence_documents'))) {
    console.log('LEGAL EVIDENCE AUDIT: NOT VERIFIED (evidence_documents missing)');
    return;
  }
  const total = await count(`SELECT COUNT(*)::int AS n FROM evidence_documents`);
  const legal = await count(`SELECT COUNT(*)::int AS n FROM evidence_documents WHERE domain = 'LEGAL_TITLE'`);
  const linked = await count(`SELECT COUNT(DISTINCT document_id)::int AS n FROM evidence_document_subjects`);
  const byType = await grouped(
    `SELECT document_type, COUNT(*)::int AS n FROM evidence_documents GROUP BY document_type ORDER BY document_type`
  );
  const byVerification = await grouped(
    `SELECT verification_state, COUNT(*)::int AS n FROM evidence_documents GROUP BY verification_state ORDER BY verification_state`
  );
  const byExtraction = await grouped(
    `SELECT extraction_state, COUNT(*)::int AS n FROM evidence_documents GROUP BY extraction_state ORDER BY extraction_state`
  );
  let withLegal = 'NOT VERIFIED';
  let withoutLegal = 'NOT VERIFIED';
  if (await tableExists('ai_requests')) {
    withLegal = await count(
      `SELECT COUNT(*)::int AS n FROM ai_requests
       WHERE request_type = 'property_intelligence'
         AND output_data ? 'legalTitleDomain'
         AND COALESCE((output_data->'legalTitleDomain'->'assessment'->>'documentsPresent')::boolean, false) = true`
    );
    withoutLegal = await count(
      `SELECT COUNT(*)::int AS n FROM ai_requests
       WHERE request_type = 'property_intelligence'
         AND (
           NOT (output_data ? 'legalTitleDomain')
           OR COALESCE((output_data->'legalTitleDomain'->'assessment'->>'documentsPresent')::boolean, false) = false
         )`
    );
  }
  console.log(JSON.stringify({
    totalPrivateEvidenceDocuments: total,
    legalDocuments: legal,
    documentsByType: byType,
    documentsByVerificationState: byVerification,
    documentsByExtractionState: byExtraction,
    documentsLinkedToSubjects: linked,
    legalTitleAnalysesWithEvidence: withLegal,
    legalTitleAnalysesWithoutEvidence: withoutLegal,
  }, null, 2));
}

run()
  .catch((err) => {
    console.log('LEGAL EVIDENCE AUDIT: NOT VERIFIED');
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
