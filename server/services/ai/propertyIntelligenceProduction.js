/**
 * Property Intelligence production contracts.
 * Persistence, credit safety, and public error shaping only.
 * Does not score, assemble intelligence, or call providers.
 */

const AiRequest = require('../../models/AiRequest');
const AiSubscription = require('../../models/AiSubscription');
const { sanitizePrivateEvidenceSnapshot } = require('../evidence/sanitizePrivateEvidence');

const ANALYSIS_FAILED_PUBLIC = 'Property analysis failed';
const WHAT_IF_FAILED_PUBLIC = 'What-if comparison failed';
const LOOKUP_FAILED_PUBLIC = 'Lookup failed';
const RESOLVE_FAILED_PUBLIC = 'Failed to resolve property';
const INVESTMENT_FAILED_PUBLIC = 'Investment analysis failed';
const RENT_FAILED_PUBLIC = 'Rent analysis failed';
const PORTFOLIO_FAILED_PUBLIC = 'Portfolio analysis failed';
const UPRN_PROFILE_FAILED_PUBLIC = 'Failed to load UPRN profile';
const POSTCODE_INTEL_UNAVAILABLE_PUBLIC = 'Postcode market intelligence unavailable';
const EXTERNAL_ENRICHMENT_FAILED_PUBLIC =
  'External enrichment failed — continuing with internal data only';
const LISTING_FAILED_PUBLIC = 'Listing generation failed';
const VALUATION_FAILED_PUBLIC = 'Valuation failed';
const BUYER_MATCH_FAILED_PUBLIC = 'Buyer match failed';
const UPGRADE_FAILED_PUBLIC = 'Upgrade failed';
const PLANS_FAILED_PUBLIC = 'Unable to load plans';
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const INSUFFICIENT_CREDITS_PUBLIC =
  'No credits remaining. Upgrade your plan to continue.';

function redactSensitiveLogText(text) {
  return String(text || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted-key]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-jwt]')
    .replace(/[A-Za-z]:\\[^\s"'`]+private-evidence[^\s"'`]*/gi, '[redacted-private-path]')
    .replace(/\/[^\s"'`]*private-evidence[^\s"'`]*/gi, '[redacted-private-path]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-storage-key]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-access-key]')
    .replace(/\b(SecretAccessKey|AccountKey|SharedAccessKey)=[^\s"'`]+/gi, '$1=[redacted]');
}

function logIntelligenceFailure(scope, error) {
  const code = error?.code || error?.name || 'Error';
  const detail = redactSensitiveLogText(
    error?.message ? String(error.message).slice(0, 300) : 'unknown'
  );
  console.error(`[property-intelligence] ${scope}: ${code}: ${detail}`);
  if (error?.stack) {
    const stack = redactSensitiveLogText(String(error.stack))
      .split('\n')
      .slice(0, 8)
      .join('\n');
    console.error(stack);
  }
}

function publicFailureBody(fallbackMessage) {
  return {
    success: false,
    message: fallbackMessage || ANALYSIS_FAILED_PUBLIC,
    code: INTERNAL_ERROR_CODE,
  };
}

function insufficientCreditsBody(error) {
  return {
    success: false,
    message: error?.credit?.reason || INSUFFICIENT_CREDITS_PUBLIC,
    code: 'INSUFFICIENT_CREDITS',
    subscription: error?.credit?.subscription,
    plan: error?.credit?.plan,
    upgradeUrl: '/ai-services/pricing',
  };
}

function classifyCaughtIntelligenceError(error, fallbackMessage) {
  if (error?.code === 'INSUFFICIENT_CREDITS') {
    return { status: 402, body: insufficientCreditsBody(error) };
  }
  return { status: 500, body: publicFailureBody(fallbackMessage) };
}

function toPublicIntelligenceHttpOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const publicOutput = { ...output };
  delete publicOutput.externalIntelligence;
  return sanitizePrivateEvidenceSnapshot(publicOutput);
}

function isCanonicalPropertyIntelligence(requestType) {
  return requestType === 'property_intelligence';
}

function shouldPersistCanonicalReport(output, requestType = 'property_intelligence') {
  if (!isCanonicalPropertyIntelligence(requestType)) {
    return Boolean(output);
  }
  return Boolean(output) && output.success !== false && output.code !== 'ACCESS_DENIED';
}

async function persistCompletedCanonicalAnalysis({
  userId,
  requestType,
  input,
  output,
  propertyId,
  subjectId = null,
  creditsUsed,
  modelVersion,
  confidence,
  confidenceLevel,
  dataQuality,
  tokensUsed = 0,
}) {
  if (!shouldPersistCanonicalReport(output, requestType)) {
    return {
      ok: false,
      code: 'REFUSED_UNSUCCESSFUL_REPORT',
      message: 'Unsuccessful analyses are not persisted.',
    };
  }

  const amount = creditsUsed || 1;
  const credit = await AiSubscription.consumeCredit(userId, amount);
  if (!credit.allowed) {
    return { ok: false, code: 'INSUFFICIENT_CREDITS', credit };
  }

  try {
    const saved = await AiRequest.create({
      userId,
      requestType,
      inputData: input,
      outputData: sanitizePrivateEvidenceSnapshot(output),
      creditsUsed: credit.consumed ?? 1,
      modelUsed: modelVersion || output.explanation?.model || 'deterministic-v1',
      tokensUsed,
      title: output.title || `Property Intelligence – ${output.property?.title || requestType}`,
      status: 'completed',
      propertyId: propertyId || output.property?.id || null,
      subjectId: subjectId || output.property?.subjectId || input?.subjectId || null,
      confidence: confidence ?? output.confidence?.score ?? null,
      confidenceLevel: confidenceLevel ?? output.confidence?.level ?? null,
      dataQuality: dataQuality ?? output.dataQuality?.level ?? null,
      modelVersion: modelVersion || output.modelVersion || null,
    });
    return { ok: true, saved, credit };
  } catch (error) {
    if (credit.consumed) {
      try {
        await AiSubscription.restoreCredit(userId, credit.consumed);
      } catch (restoreError) {
        logIntelligenceFailure('restoreCredit', restoreError);
      }
    }
    throw error;
  }
}

module.exports = {
  ANALYSIS_FAILED_PUBLIC,
  WHAT_IF_FAILED_PUBLIC,
  LOOKUP_FAILED_PUBLIC,
  RESOLVE_FAILED_PUBLIC,
  INVESTMENT_FAILED_PUBLIC,
  RENT_FAILED_PUBLIC,
  PORTFOLIO_FAILED_PUBLIC,
  UPRN_PROFILE_FAILED_PUBLIC,
  POSTCODE_INTEL_UNAVAILABLE_PUBLIC,
  EXTERNAL_ENRICHMENT_FAILED_PUBLIC,
  LISTING_FAILED_PUBLIC,
  VALUATION_FAILED_PUBLIC,
  BUYER_MATCH_FAILED_PUBLIC,
  UPGRADE_FAILED_PUBLIC,
  PLANS_FAILED_PUBLIC,
  INTERNAL_ERROR_CODE,
  INSUFFICIENT_CREDITS_PUBLIC,
  redactSensitiveLogText,
  logIntelligenceFailure,
  publicFailureBody,
  insufficientCreditsBody,
  classifyCaughtIntelligenceError,
  toPublicIntelligenceHttpOutput,
  shouldPersistCanonicalReport,
  persistCompletedCanonicalAnalysis,
};
