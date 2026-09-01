/**
 * V1.2 platform architecture foundation — contracts only, not live engines.
 * Run: node server/tests/platformArchitectureFoundation.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const kernel = require('../architecture');
const {
  ASSET_CLASS,
  resolveAssetClass,
  listingDoesNotImplyAssetClass,
  resolveAssetSubtype,
  CLASSIFICATION_STATE,
  createClassificationSnapshot,
  applyClassificationChange,
  DOMAIN_ID,
  platformRegistry,
  createRegistry,
  createEvidence,
  EVIDENCE_CLASS,
  SOURCE_TYPE,
  VISIBILITY,
  createMeasuredValue,
  assertCompatibleUnits,
  UNIT,
  createDomainEnvelope,
  composeDomainOutputs,
  DOMAIN_STATUS,
  KERNEL_ASSESSMENT,
  mapExistingAssessment,
  isAuthoritativeEvidence,
  missingIsNotFalse,
  missingIsNotZero,
  assertEvidenceVisibility,
  PRIVATE_FACT_TYPES,
  historicalReportIsReadable,
  FROZEN_PRODUCTION_VERSIONS,
  KERNEL_VERSION,
  CANONICAL_IDENTITY_VERSION,
  createSubjectRef,
  IDENTITY_KIND,
  SPATIAL_RELATION,
  TIME_FIELD,
  createDecisionContribution,
  capabilityFor,
  CAPABILITY,
} = kernel;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    throw err;
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

console.log('platform architecture foundation\n');

test('1. UNKNOWN asset class remains valid', () => {
  const resolved = resolveAssetClass({});
  assert.strictEqual(resolved.class, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(resolved.method, 'UNKNOWN');
  assert.ok(Object.values(ASSET_CLASS).includes(ASSET_CLASS.UNKNOWN));
});

test('2. unsupported asset class is not guessed from listing fields', () => {
  const guessed = listingDoesNotImplyAssetClass({
    property_type: 'Flat',
    category: 'sale',
    title: '2 bed terrace',
  });
  assert.strictEqual(guessed.class, ASSET_CLASS.UNKNOWN);
  assert.notStrictEqual(guessed.class, ASSET_CLASS.RESIDENTIAL);
});

test('3. domain IDs are stable', () => {
  const ids = platformRegistry.listDomainIds();
  assert.deepStrictEqual(ids, [
    'ASSET_MANAGEMENT',
    'BUILDING_CONDITION',
    'DECISION',
    'DEVELOPMENT',
    'DEVELOPMENT_FEASIBILITY',
    'ENVIRONMENT',
    'FINANCE',
    'IDENTITY',
    'LEGAL_TITLE',
    'MAINTENANCE_CAPEX',
    'MARKET',
    'PLANNING',
    'PORTFOLIO',
    'PROJECT_COST',
    'PROJECT_MANAGEMENT',
    'RENTAL',
    'VALUATION',
  ]);
  assert.strictEqual(DOMAIN_ID.VALUATION, 'VALUATION');
});

test('4. domain registry rejects duplicate IDs', () => {
  const registry = createRegistry();
  registry.registerDomain({ id: 'IDENTITY', version: '1' });
  assert.throws(() => registry.registerDomain({ id: 'IDENTITY', version: '2' }), /Duplicate/);
});

test('5. domain dependencies cannot reference unknown domains', () => {
  const registry = createRegistry();
  registry.registerDomain({ id: 'A', version: '1', dependencies: ['MISSING'] });
  assert.throws(() => registry.assertDependencies(), /unknown domain MISSING/);
});

test('6. obvious dependency cycles are rejected', () => {
  const registry = createRegistry();
  registry.registerDomain({ id: 'A', version: '1', dependencies: ['B'] });
  registry.registerDomain({ id: 'B', version: '1', dependencies: ['A'] });
  assert.throws(() => registry.detectCycles(), /cycle/);
});

test('7. evidence requires provenance/source semantics', () => {
  const subject = createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '12' });
  assert.throws(
    () => createEvidence({
      domain: 'VALUATION',
      subjectRef: subject,
      factType: 'askingPrice',
      classification: EVIDENCE_CLASS.FACT,
      sourceType: SOURCE_TYPE.FIRST_PARTY,
    }),
    /provenance.source/
  );
  const ok = createEvidence({
    domain: 'VALUATION',
    subjectRef: subject,
    factType: 'askingPrice',
    classification: EVIDENCE_CLASS.FACT,
    sourceType: SOURCE_TYPE.FIRST_PARTY,
    provenance: { source: 'InternalListing' },
    value: 200000,
    unit: UNIT.GBP,
  });
  assert.strictEqual(ok.source, 'InternalListing');
});

test('8. missing evidence does not become false', () => {
  const evidence = createEvidence({
    domain: 'LEGAL_TITLE',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.SUBJECT, id: 's1' }),
    factType: 'listedBuilding',
    classification: EVIDENCE_CLASS.NOT_ASSESSED,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: { source: 'HistoricEngland' },
  });
  assert.strictEqual(evidence.value, null);
  assert.strictEqual(missingIsNotFalse(evidence), null);
  assert.notStrictEqual(missingIsNotFalse(evidence), false);
});

test('9. missing numeric evidence does not become zero', () => {
  const evidence = createEvidence({
    domain: 'FINANCE',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.LISTING, id: '1' }),
    factType: 'groundRent',
    classification: EVIDENCE_CLASS.NOT_ASSESSED,
    sourceType: SOURCE_TYPE.FIRST_PARTY,
    provenance: { source: 'InternalListing' },
  });
  assert.strictEqual(missingIsNotZero(evidence), null);
  assert.notStrictEqual(evidence.value, 0);
});

test('10. unit-bearing values retain unit', () => {
  const measured = createMeasuredValue(450, UNIT.GBP_PER_SQFT);
  assert.strictEqual(measured.unit, UNIT.GBP_PER_SQFT);
  assert.strictEqual(measured.value, 450);
});

test('11. incompatible units are not silently treated as equivalent', () => {
  assert.throws(() => assertCompatibleUnits(UNIT.GBP_PER_SQFT, UNIT.GBP_PER_SQM), /INCOMPATIBLE_UNITS/);
  assert.strictEqual(assertCompatibleUnits(UNIT.GBP, UNIT.GBP), true);
});

test('12. FACT and AREA_CONTEXT remain distinct', () => {
  assert.notStrictEqual(EVIDENCE_CLASS.FACT, EVIDENCE_CLASS.AREA_CONTEXT);
  const fact = createEvidence({
    domain: 'PLANNING',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.SUBJECT, id: 's1' }),
    factType: 'listedBuildingMatch',
    classification: EVIDENCE_CLASS.FACT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: { source: 'planning.data.gov.uk' },
    spatialRelation: SPATIAL_RELATION.SUBJECT,
  });
  const context = createEvidence({
    domain: 'ENVIRONMENT',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.SUBJECT, id: 's1' }),
    factType: 'nearbySchool',
    classification: EVIDENCE_CLASS.AREA_CONTEXT,
    sourceType: SOURCE_TYPE.OFFICIAL,
    provenance: { source: 'planning.data.gov.uk' },
    spatialRelation: SPATIAL_RELATION.NEARBY,
  });
  assert.notStrictEqual(fact.classification, context.classification);
});

test('13. USER_INPUT and FACT remain distinct', () => {
  assert.notStrictEqual(EVIDENCE_CLASS.USER_INPUT, EVIDENCE_CLASS.FACT);
});

test('14. SCENARIO and FACT remain distinct', () => {
  assert.notStrictEqual(EVIDENCE_CLASS.SCENARIO, EVIDENCE_CLASS.FACT);
});

test('15. MODEL_ASSISTED is not authoritative by default', () => {
  const evidence = createEvidence({
    domain: 'LEGAL_TITLE',
    subjectRef: createSubjectRef({ kind: IDENTITY_KIND.SUBJECT, id: 's1' }),
    factType: 'covenantSummary',
    classification: EVIDENCE_CLASS.INFERENCE,
    sourceType: SOURCE_TYPE.MODEL_ASSISTED,
    provenance: { source: 'llm_extraction' },
    authoritative: true,
  });
  assert.strictEqual(evidence.authoritative, false);
  assert.strictEqual(isAuthoritativeEvidence(evidence), false);
});

test('16. domain NOT_ASSESSED does not crash report composition', () => {
  const composed = composeDomainOutputs([
    createDomainEnvelope({ domain: 'VALUATION', version: 'v', status: DOMAIN_STATUS.AVAILABLE }),
    createDomainEnvelope({ domain: 'LEGAL_TITLE', version: 'v', status: DOMAIN_STATUS.NOT_ASSESSED }),
  ]);
  assert.strictEqual(composed.domains.length, 2);
  assert.strictEqual(composed.notAssessed.length, 1);
});

test('17. unavailable domain does not erase available domains', () => {
  const composed = composeDomainOutputs([
    createDomainEnvelope({ domain: 'FINANCE', version: 'v', status: DOMAIN_STATUS.AVAILABLE }),
    createDomainEnvelope({ domain: 'LEGAL_TITLE', version: 'v', status: DOMAIN_STATUS.UNAVAILABLE }),
  ]);
  assert.ok(composed.byId.FINANCE);
  assert.strictEqual(composed.available[0].domain, 'FINANCE');
  assert.strictEqual(composed.unavailable[0].domain, 'LEGAL_TITLE');
});

test('18. private data is not represented as shared property evidence', () => {
  assert.ok(PRIVATE_FACT_TYPES.includes('mortgage'));
  assert.throws(
    () => assertEvidenceVisibility({
      factType: 'mortgage',
      visibility: VISIBILITY.PRIVATE,
      sharedPropertyEvidence: true,
    }),
    /PRIVATE_DATA_CANNOT_BE_SHARED/
  );
});

test('19. domain version is explicit', () => {
  const valuation = platformRegistry.getDomain(DOMAIN_ID.VALUATION);
  assert.ok(valuation.version);
  const envelope = createDomainEnvelope({ domain: DOMAIN_ID.VALUATION, version: valuation.version });
  assert.strictEqual(envelope.version, valuation.version);
  assert.ok(KERNEL_VERSION);
  assert.strictEqual(CANONICAL_IDENTITY_VERSION, 'canonical-subject-identity-1.0.0');
});

test('20. historical V1.1 output remains readable', () => {
  const v11 = {
    modelVersion: 'property-intelligence-v1.1',
    investment: { presented: { grossYield: { available: true, value: 6 } } },
    personalDecision: { score: 50 },
  };
  assert.strictEqual(historicalReportIsReadable(v11), true);
  assert.strictEqual(FROZEN_PRODUCTION_VERSIONS.propertyIntelligenceV11, 'property-intelligence-v1.1');
});

test('21-25. live engines are not imported or rewritten by the kernel', () => {
  const archDir = path.join(__dirname, '..', 'architecture');
  fs.readdirSync(archDir).forEach((file) => {
    const src = fs.readFileSync(path.join(archDir, file), 'utf8');
    assert.ok(!src.includes("require('../services/ai/valuationEngine')"));
    assert.ok(!src.includes("require('../services/ai/financialEngine')"));
    assert.ok(!src.includes("require('../services/ai/personalDecisionEngine')"));
    assert.ok(!src.includes("require('../services/ai/decisionIntelligence')"));
    assert.ok(!src.includes("require('../services/ai/intelligenceWhatIfService')"));
  });

  const live = [
    '../services/ai/valuationEngine.js',
    '../services/ai/financialEngine.js',
    '../services/ai/financeInputContract.js',
    '../services/ai/personalDecisionEngine.js',
    '../services/ai/decisionIntelligence.js',
    '../services/ai/intelligenceWhatIfService.js',
    '../services/ai/propertyIntelligenceEngine.js',
  ];
  live.forEach((rel) => {
    const src = read(rel);
    assert.ok(!src.includes("require('../architecture") && !src.includes('require("../architecture'));
  });
});

test('26. provider-cost protection unchanged (kernel does not call providers)', () => {
  const arch = fs.readdirSync(path.join(__dirname, '..', 'architecture'))
    .map((f) => read(`../architecture/${f}`))
    .join('\n');
  assert.ok(!/getSoldPrices|getRents|getSaleValuation|openai|anthropic/i.test(arch));
  assert.ok(platformRegistry.getDomain(DOMAIN_ID.VALUATION).mayIncurProviderCost);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.FINANCE).mayIncurProviderCost, false);
});

test('27. outcome/backtest files are not imported', () => {
  const arch = fs.readdirSync(path.join(__dirname, '..', 'architecture'))
    .map((f) => read(`../architecture/${f}`))
    .join('\n');
  assert.ok(!arch.includes("require('../services/ai/backtesting"));
  assert.ok(!arch.includes("require('../services/ai/listingOutcomeService')"));
});

test('28. no provider call introduced', () => {
  const arch = fs.readdirSync(path.join(__dirname, '..', 'architecture'))
    .map((f) => read(`../architecture/${f}`))
    .join('\n');
  assert.ok(!/https?:\/\//.test(arch));
  assert.ok(!/axios|fetch\(|http\.request/.test(arch));
});

test('29. no LLM call introduced', () => {
  const arch = fs.readdirSync(path.join(__dirname, '..', 'architecture'))
    .map((f) => read(`../architecture/${f}`))
    .join('\n');
  assert.ok(!/chat\.completions|openai|anthropic|generatePropertyExplanation/.test(arch));
});

test('30. V1.1 / frozen production versions retain historical meaning', () => {
  assert.strictEqual(FROZEN_PRODUCTION_VERSIONS.propertyIntelligence, 'property-intelligence-v2');
  assert.strictEqual(FROZEN_PRODUCTION_VERSIONS.assessmentSafety, 'assessment-safety-1.0.0');
  assert.strictEqual(FROZEN_PRODUCTION_VERSIONS.financeSemantic, 'finance-semantic-1.0.0');
  const engine = read('../services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes("property-intelligence-v2"));
  const safety = read('../services/ai/valuationAssessmentSafety.js');
  assert.ok(safety.includes("assessment-safety-1.0.0"));
  const finance = read('../services/ai/financeInputContract.js');
  assert.ok(finance.includes("finance-semantic-1.0.0"));
});

test('inferred class requires provenance; weak inference stays UNKNOWN', () => {
  const weak = resolveAssetClass({ inferred: ASSET_CLASS.RESIDENTIAL, inference: { source: null } });
  assert.strictEqual(weak.class, ASSET_CLASS.UNKNOWN);
  const labelled = resolveAssetClass({
    inferred: ASSET_CLASS.RESIDENTIAL,
    inference: { source: 'user_declared_form', confidence: 'low' },
  });
  assert.strictEqual(labelled.class, ASSET_CLASS.RESIDENTIAL);
  assert.strictEqual(labelled.method, 'INFERRED');
});

test('existing assessment names map without rewrite', () => {
  assert.strictEqual(mapExistingAssessment({ state: 'assessed' }), KERNEL_ASSESSMENT.ASSESSED);
  assert.strictEqual(mapExistingAssessment({ state: 'notAssessed' }), KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.strictEqual(mapExistingAssessment({ available: false }), KERNEL_ASSESSMENT.NOT_ASSESSED);
  assert.strictEqual(mapExistingAssessment({ available: true, value: 0 }), KERNEL_ASSESSMENT.ASSESSED);
});

test('future residential valuation is not reused as commercial capability', () => {
  assert.strictEqual(capabilityFor(DOMAIN_ID.VALUATION, ASSET_CLASS.RESIDENTIAL), CAPABILITY.SUPPORTED);
  assert.strictEqual(capabilityFor(DOMAIN_ID.VALUATION, ASSET_CLASS.COMMERCIAL), CAPABILITY.FUTURE);
  assert.strictEqual(capabilityFor(DOMAIN_ID.VALUATION, ASSET_CLASS.AGRICULTURAL), CAPABILITY.FUTURE);
});

test('classification states include AUTHORITATIVE without treating UNKNOWN as error', () => {
  assert.strictEqual(CLASSIFICATION_STATE.UNKNOWN, 'UNKNOWN');
  assert.strictEqual(CLASSIFICATION_STATE.AUTHORITATIVE, 'AUTHORITATIVE');
  const unknown = createClassificationSnapshot({ assetClass: ASSET_CLASS.UNKNOWN, state: CLASSIFICATION_STATE.UNKNOWN });
  assert.strictEqual(unknown.ok, true);
  const existing = createClassificationSnapshot({
    assetClass: ASSET_CLASS.RESIDENTIAL,
    state: CLASSIFICATION_STATE.DECLARED,
    provenance: { source: 'UserDeclaration' },
  });
  const incoming = createClassificationSnapshot({
    assetClass: ASSET_CLASS.COMMERCIAL,
    state: CLASSIFICATION_STATE.INFERRED,
    provenance: { source: 'weak' },
  });
  const rejected = applyClassificationChange({ existing, incoming, explicit: false });
  assert.strictEqual(rejected.applied, false);
});

test('unregistered subtype remains extensible without inventing class', () => {
  const sub = resolveAssetSubtype(ASSET_CLASS.COMMERCIAL, 'data_centre');
  assert.strictEqual(sub.registered, false);
  assert.strictEqual(sub.subtype, 'data_centre');
});

test('time fields are distinct', () => {
  assert.notStrictEqual(TIME_FIELD.retrievedAt, TIME_FIELD.evidenceAsOf);
  assert.notStrictEqual(TIME_FIELD.observedAt, TIME_FIELD.analysisAt);
});

test('spatial proximity is not a legal claim', () => {
  assert.ok(SPATIAL_RELATION.NEARBY);
  assert.ok(SPATIAL_RELATION.UNKNOWN);
});

test('DI V2 contribution cannot create domain facts', () => {
  const c = createDecisionContribution({
    domain: DOMAIN_ID.LEGAL_TITLE,
    domainVersion: 'legal-title-0.0.0',
    materialFindings: ['title docs missing'],
  });
  assert.strictEqual(c.createsDomainFacts, false);
});

test('platform registry has no cycles and only MARKET, PLANNING, ENVIRONMENT, and LEGAL_TITLE are wired live', () => {
  platformRegistry.finalize();
  const live = new Set([DOMAIN_ID.MARKET, DOMAIN_ID.PLANNING, DOMAIN_ID.ENVIRONMENT, DOMAIN_ID.LEGAL_TITLE]);
  for (const id of platformRegistry.listDomainIds()) {
    assert.strictEqual(
      platformRegistry.getDomain(id).wiredIntoLiveAnalysis,
      live.has(id)
    );
    assert.strictEqual(platformRegistry.getDomain(id).llmAuthoritative, false);
  }
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PLANNING).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.ENVIRONMENT).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.LEGAL_TITLE).wiredIntoLiveAnalysis, true);
  assert.strictEqual(platformRegistry.getDomain(DOMAIN_ID.PROJECT_COST).wiredIntoLiveAnalysis, false);
});

console.log('\nplatform architecture foundation passed');
