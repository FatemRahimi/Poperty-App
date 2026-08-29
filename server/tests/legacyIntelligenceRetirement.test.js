/**
 * Phase 6 — retire legacy heuristic generation from new canonical landlord PI.
 * Run: node server/tests/legacyIntelligenceRetirement.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const {
  assembleDecisionIntelligence,
  publicDecisionIntelligenceForExplanation,
} = require('../services/ai/decisionIntelligence');
const { extractCanonicalCoreFacts } = require('../services/ai/propertyIntelligenceService');
const { templateSummary } = require('../services/ai/propertyExplanationService');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const { executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');
const {
  intelligenceFromCanonicalReport,
  scorePublicLandlordPersonalDecision,
} = require('../services/ai/personalDecisionCanonical');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
  WHAT_IF_VERSION,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { parseDemandResponse, parseDemandRentResponse } = require('../services/providers/propertyData/propertyDataParsers');
const {
  buildStrengths,
  buildWeaknesses,
  buildOpportunities,
  buildRisks,
  buildPrimaryRecommendation,
} = require('../services/ai/legacyHeuristicIntelligence');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

function asyncTest(name, fn) {
  pending.push({ name, fn });
}

const ASOF = '2026-08-26T23:00:00.000Z';
const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function listing(extra = {}) {
  return {
    id: 61,
    title: 'Legacy retirement listing',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    bedrooms: 2,
    property_type: 'Terraced',
    ...extra,
  };
}

function access() {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 61,
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1050,
      currentRent: 1000,
      marketRange: { low: 950, high: 1150 },
      underRented: true,
      potentialAnnualUplift: { low: 600, high: 1800 },
      confidence: 62,
      confidenceLevel: 'Medium',
      comparables: [
        { id: 1, similarity: 0.8 },
        { id: 2, similarity: 0.7 },
        { id: 3, similarity: 0.6 },
        { id: 4, similarity: 0.5 },
        { id: 5, similarity: 0.5 },
      ],
    }),
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      lowerEstimate: 180000,
      upperEstimate: 210000,
      evidenceCount: 6,
    }),
    generatePropertyExplanation: async (facts) => ({
      summary: templateSummary(facts),
      source: 'template',
      tokensUsed: 0,
      _facts: facts,
    }),
  };
}

async function assemble(extra = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(extra.property),
    access: access(),
    userId: 1,
    target: { propertyId: 61 },
    options: {
      skipExplanation: extra.skipExplanation !== false,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipFlood: true,
      asOf: ASOF,
      deps: deps(),
      ...(extra.options || {}),
    },
  });
}

test('canonical engine no longer calls retired narrative helpers', () => {
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(!engine.includes('buildStrengths'), 'new analyses must not call buildStrengths');
  assert.ok(!engine.includes('buildWeaknesses'), 'new analyses must not call buildWeaknesses');
  assert.ok(!engine.includes('buildOpportunities'), 'new analyses must not call buildOpportunities');
  assert.ok(!engine.includes('buildPrimaryRecommendation'), 'new analyses must not call buildPrimaryRecommendation');
  assert.ok(!engine.includes('topOpportunity'));
  assert.ok(!engine.includes('topRisk'));
  assert.ok(!engine.includes("stamp('opportunities'"));
  assert.ok(engine.includes("require('./legacyHeuristicIntelligence')"));
  assert.ok(/const \{ buildRisks \} = require\('\.\/legacyHeuristicIntelligence'\)/.test(engine));
  assert.ok(engine.includes('const risks = buildRisks('), 'PD scoring still needs the risk register');
});

test('retired helpers remain isolated for historical algorithm reference', () => {
  assert.strictEqual(typeof buildStrengths, 'function');
  assert.strictEqual(typeof buildWeaknesses, 'function');
  assert.strictEqual(typeof buildOpportunities, 'function');
  assert.strictEqual(typeof buildRisks, 'function');
  assert.strictEqual(typeof buildPrimaryRecommendation, 'function');
  const isolated = read('services/ai/legacyHeuristicIntelligence.js');
  assert.ok(/DEPRECATED/.test(isolated));
  assert.ok(/TECHNICAL DEBT/.test(isolated));
});

test('Decision Intelligence assembler does not consume legacy heuristic fields', () => {
  const di = read('services/ai/decisionIntelligence.js');
  const explainer = read('services/ai/decisionIntelligenceExplanation.js');
  assert.ok(!di.includes('buildStrengths'));
  assert.ok(!di.includes('buildWeaknesses'));
  assert.ok(!di.includes('buildOpportunities'));
  assert.ok(!di.includes('buildRisks'));
  assert.ok(!di.includes('buildPrimaryRecommendation'));
  assert.ok(!di.includes('riskExposure'));
  assert.ok(!explainer.includes('buildStrengths'));
  assert.ok(!explainer.includes('buildRisks'));
  assert.ok(!explainer.includes('primaryRecommendation'));
});

asyncTest('new canonical report omits narrative heuristic fields and keeps PD + DI', async () => {
  const report = await assemble();
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'strengths'));
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'weaknesses'));
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'opportunities'));
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'recommendation'));
  assert.strictEqual(report.recommendation, undefined);
  assert.ok(report.personalDecision);
  assert.strictEqual(report.personalDecision.profile, 'landlord');
  assert.ok(report.decisionIntelligence);
  assert.strictEqual(report.decisionIntelligence.engine, 'decisionIntelligence');
  assert.ok(report.decisionIntelligence.explanation);
  assert.strictEqual(report.decisionIntelligence.explanation.version, 'decision-intelligence-explanation-1.0.0');
  assert.ok(Array.isArray(report.risks), 'risks retained for PD / What-if scoring compatibility');
});

asyncTest('no duplicate recommendation path on new reports', async () => {
  const report = await assemble();
  assert.ok(!report.recommendation);
  assert.ok(report.personalDecision);
  assert.ok(report.decisionIntelligence.explanation.overview);
  const overview = JSON.stringify(report.explanation || {});
  assert.ok(!/Proceed with purchase/i.test(overview));
  assert.ok(!/Primary risk flagged/i.test(report.executiveSummary || ''));
});

asyncTest('material findings and priorities do not consume legacy strengths or weaknesses', async () => {
  const report = await assemble();
  const di = report.decisionIntelligence;
  const blob = JSON.stringify(di);
  assert.ok(!blob.includes('Location data on file'));
  assert.ok(!blob.includes('Listing positioning gap'));
  assert.ok(!blob.includes('riskExposure'));
  assert.ok(!/Rent uplift opportunity/.test(blob));
  const findingIds = (di.materialFindings || []).map((row) => row.id);
  const priorityIds = (di.investigationPriorities || []).map((row) => row.id);
  assert.ok(!findingIds.includes('rent-opportunity'));
  assert.ok(!priorityIds.includes('missing-epc'));
  assert.ok(typeof assembleDecisionIntelligence === 'function');
});

asyncTest('Decision Intelligence explanation does not consume legacy risks or recommendations', async () => {
  const report = await assemble({ skipExplanation: false });
  const factsUsed = report.explanation?._facts;
  assert.ok(!factsUsed || !Object.prototype.hasOwnProperty.call(factsUsed, 'topRisk'));
  assert.ok(!factsUsed || !Object.prototype.hasOwnProperty.call(factsUsed, 'recommendation'));
  assert.ok(!factsUsed || !Object.prototype.hasOwnProperty.call(factsUsed, 'topOpportunity'));
  assert.ok(!factsUsed || !Object.prototype.hasOwnProperty.call(factsUsed, 'decisionIntelligence'));
  const expl = JSON.stringify(report.decisionIntelligence.explanation);
  assert.ok(!expl.includes('riskExposure'));
  assert.ok(!/Proceed with further investment analysis/.test(expl));
  const publicDi = publicDecisionIntelligenceForExplanation(report.decisionIntelligence);
  assert.ok(!Object.prototype.hasOwnProperty.call(publicDi, 'explanation'));
});

asyncTest('legacy risk probability does not enter canonical Decision Intelligence', async () => {
  const report = await assemble();
  const heuristic = report.risks.find((r) => r.probability != null);
  assert.ok(heuristic, 'scoring register still has invented probability');
  const diJson = JSON.stringify(report.decisionIntelligence);
  assert.ok(!diJson.includes(`"probability":${heuristic.probability}`));
  assert.ok(!diJson.includes(`"riskExposure":${heuristic.riskExposure}`));
  assert.ok(!(report.decisionIntelligence.materialFindings || []).some((row) => row.probability != null));
  assert.ok(!(report.decisionIntelligence.investigationPriorities || []).some((row) => row.riskExposure != null));
});

asyncTest('historical saved report with legacy fields is not recomputed', async () => {
  const historical = {
    success: true,
    analysisMode: 'canonical',
    engineVersion: 'property-intelligence-v2',
    strengths: [{ title: 'Garden', evidence: 'Flagged' }],
    weaknesses: [{ title: 'Missing EPC' }],
    opportunities: [{ id: 'rent-opportunity', title: 'Rent opportunity' }],
    risks: [{ id: 'missing-epc', probability: 0.95, riskExposure: 0.63, impact: 'Medium' }],
    recommendation: { action: 'Review rental pricing.' },
    personalDecision: { profile: 'landlord', score: 61 },
    investment: { presented: { grossYield: { available: true, value: 6 } } },
    marketIntelligence: { rent: { success: true, underRented: true, currentRent: 1000 } },
  };
  const row = { id: 9001, output_data: historical, created_at: ASOF };
  const snapshot = JSON.stringify(row.output_data);
  const extracted = extractCanonicalCoreFacts(row);
  assert.strictEqual(JSON.stringify(row.output_data), snapshot);
  assert.strictEqual(extracted.grossYield, 6);
  assert.strictEqual(extracted.underRented, true);
  assert.strictEqual(row.output_data.recommendation.action, 'Review rental pricing.');
  assert.strictEqual(row.output_data.strengths[0].title, 'Garden');
});

asyncTest('Personal Decision score is unchanged for identical canonical inputs', async () => {
  const first = await assemble();
  const second = await assemble();
  assert.strictEqual(second.personalDecision.score, first.personalDecision.score);
  assert.strictEqual(
    second.personalDecision.dimensions.risk.score,
    first.personalDecision.dimensions.risk.score
  );
  const rescored = scorePublicLandlordPersonalDecision({
    property: listing(),
    finance: {},
    intelligence: intelligenceFromCanonicalReport(first),
    asOf: ASOF,
  });
  assert.strictEqual(rescored.score, first.personalDecision.score);
  assert.strictEqual(rescored.dimensions.risk.score, first.personalDecision.dimensions.risk.score);
  assert.ok(Array.isArray(intelligenceFromCanonicalReport(first).risks));
  assert.strictEqual(intelligenceFromCanonicalReport(first).risks.length, first.risks.length);
});

asyncTest('valuation rent finance confidence demand and What-if remain frozen', async () => {
  const report = await assemble();
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1050);
  assert.strictEqual(report.marketIntelligence.propertySpecificTenantDemand.state, 'notAssessed');
  assert.strictEqual(report.personalDecision.dimensions.demand.available, false);
  assert.strictEqual(report.personalDecision.confidence.model, 'confidence-1.1.0');
  assert.ok(report.investment);
  const finance = parseAnalyseFinanceRequest({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
  });
  assert.strictEqual(finance.ok, true);
  const whatIf = executeIntelligenceWhatIf({
    property: listing({ monthly_rent: 1000 }),
    profile: 'landlord',
    baselineOptions: {
      purchasePrice: 200000,
      expectedRent: 1000,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
    intelligence: intelligenceFromCanonicalReport(report),
  });
  assert.strictEqual(whatIf.scoreSource, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
  assert.ok(!Object.prototype.hasOwnProperty.call(report, 'genericRiskScore'));
  assert.strictEqual(report.scores.overall, null);
});

test('overview template is not a second recommendation path', () => {
  const summary = templateSummary({
    property: { title: 'Example' },
    topRisk: { title: 'Must not appear' },
    recommendation: { action: 'Buy now' },
    topOpportunity: { title: 'Must not appear' },
    decisionIntelligence: {
      materialFindings: [{ title: 'Should stay in DI explanation only' }],
      investigationPriorities: [{ title: 'Verify later' }],
    },
    dataQuality: { score: 70 },
  });
  assert.ok(!/Must not appear/.test(summary));
  assert.ok(!/Buy now/.test(summary));
  assert.ok(!/Primary risk flagged/.test(summary));
  assert.ok(!/What currently matters/.test(summary));
  assert.ok(!/What to verify next/.test(summary));
  assert.ok(/Data quality score: 70/.test(summary));
});

test('weights confidence valuation demand What-if and no new score', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.deepStrictEqual(Object.keys(LANDLORD_WEIGHTS).sort(), [
    'cashFlow',
    'demand',
    'dscr',
    'grossYield',
    'netOperating',
    'rentPosition',
    'risk',
    'vacancy',
  ]);
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'genericRisk'));
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  assert.ok(parseDemandResponse({ demand_rating: 3 }));
  assert.ok(parseDemandRentResponse({ rental_demand_rating: 4 }));
});

test('evidence providers are unchanged', () => {
  const flood = read('services/ai/floodEvidence.js');
  const planning = read('services/ai/planningEvidence.js');
  const schools = read('services/ai/schoolEvidence.js');
  const listed = read('services/ai/listedBuildingEvidence.js');
  const conservation = read('services/ai/conservationAreaEvidence.js');
  const article4 = read('services/ai/article4Evidence.js');
  assert.ok(flood.includes('getFloodEvidence'));
  assert.ok(planning.includes('getPlanningEvidence'));
  assert.ok(schools.includes('getSchoolEvidence'));
  assert.ok(listed.includes('getListedBuildingEvidence'));
  assert.ok(conservation.includes('getConservationAreaEvidence'));
  assert.ok(article4.includes('getArticle4Evidence'));
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('getFloodEvidence'));
  assert.ok(engine.includes('getPlanningEvidence'));
  assert.ok(engine.includes('getSchoolEvidence'));
});

function arrayIds(rows) {
  return (rows || []).map((row) => row.id);
}

asyncTest('Decision Intelligence arrays are unchanged for identical fixtures', async () => {
  const first = await assemble();
  const second = await assemble();
  const a = first.decisionIntelligence;
  const b = second.decisionIntelligence;
  assert.deepStrictEqual(arrayIds(a.unresolvedDependencies), arrayIds(b.unresolvedDependencies));
  assert.deepStrictEqual(arrayIds(a.investigationPriorities), arrayIds(b.investigationPriorities));
  assert.deepStrictEqual(arrayIds(a.materialFindings), arrayIds(b.materialFindings));
  assert.deepStrictEqual(arrayIds(a.sensitivityDrivers), arrayIds(b.sensitivityDrivers));
  assert.deepStrictEqual(
    (a.materialFindings || []).map((row) => row.effect),
    (b.materialFindings || []).map((row) => row.effect)
  );
});

asyncTest('What-if does not consume retired narrative heuristics', async () => {
  const whatIfSrc = [
    read('services/ai/intelligenceWhatIfService.js'),
    read('services/ai/personalDecisionWhatIfEngine.js'),
    read('services/ai/historicalWhatIfBaseline.js'),
  ].join('\n');
  assert.ok(!whatIfSrc.includes('buildStrengths'));
  assert.ok(!whatIfSrc.includes('buildWeaknesses'));
  assert.ok(!whatIfSrc.includes('buildOpportunities'));
  assert.ok(!whatIfSrc.includes('buildPrimaryRecommendation'));
  assert.ok(!whatIfSrc.includes('buildRisks('));

  const report = await assemble();
  const whatIfArgs = {
    property: listing({ monthly_rent: 1000 }),
    profile: 'landlord',
    baselineOptions: {
      purchasePrice: 200000,
      expectedRent: 1000,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: ASOF,
  };
  const base = executeIntelligenceWhatIf({
    ...whatIfArgs,
    intelligence: intelligenceFromCanonicalReport(report),
  });
  const injected = executeIntelligenceWhatIf({
    ...whatIfArgs,
    intelligence: intelligenceFromCanonicalReport({
      ...report,
      strengths: [{ title: 'Garden' }],
      weaknesses: [{ title: 'Missing EPC' }],
      opportunities: [{ id: 'rent-opportunity', title: 'Rent opportunity', category: 'RENT' }],
      recommendation: { action: 'Proceed with purchase' },
    }),
  });
  assert.strictEqual(injected.change.score.after, base.change.score.after);
  assert.strictEqual(injected.change.score.delta, base.change.score.delta);
  assert.strictEqual(injected.scoreSource, 'personal-decision-whatif-1.0.0');
});

asyncTest('new report does not introduce buy/avoid/proceed recommendation language', async () => {
  const report = await assemble({ skipExplanation: false });
  assert.ok(!report.recommendation);
  const narrative = [
    report.executiveSummary,
    JSON.stringify(report.decisionIntelligence.explanation),
    JSON.stringify(report.personalDecision?.explanation || null),
  ].join(' ');
  assert.ok(!/\b(buy this|avoid this|proceed with purchase|strong buy|you should buy)\b/i.test(narrative));
});

asyncTest('sparse pre-DI historical snapshot stays readable and unrecomputed', async () => {
  const sparse = {
    success: true,
    recommendation: { action: 'Review rental pricing.', why: 'pre-DI snapshot' },
    strengths: [{ title: 'Location data on file' }],
  };
  const row = { id: 9002, output_data: sparse, created_at: ASOF };
  const snapshot = JSON.stringify(row.output_data);
  const extracted = extractCanonicalCoreFacts(row);
  assert.strictEqual(JSON.stringify(row.output_data), snapshot);
  assert.strictEqual(row.output_data.recommendation.action, 'Review rental pricing.');
  assert.strictEqual(row.output_data.strengths[0].title, 'Location data on file');
  assert.strictEqual(extracted.decisionIntelligence, null);
});

test('LLM explanation facts and prompts do not take legacy heuristic inputs', () => {
  const explainer = read('services/ai/decisionIntelligenceExplanation.js');
  const overview = read('services/ai/propertyExplanationService.js');
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(explainer.includes('riskExposure'));
  assert.ok(explainer.includes('FORBIDDEN_OUTPUT_KEYS'));
  assert.ok(!explainer.includes('buildStrengths'));
  assert.ok(!explainer.includes('buildPrimaryRecommendation'));
  assert.ok(overview.includes('This overview is not the landlord decision narrative'));
  assert.ok(overview.includes('Do not write a buy, avoid, or proceed recommendation'));
  assert.ok(!engine.includes('topRisk'));
  assert.ok(!engine.includes('topOpportunity'));
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\nlegacyIntelligenceRetirement.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
