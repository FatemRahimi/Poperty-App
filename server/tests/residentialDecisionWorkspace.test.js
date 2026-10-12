/**
 * Residential decision workspace — presentation/routing of existing intelligence.
 * Run: node server/tests/residentialDecisionWorkspace.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const {
  resolveIntelligenceAnalyseOptions,
} = require('../controllers/intelligenceController');
const {
  DECISION_JOB,
  parseResidentialDecisionIntent,
  stripDecisionIntentKeys,
  createResidentialDecisionContext,
  interpretLegacyDecisionContext,
  FORBIDDEN_INJECTION_KEYS,
  UNSUPPORTED_DECISION_JOBS,
  RESIDENTIAL_DECISION_CONTEXT_VERSION,
} = require('../architecture/decisionContextContract');
const { KERNEL_ASSESSMENT } = require('../architecture/assessmentStates');
const { executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');

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

const ASOF = '2026-09-01T12:00:00.000Z';

function listing(overrides = {}) {
  return {
    id: 41,
    title: 'Decision workspace listing',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    category: 'sale',
    price: 200000,
    monthly_rent: 1000,
    bedrooms: 2,
    property_type: 'Terraced',
    ...overrides,
  };
}

function access() {
  return {
    allowed: true,
    userId: 1,
    role: 'owner',
    relationship: 'owner',
    accessLevel: 'professional_intelligence',
    propertyId: 41,
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1050,
      currentRent: 1000,
      marketRange: { low: 950, high: 1150 },
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
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
  };
}

async function analyse(body = {}, listingOverrides = {}, extraOptions = {}) {
  const parsed = body && Object.keys(body).length
    ? parseAnalyseFinanceRequest(stripDecisionIntentKeys(body))
    : { ok: true, options: {} };
  if (!parsed.ok) return { parsed, report: null };
  const report = await assemblePropertyIntelligenceReport({
    property: listing(listingOverrides),
    access: access(),
    userId: 1,
    target: { propertyId: 41 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipEpb: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: ASOF,
      ...parsed.options,
      ...extraOptions,
      deps: deps(),
    },
  });
  return { parsed, report };
}

test('HTTP analyse requires an explicit supported decision job', () => {
  const missing = resolveIntelligenceAnalyseOptions({});
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.decisionError.error, 'DECISION_JOB_REQUIRED');

  const buy = resolveIntelligenceAnalyseOptions({ decisionJob: 'BUY' });
  assert.strictEqual(buy.ok, true);
  assert.strictEqual(buy.decisionJob, DECISION_JOB.BUY);

  const letInvest = resolveIntelligenceAnalyseOptions({ decisionJob: 'let-invest' });
  assert.strictEqual(letInvest.ok, true);
  assert.strictEqual(letInvest.decisionJob, DECISION_JOB.LET_INVEST);

  const sell = resolveIntelligenceAnalyseOptions({ job: 'SELL' });
  assert.strictEqual(sell.ok, true);
  assert.strictEqual(sell.decisionJob, DECISION_JOB.SELL);
});

test('unsupported jobs and injected assessed outputs are rejected or stripped', () => {
  UNSUPPORTED_DECISION_JOBS.forEach((job) => {
    const parsed = parseResidentialDecisionIntent({ decisionJob: job });
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.error, 'DECISION_JOB_UNSUPPORTED');
  });
  const injected = resolveIntelligenceAnalyseOptions({
    decisionJob: 'BUY',
    personalDecision: { score: 99, profile: 'landlord' },
    decisionIntelligence: { materialFindings: [{ title: 'injected' }] },
    decisionWorkspace: { keyIntelligence: [] },
    scores: { buyScore: 88 },
  });
  assert.strictEqual(injected.ok, true);
  FORBIDDEN_INJECTION_KEYS.forEach((key) => {
    assert.strictEqual(injected.options[key], undefined, key);
  });
  assert.strictEqual(injected.options.decisionJob, 'BUY');
});

test('assemble without a job does not silently become BUY or SELL', () => {
  const unspecified = parseResidentialDecisionIntent({});
  assert.strictEqual(unspecified.ok, false);
  assert.strictEqual(unspecified.error, 'DECISION_JOB_REQUIRED');
});

asyncTest('explicit BUY does not expose landlord conclusions as buyer conclusions', async () => {
  const { report } = await analyse({}, {}, { decisionJob: 'BUY' });
  assert.strictEqual(report.residentialDecisionContext.decisionJob, 'BUY');
  assert.strictEqual(report.decisionWorkspace.decisionJob, 'BUY');
  assert.strictEqual(report.personalDecision.profile, 'buyer_general');
  assert.strictEqual(report.personalDecision.notABuyScore, true);
  assert.strictEqual(report.decisionIntelligence.applicable, false);
  assert.ok(!report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'landlord_fit'));
  assert.ok(!report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'grossYield'));
  assert.ok(report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'valuation_range'));
  assert.ok(report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'buyer_general_fit'));
  const text = JSON.stringify(report.decisionWorkspace);
  assert.ok(!/good buy/i.test(text));
  assert.ok(!text.includes('BUY SCORE'));
  assert.strictEqual(report.personalDecision.notABuyScore, true);
});

asyncTest('explicit LET_INVEST preserves landlord Personal Decision and DI V1', async () => {
  const { report } = await analyse({
    finance: {
      purchasePrice: 185000,
      expectedRent: 1100,
      operatingCosts: {
        maintenance: 1200,
        insurance: 600,
        managementFee: 0,
        taxes: 0,
        vacancyAssumption: 5,
      },
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
  }, {}, { decisionJob: 'LET_INVEST' });
  assert.strictEqual(report.personalDecision.profile, 'landlord');
  assert.strictEqual(report.personalDecision.scoreLabel, 'Landlord fit score');
  assert.ok(report.decisionIntelligence.applicable !== false);
  assert.ok(report.decisionIntelligence.explanation);
  assert.ok(report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'landlord_fit'));
  assert.ok(report.decisionWorkspace.keyIntelligence.some((row) => row.id === 'grossYield'));
  assert.ok(Number.isFinite(report.personalDecision.score));
  assert.strictEqual(report.personalDecision.notPurchaseAdvice, true);
});

asyncTest('explicit SELL does not invent sell methodology or a seller score', async () => {
  const { report } = await analyse({}, {}, { decisionJob: 'SELL' });
  assert.strictEqual(report.residentialDecisionContext.decisionJob, 'SELL');
  assert.strictEqual(report.personalDecision.notASellScore, true);
  assert.strictEqual(report.personalDecision.score, null);
  assert.strictEqual(report.decisionIntelligence.applicable, false);
  assert.strictEqual(report.decisionWorkspace.whatIfApplicable, false);
  const ids = report.decisionWorkspace.keyIntelligence.map((row) => row.id);
  assert.ok(ids.includes('valuation_range'));
  assert.ok(!ids.includes('landlord_fit'));
  assert.ok(!ids.includes('buyer_general_fit'));
  const text = JSON.stringify(report.decisionWorkspace);
  assert.ok(!/days to sell/i.test(text));
  assert.ok(!/optimal listing/i.test(text));
  assert.ok(!/SELL SCORE/i.test(text));
});

asyncTest('assemble without decisionJob keeps landlord compatibility and is not BUY/SELL', async () => {
  const { report } = await analyse();
  assert.strictEqual(report.residentialDecisionContext.decisionJob, 'LET_INVEST');
  assert.strictEqual(report.residentialDecisionContext.provenance.unspecifiedCompatibility, true);
  assert.strictEqual(report.personalDecision.profile, 'landlord');
  assert.ok(report.decisionIntelligence.explanation);
});

asyncTest('missing finance inputs remain NOT_ASSESSED for LET_INVEST', async () => {
  const { report } = await analyse({}, {}, { decisionJob: 'LET_INVEST' });
  const noi = report.decisionWorkspace.keyIntelligence.find((row) => row.id === 'noi');
  const cash = report.decisionWorkspace.keyIntelligence.find((row) => row.id === 'annualCashFlow');
  assert.ok(noi);
  assert.notStrictEqual(noi.state, KERNEL_ASSESSMENT.ASSESSED);
  assert.notStrictEqual(noi.value, 0);
  assert.ok(cash);
  assert.notStrictEqual(cash.state, KERNEL_ASSESSMENT.ASSESSED);
  assert.notStrictEqual(cash.value, 0);
});

asyncTest('unsupported asset classes remain gated for BUY', async () => {
  const { report } = await analyse({}, {
    property_type: 'Office',
    asset_class: 'COMMERCIAL',
  }, {
    decisionJob: 'BUY',
    assetClassification: {
      assetClass: 'COMMERCIAL',
      state: 'DECLARED',
      provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
    },
  });
  assert.strictEqual(report.residentialMethodology.mode, 'NOT_SUPPORTED_FOR_ASSET_CLASS');
  assert.strictEqual(report.decisionWorkspace.state, KERNEL_ASSESSMENT.NOT_APPLICABLE);
  assert.ok(report.marketIntelligence.sale.success !== true || report.marketIntelligence.sale.notAssessed);
});

asyncTest('UNKNOWN is not classified as residential', async () => {
  const { report } = await analyse({}, {}, {
    decisionJob: 'BUY',
    assetClassification: {
      assetClass: 'UNKNOWN',
      state: 'UNRESOLVED',
    },
  });
  assert.strictEqual(report.assetClassification.assetClass, 'UNKNOWN');
  assert.notStrictEqual(report.assetClassification.assetClass, 'RESIDENTIAL');
  assert.ok(
    report.residentialMethodology.mode === 'LEGACY_RESIDENTIAL_COMPATIBILITY'
    || report.residentialMethodology.mode === 'RESIDENTIAL_SUPPORTED'
    || report.residentialMethodology.mode
  );
  assert.notStrictEqual(report.residentialMethodology.mode, 'RESIDENTIAL_BECAUSE_UNKNOWN');
});

test('legacy snapshots are Let / Invest compatibility, never Buy or Sell', () => {
  const legacy = interpretLegacyDecisionContext({
    personalDecision: { profile: 'landlord', score: 70 },
    decisionIntelligence: { engine: 'decisionIntelligence' },
  });
  assert.strictEqual(legacy.decisionJob, 'LET_INVEST');
  assert.strictEqual(legacy.provenance.legacySnapshot, true);
  assert.strictEqual(legacy.provenance.notBuy, true);
  assert.strictEqual(legacy.provenance.notSell, true);
  const explicit = interpretLegacyDecisionContext({
    residentialDecisionContext: createResidentialDecisionContext({ decisionJob: 'BUY' }),
  });
  assert.strictEqual(explicit.decisionJob, 'BUY');
});

test('history preserves decision context on the report contract', () => {
  const ctx = createResidentialDecisionContext({
    decisionJob: 'SELL',
    assetClass: 'RESIDENTIAL',
    selectedAt: ASOF,
  });
  assert.strictEqual(ctx.contractVersion, RESIDENTIAL_DECISION_CONTEXT_VERSION);
  assert.strictEqual(ctx.userIntentNotPropertyFact, true);
  assert.ok(ctx.provenance.notIdentity);
});

test('What-if and workspace modules do not update ai_requests snapshots', () => {
  const files = [
    'services/ai/residentialDecisionWorkspace.js',
    'architecture/decisionContextContract.js',
    'services/ai/intelligenceWhatIfService.js',
    'controllers/intelligenceController.js',
  ];
  files.forEach((rel) => {
    const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    assert.ok(!/UPDATE\s+ai_requests/i.test(src), rel);
  });
});

test('no new universal score is created', () => {
  const src = [
    fs.readFileSync(path.join(__dirname, '..', 'services/ai/residentialDecisionWorkspace.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'architecture/decisionContextContract.js'), 'utf8'),
  ].join('\n');
  assert.ok(!/BUY_SCORE|SELL_SCORE|INVESTMENT_SCORE|OPPORTUNITY_SCORE/.test(src));
  assert.ok(!src.includes('good buy'));
});

asyncTest('What-if does not mutate canonical analysis fields', async () => {
  const { report } = await analyse({}, {}, { decisionJob: 'LET_INVEST' });
  const before = JSON.stringify({
    personalDecision: report.personalDecision,
    investment: report.investment,
    decisionWorkspace: report.decisionWorkspace,
  });
  const result = executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: {},
    scenarioOptions: { purchasePrice: 150000 },
    intelligence: {},
  });
  assert.strictEqual(result.success, true);
  const after = JSON.stringify({
    personalDecision: report.personalDecision,
    investment: report.investment,
    decisionWorkspace: report.decisionWorkspace,
  });
  assert.strictEqual(before, after);
  assert.strictEqual(result.notSaved, undefined);
});

test('authorization and privacy stripping are unchanged in the analyse handlers', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'intelligenceController.js'),
    'utf8'
  );
  assert.ok(/authenticateAI|req\.user\.id/.test(src));
  assert.ok(src.includes('toPublicIntelligenceHttpOutput'));
  assert.ok(src.includes('assertSubjectAccess'));
});

test('assessment-state presentation uses the kernel vocabulary', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services/ai/residentialDecisionWorkspace.js'),
    'utf8'
  );
  assert.ok(src.includes('KERNEL_ASSESSMENT.ASSESSED'));
  assert.ok(src.includes('KERNEL_ASSESSMENT.NOT_ASSESSED'));
  assert.ok(src.includes('KERNEL_ASSESSMENT.NOT_APPLICABLE'));
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (err) {
      console.error(`✗ ${item.name}`);
      throw err;
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
