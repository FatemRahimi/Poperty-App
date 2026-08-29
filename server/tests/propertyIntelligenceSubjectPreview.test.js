/**
 * V1.1 Phase 6 — Subject preview cost / access protection.
 * Hybrid shared UPRN identity + per-user lookup relationship.
 * Does not change scoring, analyse credits, analyse lease, or historical snapshots.
 * Run: node server/tests/propertyIntelligenceSubjectPreview.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  evaluateSubjectPreviewAccess,
  SUBJECT_PREVIEW_NOT_FOUND_PUBLIC,
} = require('../services/ai/externalPropertyLookupService');
const { CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const {
  ANALYSIS_FAILED_PUBLIC,
  INTERNAL_ERROR_CODE,
  publicFailureBody: productionFailureBody,
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

function previewFnSource() {
  const src = read('services/ai/externalPropertyLookupService.js');
  const start = src.indexOf('async function getSubjectPreview');
  const end = src.indexOf('async function getRecentSubjectLookups');
  assert.ok(start >= 0 && end > start);
  return src.slice(start, end);
}

test('authenticated legitimate preview is allowed when the user has a lookup relationship', () => {
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 7, subjectId: 42, hasLookup: true }),
    true
  );
});

test('unauthenticated or invalid preview access is denied', () => {
  assert.strictEqual(evaluateSubjectPreviewAccess({ userId: null, subjectId: 42, hasLookup: true }), false);
  assert.strictEqual(evaluateSubjectPreviewAccess({ userId: 0, subjectId: 42, hasLookup: true }), false);
  assert.strictEqual(evaluateSubjectPreviewAccess({ userId: 7, subjectId: 'x', hasLookup: true }), false);
  const routes = read('routes/aiRoutes.js');
  assert.ok(
    routes.includes(
      "router.get('/intelligence/subjects/:subjectId/preview', authenticateAI, getSubjectPreviewEndpoint)"
    )
  );
  assert.ok(!/preview', authenticateAI, requireCredits/.test(routes));
});

test('another user without lookup or created_by cannot preview', () => {
  assert.strictEqual(
    evaluateSubjectPreviewAccess({
      userId: 2,
      subjectId: 42,
      hasLookup: false,
      createdBy: 1,
    }),
    false
  );
});

test('sequential IDs do not grant access; created_by is a legitimate fallback only', () => {
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 9, subjectId: 1, hasLookup: false, createdBy: 1 }),
    false
  );
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 9, subjectId: 2, hasLookup: false, createdBy: null }),
    false
  );
  assert.strictEqual(
    evaluateSubjectPreviewAccess({ userId: 9, subjectId: 3, hasLookup: false, createdBy: 9 }),
    true
  );
  assert.strictEqual(SUBJECT_PREVIEW_NOT_FOUND_PUBLIC, 'Analysis subject not found.');
});

test('nonexistent and unauthorized preview share the same client-safe 404', () => {
  const controller = read('controllers/intelligenceController.js');
  assert.ok(controller.includes('assertSubjectPreviewAccess'));
  assert.ok(controller.includes("res.status(access.status).json(access.body)"));
  const denied = evaluateSubjectPreviewAccess({ userId: 4, subjectId: 999999, hasLookup: false });
  assert.strictEqual(denied, false);
});

test('preview function does not call providers or consume analyse credits', () => {
  const preview = previewFnSource();
  assert.ok(!preview.includes('getUprnProfile'));
  assert.ok(!preview.includes('getSoldPrices'));
  assert.ok(!preview.includes('getRents'));
  assert.ok(!preview.includes('getDemand'));
  assert.ok(!preview.includes('enrichSubjectForIntelligence'));
  assert.ok(!preview.includes('consumeCredit'));
  assert.ok(preview.includes('findSubjectById'));
  assert.ok(preview.includes('getListingSummaryById'));
  const routes = read('routes/aiRoutes.js');
  assert.ok(!/subjects\/:subjectId\/preview', authenticateAI, requireCredits/.test(routes));
});

test('provider failures stay off the preview HTTP contract; Phase 5 500 remains generic', () => {
  const controller = read('controllers/intelligenceController.js');
  const fn = controller.slice(controller.indexOf('const getSubjectPreviewEndpoint'));
  const end = fn.indexOf('const analyseSubjectIntelligence');
  const previewEndpoint = fn.slice(0, end);
  assert.ok(!previewEndpoint.includes('error.message'));
  assert.ok(previewEndpoint.includes("message: 'Failed to load property preview'"));
  assert.deepStrictEqual(productionFailureBody(), {
    success: false,
    message: ANALYSIS_FAILED_PUBLIC,
    code: INTERNAL_ERROR_CODE,
  });
});

test('analyse credits and lease remain on analyse routes only', () => {
  const routes = read('routes/aiRoutes.js');
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analyseSubjectIntelligence/.test(
      routes
    )
  );
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
      routes
    )
  );
  assert.ok(routes.includes('requireIntelligenceAnalyseSlot'));
  assert.strictEqual(ANALYSIS_IN_PROGRESS_CODE, 'ANALYSIS_IN_PROGRESS');
  const previewLine = routes
    .split('\n')
    .find((line) => line.includes("subjects/:subjectId/preview"));
  assert.ok(previewLine);
  assert.ok(!previewLine.includes('requireCredits'));
  assert.ok(!previewLine.includes('requireIntelligenceAnalyseSlot'));
});

test('subject analyse still uses getSubjectPreview internally without the HTTP access helper', () => {
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('getSubjectPreview(target.subjectId)'));
  assert.ok(!engine.includes('assertSubjectPreviewAccess'));
});

test('listing analyse route is unchanged', () => {
  const routes = read('routes/aiRoutes.js');
  assert.ok(routes.includes("'/intelligence/analyse/:propertyId'"));
  assert.ok(
    /authenticateAI,\s*requireCredits,\s*requireIntelligenceAnalyseSlot,\s*analysePropertyIntelligence/.test(
      routes
    )
  );
});

test('history does not call subject preview', () => {
  const history = readClient('pages/ai/AiHistoryDetail.js');
  const historyList = readClient('pages/ai/AiHistory.js');
  assert.ok(!history.includes('fetchSubjectPreview'));
  assert.ok(!historyList.includes('fetchSubjectPreview'));
  assert.ok(history.includes('fetchHistoryItem'));
  assert.ok(history.includes('savedIntelligenceReportFromRow'));
  const controller = read('controllers/aiController.js');
  assert.ok(controller.includes('res.json({ success: true, item })'));
});

test('preview response contract remains the fields the client renders', () => {
  const preview = previewFnSource();
  assert.ok(preview.includes('property: buildSyntheticPropertyFromSubject(subject)'));
  assert.ok(preview.includes('linkedListing'));
  assert.ok(preview.includes('accessContext'));
  const page = readClient('pages/ai/PropertyIntelligence.js');
  assert.ok(page.includes('setPreview(data.property)'));
  assert.ok(page.includes('setLinkedListing(data.linkedListing'));
  assert.ok(page.includes('setAccessContext(data.accessContext'));
  assert.ok(page.includes('preview.title'));
  assert.ok(page.includes('preview.bedrooms'));
  assert.ok(page.includes('preview.price'));
});

test('client only fetches preview on subject select, deep link, or unlink — not history or render loops', () => {
  const page = readClient('pages/ai/PropertyIntelligence.js');
  const matches = page.match(/fetchSubjectPreview\(/g) || [];
  assert.strictEqual(matches.length, 2);
  assert.ok(page.includes('selectRecentSubject'));
  assert.ok(page.includes('handleUnlinkListing'));
});

test('What-if subject path uses the same access guard; formulas are not rewritten', () => {
  const controller = read('controllers/intelligenceController.js');
  const whatIf = controller.slice(controller.indexOf('const compareIntelligenceWhatIf'));
  assert.ok(whatIf.includes('assertSubjectPreviewAccess(req.user && req.user.id, parsed.subjectId)'));
  assert.ok(whatIf.includes('const previewAccess = await assertSubjectPreviewAccess'));
  assert.ok(whatIf.includes('access = preview.accessContext'));
  assert.ok(!/const access = await assertSubjectPreviewAccess/.test(whatIf));
  assert.ok(whatIf.includes('executeIntelligenceWhatIf'));
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
});

test('Phase 1–5 freeze: concurrency, missing-value, PD/DI, history, privacy', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(OUTCOME_THRESHOLDS.strong_fit, 80);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');
  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('const risks = buildRisks('));
  assert.ok(!engine.includes('buildStrengths'));
  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(guard.includes('pi_analyse_slots'));
  assert.strictEqual(toListingNumber(null), null);
  assert.strictEqual(toListingNumber(0), 0);
  assert.strictEqual(getMonthlyRent({ monthly_rent: null, weekly_rent: null }), null);
  assert.strictEqual(getMonthlyRent({ monthly_rent: 0 }), 0);
  const historyModel = read('models/AiRequest.js');
  assert.ok(historyModel.includes('Stored `output_data` is returned unchanged'));
  const privacy = read('controllers/intelligenceController.js');
  assert.ok(!privacy.includes('error.message'));
  assert.ok(privacy.includes('toPublicIntelligenceHttpOutput(output)'));
});

asyncTest('HTTP preview with access still returns the stubbed payload', async () => {
  const lookup = require('../services/ai/externalPropertyLookupService');
  const originalPreview = lookup.getSubjectPreview;
  const originalAccess = lookup.assertSubjectPreviewAccess;
  lookup.assertSubjectPreviewAccess = async () => ({ ok: true });
  lookup.getSubjectPreview = async (subjectId) => ({
    success: true,
    subject: { id: subjectId, uprn: '1', address: '12 High St' },
    property: { subjectId, title: '12 High St', bedrooms: 2, price: 250000 },
    linkedListing: null,
    accessContext: { subjectId, accessLevel: 'public_intelligence' },
  });
  try {
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrl = require('../controllers/intelligenceController');
    let status = 200;
    let body;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
      },
    };
    await ctrl.getSubjectPreviewEndpoint({ params: { subjectId: '42' }, user: { id: 7 } }, res);
    assert.strictEqual(status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.property.bedrooms, 2);
    assert.strictEqual(body.property.price, 250000);
  } finally {
    lookup.getSubjectPreview = originalPreview;
    lookup.assertSubjectPreviewAccess = originalAccess;
    delete require.cache[require.resolve('../controllers/intelligenceController')];
  }
});

asyncTest('HTTP preview without access is 404 and does not load licensed payload', async () => {
  const lookup = require('../services/ai/externalPropertyLookupService');
  const originalPreview = lookup.getSubjectPreview;
  const originalAccess = lookup.assertSubjectPreviewAccess;
  let previewCalled = false;
  lookup.assertSubjectPreviewAccess = async () => ({
    ok: false,
    status: 404,
    body: { success: false, message: SUBJECT_PREVIEW_NOT_FOUND_PUBLIC },
  });
  lookup.getSubjectPreview = async () => {
    previewCalled = true;
    return {
      success: true,
      property: { title: 'secret licensed profile', price: 999999 },
    };
  };
  try {
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrl = require('../controllers/intelligenceController');
    let status = 200;
    let body;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
      },
    };
    await ctrl.getSubjectPreviewEndpoint({ params: { subjectId: '1' }, user: { id: 2 } }, res);
    assert.strictEqual(status, 404);
    assert.strictEqual(previewCalled, false);
    assert.strictEqual(body.message, SUBJECT_PREVIEW_NOT_FOUND_PUBLIC);
    assert.strictEqual(body.property, undefined);
    assert.ok(!JSON.stringify(body).includes('secret licensed profile'));
  } finally {
    lookup.getSubjectPreview = originalPreview;
    lookup.assertSubjectPreviewAccess = originalAccess;
    delete require.cache[require.resolve('../controllers/intelligenceController')];
  }
});

asyncTest('What-if subject path does not throw after a successful preview access check', async () => {
  const lookup = require('../services/ai/externalPropertyLookupService');
  const originalPreview = lookup.getSubjectPreview;
  const originalAccess = lookup.assertSubjectPreviewAccess;
  lookup.assertSubjectPreviewAccess = async () => ({ ok: true });
  lookup.getSubjectPreview = async (subjectId) => ({
    success: true,
    property: {
      id: null,
      subjectId,
      title: '12 High St',
      price: 200000,
      monthly_rent: 1000,
    },
    accessContext: { subjectId, accessLevel: 'public_intelligence' },
  });
  try {
    delete require.cache[require.resolve('../controllers/intelligenceController')];
    const ctrl = require('../controllers/intelligenceController');
    let status = 200;
    let body;
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(payload) {
        body = payload;
      },
    };
    await ctrl.compareIntelligenceWhatIf(
      {
        user: { id: 7 },
        body: {
          subjectId: 42,
          profile: 'landlord',
          scenario: { purchasePrice: 185000 },
        },
      },
      res
    );
    assert.notStrictEqual(status, 500, JSON.stringify(body));
    assert.ok(status === 200 || status === 400 || status === 404);
  } finally {
    lookup.getSubjectPreview = originalPreview;
    lookup.assertSubjectPreviewAccess = originalAccess;
    delete require.cache[require.resolve('../controllers/intelligenceController')];
  }
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyIntelligenceSubjectPreview.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
