/**
 * V1.1 Phase 6B — Subject analyse access boundary.
 * Reuses the Phase 6A hybrid lookup/created_by rule on POST subject analyse.
 * Does not change scoring, credits-on-success, analyse lease, listing analyse, What-if, or history.
 * Run: node server/tests/propertyIntelligenceSubjectAnalyseAccess.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  evaluateSubjectPreviewAccess,
  assertSubjectPreviewAccess,
  assertSubjectAccess,
  SUBJECT_PREVIEW_NOT_FOUND_PUBLIC,
} = require('../services/ai/externalPropertyLookupService');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const {
  ANALYSIS_FAILED_PUBLIC,
  INTERNAL_ERROR_CODE,
  publicFailureBody,
} = require('../services/ai/propertyIntelligenceProduction');
const { LANDLORD_WEIGHTS, WHAT_IF_VERSION, OUTCOME_THRESHOLDS } = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { toListingNumber, getMonthlyRent } = require('../services/ai/propertyDataAggregator');
const { ANALYSIS_IN_PROGRESS_CODE } = require('../services/ai/propertyIntelligenceAnalyseGuard');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(__dirname, '../../client/src');

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readClient(rel) {
  return fs.readFileSync(path.join(CLIENT, rel), 'utf8');
}

function analyseFnSource() {
  const src = read('controllers/intelligenceController.js');
  const start = src.indexOf('const analyseSubjectIntelligence');
  const end = src.indexOf('const unlinkSubjectListing');
  assert.ok(start >= 0 && end > start);
  return src.slice(start, end);
}

function mockRes() {
  let status = 200;
  let body;
  return {
    get statusCode() {
      return status;
    },
    get body() {
      return body;
    },
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
}

test('ONE subject-access rule: analyse reuses the Phase 6A helper', () => {
  assert.strictEqual(assertSubjectAccess, assertSubjectPreviewAccess);
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 7, subjectId: 42, hasLookup: true }),
    true
  );
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 7, subjectId: 42, hasLookup: false, createdBy: 7 }),
    true
  );
});

test('fresh resolve records the lookup relationship before analyse', () => {
  const lookup = read('services/ai/externalPropertyLookupService.js');
  const resolve = lookup.slice(
    lookup.indexOf('async function resolveExternalSubject'),
    lookup.indexOf('async function getRecentSubjectLookups')
  );
  assert.ok(resolve.includes('await recordSubjectLookup(userId, subject.id)'));
  assert.ok(resolve.includes("createdBy: userId"));
});

test('unauthorized guessed id and nonexistent subject share the same 404', () => {
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 2, subjectId: 42, hasLookup: false, createdBy: 1 }),
    false
  );
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 2, subjectId: 999999, hasLookup: false }),
    false
  );
  assert.strictEqual(SUBJECT_PREVIEW_NOT_FOUND_PUBLIC, 'Analysis subject not found.');
  const fn = analyseFnSource();
  assert.ok(fn.includes('assertSubjectAccess(req.user && req.user.id, subjectId)'));
  assert.ok(fn.indexOf('assertSubjectAccess') < fn.indexOf('runFullPropertyAnalysis'));
  assert.ok(fn.indexOf('assertSubjectAccess') < fn.indexOf('saveAnalysis'));
});

test('denied subject analyse cannot consume credits or persist', () => {
  const fn = analyseFnSource();
  assert.ok(!fn.includes('consumeCredit'));
  assert.ok(fn.indexOf('assertSubjectAccess') < fn.indexOf('saveAnalysis({'));
  const persist = read('services/ai/propertyIntelligenceProduction.js');
  assert.ok(persist.includes('AiSubscription.consumeCredit'));
  assert.ok(persist.includes('shouldPersistCanonicalReport'));
});

test('subject analyse route still uses credits eligibility and the Postgres lease', () => {
  const routes = read('routes/aiRoutes.js');
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analyseSubjectIntelligence/.test(
      routes
    )
  );
  assert.strictEqual(ANALYSIS_IN_PROGRESS_CODE, 'ANALYSIS_IN_PROGRESS');
  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(guard.includes('pi_analyse_slots'));
});

test('Phase 6A preview and What-if guards are unchanged', () => {
  const controller = read('controllers/intelligenceController.js');
  const preview = controller.slice(
    controller.indexOf('const getSubjectPreviewEndpoint'),
    controller.indexOf('const analyseSubjectIntelligence')
  );
  assert.ok(preview.includes('assertSubjectPreviewAccess(req.user && req.user.id, subjectId)'));
  const whatIf = controller.slice(controller.indexOf('const compareIntelligenceWhatIf'));
  assert.ok(whatIf.includes('const previewAccess = await assertSubjectPreviewAccess'));
  assert.ok(!/const access = await assertSubjectPreviewAccess/.test(whatIf));
});

test('listing analyse, history, and engine internals stay on their existing contracts', () => {
  const routes = read('routes/aiRoutes.js');
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
      routes
    )
  );
  const listing = read('controllers/intelligenceController.js');
  const listingFn = listing.slice(
    listing.indexOf('const analysePropertyIntelligence'),
    listing.indexOf('const getPropertyAnalysisHistory')
  );
  assert.ok(!listingFn.includes('assertSubjectAccess'));
  const history = read('controllers/aiController.js');
  assert.ok(history.includes("sql += ' AND user_id = $2'") || read('models/AiRequest.js').includes("sql += ' AND user_id = $2'"));
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('getSubjectPreview(target.subjectId)'));
  assert.ok(!engine.includes('assertSubjectAccess'));
  assert.ok(!engine.includes('assertSubjectPreviewAccess'));
});

test('frontend analyse of a subject id comes from resolve, recent lookup, or gated preview — not ID probing', () => {
  const page = readClient('pages/ai/PropertyIntelligence.js');
  assert.ok(page.includes('analyseSubjectIntelligence(selectedSubjectId'));
  assert.ok(page.includes('selectRecentSubject'));
  assert.ok(page.includes('resolveIntelligenceSubject'));
  const hub = readClient('pages/ai/AiHub.js');
  const dash = readClient('pages/ai/AiDashboard.js');
  assert.ok(hub.includes('subjectId=${item.id}') || hub.includes('subjectId='));
  assert.ok(dash.includes('subjectId=${item.id}') || dash.includes('subjectId='));
  const history = readClient('pages/ai/AiHistoryDetail.js');
  assert.ok(!history.includes('analyseSubjectIntelligence'));
});

test('Phase 5 privacy and frozen scoring/formulas remain', () => {
  assert.deepStrictEqual(publicFailureBody(), {
    success: false,
    message: ANALYSIS_FAILED_PUBLIC,
    code: INTERNAL_ERROR_CODE,
  });
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(OUTCOME_THRESHOLDS.strong_fit, 80);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('const risks = buildRisks('));
  assert.strictEqual(toListingNumber(null), null);
  assert.strictEqual(toListingNumber(0), 0);
  assert.strictEqual(getMonthlyRent({ monthly_rent: 0 }), 0);
  const controller = read('controllers/intelligenceController.js');
  assert.ok(!controller.includes('error.message'));
});

asyncTest('legitimate access reaches analysis; guessed id does not', async () => {
  const lookup = require('../services/ai/externalPropertyLookupService');
  const engine = require('../services/ai/propertyIntelligenceEngine');
  const prod = require('../services/ai/propertyIntelligenceProduction');
  const AiSubscription = require('../models/AiSubscription');
  const repo = require('../services/enrichment/intelligenceSubjectRepository');
  const originalAccess = lookup.assertSubjectAccess;
  const originalPreviewAccess = lookup.assertSubjectPreviewAccess;
  const originalRun = engine.runFullPropertyAnalysis;
  const originalPersist = prod.persistCompletedCanonicalAnalysis;
  const originalFind = AiSubscription.findByUserId;
  const originalRecord = repo.recordSubjectLookup;
  let ranAnalysis = 0;
  let persisted = 0;

  lookup.assertSubjectAccess = async () => ({ ok: true });
  lookup.assertSubjectPreviewAccess = lookup.assertSubjectAccess;
  engine.runFullPropertyAnalysis = async () => {
    ranAnalysis += 1;
    return {
      success: true,
      property: { title: '12 High St', uprn: '1' },
      accessContext: { accessLevel: 'public_intelligence' },
      modelVersion: 'property-intelligence-v2',
      confidence: { score: 70, level: 'Medium' },
      dataQuality: { level: 'Medium' },
      explanation: { tokensUsed: 0 },
      personalDecision: { score: 61 },
      decisionIntelligence: { materialFindings: [] },
    };
  };
  prod.persistCompletedCanonicalAnalysis = async () => {
    persisted += 1;
    return { ok: true, saved: { id: 88 } };
  };
  AiSubscription.findByUserId = async () => ({ credits_remaining: 3 });
  repo.recordSubjectLookup = async () => {};

  try {
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrl = require('../controllers/intelligenceController');
    const allowed = mockRes();
    await ctrl.analyseSubjectIntelligence(
      { params: { subjectId: '42' }, user: { id: 7 }, body: {} },
      allowed
    );
    assert.strictEqual(allowed.statusCode, 200);
    assert.strictEqual(ranAnalysis, 1);
    assert.strictEqual(persisted, 1);
    assert.strictEqual(allowed.body.success, true);
    assert.strictEqual(allowed.body.id, 88);

    ranAnalysis = 0;
    persisted = 0;
    lookup.assertSubjectAccess = async () => ({
      ok: false,
      status: 404,
      body: { success: false, message: SUBJECT_PREVIEW_NOT_FOUND_PUBLIC },
    });
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrlDenied = require('../controllers/intelligenceController');
    const denied = mockRes();
    await ctrlDenied.analyseSubjectIntelligence(
      { params: { subjectId: '1' }, user: { id: 2 }, body: {} },
      denied
    );
    assert.strictEqual(denied.statusCode, 404);
    assert.strictEqual(denied.body.message, SUBJECT_PREVIEW_NOT_FOUND_PUBLIC);
    assert.strictEqual(denied.body.property, undefined);
    assert.strictEqual(denied.body.output, undefined);
    assert.strictEqual(ranAnalysis, 0);
    assert.strictEqual(persisted, 0);
    assert.ok(!JSON.stringify(denied.body).includes('created_by'));
  } finally {
    lookup.assertSubjectAccess = originalAccess;
    lookup.assertSubjectPreviewAccess = originalPreviewAccess;
    engine.runFullPropertyAnalysis = originalRun;
    prod.persistCompletedCanonicalAnalysis = originalPersist;
    AiSubscription.findByUserId = originalFind;
    repo.recordSubjectLookup = originalRecord;
    delete require.cache[require.resolve('../controllers/intelligenceController')];
  }
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyIntelligenceSubjectAnalyseAccess.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
