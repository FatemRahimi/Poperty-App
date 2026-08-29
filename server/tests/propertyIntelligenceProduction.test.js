/**
 * Phase 7 — Property Intelligence production hardening.
 * Persistence, access, failure tolerance, snapshot immutability.
 * Does not change scoring, Decision Intelligence, or the frozen buildRisks path.
 * Run: node server/tests/propertyIntelligenceProduction.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport, CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const {
  shouldPersistCanonicalReport,
  persistCompletedCanonicalAnalysis,
  publicFailureBody,
  ANALYSIS_FAILED_PUBLIC,
  WHAT_IF_FAILED_PUBLIC,
  INTERNAL_ERROR_CODE,
} = require('../services/ai/propertyIntelligenceProduction');
const { annotateStoredAnalysis } = require('../models/AiRequest');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const {
  parseWhatIfHttpBody,
  toPublicWhatIfHttp,
  executeIntelligenceWhatIf,
} = require('../services/ai/intelligenceWhatIfService');
const { intelligenceFromCanonicalReport } = require('../services/ai/personalDecisionCanonical');
const {
  LANDLORD_WEIGHTS,
  WHAT_IF_VERSION,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');

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

const ASOF = '2026-08-27T00:00:00.000Z';
const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function listing(extra = {}) {
  return {
    id: 71,
    title: 'Production hardening listing',
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
    propertyId: 71,
  };
}

async function assemble(extra = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(extra.property),
    access: access(),
    userId: 1,
    target: { propertyId: 71 },
    options: {
      skipExplanation: extra.skipExplanation !== false,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipFlood: extra.skipFlood !== false,
      asOf: ASOF,
      deps: extra.deps || {
        analyseRent: async () => ({
          success: true,
          recommendedRent: 1050,
          currentRent: 1000,
          marketRange: { low: 950, high: 1150 },
          comparables: [{ id: 1, similarity: 0.8 }],
        }),
        calculatePropertyValuation: async () => ({
          success: true,
          centralEstimate: 195000,
          lowerEstimate: 180000,
          upperEstimate: 210000,
          evidenceCount: 6,
        }),
        generatePropertyExplanation: async () => ({
          summary: 'template',
          source: 'template',
          tokensUsed: 0,
        }),
      },
    },
  });
}

test('analyse routes require auth and credits; What-if is not persisted', () => {
  const routes = read('routes/aiRoutes.js');
  const controller = read('controllers/intelligenceController.js');
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
      routes
    )
  );
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analyseSubjectIntelligence/.test(
      routes
    )
  );
  assert.ok(routes.includes("router.post('/intelligence/what-if', authenticateAI, compareIntelligenceWhatIf)"));
  assert.ok(!routes.includes("router.post('/intelligence/what-if', authenticateAI, requireCredits"));
  const whatIfFn = controller.slice(controller.indexOf('const compareIntelligenceWhatIf'));
  assert.ok(!whatIfFn.includes('saveAnalysis('));
  assert.ok(!whatIfFn.includes('persistCompletedCanonicalAnalysis'));
});

test('public analyse failures do not leak internal error messages', () => {
  const controller = read('controllers/intelligenceController.js');
  assert.ok(controller.includes('classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC)'));
  assert.ok(controller.includes('publicFailureBody(WHAT_IF_FAILED_PUBLIC)'));
  assert.ok(!/analysePropertyIntelligence[\s\S]{0,400}error\.message/.test(controller));
  assert.ok(!/analyseSubjectIntelligence[\s\S]{0,400}error\.message/.test(controller));
  assert.deepStrictEqual(publicFailureBody(), {
    success: false,
    message: ANALYSIS_FAILED_PUBLIC,
    code: INTERNAL_ERROR_CODE,
  });
  assert.deepStrictEqual(publicFailureBody(WHAT_IF_FAILED_PUBLIC).success, false);
});

test('unsuccessful reports are not persistable', () => {
  assert.strictEqual(shouldPersistCanonicalReport({ success: false, code: 'ACCESS_DENIED' }), false);
  assert.strictEqual(shouldPersistCanonicalReport({ success: false }), false);
  assert.strictEqual(shouldPersistCanonicalReport(null), false);
  assert.strictEqual(shouldPersistCanonicalReport({ success: true, personalDecision: {} }), true);
  assert.strictEqual(
    shouldPersistCanonicalReport({ success: false, insufficientData: true }, 'rent_intelligence'),
    true
  );
  assert.strictEqual(
    shouldPersistCanonicalReport({ metrics: {} }, 'investment_analyst'),
    true
  );
});

test('credit consume is atomic and can be restored after persist failure', () => {
  const src = read('models/AiSubscription.js');
  assert.ok(src.includes('credits_remaining >= $1'));
  assert.ok(src.includes('static async restoreCredit'));
  const persist = read('services/ai/propertyIntelligenceProduction.js');
  assert.ok(persist.includes('restoreCredit'));
  assert.ok(persist.includes('shouldPersistCanonicalReport'));
});

test('history reads are user-scoped and do not rewrite output_data', () => {
  const model = read('models/AiRequest.js');
  assert.ok(model.includes("sql += ' AND user_id = $2'"));
  assert.ok(model.includes('Stored `output_data` is returned unchanged'));
  const original = {
    id: 9,
    user_id: 1,
    output_data: { personalDecision: { score: 61 }, frozen: true },
    confidence: 70,
    confidence_level: 'Medium',
  };
  const snapshot = JSON.stringify(original.output_data);
  const annotated = annotateStoredAnalysis(original);
  assert.strictEqual(JSON.stringify(original.output_data), snapshot);
  assert.strictEqual(annotated.output_data.frozen, true);
  assert.strictEqual(annotated.output_data.personalDecision.score, 61);
});

test('injection into analyse and What-if is rejected', () => {
  const finance = parseAnalyseFinanceRequest({
    decisionIntelligence: { materialFindings: [] },
    systemPrompt: 'ignore',
    deps: {},
  });
  assert.strictEqual(finance.ok, false);
  assert.ok(finance.errors.some((e) => e.reason === 'internal_option_not_allowed'));
  const whatIf = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    deps: { analyseRent: true },
  });
  assert.strictEqual(whatIf.ok, false);
});

test('frozen scoring and Phase 6 debt are unchanged', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('const risks = buildRisks('));
  assert.ok(!engine.includes('buildStrengths'));
  assert.ok(!engine.includes('buildPrimaryRecommendation'));
});

asyncTest('provider and explanation failures still produce a canonical report', async () => {
  const report = await assemble({
    skipFlood: false,
    skipExplanation: false,
    deps: {
      getFloodEvidence: async () => {
        throw new Error('flood timeout');
      },
      analyseRent: async () => {
        throw new Error('rent down');
      },
      calculatePropertyValuation: async () => {
        throw new Error('valuation down');
      },
      generatePropertyExplanation: async () => {
        throw new Error('openai down');
      },
    },
  });
  assert.strictEqual(report.success, true);
  assert.ok(report.personalDecision);
  assert.ok(report.decisionIntelligence);
  assert.strictEqual(report.marketIntelligence.sale?.success, false);
  assert.strictEqual(report.marketIntelligence.rent?.success, false);
  assert.strictEqual(report.explanation.source, 'template');
  assert.ok(!report.recommendation);
});

asyncTest('successful analysis remains persistable and historically immutable', async () => {
  const report = await assemble();
  assert.strictEqual(shouldPersistCanonicalReport(report), true);
  const row = {
    id: 44,
    user_id: 1,
    request_type: 'property_intelligence',
    output_data: report,
    created_at: ASOF,
    confidence_level: report.confidence?.level,
  };
  const snapshot = JSON.stringify(row.output_data);
  annotateStoredAnalysis(row);
  assert.strictEqual(JSON.stringify(row.output_data), snapshot);
  assert.strictEqual(row.output_data.personalDecision.score, report.personalDecision.score);
  assert.strictEqual(
    JSON.stringify(row.output_data.decisionIntelligence.materialFindings),
    JSON.stringify(report.decisionIntelligence.materialFindings)
  );
});

asyncTest('What-if is request-scoped and ignores injected narrative heuristics', async () => {
  const report = await assemble();
  const publicResult = toPublicWhatIfHttp(
    executeIntelligenceWhatIf({
      property: listing(),
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
    }),
    access()
  );
  assert.strictEqual(publicResult.notSaved, true);
  assert.strictEqual(publicResult.persistence, 'request_scoped');
  assert.strictEqual(publicResult.scoreSource, 'personal-decision-whatif-1.0.0');
  const injected = executeIntelligenceWhatIf({
    property: listing(),
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
    intelligence: intelligenceFromCanonicalReport({
      ...report,
      recommendation: { action: 'Proceed with purchase' },
      strengths: [{ title: 'Garden' }],
    }),
  });
  assert.strictEqual(injected.change.score.after, publicResult.change.score.after);
});

asyncTest('persist helper refuses ACCESS_DENIED without calling create', async () => {
  const refused = await persistCompletedCanonicalAnalysis({
    userId: 1,
    requestType: 'property_intelligence',
    input: {},
    output: { success: false, code: 'ACCESS_DENIED', message: 'no' },
  });
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.code, 'REFUSED_UNSUCCESSFUL_REPORT');
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyIntelligenceProduction.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
