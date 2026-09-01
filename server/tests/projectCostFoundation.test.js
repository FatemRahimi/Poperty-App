/**
 * Project cost evidence foundation — not an estimator or feasibility engine.
 * Run: node server/tests/projectCostFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  DOMAIN_ID,
  IDENTITY_KIND,
  ASSET_CLASS,
  CAPABILITY,
  VISIBILITY,
  SOURCE_TYPE,
  UNIT,
  KERNEL_ASSESSMENT,
  PROJECT_COST_DOMAIN_VERSION,
  PROJECT_COST_CONTRACT_VERSION,
  DEVELOPMENT_DOMAIN_VERSION,
  DEVELOPMENT_PROJECT_CONTRACT_VERSION,
  LEGAL_TITLE_DOMAIN_VERSION,
  BUILDING_CONDITION_DOMAIN_VERSION,
  PLANNING_DOMAIN_VERSION,
  ENVIRONMENT_DOMAIN_VERSION,
  platformRegistry,
  capabilityFor,
  historicalReportIsReadable,
  createSubjectRef,
  createDevelopmentProject,
  createDevelopmentScenario,
  createWorkScope,
  createCostItem,
  createCostBenchmark,
  aggregateCompatibleCostItems,
  classifyLegacyRenovationCost,
  parseCostNumber,
  assertCostUnitsDistinct,
  deriveTotalFromRate,
  benchmarkApplies,
  COST_KIND,
  COST_CATEGORY,
  COST_UNIT,
  COST_COMPLETENESS,
  COST_SOURCE_TYPE,
  TAX_TREATMENT,
  WORK_SCOPE_TYPE,
  assertEvidenceVisibility,
} = require('../architecture');
const {
  adaptProjectCostFoundation,
  attachProjectCostFoundation,
} = require('../services/domains/projectCostDomain');
const { adaptDevelopmentFoundation } = require('../services/domains/developmentDomain');
const { adaptLegalTitleFoundation } = require('../services/domains/legalTitleDomain');
const { adaptBuildingConditionFoundation } = require('../services/domains/buildingConditionDomain');
const { composeLiveDomainEnvelopes } = require('../services/domains/composeLiveDomains');
const { adaptPlanningDomain } = require('../services/domains/planningDomain');
const { adaptEnvironmentDomain } = require('../services/domains/environmentDomain');
const { assessedPlanning } = require('../services/ai/planningEvidence');
const { assessedFlood } = require('../services/ai/floodEvidence');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function identity() {
  return { listingId: 12, subjectId: null, uprn: '10001233621' };
}

function quoteItem(overrides = {}) {
  return createCostItem({
    costItemId: 'q1',
    projectId: 'proj-1',
    costKind: COST_KIND.CONTRACTOR_QUOTE,
    sourceType: COST_SOURCE_TYPE.CONTRACTOR_QUOTE,
    amount: 10000,
    unit: COST_UNIT.GBP_TOTAL,
    quoteDate: '2026-01-01T00:00:00.000Z',
    priceBaseDate: '2026-01-01T00:00:00.000Z',
    scopeId: 'scope-1',
    exclusions: ['professional fees'],
    taxTreatment: TAX_TREATMENT.UNKNOWN,
    ...overrides,
  });
}

console.log('project cost foundation\n');

test('1. PROJECT_COST domain ID stable', () => {
  assert.strictEqual(DOMAIN_ID.PROJECT_COST, 'PROJECT_COST');
  assert.strictEqual(PROJECT_COST_DOMAIN_VERSION, 'project-cost-domain-0.1.0');
  assert.strictEqual(PROJECT_COST_CONTRACT_VERSION, 'project-cost-contract-0.1.0');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).implementationStatus, 'PARTIAL');
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).mayIncurProviderCost, false);
});

test('2-4. missing != zero; explicit zero preserved; invalid != zero', () => {
  assert.strictEqual(parseCostNumber(null).state, 'missing');
  assert.strictEqual(parseCostNumber(null).value, null);
  assert.notStrictEqual(parseCostNumber(null).value, 0);
  const zero = createCostItem({
    costItemId: 'z1',
    projectId: 'proj-1',
    costKind: COST_KIND.USER_BUDGET,
    amount: 0,
  });
  assert.strictEqual(zero.amount, 0);
  assert.strictEqual(zero.explicitZero, true);
  const invalid = createCostItem({
    costItemId: 'inv',
    projectId: 'proj-1',
    amount: Number.NaN,
  });
  assert.strictEqual(invalid.assessment.state, KERNEL_ASSESSMENT.INVALID_INPUT);
  assert.strictEqual(invalid.amount, null);
});

test('5-9. quote != actual; budget != cost; benchmark != fact; assumption != evidence; scenario != fact', () => {
  assert.throws(
    () => createCostItem({
      costItemId: 'q',
      projectId: 'p',
      costKind: COST_KIND.CONTRACTOR_QUOTE,
      asActualCost: true,
    }),
    /QUOTE_IS_NOT_ACTUAL_COST/
  );
  assert.throws(
    () => createCostItem({
      costItemId: 'b',
      projectId: 'p',
      costKind: COST_KIND.USER_BUDGET,
      amount: 100000,
      asAssessedProjectCost: true,
    }),
    /USER_BUDGET_IS_NOT_PROJECT_COST/
  );
  const budget = createCostItem({
    costItemId: 'b2',
    projectId: 'p',
    costKind: COST_KIND.USER_BUDGET,
    amount: 100000,
  });
  assert.strictEqual(budget.isUserBudget, true);
  assert.strictEqual(budget.isAssessedProjectCost, false);
  const bench = createCostBenchmark({
    benchmarkId: 'bm1',
    source: 'future-benchmark',
    unit: COST_UNIT.GBP_PER_SQM,
    applicableAssetClasses: [ASSET_CLASS.RESIDENTIAL],
  });
  assert.strictEqual(bench.isPropertySpecificFact, false);
  const assumption = createCostItem({
    costItemId: 'a1',
    projectId: 'p',
    costKind: COST_KIND.ASSUMPTION,
    amount: 50,
  });
  assert.strictEqual(assumption.isAssessedProjectCost, false);
  const scenario = createCostItem({
    costItemId: 's1',
    projectId: 'p',
    costKind: COST_KIND.SCENARIO,
    amount: 75,
  });
  assert.strictEqual(scenario.costKind, 'SCENARIO');
  assert.strictEqual(scenario.isAssessedProjectCost, false);
});

test('10-13. units and rate/quantity do not invent totals', () => {
  assert.throws(() => assertCostUnitsDistinct(COST_UNIT.GBP_PER_SQM, COST_UNIT.GBP_PER_SQFT), /INCOMPATIBLE_UNITS/);
  assert.throws(() => assertCostUnitsDistinct(COST_UNIT.GBP_TOTAL, COST_UNIT.GBP_PER_SQM), /TOTAL_IS_NOT_UNIT_RATE/);
  const rateOnly = createCostItem({
    costItemId: 'r1',
    projectId: 'p',
    costKind: COST_KIND.CONTRACTOR_QUOTE,
    sourceType: COST_SOURCE_TYPE.CONTRACTOR_QUOTE,
    unit: COST_UNIT.GBP_PER_SQM,
    unitRate: 1200,
  });
  assert.strictEqual(rateOnly.amount, null);
  assert.strictEqual(rateOnly.assessment.state, KERNEL_ASSESSMENT.INSUFFICIENT_EVIDENCE);
  const qtyOnly = createCostItem({
    costItemId: 'qty1',
    projectId: 'p',
    costKind: COST_KIND.CONTRACTOR_QUOTE,
    sourceType: COST_SOURCE_TYPE.CONTRACTOR_QUOTE,
    quantity: 40,
    quantityUnit: UNIT.SQM,
    unit: COST_UNIT.GBP_PER_SQM,
  });
  assert.strictEqual(qtyOnly.amount, null);
  const derived = deriveTotalFromRate({
    unitRate: 1200,
    quantity: 40,
    quantityUnit: UNIT.SQM,
    rateUnit: COST_UNIT.GBP_PER_SQM,
  });
  assert.strictEqual(derived.amount, 48000);
  const both = createCostItem({
    costItemId: 'both',
    projectId: 'p',
    costKind: COST_KIND.CONTRACTOR_QUOTE,
    sourceType: COST_SOURCE_TYPE.CONTRACTOR_QUOTE,
    unit: COST_UNIT.GBP_PER_SQM,
    unitRate: 1200,
    quantity: 40,
    quantityUnit: UNIT.SQM,
    scopeId: 'roof',
  });
  assert.strictEqual(both.amount, 48000);
  assert.strictEqual(both.derivedTotal, true);
});

test('14-16. quote and price-base dates preserved; old quote not current', () => {
  const old = quoteItem({
    quoteDate: '2022-03-01T00:00:00.000Z',
    priceBaseDate: '2022-03-01T00:00:00.000Z',
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.strictEqual(old.quoteDate, '2022-03-01T00:00:00.000Z');
  assert.strictEqual(old.priceBaseDate, '2022-03-01T00:00:00.000Z');
  assert.strictEqual(old.isCurrent, false);
  const expired = quoteItem({
    costItemId: 'exp',
    validUntil: '2025-01-01T00:00:00.000Z',
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.strictEqual(expired.expired, true);
  assert.strictEqual(expired.isCurrent, false);
  assert.strictEqual(expired.escalation, KERNEL_ASSESSMENT.NOT_ASSESSED);
});

test('17-20. VAT unknown; missing VAT != 0; no auto contingency or fees', () => {
  const item = quoteItem();
  assert.strictEqual(item.taxTreatment, TAX_TREATMENT.UNKNOWN);
  assert.strictEqual(item.vatAssumed, false);
  assert.strictEqual(item.contingencyAutoAdded, false);
  assert.strictEqual(item.professionalFeesAutoAdded, false);
  const agg = aggregateCompatibleCostItems({
    items: [item],
    projectId: 'proj-1',
  });
  assert.strictEqual(agg.contingencyAutoAdded, false);
  assert.strictEqual(agg.professionalFeesAutoAdded, false);
  assert.ok(!agg.quoteSubtotal.itemIds.some((id) => id === 'invented-fee'));
});

test('21-24. exclusions retained; no double-count; subtotal != total', () => {
  const q = quoteItem({ scopeId: 'roof' });
  assert.deepStrictEqual(q.exclusions, ['professional fees']);
  const actual = createCostItem({
    costItemId: 'act1',
    projectId: 'proj-1',
    scopeId: 'roof',
    costKind: COST_KIND.ACTUAL_COST,
    sourceType: COST_SOURCE_TYPE.ACTUAL_INVOICE,
    amount: 9000,
    incurredAt: '2026-06-01T00:00:00.000Z',
    evidenceRefs: ['invoice-1'],
  });
  const dup = quoteItem({ costItemId: 'q1' });
  const agg = aggregateCompatibleCostItems({
    items: [q, actual, dup],
    projectId: 'proj-1',
  });
  assert.strictEqual(agg.actualSubtotal.amount, 9000);
  assert.strictEqual(agg.quoteSubtotal.amount, null);
  assert.strictEqual(agg.isTotalProjectCost, false);
  assert.strictEqual(agg.completeness, COST_COMPLETENESS.PARTIAL);
  const complete = aggregateCompatibleCostItems({
    items: [actual],
    projectId: 'proj-1',
    completeness: COST_COMPLETENESS.COMPLETE_FOR_DECLARED_SCOPE,
  });
  assert.strictEqual(complete.isTotalProjectCost, true);
});

test('25-29. project/scenario/scope isolation; no property overwrite', () => {
  const a = quoteItem({ scenarioId: 'sc-a', amount: 10000 });
  const b = quoteItem({
    costItemId: 'q-b',
    scenarioId: 'sc-b',
    amount: 25000,
  });
  const aggA = aggregateCompatibleCostItems({
    items: [a, b],
    projectId: 'proj-1',
    scenarioId: 'sc-a',
  });
  assert.strictEqual(aggA.quoteSubtotal.amount, 10000);
  assert.ok(!aggA.quoteSubtotal.itemIds.includes('q-b'));
  const other = aggregateCompatibleCostItems({
    items: [a],
    projectId: 'proj-other',
  });
  assert.strictEqual(other.quoteSubtotal.amount, null);
  assert.throws(
    () => createCostItem({
      costItemId: 'pf',
      projectId: 'p',
      asPropertyFact: true,
    }),
    /PROJECT_COST_IS_NOT_PROPERTY_FACT/
  );
});

test('30-34. scope/condition/planning/legal/environment do not invent cost', () => {
  const project = createDevelopmentProject({ projectId: 'proj-1' });
  const scope = createWorkScope({
    scopeId: 'roof',
    projectId: 'proj-1',
    scopeType: WORK_SCOPE_TYPE.ENVELOPE_WORK,
    description: 'replace roof',
  });
  const { envelope } = adaptProjectCostFoundation({
    project,
    scopes: [scope],
    conditionEvidenceRefs: ['cond-1'],
    planningEvidenceRefs: ['plan-1'],
    legalEvidenceRefs: ['legal-1'],
    environmentEvidenceRefs: ['env-1'],
  });
  assert.strictEqual(envelope.status, 'NOT_ASSESSED');
  assert.ok(envelope.findings.some((row) => row.id === 'scope_defined_without_cost'));
  assert.strictEqual(envelope.assessment.assessedProjectCost, null);
  assert.strictEqual(envelope.assessment.conditionInventedCost, false);
  assert.strictEqual(envelope.assessment.planningInventedCost, false);
  assert.strictEqual(envelope.assessment.legalInventedCost, false);
  assert.strictEqual(envelope.assessment.environmentInventedCost, false);
});

test('35-40 + 41-45. live domains and foundations unchanged', () => {
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.BUILDING_CONDITION).wiredIntoLiveAnalysis, false);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.DEVELOPMENT).wiredIntoLiveAnalysis, false);
  assert.strictEqual(LEGAL_TITLE_DOMAIN_VERSION, 'legal-title-domain-0.1.0');
  assert.strictEqual(BUILDING_CONDITION_DOMAIN_VERSION, 'building-condition-domain-0.1.0');
  assert.strictEqual(DEVELOPMENT_DOMAIN_VERSION, 'development-domain-0.1.0');
  assert.strictEqual(DEVELOPMENT_PROJECT_CONTRACT_VERSION, 'development-project-contract-0.1.0');
  assert.strictEqual(adaptDevelopmentFoundation({}).envelope.assessment.projectDefined, false);
  assert.strictEqual(adaptLegalTitleFoundation({ identity: identity() }).envelope.assessment.liveLegalAssessmentAvailable, false);
  assert.strictEqual(adaptBuildingConditionFoundation({ identity: identity() }).envelope.assessment.liveConditionAssessmentAvailable, false);
});

test('46-52. asset-class safety including LAND and UNKNOWN', () => {
  ['COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'MIXED_USE', 'LAND', 'DEVELOPMENT_SITE', 'UNKNOWN'].forEach((cls) => {
    const { envelope, assetClassUnchanged } = adaptProjectCostFoundation({
      project: createDevelopmentProject({ projectId: `p-${cls}` }),
      assetClassification: { assetClass: cls },
    });
    assert.strictEqual(envelope.assessment.residentialMethodologyActivated, false);
    assert.strictEqual(envelope.assessment.buildingConditionRequired, false);
    assert.strictEqual(assetClassUnchanged, cls);
    if (cls !== 'UNKNOWN') {
      assert.strictEqual(capabilityFor(DOMAIN_ID.PROJECT_COST, cls), CAPABILITY.CONDITIONAL);
    }
  });
  const residentialBench = createCostBenchmark({
    benchmarkId: 'res-refurb',
    source: 'future',
    unit: COST_UNIT.GBP_PER_SQM,
    applicableAssetClasses: [ASSET_CLASS.RESIDENTIAL],
  });
  assert.strictEqual(benchmarkApplies(residentialBench, { assetClass: ASSET_CLASS.INDUSTRIAL }), false);
  assert.strictEqual(benchmarkApplies(residentialBench, { assetClass: ASSET_CLASS.RESIDENTIAL }), true);
});

test('53-54. private costs cannot become shared property evidence', () => {
  const item = quoteItem({ createdBy: 9 });
  assert.strictEqual(item.visibility, VISIBILITY.PRIVATE);
  assert.strictEqual(item.sharedPropertyEvidence, false);
  assert.throws(
    () => assertEvidenceVisibility({
      factType: 'contractorQuote',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: true,
    }),
    /PRIVATE_DATA_CANNOT_BE_SHARED_PROPERTY_EVIDENCE/
  );
});

test('55. historical cost evidence is not repriced', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  assert.strictEqual(old.projectCostDomain, undefined);
  const item = quoteItem({
    quoteDate: '2022-01-01T00:00:00.000Z',
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.strictEqual(item.escalation, KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.strictEqual(item.amount, 10000);
});

test('56-59. no LLM, provider, feasibility, or schedule', () => {
  const src = read('../services/domains/projectCostDomain.js');
  assert.ok(!src.includes('openai'));
  assert.ok(!src.includes('getSoldPrices'));
  assert.ok(!src.includes('grossDevelopmentValue'));
  assert.ok(!src.includes('critical path'));
  assert.ok(src.includes('noAdditionalProviderCall: true'));
  const { envelope } = adaptProjectCostFoundation({
    project: createDevelopmentProject({ projectId: 'proj-1' }),
    costItems: [quoteItem()],
  });
  assert.strictEqual(envelope.assessment.impliesFeasibility, false);
  assert.strictEqual(envelope.assessment.impliesSchedule, false);
  assert.ok(!/will cost £|expensive|viable|affordable/i.test(JSON.stringify(envelope.findings)));
});

test('62. V1.1 and live domain versions unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
  assert.strictEqual(PLANNING_DOMAIN_VERSION, 'planning-domain-1.0.0');
  assert.strictEqual(ENVIRONMENT_DOMAIN_VERSION, 'environment-domain-1.0.0');
});

test('renovationCost remains a frozen finance input, not assessed project cost', () => {
  const legacy = classifyLegacyRenovationCost();
  assert.strictEqual(legacy.field, 'renovationCost');
  assert.strictEqual(legacy.isAssessedProjectCost, false);
  assert.strictEqual(legacy.feedsCurrentFinance, true);
  assert.strictEqual(legacy.feedsValuation, false);
  assert.strictEqual(legacy.frozen, true);
  assert.strictEqual(legacy.costKind, COST_KIND.USER_BUDGET);
});

test('adapter records quote and budget without claiming total cost', () => {
  const project = createDevelopmentProject({ projectId: 'proj-1' });
  const { envelope, aggregation } = adaptProjectCostFoundation({
    project,
    costItems: [
      quoteItem(),
      createCostItem({
        costItemId: 'bud',
        projectId: 'proj-1',
        costKind: COST_KIND.USER_BUDGET,
        amount: 100000,
      }),
    ],
    analysisAt: '2026-08-30T00:00:00.000Z',
  });
  assert.ok(envelope.findings.some((row) => row.id.startsWith('quote_recorded')));
  assert.ok(envelope.findings.some((row) => row.id.startsWith('user_budget_recorded')));
  assert.ok(envelope.findings.some((row) => row.id === 'cost_evidence_partial'));
  assert.strictEqual(aggregation.isTotalProjectCost, false);
  assert.strictEqual(envelope.assessment.impliesValuationAdjustment, false);
  assert.strictEqual(envelope.assessment.impliesFinanceChange, false);
});

test('actual cost requires expenditure evidence', () => {
  assert.throws(
    () => createCostItem({
      costItemId: 'bare-actual',
      projectId: 'p',
      costKind: COST_KIND.ACTUAL_COST,
      amount: 1,
    }),
    /ACTUAL_COST_REQUIRES_EXPENDITURE_EVIDENCE/
  );
});

test('live composer still excludes PROJECT_COST', () => {
  const planning = adaptPlanningDomain({
    planningEvidence: assessedPlanning({
      subjectApplications: [],
      nearbyApplications: [],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: identity(),
      radiusMetres: 400,
      queryKind: 'geometry',
    }),
    identity: identity(),
  }).envelope;
  const environment = adaptEnvironmentDomain({
    floodEvidence: assessedFlood({
      zone: 3,
      layersMatched: ['Flood Zone 3'],
      retrievedAt: '2026-08-01T10:00:00.000Z',
      identity: { ...identity(), latitude: 51.5, longitude: -0.12 },
    }),
    identity: identity(),
  }).envelope;
  const live = composeLiveDomainEnvelopes([planning, environment]);
  assert.strictEqual(live.byId.PROJECT_COST, undefined);
  assert.strictEqual(live.domains.length, 2);
});

test('malformed attach degrades', () => {
  const attached = attachProjectCostFoundation({ project: { projectId: null }, costItems: [{}] });
  assert.strictEqual(attached.projectCostDomain.domain, 'PROJECT_COST');
});

test('scenario identity remains distinct from finance What-if', () => {
  const scenario = createDevelopmentScenario({
    scenarioId: 'dev-sc-1',
    projectId: 'proj-1',
  });
  assert.strictEqual(scenario.isFinanceWhatIf, false);
});

test('UNKNOWN cost kind remains valid', () => {
  const item = createCostItem({
    costItemId: 'unk',
    projectId: 'p',
    costKind: COST_KIND.UNKNOWN,
  });
  assert.strictEqual(item.costKind, 'UNKNOWN');
});

asyncTest('35-40 + 60-61. live PI, finance, What-if, outcomes unchanged', async () => {
  const report = await assemblePropertyIntelligenceReport({
    property: {
      id: 12,
      title: 'Project cost foundation fixture',
      category: 'sale',
      property_type: 'terraced',
      price: 200000,
      monthly_rent: 1000,
      city: 'Manchester',
      zip_code: 'M1 1AA',
    },
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: 12,
    },
    userId: 1,
    target: { propertyId: 12 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipFlood: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      asOf: '2026-08-30T00:00:00.000Z',
      deps: {
        analyseRent: async () => ({
          success: true,
          recommendedRent: 1100,
          marketRange: { low: 1000, high: 1200 },
          comparables: [],
        }),
        calculatePropertyValuation: async () => ({
          success: true,
          centralEstimate: 195000,
          assessmentState: 'assessed',
        }),
        generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
      },
    },
  });
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.projectCostDomain, undefined);
  assert.strictEqual(report.domains.byId.PROJECT_COST, undefined);
  assert.ok(report.planningDomain);
  assert.ok(report.environmentDomain);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.recommendedRent, 1100);
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(!engine.includes('adaptProjectCostFoundation'));
  assert.ok(!engine.includes('attachProjectCostFoundation'));
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  assert.ok(whatIf.includes('notSaved'));
  const finance = read('../services/ai/financialEngine.js');
  assert.ok(finance.includes('renovationCost'));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nproject cost foundation passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
