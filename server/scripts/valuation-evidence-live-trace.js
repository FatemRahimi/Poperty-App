/**
 * Bounded live valuation trace — max 3 properties, uses existing enrichment path.
 * Respects provider cache / cost protection (no bulk calls).
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { runFullPropertyAnalysis } = require('../services/ai/propertyIntelligenceEngine');
const { calculatePropertyValuation } = require('../services/ai/valuationEngine');
const { DECISION_JOB } = require('../architecture/decisionContextContract');

const ASOF = '2026-09-01T20:00:00.000Z';
const PROPERTY_IDS = [147, 149, 63, 155, 148];

function traceEnrichments(ext) {
  const e = ext?.enrichments || {};
  const out = {};
  ['valuation_sale', 'sold_prices', 'uprn_profile', 'sold_prices_per_sqf'].forEach((type) => {
    const row = e[type];
    if (!row) {
      out[type] = { state: 'NOT_RETURNED' };
      return;
    }
    out[type] = {
      state: row.success ? 'RETURNED' : 'FAILED',
      cacheHit: row.cacheHit || row.fromPersistence || false,
      message: row.message || null,
      creditsUsed: row.creditsUsed ?? null,
      hasData: Boolean(row.data),
    };
  });
  return out;
}

function traceValuation(val) {
  return {
    success: val.success,
    notAssessed: val.notAssessed,
    message: val.message,
    centralEstimate: val.centralEstimate,
    components: (val.components || []).map((c) => ({
      method: c.method,
      centralEstimate: c.centralEstimate,
      declaredUnit: c.declaredUnit,
      validation: c.componentValidation,
    })),
    eligibility: val.evidenceEligibility?.methods?.map((m) => ({
      method: m.method,
      eligible: m.eligibleForAssessment,
      canAssessAlone: m.canAssessAlone,
      rejections: m.rejectionReasons,
    })),
    assessment: val.evidenceEligibility?.assessment,
    safety: val.assessmentSafety || val.evidenceEligibility?.assessmentSafety,
    internalComps: val.internalComparables?.length ?? val.internalSale?.comparableCount,
  };
}

async function main() {
  await ensureIntelligenceSchema();
  const results = [];
  for (const id of PROPERTY_IDS) {
    const row = (
      await pool.query(
        `SELECT p.*, pi.uprn, pi.paon, pi.saon FROM properties p
         LEFT JOIN property_identities pi ON pi.property_id = p.id WHERE p.id = $1`,
        [id]
      )
    ).rows[0];
    if (!row) continue;

    const report = await runFullPropertyAnalysis(
      { propertyId: id },
      row.user_id || 1,
      {
        decisionJob: DECISION_JOB.BUY,
        skipExplanation: true,
        asOf: ASOF,
      }
    );

    const ext = report.externalIntelligence || report.externalEnrichment || {};
    const valDirect = calculatePropertyValuation(row, ext);

    results.push({
      propertyId: id,
      category: row.category,
      price: row.price,
      uprn: row.uprn,
      enrichments: traceEnrichments(ext),
      enrichmentAvailable: ext.available,
      enrichmentSources: ext.sources,
      valuationFromReport: {
        state: report.marketIntelligence?.sale?.assessmentState
          || (report.marketIntelligence?.sale?.success ? 'ASSESSED' : 'NOT_ASSESSED'),
        centralEstimate: report.marketIntelligence?.sale?.centralEstimate,
        message: report.marketIntelligence?.sale?.message,
      },
      valuationDirect: traceValuation(valDirect),
      pricePosition: report.marketIntelligence?.pricePosition?.state
        || report.marketIntelligence?.pricePosition?.assessmentState,
    });
  }
  console.log(JSON.stringify({ measuredAt: ASOF, liveTraces: results }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
