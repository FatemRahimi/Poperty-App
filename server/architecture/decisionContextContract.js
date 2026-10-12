/**
 * Residential decision-context contract.
 * User intent is not a property fact and is not identity.
 * Client may select a job. Client may not inject assessed outputs.
 */

const { createSubjectRef, IDENTITY_KIND } = require('./identityModel');

const RESIDENTIAL_DECISION_CONTEXT_VERSION = 'residential-decision-context-1.0.0';

const DECISION_JOB = Object.freeze({
  BUY: 'BUY',
  LET_INVEST: 'LET_INVEST',
  SELL: 'SELL',
});

const UNSUPPORTED_DECISION_JOBS = Object.freeze([
  'HOLD',
  'REFINANCE',
  'RENOVATE',
  'DEVELOP',
  'COMMERCIAL_OCCUPATION',
  'PORTFOLIO',
]);

const FORBIDDEN_INJECTION_KEYS = Object.freeze([
  'personalDecision',
  'decisionIntelligence',
  'decisionWorkspace',
  'valuation',
  'saleValuation',
  'pricePosition',
  'materialFindings',
  'unresolvedDependencies',
  'investigationPriorities',
  'scores',
  'confidence',
  'investment',
  'presentedInvestment',
  'assessmentState',
  'verificationState',
  'VERIFIED_EXACT',
]);

const JOB_LABEL = Object.freeze({
  BUY: 'Buy',
  LET_INVEST: 'Let / Invest',
  SELL: 'Sell',
});

function nonempty(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function stripDecisionIntentKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out = { ...body };
  delete out.decisionJob;
  delete out.decision_job;
  delete out.decisionContext;
  delete out.decision_context;
  delete out.job;
  FORBIDDEN_INJECTION_KEYS.forEach((key) => {
    delete out[key];
  });
  return out;
}

function pickJob(body = {}) {
  const nested = body.decisionContext || body.decision_context || {};
  return nonempty(body.decisionJob)
    || nonempty(body.decision_job)
    || nonempty(body.job)
    || nonempty(nested.decisionJob)
    || nonempty(nested.job);
}

function parseResidentialDecisionIntent(body = {}) {
  if (body == null || body === '') {
    return { ok: false, error: 'DECISION_JOB_REQUIRED', job: null };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'DECISION_JOB_MALFORMED', job: null };
  }
  FORBIDDEN_INJECTION_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      // stripped by caller; presence is ignored, never trusted
    }
  });
  const raw = pickJob(body);
  if (!raw) {
    return { ok: false, error: 'DECISION_JOB_REQUIRED', job: null };
  }
  const job = String(raw).trim().toUpperCase().replace(/[-\s]/g, '_');
  const normalised = job === 'LET' || job === 'INVEST' || job === 'LETINVEST'
    ? DECISION_JOB.LET_INVEST
    : job;
  if (UNSUPPORTED_DECISION_JOBS.includes(normalised)) {
    return { ok: false, error: 'DECISION_JOB_UNSUPPORTED', job: null, requested: normalised };
  }
  if (!DECISION_JOB[normalised]) {
    return { ok: false, error: 'DECISION_JOB_INVALID', job: null };
  }
  return { ok: true, job: normalised, error: null };
}

function subjectRefFromAnalyse(property = {}, target = {}) {
  try {
    if (target.subjectId != null && target.subjectId !== '') {
      return createSubjectRef({
        kind: IDENTITY_KIND.SUBJECT,
        id: target.subjectId,
        listingId: property.id || null,
        subjectId: target.subjectId,
        uprn: property.uprn || null,
      });
    }
    if (property.id != null) {
      return createSubjectRef({
        kind: IDENTITY_KIND.LISTING,
        id: property.id,
        listingId: property.id,
        uprn: property.uprn || null,
      });
    }
  } catch {
    return null;
  }
  return null;
}

function createResidentialDecisionContext({
  decisionJob,
  assetClass = null,
  subjectRef = null,
  selectedAt = null,
  provenance = {},
  unspecifiedCompatibility = false,
  legacySnapshot = false,
} = {}) {
  const job = DECISION_JOB[decisionJob] || null;
  return {
    contractVersion: RESIDENTIAL_DECISION_CONTEXT_VERSION,
    decisionJob: job,
    jobLabel: job ? JOB_LABEL[job] : null,
    assetClass: assetClass || null,
    subjectRef: subjectRef || null,
    selectedAt: selectedAt || new Date().toISOString(),
    provenance: {
      source: provenance.source || 'USER_SELECTED',
      userIntent: true,
      notPropertyFact: true,
      notIdentity: true,
      unspecifiedCompatibility: unspecifiedCompatibility === true,
      legacySnapshot: legacySnapshot === true,
      ...provenance,
    },
    userIntentNotPropertyFact: true,
  };
}

function interpretLegacyDecisionContext(report = {}) {
  const existing = report.decisionContext || report.residentialDecisionContext || null;
  if (existing?.decisionJob && DECISION_JOB[existing.decisionJob]) {
    return {
      ...existing,
      legacySnapshot: false,
    };
  }
  if (report.personalDecision?.profile === 'landlord' || report.decisionIntelligence) {
    return createResidentialDecisionContext({
      decisionJob: DECISION_JOB.LET_INVEST,
      assetClass: report.assetClassification?.assetClass || null,
      provenance: {
        source: 'LEGACY_LANDLORD_SNAPSHOT',
        legacySnapshot: true,
        notBuy: true,
        notSell: true,
        note: 'Historical analyses without a decision job are shown as Let / Invest compatibility. They are not reinterpreted as Buy or Sell.',
      },
      unspecifiedCompatibility: false,
      legacySnapshot: true,
    });
  }
  return createResidentialDecisionContext({
    decisionJob: DECISION_JOB.LET_INVEST,
    assetClass: report.assetClassification?.assetClass || null,
    provenance: {
      source: 'LEGACY_UNSPECIFIED_SNAPSHOT',
      legacySnapshot: true,
      notBuy: true,
      notSell: true,
      note: 'Historical analyses without a decision job are shown as Let / Invest compatibility. They are not reinterpreted as Buy or Sell.',
    },
    unspecifiedCompatibility: true,
    legacySnapshot: true,
  });
}

function resolveAssembleDecisionIntent(options = {}) {
  const raw = options.decisionJob || options.residentialDecisionJob || null;
  if (raw == null || raw === '') {
    return {
      ok: true,
      job: DECISION_JOB.LET_INVEST,
      unspecifiedCompatibility: true,
      error: null,
    };
  }
  const parsed = parseResidentialDecisionIntent({ decisionJob: raw });
  if (!parsed.ok) {
    return { ...parsed, unspecifiedCompatibility: false };
  }
  return {
    ok: true,
    job: parsed.job,
    unspecifiedCompatibility: false,
    error: null,
  };
}

function invalidDecisionHttpResponse(parsed) {
  const messages = {
    DECISION_JOB_REQUIRED: 'Select whether you are assessing this property to Buy, Let / Invest, or Sell.',
    DECISION_JOB_INVALID: 'Decision job must be BUY, LET_INVEST, or SELL.',
    DECISION_JOB_UNSUPPORTED: 'That decision job is not supported in this workspace.',
    DECISION_JOB_MALFORMED: 'Decision job is invalid.',
  };
  return {
    success: false,
    code: parsed.error || 'DECISION_JOB_REQUIRED',
    message: messages[parsed.error] || messages.DECISION_JOB_REQUIRED,
  };
}

module.exports = {
  RESIDENTIAL_DECISION_CONTEXT_VERSION,
  DECISION_JOB,
  JOB_LABEL,
  UNSUPPORTED_DECISION_JOBS,
  FORBIDDEN_INJECTION_KEYS,
  parseResidentialDecisionIntent,
  stripDecisionIntentKeys,
  createResidentialDecisionContext,
  subjectRefFromAnalyse,
  interpretLegacyDecisionContext,
  resolveAssembleDecisionIntent,
  invalidDecisionHttpResponse,
};
