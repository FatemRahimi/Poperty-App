require('../config/loadEnv');
const pool = require('../models/db');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

const JOBS = ['BUY', 'LET_INVEST', 'SELL'];
const IDS = [147, 148, 150, 153, 63];

(async () => {
  for (const id of IDS) {
    const r = await pool.query(
      `SELECT p.*, pi.uprn
       FROM properties p
       LEFT JOIN property_identities pi ON pi.property_id = p.id
       WHERE p.id = $1`,
      [id]
    );
    const p = r.rows[0];
    if (!p) continue;
    console.log('=== property', id, p.title, p.property_type, 'price', p.price, 'rent', p.monthly_rent, 'uprn', p.uprn);
    for (const job of JOBS) {
      const report = await assemblePropertyIntelligenceReport({
        property: p,
        access: {
          allowed: true,
          userId: p.user_id || 1,
          role: 'owner',
          relationship: 'owner',
          accessLevel: 'professional_intelligence',
          propertyId: id,
        },
        userId: p.user_id || 1,
        target: { propertyId: id },
        options: { decisionJob: job, skipExplanation: true, asOf: '2026-09-01T20:00:00.000Z' },
      });
      const sale = report.marketIntelligence?.sale;
      const ws = report.decisionWorkspace;
      console.log(JSON.stringify({
        job,
        assetClass: report.assetClassification?.assetClass,
        valuation: sale?.success && sale?.notAssessed !== true ? sale.centralEstimate : null,
        valuationState: sale?.notAssessed === true ? 'NOT_ASSESSED' : (sale?.success ? 'ASSESSED' : 'NOT_ASSESSED'),
        pricePosition: report.marketIntelligence?.pricePosition?.position || null,
        rent: report.marketIntelligence?.rent?.recommendedRent || null,
        grossYield: report.investment?.presented?.grossYield?.value || null,
        pdAvailable: report.personalDecision?.available,
        diFindings: (report.decisionIntelligence?.materialFindings || []).length,
        diPriorities: (report.decisionIntelligence?.investigationPriorities || []).length,
        planning: ws?.contextEvidence?.find((x) => x.id === 'planning')?.state,
        epb: ws?.contextEvidence?.find((x) => x.id === 'epb')?.state,
        flood: ws?.contextEvidence?.find((x) => x.id === 'flood')?.state,
        keyAssessed: (ws?.keyIntelligence || []).filter((x) => x.available).map((x) => x.id),
      }));
    }
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
