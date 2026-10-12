/**
 * V1.2 — Valuation evidence pipeline before/after measurement.
 * Bounded real inventory; respects provider cost protections (cache hits).
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { enrichPropertyForIntelligence } = require('../services/enrichment/propertyEnrichmentService');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { listEnrichmentsForProperty } = require('../services/enrichment/propertyIdentityRepository');
const { runFullPropertyAnalysis } = require('../services/ai/propertyIntelligenceEngine');
const { DECISION_JOB } = require('../architecture/decisionContextContract');

const SAMPLE_IDS = [149, 147, 155, 63, 123, 148];

async function traceProperty(id) {
  const row = (
    await pool.query(
      `SELECT p.*, pi.uprn, pi.paon, pi.saon FROM properties p
       LEFT JOIN property_identities pi ON pi.property_id = p.id WHERE p.id = $1`,
      [id]
    )
  ).rows[0];
  if (!row) return null;

  const avmReadiness = buildValuationSaleRequest(row);
  const beforeRows = (await listEnrichmentsForProperty(id)).length;

  const ext = await enrichPropertyForIntelligence(row, { userId: row.user_id || 1 });
  const afterRows = (await listEnrichmentsForProperty(id)).length;
  const val = await calculatePropertyValuation(row, ext);

  const enrichments = ext.enrichments || {};
  const pdAudit = {};
  ['valuation_sale', 'sold_prices', 'sold_prices_per_sqf', 'uprn_profile'].forEach((type) => {
    const e = enrichments[type];
    pdAudit[type] = e
      ? { state: e.success ? 'RETURNED' : 'FAILED', message: e.message || null, reasonCode: e.reasonCode || null }
      : { state: 'ABSENT' };
  });

  let workspace = null;
  if (row.category === 'sale' && Number(row.price) > 0) {
    const report = await runFullPropertyAnalysis(
      { propertyId: id },
      row.user_id || 1,
      { decisionJob: DECISION_JOB.BUY, skipExplanation: true, asOf: '2026-09-02T10:00:00.000Z' }
    );
    workspace = {
      valuation: report.marketIntelligence?.sale?.assessmentState || 'NOT_ASSESSED',
      pricePosition: report.marketIntelligence?.pricePosition?.state || 'NOT_ASSESSED',
      hasSoldPrices: Boolean(report.externalEnrichment?.hasSoldPrices),
    };
  }

  return {
    propertyId: id,
    category: row.category,
    price: row.price,
    property_type: row.property_type,
    square_feet: row.square_feet,
    uprn: row.uprn,
    avmReadiness: avmReadiness.readiness,
    enrichmentRowsBefore: beforeRows,
    enrichmentRowsAfter: afterRows,
    enrichmentDelta: afterRows - beforeRows,
    propertyData: pdAudit,
    enrichmentErrors: ext.errors || [],
    components: (val.components || []).map((c) => ({
      method: c.method,
      estimate: c.centralEstimate,
      eligible: val.evidenceEligibility?.methods?.find((m) => m.method === c.method)?.eligibleForAssessment,
    })),
    assessment: val.evidenceEligibility?.assessment?.reason,
    safety: val.assessmentSafety?.reason || val.evidenceEligibility?.assessmentSafety?.reason,
    valuationAssessed: val.success === true,
    workspace,
  };
}

async function inventoryCounts() {
  const total = (await pool.query('SELECT COUNT(*)::int n FROM property_enrichments')).rows[0].n;
  const byType = await pool.query(
    'SELECT enrichment_type, COUNT(*)::int n FROM property_enrichments GROUP BY enrichment_type ORDER BY enrichment_type'
  );
  return { totalRows: total, byType: byType.rows };
}

async function main() {
  await ensureIntelligenceSchema();
  const traces = [];
  for (const id of SAMPLE_IDS) {
    traces.push(await traceProperty(id));
  }
  console.log(
    JSON.stringify(
      {
        study: 'V1.2_VALUATION_EVIDENCE_PIPELINE_CORRECTNESS',
        measuredAt: new Date().toISOString(),
        sampleSize: SAMPLE_IDS.length,
        inventoryEnrichments: await inventoryCounts(),
        traces,
      },
      null,
      2
    )
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
