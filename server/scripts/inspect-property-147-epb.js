require('../config/loadEnv');
const pool = require('../models/db');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

(async () => {
  const r = await pool.query(
    `SELECT p.*, pi.uprn FROM properties p LEFT JOIN property_identities pi ON pi.property_id = p.id WHERE p.id = 147`
  );
  const p = r.rows[0];
  const report = await assemblePropertyIntelligenceReport({
    property: p,
    access: { allowed: true, userId: p.user_id, role: 'owner', relationship: 'owner', accessLevel: 'professional_intelligence', propertyId: 147 },
    userId: p.user_id,
    target: { propertyId: 147 },
    options: { decisionJob: 'LET_INVEST', skipExplanation: true, asOf: '2026-09-01T20:00:00.000Z' },
  });
  console.log(JSON.stringify({
    epbEvidence: report.epbEvidence || null,
    propertyFactsEpc: report.propertyFacts?.facts?.epc || null,
    buildingDomain: report.domains?.BUILDING_CONDITION?.client || null,
    saleValuation: report.marketIntelligence?.sale,
    valuationReason: report.marketIntelligence?.sale?.message || report.marketIntelligence?.sale?.reason,
  }, null, 2));
  await pool.end();
})();
