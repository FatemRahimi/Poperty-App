/**
 * LET_INVEST underwriting input completion tests.
 * Run: node server/tests/letInvestUnderwritingInputCompletion.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseCanonicalNumber, NUMERIC_STATES } = require('../services/ai/financeInputContract');
const {
  buildMissingUnderwritingInputs,
  metricResolutionHint,
  ROOT_CAUSE,
} = require('../services/ai/underwritingInputCompletion');
const { buildResidentialDecisionWorkspace } = require('../services/ai/residentialDecisionWorkspace');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

test('missing vs zero semantics preserved in finance contract', () => {
  assert.strictEqual(parseCanonicalNumber('').state, NUMERIC_STATES.MISSING);
  assert.strictEqual(parseCanonicalNumber(0).state, NUMERIC_STATES.EXPLICIT_ZERO);
  assert.strictEqual(parseCanonicalNumber(5).state, NUMERIC_STATES.POSITIVE_VALUE);
  assert.strictEqual(parseCanonicalNumber('abc').state, NUMERIC_STATES.INVALID);
});

test('vacancy missing is not zero evidence', () => {
  const report = {
    investment: {
      presented: {
        costEvidence: { missing: ['vacancyAssumption'], completeness: 'PARTIAL_EVIDENCE' },
        financeEvidence: { missing: [], completeness: 'NOT_ASSESSED' },
        noi: { available: false, state: 'notAssessed' },
      },
    },
    decisionIntelligence: { unresolvedDependencies: [] },
  };
  const built = buildMissingUnderwritingInputs(report);
  const vacancy = built.items.find((row) => row.inputKey === 'vacancyAssumption');
  assert.ok(vacancy);
  assert.strictEqual(vacancy.cause, ROOT_CAUSE.MISSING_USER_INPUT);
  assert.ok(vacancy.zeroValid);
});

test('workspace lists specific finance inputs not generic copy', () => {
  const report = {
    marketIntelligence: { sale: { notAssessed: true, success: false } },
    investment: {
      presented: {
        costEvidence: {
          missing: ['vacancyAssumption', 'maintenance', 'insurance', 'managementFee', 'serviceCharge', 'groundRent', 'taxes'],
        },
        financeEvidence: { missing: ['deposit', 'interestRate', 'mortgageTermYears'] },
        grossYield: { available: true, value: 6 },
        noi: { available: false, reason: 'Operating costs were not supplied' },
        annualCashFlow: { available: false },
        dscr: { available: false },
      },
    },
    personalDecision: { profile: 'landlord', available: false },
    decisionIntelligence: { unresolvedDependencies: [] },
  };
  const ws = buildResidentialDecisionWorkspace({
    decisionContext: { decisionJob: DECISION_JOB.LET_INVEST },
    report,
  });
  assert.ok(ws.missingUnderwritingInputs.items.length >= 7);
  assert.ok(ws.missingUnderwritingInputs.userInputCount >= 7);
  const noiHint = ws.keyIntelligence.find((row) => row.id === 'noi');
  assert.strictEqual(noiHint.isUserInput, true);
  assert.ok(noiHint.resolutionInputKeys.length > 0);
});

test('platform valuation gap is not user input', () => {
  const report = {
    marketIntelligence: {
      sale: { notAssessed: true, success: false, message: 'Insufficient evidence' },
    },
    investment: { presented: { costEvidence: { missing: [] }, financeEvidence: { missing: [] } } },
    personalDecision: { profile: 'landlord', available: false },
  };
  const built = buildMissingUnderwritingInputs(report);
  const val = built.items.find((row) => row.id === 'platform_valuation');
  assert.ok(val);
  assert.strictEqual(val.cause, ROOT_CAUSE.MISSING_PLATFORM_EVIDENCE);
  assert.strictEqual(val.provenance, null);
});

test('client cannot inject calculated outputs — forbidden keys unchanged', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'architecture', 'decisionContextContract.js'),
    'utf8'
  );
  assert.ok(src.includes('investment'));
  assert.ok(src.includes('personalDecision'));
});

function listing() {
  return {
    id: 149,
    title: 'Property for Sale',
    city: 'Bristol',
    zip_code: 'BS1 1HT',
    category: 'sale',
    price: 23000,
    monthly_rent: null,
    bedrooms: 1,
    property_type: 'flat',
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 900,
      currentRent: null,
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

asyncTest('supplying complete user inputs unlocks NOI cash flow and DSCR without assessing valuation', async () => {
  const base = await assemblePropertyIntelligenceReport({
    property: listing(),
    access: { allowed: true, userId: 1, role: 'owner', relationship: 'owner', accessLevel: 'professional_intelligence', propertyId: 149 },
    userId: 1,
    target: { propertyId: 149 },
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
      asOf: '2026-09-01T20:00:00.000Z',
      deps: deps(),
    },
  });
  const before = base.decisionWorkspace.keyIntelligence.reduce((acc, row) => {
    acc[row.id] = row.available;
    return acc;
  }, {});
  assert.strictEqual(before.grossYield, true);
  assert.strictEqual(before.noi, false);
  assert.strictEqual(before.valuation_range, false);

  const complete = await assemblePropertyIntelligenceReport({
    property: listing(),
    access: { allowed: true, userId: 1, role: 'owner', relationship: 'owner', accessLevel: 'professional_intelligence', propertyId: 149 },
    userId: 1,
    target: { propertyId: 149 },
    options: {
      decisionJob: 'LET_INVEST',
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipEpb: true,
      skipPlanning: true,
      asOf: '2026-09-01T20:00:00.000Z',
      deps: deps(),
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
    },
  });
  const after = complete.decisionWorkspace.keyIntelligence.reduce((acc, row) => {
    acc[row.id] = row.available;
    return acc;
  }, {});
  assert.strictEqual(after.noi, true);
  assert.strictEqual(after.annualCashFlow, true);
  assert.strictEqual(after.dscr, true);
  assert.strictEqual(after.valuation_range, false);
  assert.ok(complete.investment.presented.noi.available);
});

asyncTest('What-if does not mutate canonical analysis', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: listing(),
    access: { allowed: true, userId: 1, role: 'owner', relationship: 'owner', accessLevel: 'professional_intelligence', propertyId: 149 },
    userId: 1,
    target: { propertyId: 149 },
    options: { decisionJob: 'LET_INVEST', skipExplanation: true, deps: deps(), asOf: '2026-09-01T20:00:00.000Z' },
  });
  const before = JSON.stringify(report.investment);
  executeIntelligenceWhatIf({
    property: listing(),
    profile: 'landlord',
    baselineOptions: {},
    scenarioOptions: { vacancyAssumption: 10 },
    intelligence: {},
  });
  assert.strictEqual(before, JSON.stringify(report.investment));
});

test('BUY workspace does not expose missing underwriting inputs section', () => {
  const report = {
    marketIntelligence: {},
    investment: { presented: { costEvidence: { missing: ['vacancyAssumption'] } } },
    personalDecision: { profile: 'buyer_general' },
  };
  const ws = buildResidentialDecisionWorkspace({
    decisionContext: { decisionJob: DECISION_JOB.BUY },
    report,
  });
  assert.strictEqual(ws.missingUnderwritingInputs, undefined);
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`✓ ${item.name}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
