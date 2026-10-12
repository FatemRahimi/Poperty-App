/**
 * LET_INVEST before/after underwriting input measurement (read-only runtime).
 */
require('../config/loadEnv');
const pool = require('../models/db');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

function listing(row) {
  return {
    id: row.id,
    title: row.title,
    city: row.city,
    zip_code: row.zip_code,
    category: row.category,
    price: row.price != null ? Number(row.price) : null,
    monthly_rent: row.monthly_rent != null ? Number(row.monthly_rent) : null,
    bedrooms: row.bedrooms,
    property_type: row.property_type,
    user_id: row.user_id,
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 900,
      marketRange: { low: 850, high: 950 },
      comparables: [{ id: 1, similarity: 0.8 }],
    }),
    calculatePropertyValuation: async () => ({
      success: false,
      notAssessed: true,
      insufficientEvidence: true,
      message: 'Insufficient evidence',
    }),
    generatePropertyExplanation: async () => ({ summary: 't', source: 'template', tokensUsed: 0 }),
  };
}

function summarise(report) {
  const ki = (report.decisionWorkspace?.keyIntelligence || []).map((r) => ({
    id: r.id,
    available: r.available,
    state: r.state,
  }));
  const assessed = ki.filter((r) => r.available).map((r) => r.id);
  const userGaps = (report.decisionWorkspace?.missingUnderwritingInputs?.items || [])
    .filter((r) => r.cause === 'MISSING_USER_INPUT').length;
  const platformGaps = (report.decisionWorkspace?.missingUnderwritingInputs?.items || [])
    .filter((r) => r.cause === 'MISSING_PLATFORM_EVIDENCE').length;
  return {
    assessed,
    notAssessed: ki.filter((r) => !r.available).map((r) => r.id),
    userInputGaps: userGaps,
    platformEvidenceGaps: platformGaps,
    pdAvailable: report.personalDecision?.available,
    diPriorities: (report.decisionIntelligence?.investigationPriorities || []).length,
    valuationAssessed: report.marketIntelligence?.sale?.notAssessed !== true && report.marketIntelligence?.sale?.success,
  };
}

async function analyse(property, options = {}) {
  return assemblePropertyIntelligenceReport({
    property,
    access: {
      allowed: true,
      userId: property.user_id || 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: property.id,
    },
    userId: property.user_id || 1,
    target: { propertyId: property.id },
    options: {
      decisionJob: 'LET_INVEST',
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipEpb: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-09-01T22:00:00.000Z',
      deps: deps(),
      ...options,
    },
  });
}

const COMPLETE_INPUTS = {
  vacancyAssumption: 5,
  maintenance: 1200,
  insurance: 400,
  managementFee: 0,
  taxes: 0,
  serviceCharge: 0,
  groundRent: 0,
  deposit: 5000,
  interestRate: 5.5,
  mortgageTermYears: 25,
  expectedRent: 900,
};

(async () => {
  const ids = [149, 41];
  const out = [];
  for (const id of ids) {
    const row = (await pool.query('SELECT * FROM properties WHERE id = $1', [id])).rows[0];
    if (!row) continue;
    const prop = listing(row);
    const before = await analyse(prop);
    const after = await analyse(prop, COMPLETE_INPUTS);
    out.push({
      propertyId: id,
      title: row.title,
      price: prop.price,
      rent: prop.monthly_rent,
      before: summarise(before),
      after: summarise(after),
      testInputsLabel: 'USER_SUPPLIED_SCENARIO_TEST_ONLY',
    });
  }
  console.log(JSON.stringify({ measuredAt: '2026-09-01T22:00:00.000Z', results: out }, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
