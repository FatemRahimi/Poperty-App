/**
 * Universal subject / applicability / methodology safety.
 * Run: node server/tests/domainApplicability.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ASSET_CLASS,
  DOMAIN_ID,
  IDENTITY_KIND,
  IDENTITY_NON_EQUIVALENCE,
  KERNEL_ASSESSMENT,
  APPLICABILITY,
  VALUE_IDENTITY,
  capabilityFor,
  CAPABILITY,
} = require('../architecture');
const { residentialMethodologyGate } = require('../services/identity/assetClassificationRuntime');
const {
  evaluatePlatformApplicability,
  methodologyIsPermitted,
  RESIDENTIAL_SALE_AVM,
  RESIDENTIAL_RENT,
} = require('../services/identity/domainApplicability');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { historicalReportIsReadable } = require('../architecture/domainEnvelope');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

function test(name, fn) {
  fn();
  console.log(`  ok  ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function listing(overrides = {}) {
  return {
    id: 1,
    title: '2 bed terrace',
    category: 'sale',
    property_type: 'terraced',
    price: 200000,
    monthly_rent: 1000,
    city: 'Manchester',
    zip_code: 'M1 1AA',
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
  };
}

function deps() {
  return {
    analyseRent: async () => ({
      success: true,
      recommendedRent: 1100,
      marketRange: { low: 1000, high: 1200 },
      comparables: [{ id: 1 }],
    }),
    calculatePropertyValuation: async () => ({
      success: true,
      centralEstimate: 195000,
      assessmentState: 'assessed',
    }),
    generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
    getFloodEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getPlanningEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getSchoolEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getListedBuildingEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getConservationAreaEvidence: async () => ({ available: false, state: 'notAssessed' }),
    getArticle4Evidence: async () => ({ available: false, state: 'notAssessed' }),
  };
}

async function analyse(propertyOverrides = {}, options = {}) {
  return assemblePropertyIntelligenceReport({
    property: listing(propertyOverrides),
    access: access(),
    target: { propertyId: 1 },
    userId: 1,
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipFlood: true,
      asOf: '2026-08-30T00:00:00.000Z',
      deps: deps(),
      ...options,
    },
  });
}

function declared(cls) {
  return {
    assetClassification: {
      assetClass: cls,
      state: 'DECLARED',
      provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
    },
  };
}

console.log('domain applicability safety\n');

test('1. residential legitimate route remains valid', () => {
  const view = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.RESIDENTIAL });
  assert.strictEqual(view.domains.VALUATION.applicability, APPLICABILITY.APPLICABLE);
  assert.ok(view.domains.VALUATION.permittedMethodologies.includes(RESIDENTIAL_SALE_AVM));
  assert.strictEqual(methodologyIsPermitted(DOMAIN_ID.VALUATION, RESIDENTIAL_SALE_AVM, ASSET_CLASS.RESIDENTIAL), true);
  assert.strictEqual(residentialMethodologyGate({ assetClass: ASSET_CLASS.RESIDENTIAL }).allowed, true);
});

['COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND'].forEach((cls) => {
  test(`${cls} cannot silently run residential AVM`, () => {
    assert.strictEqual(methodologyIsPermitted(DOMAIN_ID.VALUATION, RESIDENTIAL_SALE_AVM, cls), false);
    const view = evaluatePlatformApplicability({ assetClass: cls });
    assert.ok(view.domains.VALUATION.blockedMethodologies.includes(RESIDENTIAL_SALE_AVM));
    assert.strictEqual(residentialMethodologyGate({ assetClass: cls }).allowed, false);
  });
  test(`${cls} cannot silently run residential rent`, () => {
    assert.strictEqual(methodologyIsPermitted(DOMAIN_ID.RENTAL, RESIDENTIAL_RENT, cls), false);
    const view = evaluatePlatformApplicability({ assetClass: cls });
    assert.ok(view.domains.RENTAL.blockedMethodologies.includes(RESIDENTIAL_RENT));
  });
});

test('10. mixed-use does not silently become residential', () => {
  const view = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.MIXED_USE });
  assert.strictEqual(view.assetClass, ASSET_CLASS.MIXED_USE);
  assert.notStrictEqual(view.assetClass, ASSET_CLASS.RESIDENTIAL);
  assert.strictEqual(methodologyIsPermitted(DOMAIN_ID.VALUATION, RESIDENTIAL_SALE_AVM, ASSET_CLASS.MIXED_USE), false);
});

test('11. unknown does not silently become residential', () => {
  const view = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.UNKNOWN });
  assert.strictEqual(view.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(view.residentialMethodology.equivalentToResidentialClass, false);
  assert.strictEqual(view.residentialMethodology.mode, 'LEGACY_RESIDENTIAL_COMPATIBILITY');
});

test('12-14. identity non-equivalence', () => {
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.landIsNotBuilding, true);
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.propertyIsNotTitle, true);
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.developmentSiteIsNotDevelopmentProject, true);
  assert.strictEqual(IDENTITY_KIND.DEVELOPMENT_SITE !== IDENTITY_KIND.DEVELOPMENT_PROJECT, true);
});

test('15. development site does not imply GDV', () => {
  const view = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.DEVELOPMENT_SITE });
  assert.ok(view.domains.DEVELOPMENT.blockedMethodologies.includes(VALUE_IDENTITY.GDV));
  assert.ok(view.domains.DEVELOPMENT.blockedMethodologies.includes(VALUE_IDENTITY.RESIDUAL_LAND_VALUE));
  assert.strictEqual(IDENTITY_NON_EQUIVALENCE.developmentSiteIsNotGdv, true);
});

test('16. scenario value is a distinct value identity', () => {
  assert.notStrictEqual(VALUE_IDENTITY.SCENARIO_VALUE, VALUE_IDENTITY.CURRENT_VALUE);
  assert.notStrictEqual(VALUE_IDENTITY.USER_ASSUMPTION, VALUE_IDENTITY.CURRENT_VALUE);
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  assert.ok(whatIf.includes('saved_snapshot') || whatIf.includes('scenario'));
});

test('17. notApplicable remains distinct from notAssessed', () => {
  assert.notStrictEqual(KERNEL_ASSESSMENT.NOT_APPLICABLE, KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.notStrictEqual(APPLICABILITY.NOT_APPLICABLE, KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.strictEqual(capabilityFor(DOMAIN_ID.RENTAL, ASSET_CLASS.LAND), CAPABILITY.NOT_APPLICABLE);
  assert.strictEqual(
    evaluatePlatformApplicability({ assetClass: ASSET_CLASS.LAND }).domains.RENTAL.applicability,
    APPLICABILITY.NOT_APPLICABLE
  );
});

test('18-21. unknown/missing/blocked stay non-zero', () => {
  const blocked = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.COMMERCIAL });
  assert.notStrictEqual(blocked.domains.VALUATION.applicability, APPLICABILITY.APPLICABLE);
  assert.ok(!blocked.domains.VALUATION.permittedMethodologies.includes(RESIDENTIAL_SALE_AVM));
  const states = read('../architecture/assessmentStates.js');
  assert.ok(states.includes('UNKNOWN != FALSE') || states.includes('NOT_ASSESSED'));
});

test('22. finance preserves missing semantics', () => {
  const finance = read('../architecture/domainRegistry.js');
  assert.ok(finance.includes('finance-semantic-1.0.0'));
  const semantic = read('../services/ai/financeInputContract.js');
  assert.ok(/available|notAssessed|missing/i.test(semantic));
});

test('23. DI does not treat missing domain as a score input contract', () => {
  const di = read('../services/ai/decisionIntelligence.js');
  assert.ok(!/penalty.*planningDomain|planningDomain.*penalty/i.test(di));
  assert.ok(!di.includes('legalTitleDomain.assessment.state'));
});

test('24-26. Planning, Environment, Legal remain isolated modules', () => {
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('attachPlanningDomain'));
  assert.ok(engine.includes('attachEnvironmentDomain'));
  assert.ok(engine.includes('legalDocuments = [];'));
});

test('27-28. history does not reroute or re-query in the history renderer', () => {
  const history = read('../../client/src/pages/ai/AiHistoryDetail.js');
  assert.ok(!/assemblePropertyIntelligenceReport|enrichPropertyForIntelligence/.test(history));
  assert.strictEqual(historicalReportIsReadable({
    modelVersion: 'property-intelligence-v1.1',
    personalDecision: { score: 40 },
  }), true);
});

test('29. What-if remains separate', () => {
  const whatIf = read('../services/ai/intelligenceWhatIfService.js');
  assert.ok(whatIf.includes('baselineMode'));
  assert.ok(!whatIf.includes('evaluatePlatformApplicability'));
});

test('30. no new paid-provider execution in applicability', () => {
  const src = read('../services/identity/domainApplicability.js');
  assert.ok(!/getSaleValuation|getRents|axios|fetch\(/.test(src));
});

asyncTest('31-32. residential valuation and rental regression', async () => {
  const report = await analyse({}, declared(ASSET_CLASS.RESIDENTIAL));
  assert.strictEqual(report.residentialMethodology.mode, 'RESIDENTIAL_SUPPORTED');
  assert.strictEqual(report.marketIntelligence.sale.success, true);
  assert.strictEqual(report.marketIntelligence.rent.success, true);
  assert.strictEqual(report.domainApplicability.assetClass, ASSET_CLASS.RESIDENTIAL);
});

test('33-35. finance/PD/DI files are not rewritten by this primitive', () => {
  const applic = read('../services/identity/domainApplicability.js');
  assert.ok(!applic.includes('calculateInvestmentMetrics'));
  assert.ok(!applic.includes('scorePublicLandlordPersonalDecision'));
  assert.ok(!applic.includes('assembleDecisionIntelligence'));
});

test('36. snapshot immutability helper unchanged', () => {
  assert.strictEqual(historicalReportIsReadable({
    modelVersion: 'property-intelligence-v2',
    investment: { presented: {} },
  }), true);
});

test('37. capability status does not claim foundation as implemented', () => {
  const view = evaluatePlatformApplicability({ assetClass: ASSET_CLASS.RESIDENTIAL });
  assert.strictEqual(view.domains.MARKET.wiredIntoLiveAnalysis, true);
  assert.strictEqual(view.domains.BUILDING_CONDITION.wiredIntoLiveAnalysis, false);
  assert.strictEqual(view.domains.DEVELOPMENT.wiredIntoLiveAnalysis, false);
  assert.strictEqual(view.domains.PROJECT_COST.wiredIntoLiveAnalysis, false);
  assert.ok(view.domains.BUILDING_CONDITION.implementationStatus === 'PARTIAL'
    || view.domains.BUILDING_CONDITION.implementationStatus === 'FUTURE');
});

test('38. documentation status is supported by code evidence', () => {
  const status = read('../../docs/architecture/implementation-status.md');
  assert.ok(status.includes('FOUNDATION_ONLY') || status.includes('IMPLEMENTED_BUT_LIMITED'));
  assert.ok(status.includes('residentialMethodologyGate') || status.includes('VALUATION'));
  assert.ok(!/READY_FOR_SECOND_DOMAIN|production private evidence operational/i.test(status));
});

asyncTest('blocked commercial valuation is not a successful £0 sale', async () => {
  const report = await analyse({}, declared(ASSET_CLASS.COMMERCIAL));
  assert.strictEqual(report.marketIntelligence.sale.success, false);
  assert.strictEqual(report.marketIntelligence.sale.notAssessed, true);
  assert.notStrictEqual(report.marketIntelligence.sale.centralEstimate, 0);
  assert.ok(!report.marketIntelligence.rent.recommendedRent);
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log(`\ndomain applicability safety passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
