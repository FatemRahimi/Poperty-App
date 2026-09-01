/**
 * V1.1 Phase 5 — API error / privacy hardening.
 * Client-safe errors and live-transport minimization only.
 * Does not change scoring, Personal Decision, Decision Intelligence, What-if, or snapshots.
 * Run: node server/tests/propertyIntelligencePrivacy.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { assemblePropertyIntelligenceReport, CANONICAL_ENGINE_VERSION } = require('../services/ai/propertyIntelligenceEngine');
const {
  publicFailureBody,
  classifyCaughtIntelligenceError,
  toPublicIntelligenceHttpOutput,
  redactSensitiveLogText,
  insufficientCreditsBody,
  ANALYSIS_FAILED_PUBLIC,
  WHAT_IF_FAILED_PUBLIC,
  LOOKUP_FAILED_PUBLIC,
  RESOLVE_FAILED_PUBLIC,
  INTERNAL_ERROR_CODE,
  POSTCODE_INTEL_UNAVAILABLE_PUBLIC,
  UPRN_PROFILE_FAILED_PUBLIC,
} = require('../services/ai/propertyIntelligenceProduction');
const { parseAnalyseFinanceRequest, invalidFinanceHttpResponse } = require('../services/ai/financeInputContract');
const { parseWhatIfHttpBody, toPublicWhatIfHttp, executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');
const { intelligenceFromCanonicalReport } = require('../services/ai/personalDecisionCanonical');
const { annotateStoredAnalysis } = require('../models/AiRequest');
const { LANDLORD_WEIGHTS, WHAT_IF_VERSION, OUTCOME_THRESHOLDS } = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { toListingNumber, getMonthlyRent } = require('../services/ai/propertyDataAggregator');
const {
  ANALYSIS_IN_PROGRESS_CODE,
  inProgressBody,
} = require('../services/ai/propertyIntelligenceAnalyseGuard');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(__dirname, '../../client/src');
const ASOF = '2026-08-28T00:00:00.000Z';

const MARKERS = {
  stack: 'STACK_MARKER_privacyPhase5',
  key: 'sk-KEY_MARKER_privacyPhase5_notreal',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.JWT_MARKER_privacyPhase5.sig',
  auth: 'Authorization: Bearer JWT_MARKER_privacyPhase5',
  prompt: 'PROMPT_MARKER You are a UK property intelligence analyst. Return only JSON.',
  sql: 'SQL_MARKER SELECT password FROM users WHERE api_key=',
  provider: 'https://api.provider.example/v1/timeout?api_key=KEY_MARKER_privacyPhase5',
};

const REQUIRED_PUBLIC_REPORT_FIELDS = [
  'success',
  'property',
  'personalDecision',
  'decisionIntelligence',
  'marketIntelligence',
  'investment',
  'financeRequest',
  'confidence',
  'dataQuality',
  'snapshot',
  'scores',
  'labels',
  'executiveSummary',
  'risks',
  'assumptions',
  'disclaimer',
  'accessContext',
  'modelVersion',
];

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

function poisonedError(message = 'unexpected') {
  const error = new Error(
    `${message} ${MARKERS.stack} ${MARKERS.key} ${MARKERS.jwt} ${MARKERS.auth} ${MARKERS.prompt} ${MARKERS.sql} ${MARKERS.provider}`
  );
  error.stack = `${MARKERS.stack}\n    at Object.run (${MARKERS.auth})\n    at ${MARKERS.prompt}`;
  return error;
}

function assertNoSensitiveLeak(payload, label) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  Object.entries(MARKERS).forEach(([name, marker]) => {
    assert.ok(!text.includes(marker), `${label} leaked ${name} marker`);
  });
}

function listing(extra = {}) {
  return {
    id: 71,
    title: 'Privacy hardening listing',
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

test('validation errors remain useful and safe', () => {
  const parsed = parseAnalyseFinanceRequest({ interestRate: 'not-a-rate' });
  assert.strictEqual(parsed.ok, false);
  const body = invalidFinanceHttpResponse(parsed.errors);
  assert.strictEqual(body.code, 'INVALID_FINANCE_INPUT');
  assert.strictEqual(body.message, 'Finance inputs are invalid.');
  assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
  assert.ok(body.errors.some((e) => e.field === 'interestRate'));
  assertNoSensitiveLeak(body, 'validation');
});

test('unauthenticated AI requests stay 401 without implementation detail', () => {
  const auth = read('middleware/aiAuth.js');
  assert.ok(auth.includes("res.status(401).json({"));
  assert.ok(auth.includes('Authentication required. Please log in to use AI Property Services.'));
  assert.ok(auth.includes('Invalid authentication token'));
  assert.ok(!auth.includes('error.message'));
  assert.ok(!auth.includes('error.stack'));
});

test('unauthorized saved-analysis access remains user-scoped 404', () => {
  const model = read('models/AiRequest.js');
  assert.ok(model.includes("sql += ' AND user_id = $2'"));
  const controller = read('controllers/intelligenceController.js');
  const history = read('controllers/aiController.js');
  assert.ok(controller.includes("res.status(404).json({ success: false, message: 'Analysis not found' })"));
  assert.ok(history.includes("res.status(404).json({ success: false, message: 'Request not found' })"));
  assert.ok(!controller.includes('belongs to another user'));
  assert.ok(!history.includes('belongs to another user'));
});

test('insufficient credits remains 402 with stable code', () => {
  const credits = read('middleware/aiAuth.js');
  assert.ok(credits.includes('res.status(402).json({'));
  assert.ok(credits.includes("code: 'INSUFFICIENT_CREDITS'"));
  const classified = classifyCaughtIntelligenceError(
    { code: 'INSUFFICIENT_CREDITS', credit: { reason: 'No credits remaining. Upgrade your plan to continue.' } },
    ANALYSIS_FAILED_PUBLIC
  );
  assert.strictEqual(classified.status, 402);
  assert.strictEqual(classified.body.code, 'INSUFFICIENT_CREDITS');
  assert.ok(classified.body.message.includes('credits'));
  const body = insufficientCreditsBody({ credit: { reason: 'No credits remaining. Upgrade your plan to continue.' } });
  assert.strictEqual(body.code, 'INSUFFICIENT_CREDITS');
});

test('concurrent analyse remains 429 ANALYSIS_IN_PROGRESS', () => {
  const body = inProgressBody();
  assert.strictEqual(body.code, ANALYSIS_IN_PROGRESS_CODE);
  assert.strictEqual(body.success, false);
  const routes = read('routes/aiRoutes.js');
  assert.ok(routes.includes('requireIntelligenceAnalyseSlot'));
  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(guard.includes('res.status(429).json(inProgressBody())'));
});

test('unexpected analyse/subject-analyse/What-if failures return generic safe errors', () => {
  const error = poisonedError('openai timeout');
  const analyse = classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC);
  const subject = classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC);
  const whatIf = { status: 500, body: publicFailureBody(WHAT_IF_FAILED_PUBLIC) };
  assert.strictEqual(analyse.status, 500);
  assert.strictEqual(subject.status, 500);
  assert.strictEqual(analyse.body.message, ANALYSIS_FAILED_PUBLIC);
  assert.strictEqual(subject.body.message, ANALYSIS_FAILED_PUBLIC);
  assert.strictEqual(whatIf.body.message, WHAT_IF_FAILED_PUBLIC);
  assert.strictEqual(analyse.body.code, INTERNAL_ERROR_CODE);
  assertNoSensitiveLeak(analyse.body, 'analyse');
  assertNoSensitiveLeak(subject.body, 'subject-analyse');
  assertNoSensitiveLeak(whatIf.body, 'what-if');
  const controller = read('controllers/intelligenceController.js');
  assert.ok(controller.includes('classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC)'));
  assert.ok(controller.includes('publicFailureBody(WHAT_IF_FAILED_PUBLIC)'));
  assert.ok(!controller.includes('error.message'));
});

test('lookup and resolve unexpected failures do not expose raw error.message', () => {
  const lookup = publicFailureBody(LOOKUP_FAILED_PUBLIC);
  const resolve = publicFailureBody(RESOLVE_FAILED_PUBLIC);
  assert.strictEqual(lookup.message, LOOKUP_FAILED_PUBLIC);
  assert.strictEqual(resolve.message, RESOLVE_FAILED_PUBLIC);
  assert.strictEqual(lookup.code, INTERNAL_ERROR_CODE);
  assertNoSensitiveLeak(lookup, 'lookup');
  assertNoSensitiveLeak(resolve, 'resolve');

  const lookupSrc = read('services/ai/externalPropertyLookupService.js');
  assert.ok(!lookupSrc.includes('error: err.message'));
  assert.ok(!lookupSrc.includes("message: err.message || 'Postcode market intelligence unavailable'"));
  assert.ok(!lookupSrc.includes("message: err.message || 'Failed to load UPRN profile'"));
  assert.ok(lookupSrc.includes('POSTCODE_INTEL_UNAVAILABLE_PUBLIC'));
  assert.ok(lookupSrc.includes('UPRN_PROFILE_FAILED_PUBLIC'));

  const controller = read('controllers/intelligenceController.js');
  assert.ok(controller.includes('publicFailureBody(LOOKUP_FAILED_PUBLIC)'));
  assert.ok(controller.includes('publicFailureBody(RESOLVE_FAILED_PUBLIC)'));

  const poisonedLookup = {
    success: true,
    postcodeIntelligence: { success: false, message: POSTCODE_INTEL_UNAVAILABLE_PUBLIC },
    external: { available: true, matches: [], message: 'External lookup failed. Include a valid UK postcode.' },
  };
  assertNoSensitiveLeak(poisonedLookup, 'lookup-success-shape');
  assert.strictEqual(UPRN_PROFILE_FAILED_PUBLIC, 'Failed to load UPRN profile');
});

test('synthetic secret markers never appear in HTTP error or public analyse output', () => {
  const error = poisonedError();
  const classified = classifyCaughtIntelligenceError(error, ANALYSIS_FAILED_PUBLIC);
  assertNoSensitiveLeak(classified.body, 'markers-error');
  const httpOutput = toPublicIntelligenceHttpOutput({
    success: true,
    personalDecision: { score: 61 },
    externalIntelligence: {
      error: `${MARKERS.key} ${MARKERS.provider} ${MARKERS.prompt}`,
      enrichments: { rawHtml: `<html>${MARKERS.stack}</html>` },
    },
  });
  assertNoSensitiveLeak(httpOutput, 'markers-success');
  assert.strictEqual(httpOutput.externalIntelligence, undefined);
});

test('server logs redact bearer tokens, keys, and JWTs', () => {
  const redacted = redactSensitiveLogText(
    `${MARKERS.auth} ${MARKERS.key} ${MARKERS.jwt} ordinary timeout`
  );
  assert.ok(!redacted.includes('Bearer JWT_MARKER_privacyPhase5'));
  assert.ok(!redacted.includes(MARKERS.key));
  assert.ok(!redacted.includes(MARKERS.jwt));
  assert.ok(redacted.includes('ordinary timeout'));
});

test('live analyse transport omits externalIntelligence but persistence keeps it', () => {
  const output = {
    success: true,
    title: 'Property Intelligence – Privacy hardening listing',
    personalDecision: { score: 61 },
    decisionIntelligence: { materialFindings: [] },
    externalIntelligence: { available: false, sources: ['application_database'] },
  };
  const snapshot = JSON.stringify(output);
  const http = toPublicIntelligenceHttpOutput(output);
  assert.strictEqual(http.externalIntelligence, undefined);
  assert.strictEqual(http.personalDecision.score, 61);
  assert.strictEqual(JSON.stringify(output), snapshot);
  assert.ok(output.externalIntelligence);
});

test('client source does not consume externalIntelligence', () => {
  const files = [
    'components/ai/IntelligenceReport.js',
    'components/ai/WhatIfPanel.js',
    'pages/ai/PropertyIntelligence.js',
    'pages/ai/AiHistory.js',
    'pages/ai/AiHistoryDetail.js',
    'Utils/savedIntelligenceReport.js',
    'services/aiService.js',
  ];
  files.forEach((rel) => {
    assert.ok(!readClient(rel).includes('externalIntelligence'), rel);
  });
});

test('saved analysis persistence helper still stores the full output object', () => {
  const persist = read('services/ai/propertyIntelligenceProduction.js');
  assert.ok(persist.includes('outputData: sanitizePrivateEvidenceSnapshot(output)'));
  assert.ok(persist.includes('function toPublicIntelligenceHttpOutput'));
  const controller = read('controllers/intelligenceController.js');
  assert.ok(controller.includes('output: toPublicIntelligenceHttpOutput(output)'));
  assert.ok(controller.includes('output,'));
  assert.ok(controller.includes('saveAnalysis({'));
});

test('historical reads still return stored output_data unchanged', () => {
  const original = {
    id: 12,
    user_id: 1,
    output_data: {
      personalDecision: { score: 61 },
      externalIntelligence: { available: true, frozen: true },
    },
  };
  const snapshot = JSON.stringify(original.output_data);
  const annotated = annotateStoredAnalysis(original);
  assert.strictEqual(JSON.stringify(original.output_data), snapshot);
  assert.strictEqual(annotated.output_data.externalIntelligence.frozen, true);
  const history = read('controllers/aiController.js');
  const intelligence = read('controllers/intelligenceController.js');
  assert.ok(history.includes('res.json({ success: true, item })'));
  assert.ok(intelligence.includes('res.json({ success: true, analysis: item })'));
});

test('Phase 1–4 freeze: locking, missing-value, finance/PD, history behaviour', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(OUTCOME_THRESHOLDS.strong_fit, 80);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(WHAT_IF_VERSION, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(CANONICAL_ENGINE_VERSION, 'property-intelligence-v2');

  const engine = read('services/ai/propertyIntelligenceEngine.js');
  assert.ok(engine.includes('const risks = buildRisks('));
  assert.ok(engine.includes('scorePublicLandlordPersonalDecision'));
  assert.ok(!engine.includes('buildStrengths'));
  assert.ok(!engine.includes('buildPrimaryRecommendation'));

  const guard = read('services/ai/propertyIntelligenceAnalyseGuard.js');
  assert.ok(guard.includes('pi_analyse_slots'));
  assert.ok(guard.includes('ANALYSIS_IN_PROGRESS'));

  assert.strictEqual(toListingNumber(null), null);
  assert.strictEqual(toListingNumber(''), null);
  assert.strictEqual(toListingNumber(0), 0);
  assert.strictEqual(getMonthlyRent({ monthly_rent: null, weekly_rent: null }), null);
  assert.strictEqual(getMonthlyRent({ monthly_rent: 0 }), 0);

  const historyModel = read('models/AiRequest.js');
  assert.ok(historyModel.includes('Stored `output_data` is returned unchanged'));
});

asyncTest('successful analyse HTTP output keeps every client-required field', async () => {
  const report = await assemble();
  assert.strictEqual(report.success, true);
  const output = { title: `Property Intelligence – ${report.property.title}`, ...report };
  const http = toPublicIntelligenceHttpOutput(output);
  REQUIRED_PUBLIC_REPORT_FIELDS.forEach((field) => {
    assert.ok(http[field] !== undefined, `missing required public field ${field}`);
  });
  assert.ok(http.personalDecision);
  assert.ok(http.decisionIntelligence);
  assert.strictEqual(http.externalIntelligence, undefined);
  assert.ok(output.externalIntelligence !== undefined);
});

asyncTest('LLM explanation failure does not put prompt or SDK detail on the report', async () => {
  const report = await assemble({
    skipExplanation: false,
    deps: {
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
      generatePropertyExplanation: async () => {
        throw poisonedError('chat.completions failed');
      },
    },
  });
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.explanation.source, 'template');
  assertNoSensitiveLeak(toPublicIntelligenceHttpOutput(report), 'llm-failure-http');
  assertNoSensitiveLeak(report.explanation, 'llm-failure-explanation');
});

asyncTest('What-if formulas and public HTTP shape are unchanged aside from existing stripping', async () => {
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
  assert.strictEqual(publicResult.scoreSource, 'personal-decision-whatif-1.0.0');
  assert.strictEqual(publicResult.engineFinancialDeltas, undefined);
  assert.ok(publicResult.change.score);
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    systemPrompt: MARKERS.prompt,
    deps: {},
  });
  assert.strictEqual(injected.ok, false);
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\npropertyIntelligencePrivacy.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
