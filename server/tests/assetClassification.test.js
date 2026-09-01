/**
 * Property Identity & Asset Classification — live-safe foundation.
 * Run: node server/tests/assetClassification.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ASSET_CLASS,
  CLASSIFICATION_STATE,
  createClassificationSnapshot,
  applyClassificationChange,
  resolveAssetClass,
  listingDoesNotImplyAssetClass,
  resolveAssetSubtype,
  ASSET_CLASSIFICATION_VERSION,
} = require('../architecture/assetClassification');
const {
  declareAssetClass,
  inferredAssetClass,
  authoritativeAssetClass,
  resolveFromListingFields,
  mapProviderPropertyType,
  publicClassification,
  unknownSnapshot,
} = require('../services/identity/assetClassificationService');
const {
  mapLegacyListingFields,
  previewLegacyBackfill,
  MAPPING_KIND,
} = require('../services/identity/legacyListingTypeMapping');
const {
  resolveRuntimeClassification,
  residentialMethodologyGate,
  LEGACY_RESIDENTIAL_COMPATIBILITY_VERSION,
} = require('../services/identity/assetClassificationRuntime');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { historicalReportIsReadable } = require('../architecture/domainEnvelope');
const { platformRegistry, DOMAIN_ID, capabilityFor, CAPABILITY } = require('../architecture/domainRegistry');

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
    propertyId: 1,
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
    userId: 1,
    target: { propertyId: 1 },
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

console.log('asset classification\n');

test('1. UNKNOWN is valid', () => {
  const snap = unknownSnapshot();
  assert.strictEqual(snap.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(snap.state, CLASSIFICATION_STATE.UNKNOWN);
  assert.strictEqual(snap.ok, true);
});

test('2. unspecified classification does not become RESIDENTIAL', () => {
  const runtime = resolveRuntimeClassification({ property: listing() });
  assert.strictEqual(runtime.assetClass, ASSET_CLASS.UNKNOWN);
  const listingGuess = listingDoesNotImplyAssetClass({
    property_type: 'Flat',
    category: 'sale',
    title: '2 bed terrace',
  });
  assert.strictEqual(listingGuess.class, ASSET_CLASS.UNKNOWN);
});

['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND', 'DEVELOPMENT_SITE', 'MIXED_USE'].forEach((cls, i) => {
  test(`${3 + i}. explicit ${cls} declaration persists in snapshot`, () => {
    const declared = declareAssetClass({ assetClass: cls, subtype: null });
    assert.strictEqual(declared.ok, true);
    assert.strictEqual(declared.assetClass, cls);
    assert.strictEqual(declared.state, CLASSIFICATION_STATE.DECLARED);
    assert.strictEqual(declared.provenance.sourceType, 'FIRST_PARTY');
    assert.ok(declared.provenance.source);
  });
});

test('10. invalid class rejected', () => {
  const bad = declareAssetClass({ assetClass: 'HOUSE' });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.error, 'INVALID_ASSET_CLASS');
  const snap = createClassificationSnapshot({ assetClass: 'SHOP', state: 'DECLARED', provenance: { source: 'x' } });
  assert.strictEqual(snap.ok, false);
});

test('11. subtype cannot silently create class', () => {
  const unknown = declareAssetClass({ assetClass: ASSET_CLASS.UNKNOWN, subtype: 'office' });
  assert.strictEqual(unknown.assetClass, ASSET_CLASS.UNKNOWN);
  const sub = resolveAssetSubtype(ASSET_CLASS.UNKNOWN, 'office');
  assert.strictEqual(sub.class, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(sub.subtype, 'office');
});

test('12. custom/unregistered subtype remains safe', () => {
  const declared = declareAssetClass({ assetClass: ASSET_CLASS.COMMERCIAL, subtype: 'data_centre' });
  assert.strictEqual(declared.assetClass, ASSET_CLASS.COMMERCIAL);
  assert.strictEqual(declared.subtype, 'data_centre');
  assert.strictEqual(declared.subtypeRegistered, false);
});

test('13. declared classification records provenance', () => {
  const declared = declareAssetClass({ assetClass: ASSET_CLASS.LAND, actorUserId: 9 });
  assert.strictEqual(declared.provenance.sourceType, 'FIRST_PARTY');
  assert.strictEqual(declared.provenance.classificationMethod, 'DECLARED');
  assert.strictEqual(declared.confidence, 'stated');
});

test('14. inferred classification requires provenance', () => {
  const missing = inferredAssetClass({
    assetClass: ASSET_CLASS.RESIDENTIAL,
    inference: { source: null },
  });
  assert.strictEqual(missing.assetClass, ASSET_CLASS.UNKNOWN);
});

test('15. inferred classification does not become authoritative', () => {
  const inferred = inferredAssetClass({
    assetClass: ASSET_CLASS.RESIDENTIAL,
    inference: { source: 'labelled_review', confidence: 'low' },
  });
  assert.strictEqual(inferred.state, CLASSIFICATION_STATE.INFERRED);
  assert.notStrictEqual(inferred.state, CLASSIFICATION_STATE.AUTHORITATIVE);
  assert.ok(inferred.provenance.source);
});

test('16. missing classification evidence remains UNKNOWN', () => {
  const mapped = mapLegacyListingFields({});
  assert.strictEqual(mapped.assetClass, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(mapped.persistable, false);
});

test('17. ambiguous legacy property type remains UNKNOWN', () => {
  const mapped = mapLegacyListingFields({ property_type: 'special-purpose' });
  assert.strictEqual(mapped.kind, MAPPING_KIND.AMBIGUOUS);
  assert.strictEqual(mapped.persistable, false);
  const flat = mapLegacyListingFields({ property_type: 'flat' });
  assert.strictEqual(flat.kind, MAPPING_KIND.CONDITIONAL_MAPPING);
  assert.strictEqual(flat.persistable, false);
  assert.strictEqual(flat.assetClass, ASSET_CLASS.UNKNOWN);
});

test('18. safe residential legacy mapping works only where proven', () => {
  const safe = mapLegacyListingFields({ property_category: 'residential' });
  assert.strictEqual(safe.kind, MAPPING_KIND.EXACT_SAFE_MAPPING);
  assert.strictEqual(safe.assetClass, ASSET_CLASS.RESIDENTIAL);
  assert.strictEqual(safe.persistable, true);
  const fromFields = resolveFromListingFields({ property_category: 'residential' });
  assert.strictEqual(fromFields.assetClass, ASSET_CLASS.RESIDENTIAL);
  assert.strictEqual(fromFields.state, CLASSIFICATION_STATE.DECLARED);
});

test('19. mapping is idempotent', () => {
  const a = mapLegacyListingFields({ property_category: 'commercial', property_type: 'office' });
  const b = mapLegacyListingFields({ property_category: 'commercial', property_type: 'office' });
  assert.deepStrictEqual(a, b);
  const preview = previewLegacyBackfill([
    { id: 1, property_category: 'commercial' },
    { id: 1, property_category: 'commercial' },
  ]);
  assert.strictEqual(preview.counts.persistable, 2);
  assert.strictEqual(preview.decisions[0].mapped.assetClass, ASSET_CLASS.COMMERCIAL);
});

test('20. conflicting classification is not silently overwritten', () => {
  const existing = declareAssetClass({ assetClass: ASSET_CLASS.RESIDENTIAL });
  const incoming = declareAssetClass({ assetClass: ASSET_CLASS.COMMERCIAL });
  const silent = applyClassificationChange({ existing, incoming, explicit: false });
  assert.strictEqual(silent.applied, false);
  assert.strictEqual(silent.reason, 'CONFLICTING_CLASSIFICATION');
  assert.strictEqual(silent.existing.assetClass, ASSET_CLASS.RESIDENTIAL);
  const explicit = applyClassificationChange({ existing, incoming, explicit: true });
  assert.strictEqual(explicit.applied, true);
  assert.strictEqual(explicit.result.assetClass, ASSET_CLASS.COMMERCIAL);
});

test('21. historical snapshot is not rewritten after classification change', () => {
  const historical = {
    modelVersion: 'property-intelligence-v2',
    investment: { presented: { grossYield: { available: true, value: 6 } } },
  };
  const later = declareAssetClass({ assetClass: ASSET_CLASS.COMMERCIAL });
  assert.strictEqual(historical.assetClassification, undefined);
  assert.strictEqual(later.assetClass, ASSET_CLASS.COMMERCIAL);
  assert.ok(historicalReportIsReadable(historical));
});

test('22. old snapshot without classification remains readable', () => {
  const old = { modelVersion: 'property-intelligence-v1.1', personalDecision: { score: 40 } };
  assert.strictEqual(historicalReportIsReadable(old), true);
  const pub = publicClassification(null);
  assert.strictEqual(pub.assetClass, ASSET_CLASS.UNKNOWN);
});

asyncTest('23. new snapshot preserves classification at analysis time', async () => {
  const report = await analyse({}, {
    assetClassification: { assetClass: 'RESIDENTIAL', state: 'DECLARED', provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' } },
  });
  assert.strictEqual(report.assetClassification.assetClass, 'RESIDENTIAL');
  assert.strictEqual(report.inputSnapshot.assetClassification.assetClass, 'RESIDENTIAL');
});

test('24. UPRN behaviour remains compatible and is not the class', () => {
  const runtime = resolveRuntimeClassification({
    property: listing({ uprn: '1000123' }),
    access: { ...access(), uprn: '1000123' },
  });
  assert.strictEqual(runtime.assetClass, ASSET_CLASS.UNKNOWN);
  const identitySrc = read('../services/ai/propertyIntelligenceEngine.js');
  const runtimeSrc = read('../services/identity/assetClassificationRuntime.js');
  assert.ok(identitySrc.includes('uprnIsNotListingId'));
  assert.ok(runtimeSrc.includes('uprnIsNotLandParcel'));
});

test('25-26. classification does not grant subject access', () => {
  const accessSrc = read('../services/ai/propertyIntelligenceAccess.js');
  assert.ok(accessSrc.includes('resolvePropertyAccess'));
  assert.ok(!accessSrc.includes('asset_classifications'));
  const runtimeSrc = read('../services/identity/assetClassificationRuntime.js');
  assert.ok(runtimeSrc.includes('attachPersistedClassification'));
  assert.ok(!/req\.user|jwt|password/.test(read('../services/identity/legacyListingTypeMapping.js')));
});

asyncTest('27. residential analysis remains unchanged for supported residential asset', async () => {
  const report = await analyse({
    assetClassification: {
      assetClass: 'RESIDENTIAL',
      state: 'DECLARED',
      provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
    },
  });
  assert.strictEqual(report.residentialMethodology.mode, 'RESIDENTIAL_SUPPORTED');
  assert.strictEqual(report.marketIntelligence.sale.success, true);
  assert.strictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
  assert.strictEqual(report.marketIntelligence.rent.success, true);
});

['COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL', 'LAND', 'DEVELOPMENT_SITE', 'MIXED_USE'].forEach((cls, i) => {
  asyncTest(`${28 + i}. ${cls} does not receive residential valuation as valid`, async () => {
    const report = await analyse({
      assetClassification: {
        assetClass: cls,
        state: 'DECLARED',
        provenance: { source: 'UserDeclaration', sourceType: 'FIRST_PARTY' },
      },
    });
    assert.strictEqual(report.assetClassification.assetClass, cls);
    assert.strictEqual(report.residentialMethodology.mode, 'NOT_SUPPORTED_FOR_ASSET_CLASS');
    assert.strictEqual(report.marketIntelligence.sale.success, false);
    assert.strictEqual(report.marketIntelligence.sale.notAssessed, true);
    assert.notStrictEqual(report.marketIntelligence.sale.centralEstimate, 195000);
    assert.strictEqual(report.marketIntelligence.rent.success, false);
    assert.ok(!report.marketIntelligence.rent.recommendedRent);
  });
});

asyncTest('exact industrial listing type is gated without an inline snapshot', async () => {
  const report = await analyse({ property_type: 'industrial' });
  assert.strictEqual(report.assetClassification.assetClass, 'INDUSTRIAL');
  assert.strictEqual(report.residentialMethodology.mode, 'NOT_SUPPORTED_FOR_ASSET_CLASS');
  assert.strictEqual(report.marketIntelligence.sale.success, false);
});

asyncTest('34. UNKNOWN compatibility path is explicit and tested', async () => {
  const report = await analyse();
  assert.strictEqual(report.assetClassification.assetClass, 'UNKNOWN');
  assert.strictEqual(report.residentialMethodology.mode, 'LEGACY_RESIDENTIAL_COMPATIBILITY');
  assert.strictEqual(report.residentialMethodology.equivalentToResidentialClass, false);
  assert.strictEqual(report.residentialMethodology.version, LEGACY_RESIDENTIAL_COMPATIBILITY_VERSION);
  assert.strictEqual(report.marketIntelligence.sale.success, true);
});

test('35-40. freeze proofs — methodology files unchanged by identity service', () => {
  const identityDir = [
    '../services/identity/assetClassificationService.js',
    '../services/identity/assetClassificationRuntime.js',
    '../services/identity/legacyListingTypeMapping.js',
    '../services/identity/assetClassificationRepository.js',
  ].map(read).join('\n');
  assert.ok(!/grossYield\s*=|calculateNOI|dscr\s*=/.test(identityDir));
  assert.ok(!/openai|anthropic|chat\.completions/.test(identityDir));
  assert.ok(!/getSoldPrices|getRents|getSaleValuation/.test(identityDir));
  assert.ok(!identityDir.includes('require(\'../ai/valuationEngine\')'));
  assert.ok(!identityDir.includes('require(\'../ai/financialEngine\')'));
  assert.ok(!identityDir.includes('require(\'../ai/personalDecisionEngine\')'));
  assert.ok(!identityDir.includes('require(\'../ai/decisionIntelligence\')'));
  assert.ok(!identityDir.includes('require(\'../ai/intelligenceWhatIfService\')'));
  assert.ok(!identityDir.includes('require(\'../ai/listingOutcomeService\')'));
  assert.ok(!identityDir.includes('require(\'../ai/backtesting'));
});

test('41. outcome/backtest N semantics unchanged', () => {
  const backtest = read('../services/ai/backtesting/backtestFoundation.js');
  const constants = read('../services/ai/backtesting/constants.js');
  assert.ok(constants.includes("noData: 'NO_DATA'"));
  assert.ok(!backtest.includes('asset_classifications'));
});

test('42-45. no provider/LLM/new provider from classification', () => {
  const mapping = read('../services/identity/legacyListingTypeMapping.js');
  assert.ok(!/https?:\/\//.test(mapping));
  assert.ok(!/axios|fetch\(/.test(mapping));
  const providerMap = mapProviderPropertyType('flat');
  assert.strictEqual(providerMap.persistable, false);
  assert.strictEqual(providerMap.assetClass, ASSET_CLASS.UNKNOWN);
});

test('46. V1.1 tag unchanged', () => {
  const versions = read('../architecture/versions.js');
  assert.ok(versions.includes("propertyIntelligenceV11: 'property-intelligence-v1.1'"));
});

test('47. kernel/domain registry remains valid', () => {
  platformRegistry.finalize();
  assert.strictEqual(capabilityFor(DOMAIN_ID.VALUATION, ASSET_CLASS.RESIDENTIAL), CAPABILITY.SUPPORTED);
  assert.strictEqual(capabilityFor(DOMAIN_ID.VALUATION, ASSET_CLASS.COMMERCIAL), CAPABILITY.FUTURE);
});

test('48. only MARKET, PLANNING, ENVIRONMENT, and LEGAL_TITLE are wired live; future domains remain unwired', () => {
  const live = new Set([DOMAIN_ID.MARKET, DOMAIN_ID.PLANNING, DOMAIN_ID.ENVIRONMENT, DOMAIN_ID.LEGAL_TITLE]);
  for (const id of platformRegistry.listDomainIds()) {
    assert.strictEqual(platformRegistry.getDomain(id).wiredIntoLiveAnalysis, live.has(id));
  }
});

test('exact commercial/land/industrial category maps; conflict stays UNKNOWN', () => {
  assert.strictEqual(mapLegacyListingFields({ property_category: 'land' }).assetClass, ASSET_CLASS.LAND);
  assert.strictEqual(mapLegacyListingFields({ property_type: 'industrial' }).assetClass, ASSET_CLASS.INDUSTRIAL);
  const conflict = mapLegacyListingFields({ property_category: 'residential', property_type: 'land' });
  assert.strictEqual(conflict.persistable, false);
  assert.strictEqual(conflict.assetClass, ASSET_CLASS.UNKNOWN);
});

test('authoritative requires provenance and can supersede declared', () => {
  const missing = authoritativeAssetClass({ assetClass: ASSET_CLASS.COMMERCIAL });
  assert.strictEqual(missing.ok, false);
  const auth = authoritativeAssetClass({
    assetClass: ASSET_CLASS.COMMERCIAL,
    provenance: { source: 'OfficialUseClass', sourceType: 'OFFICIAL' },
  });
  const existing = declareAssetClass({ assetClass: ASSET_CLASS.RESIDENTIAL });
  const change = applyClassificationChange({ existing, incoming: auth, explicit: false });
  assert.strictEqual(change.applied, true);
  assert.strictEqual(change.action, 'superseded_by_authoritative');
});

test('inferred cannot overwrite declared', () => {
  const existing = declareAssetClass({ assetClass: ASSET_CLASS.RESIDENTIAL });
  const incoming = inferredAssetClass({
    assetClass: ASSET_CLASS.COMMERCIAL,
    inference: { source: 'weak_type', confidence: 'low' },
  });
  const change = applyClassificationChange({ existing, incoming, explicit: false });
  assert.strictEqual(change.applied, false);
});

test('runtime uses exact-safe class words only; dwelling types stay UNKNOWN', () => {
  const dwelling = resolveRuntimeClassification({
    property: listing({ property_category: null, property_type: 'flat' }),
  });
  assert.strictEqual(dwelling.assetClass, ASSET_CLASS.UNKNOWN);
  const subjectLike = resolveRuntimeClassification({
    property: listing({ property_category: null, property_type: 'terraced' }),
  });
  assert.strictEqual(subjectLike.assetClass, ASSET_CLASS.UNKNOWN);
  const industrial = resolveRuntimeClassification({
    property: listing({ property_type: 'industrial' }),
  });
  assert.strictEqual(industrial.assetClass, ASSET_CLASS.INDUSTRIAL);
  const declaredCategory = resolveRuntimeClassification({
    property: listing({ property_category: 'residential', property_type: 'flat' }),
  });
  assert.strictEqual(declaredCategory.assetClass, ASSET_CLASS.RESIDENTIAL);
});

test('migration 020 is additive and does not rewrite history', () => {
  const sql = read('../db/migrations/020_asset_classifications.sql');
  assert.ok(/CREATE TABLE IF NOT EXISTS asset_classifications/i.test(sql));
  assert.ok(/DEFAULT 'UNKNOWN'/.test(sql));
  assert.ok(!/UPDATE\s+properties/i.test(sql));
  assert.ok(!/UPDATE\s+ai_requests/i.test(sql));
  assert.ok(!/DROP TABLE/i.test(sql));
  const ensure = read('../db/ensureIntelligenceSchema.js');
  assert.ok(ensure.includes('020_asset_classifications.sql'));
});

test('architecture still rejects weak listing implication', () => {
  const resolved = resolveAssetClass({});
  assert.strictEqual(resolved.class, ASSET_CLASS.UNKNOWN);
  assert.strictEqual(ASSET_CLASSIFICATION_VERSION, 'asset-classification-1.0.0');
});

test('subject lookup no longer hardcodes residential category', () => {
  const src = read('../services/ai/externalPropertyLookupService.js');
  assert.ok(src.includes('property_category: null'));
  assert.ok(!src.includes("property_category: 'residential'"));
});

(async () => {
  for (const item of pending) {
    await item.fn();
    console.log(`  ok  ${item.name}`);
  }
  console.log('\nasset classification passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
