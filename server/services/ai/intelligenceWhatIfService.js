/**
 * Property Intelligence What-if adapter.
 * Invokes the existing personal-decision What-if engine with allowlisted
 * finance-input patches. Does not add formulas, scores, or providers.
 */

const { comparePersonalDecisionWhatIf } = require('./personalDecisionWhatIfEngine');
const { parseAnalyseFinanceRequest } = require('./financeInputContract');
const {
  prepareEvidencedInvestment,
  presentEvidencedInvestment,
} = require('./evidencedInvestment');
const { calculateInvestmentMetrics } = require('./financialEngine');
const { assemblePropertyFacts } = require('./propertyFacts');
const { listingObservedCharges } = require('./listingObservedFields');
const { profileIsSupported } = require('./personalDecisionEngine');
const {
  propertyWithFinanceScenario,
  intelligenceFromCanonicalReport,
} = require('./personalDecisionCanonical');
const {
  cloneJson,
  resolveSavedWhatIfBaseline,
  applySavedPersonalDecisionStamp,
  liveBaselineContext,
  parseJsonMaybe,
} = require('./historicalWhatIfBaseline');

const ALLOWED_HTTP_KEYS = Object.freeze([
  'propertyId',
  'subjectId',
  'analysisId',
  'profile',
  'baseline',
  'scenario',
  'finance',
]);

const INTERNAL_KEYS = Object.freeze([
  'deps',
  'skipExplanation',
  'skipPostcodeMarket',
  'providerCallLog',
  'asOf',
  'skipValidation',
  'engine',
  'explainFn',
  'property',
  'intelligence',
  'evidence',
  'preferences',
  'baseScore',
  'scenarioScore',
  'confidence',
  'score',
  'dimensions',
  'testStubs',
  'providerConfig',
  'personalDecision',
  'output_data',
  'outputData',
  'baselineMode',
  'listing',
  'modelVersion',
  'engineVersion',
  'flood',
  'floodEvidence',
  'propertyFacts',
  'skipFlood',
  'riskScore',
  'floodScore',
  'skipCache',
  'skipPlanning',
  'planning',
  'planningEvidence',
  'planningScore',
  'developmentScore',
  'skipSchools',
  'schools',
  'schoolEvidence',
  'schoolScore',
  'catchment',
  'educationScore',
  'skipListedBuilding',
  'listedBuilding',
  'listedBuildingEvidence',
  'listedBuildings',
  'listed',
  'heritageScore',
  'listedBuildingScore',
  'listedScore',
  'heritageRiskScore',
  'skipConservationArea',
  'conservationArea',
  'conservationAreaEvidence',
  'conservationEvidence',
  'conservationScore',
  'skipArticle4',
  'article4',
  'article4Evidence',
  'article4Direction',
  'article4Score',
  'article4Restrictions',
  'article4DirectionArea',
  'article4Areas',
  'article4Membership',
  'permittedDevelopmentRights',
  'permittedDevelopmentRight',
  'pdRights',
  'restrictionSchedule',
  'decisionIntelligence',
  'unresolvedDependencies',
  'investigationPriorities',
  'importance',
  'importanceScore',
  'evidenceRefs',
  'affects',
  'dependencyScore',
  'dependencyScores',
  'materialFindings',
  'materialFinding',
  'findingScore',
  'materialityScore',
  'effect',
  'findingImportance',
  'sensitivityDrivers',
  'sensitivityDriver',
  'sensitivityScore',
  'rankScore',
  'driverImportance',
  'directionality',
  'dependencyGraph',
  'explanation',
  'overview',
  'currentDriversSummary',
  'unresolvedSummary',
  'verificationSummary',
  'sensitivitySummary',
  'generatedExplanation',
  'llmInstructions',
  'systemPrompt',
  'systemPrompts',
]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function presentedPair(beforeField, afterField) {
  const beforeAvailable = Boolean(beforeField?.available);
  const afterAvailable = Boolean(afterField?.available);
  const before = beforeAvailable ? beforeField.value : null;
  const after = afterAvailable ? afterField.value : null;
  return {
    before,
    after,
    delta: beforeAvailable && afterAvailable ? round2(after - before) : null,
    stateBefore: beforeAvailable ? 'assessed' : 'notAssessed',
    stateAfter: afterAvailable ? 'assessed' : 'notAssessed',
    reasonBefore: beforeAvailable ? null : beforeField?.reason || 'notAssessed',
    reasonAfter: afterAvailable ? null : afterField?.reason || 'notAssessed',
  };
}

function numericOption(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value) && value.value != null) {
    const n = Number(value.value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scalarPair(before, after) {
  const b = numericOption(before);
  const a = numericOption(after);
  if (b == null && a == null) {
    return { before: null, after: null, delta: null };
  }
  if (b == null || a == null) {
    return { before: b, after: a, delta: null };
  }
  return { before: b, after: a, delta: round2(a - b) };
}

function parseFinanceSection(section, label) {
  if (section == null || section === '') {
    return { ok: true, errors: [], options: {} };
  }
  if (typeof section !== 'object' || Array.isArray(section)) {
    return {
      ok: false,
      errors: [{ field: label, reason: 'malformed_object' }],
      options: {},
    };
  }
  return parseAnalyseFinanceRequest(section);
}

function parseWhatIfHttpBody(body) {
  if (body == null || body === '') {
    return { ok: false, errors: [{ field: 'body', reason: 'malformed_request' }] };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: [{ field: 'body', reason: 'malformed_request' }] };
  }

  const errors = [];
  Object.keys(body).forEach((key) => {
    if (INTERNAL_KEYS.includes(key)) {
      errors.push({ field: key, reason: 'internal_option_not_allowed' });
      return;
    }
    if (!ALLOWED_HTTP_KEYS.includes(key)) {
      errors.push({ field: key, reason: 'unknown_field' });
    }
  });

  const profile = body.profile || 'landlord';
  if (profile !== 'landlord' && profile !== 'buyer_general') {
    errors.push({ field: 'profile', reason: 'unsupported_profile' });
  }

  function parseId(value, field) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push({ field, reason: 'malformed_value' });
      return null;
    }
    return n;
  }
  const propertyId = parseId(body.propertyId, 'propertyId');
  const subjectId = parseId(body.subjectId, 'subjectId');
  const analysisId = parseId(body.analysisId, 'analysisId');
  if (propertyId == null && subjectId == null) {
    errors.push({ field: 'propertyId', reason: 'missing_target' });
  }

  const baselineParsed = parseFinanceSection(body.baseline, 'baseline');
  const scenarioSource = body.scenario != null ? body.scenario : body.finance;
  const scenarioParsed = parseFinanceSection(scenarioSource, 'scenario');
  if (!baselineParsed.ok) {
    errors.push(...baselineParsed.errors.map((e) => ({ ...e, field: `baseline.${e.field}` })));
  }
  if (!scenarioParsed.ok) {
    errors.push(...scenarioParsed.errors.map((e) => ({
      ...e,
      field: String(e.field).startsWith('scenario') ? e.field : `scenario.${e.field}`,
    })));
  }

  if (errors.length) {
    return { ok: false, errors, profile, baselineOptions: {}, scenarioOptions: {} };
  }

  return {
    ok: true,
    errors: [],
    profile,
    propertyId,
    subjectId,
    analysisId,
    baselineOptions: baselineParsed.options,
    scenarioOptions: scenarioParsed.options,
  };
}

function scenarioPatchFromOptions(options = {}) {
  const finance = { ...options };
  const offerPrice = Object.prototype.hasOwnProperty.call(options, 'purchasePrice')
    ? numericOption(options.purchasePrice)
    : undefined;
  delete finance.purchasePrice;
  const patch = { finance };
  if (offerPrice != null) patch.offerPrice = offerPrice;
  return patch;
}

function presentFor(property, options) {
  const facts = assemblePropertyFacts({
    property,
    listingCharges: listingObservedCharges(property),
  });
  const listingPrice = numericOption(property.price) || 0;
  const purchasePrice = numericOption(options.purchasePrice) != null
    ? numericOption(options.purchasePrice)
    : listingPrice;
  const listingRent = numericOption(property.monthly_rent) || 0;
  const expectedRent = numericOption(options.expectedRent) != null
    ? numericOption(options.expectedRent)
    : listingRent;
  if (!(purchasePrice > 0 && expectedRent > 0)) {
    return { facts, presented: null, financeInputs: null, input: {} };
  }
  const prepared = prepareEvidencedInvestment({
    purchasePrice,
    expectedRent,
    options,
    property,
    propertyFacts: facts,
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  return {
    facts,
    presented: presentEvidencedInvestment(metrics, prepared.operatingCostEvidence),
    financeInputs: prepared.financeInputs,
    input: prepared.input,
    analysisKind: prepared.analysisKind,
  };
}

function publicDecision(decision) {
  if (!decision) return null;
  const dimensions = {};
  Object.entries(decision.dimensions || {}).forEach(([key, value]) => {
    dimensions[key] = {
      available: Boolean(value?.available),
      score: value?.available ? value.score : null,
      state: value?.state || null,
    };
  });
  return {
    score: Number.isFinite(decision.score) ? decision.score : null,
    outcome: decision.outcome || null,
    dimensions,
  };
}

function mergeOptions(baseline = {}, patch = {}) {
  return { ...baseline, ...patch };
}

function executeIntelligenceWhatIf({
  property,
  profile = 'landlord',
  baselineOptions = {},
  scenarioOptions = {},
  intelligence = {},
  asOf = null,
  baselineContext = null,
} = {}) {
  if (!property) {
    return { success: false, code: 'NOT_FOUND', message: 'Property is required.' };
  }
  if (!profileIsSupported(profile)) {
    return {
      success: false,
      code: 'UNSUPPORTED_PROFILE',
      message: `Profile "${profile}" is not available.`,
    };
  }

  const context = baselineContext || liveBaselineContext();
  const scoringProperty = cloneJson(property) || {};
  const frozenBaselineOptions = cloneJson(baselineOptions) || {};
  const frozenScenarioOptions = cloneJson(scenarioOptions) || {};
  const frozenIntelligence = cloneJson(intelligence) || {};
  const evidenceAsOf = asOf || context.baselineEvidenceAsOf || null;

  const listingAskingPrice = numericOption(scoringProperty.price);
  const listingRent = numericOption(scoringProperty.monthly_rent);
  const listingFacts = assemblePropertyFacts({
    property: scoringProperty,
    listingCharges: listingObservedCharges(scoringProperty),
  });

  const baselineEvidence = presentFor(scoringProperty, frozenBaselineOptions);
  const mergedScenarioOptions = mergeOptions(frozenBaselineOptions, frozenScenarioOptions);
  const scenarioPropertyPrice =
    numericOption(frozenScenarioOptions.purchasePrice) != null
      ? numericOption(frozenScenarioOptions.purchasePrice)
      : listingAskingPrice;
  const scenarioExpectedRent =
    numericOption(frozenScenarioOptions.expectedRent) != null
      ? numericOption(frozenScenarioOptions.expectedRent)
      : scoringProperty.monthly_rent;
  const scenarioEvidence = presentFor(
    {
      ...scoringProperty,
      price: scenarioPropertyPrice,
      monthly_rent: scenarioExpectedRent,
    },
    mergedScenarioOptions
  );

  let comparison = comparePersonalDecisionWhatIf({
    profile,
    property: propertyWithFinanceScenario(scoringProperty, frozenBaselineOptions),
    preferences: {},
    intelligence: frozenIntelligence,
    finance: frozenBaselineOptions,
    scenario: scenarioPatchFromOptions(frozenScenarioOptions),
    asOf: evidenceAsOf || undefined,
  });

  let stampMeta = {
    baselineDecision: context.baselineMode === 'saved_snapshot' ? 'live_ineligible' : 'live_rescored',
    baselineDecisionReason: null,
    baselinePinnedToStamp: false,
  };
  if (context.baselineMode === 'saved_snapshot') {
    stampMeta = applySavedPersonalDecisionStamp(comparison, context.stampedPersonalDecision);
    comparison = stampMeta.comparison;
  }

  const presentedChange = {
    grossYield: presentedPair(baselineEvidence.presented?.grossYield, scenarioEvidence.presented?.grossYield),
    noi: presentedPair(baselineEvidence.presented?.noi, scenarioEvidence.presented?.noi),
    netYield: presentedPair(baselineEvidence.presented?.netYield, scenarioEvidence.presented?.netYield),
    monthlyCashFlow: presentedPair(
      baselineEvidence.presented?.monthlyCashFlow,
      scenarioEvidence.presented?.monthlyCashFlow
    ),
    annualCashFlow: presentedPair(
      baselineEvidence.presented?.annualCashFlow,
      scenarioEvidence.presented?.annualCashFlow
    ),
    dscr: presentedPair(baselineEvidence.presented?.dscr, scenarioEvidence.presented?.dscr),
  };

  const decisionChange = {};
  Object.entries(comparison.dimensionDeltas || {}).forEach(([key, row]) => {
    const meaningful =
      row.delta != null || row.availableBefore !== row.availableAfter || row.stateBefore !== row.stateAfter;
    if (meaningful) decisionChange[key] = row;
  });

  return {
    success: true,
    available: comparison.available,
    model: comparison.model,
    profile: comparison.profile,
    baselineMode: context.baselineMode,
    baselineState: context.baselineState,
    baselineAnalysisId: context.baselineAnalysisId,
    baselineCreatedAt: context.baselineCreatedAt,
    baselineEvidenceAsOf: context.baselineEvidenceAsOf || evidenceAsOf,
    baselineEngineVersion: context.baselineEngineVersion,
    baselineModelVersion: context.baselineModelVersion,
    baselineDecisionModel: context.baselineDecisionModel,
    scenarioDecisionModel: context.scenarioDecisionModel,
    scenarioEngineVersion: context.scenarioEngineVersion,
    crossVersionComparison: Boolean(context.crossVersionComparison),
    scoreComparison: context.scoreComparison || (context.crossVersionComparison ? 'cross_version' : 'same_model'),
    currentListingChangedSinceAnalysis: context.currentListingChangedSinceAnalysis,
    listingChangedFields: context.listingChangedFields || [],
    baselineSource: context.baselineSource,
    baselineDecision: stampMeta.baselineDecision,
    baselineDecisionReason: stampMeta.baselineDecisionReason,
    baselinePinnedToStamp: Boolean(stampMeta.baselinePinnedToStamp),
    limitations: context.limitations || [],
    listing: {
      askingPrice: listingAskingPrice,
      monthlyRent: listingRent,
      serviceCharge: listingFacts.facts.serviceCharge?.value ?? null,
      groundRent: listingFacts.facts.groundRent?.value ?? null,
    },
    factsUnchanged: {
      listingAskingPrice,
      listingRent,
      serviceChargeFact: listingFacts.facts.serviceCharge?.value ?? null,
      groundRentFact: listingFacts.facts.groundRent?.value ?? null,
      propertyFactsVersion: listingFacts.version,
    },
    baseline: {
      purchasePrice: numericOption(frozenBaselineOptions.purchasePrice) ?? listingAskingPrice,
      expectedRent: numericOption(frozenBaselineOptions.expectedRent) ?? listingRent,
      presented: baselineEvidence.presented,
      operatingCostCompleteness: baselineEvidence.presented?.costEvidence?.completeness || null,
      financeCompleteness: baselineEvidence.presented?.financeEvidence?.completeness || null,
      decision: publicDecision(comparison.base),
    },
    scenario: {
      purchasePrice:
        numericOption(frozenScenarioOptions.purchasePrice)
        ?? numericOption(frozenBaselineOptions.purchasePrice)
        ?? listingAskingPrice,
      expectedRent:
        numericOption(frozenScenarioOptions.expectedRent)
        ?? numericOption(frozenBaselineOptions.expectedRent)
        ?? listingRent,
      presented: scenarioEvidence.presented,
      operatingCostCompleteness: scenarioEvidence.presented?.costEvidence?.completeness || null,
      financeCompleteness: scenarioEvidence.presented?.financeEvidence?.completeness || null,
      decision: publicDecision(comparison.scenarioResult),
      applied: comparison.scenario?.applied || null,
    },
    change: {
      purchasePrice: scalarPair(
        frozenBaselineOptions.purchasePrice ?? listingAskingPrice,
        frozenScenarioOptions.purchasePrice ?? frozenBaselineOptions.purchasePrice ?? listingAskingPrice
      ),
      expectedRent: scalarPair(
        frozenBaselineOptions.expectedRent ?? listingRent,
        frozenScenarioOptions.expectedRent ?? frozenBaselineOptions.expectedRent ?? listingRent
      ),
      ...presentedChange,
      monthlyPayment: comparison.financialDeltas?.monthlyPayment || null,
      score: {
        before: comparison.baseScore,
        after: comparison.scenarioScore,
        delta: comparison.scoreDelta,
      },
      outcome: {
        before: comparison.outcomeBefore,
        after: comparison.outcomeAfter,
      },
      dimensions: decisionChange,
    },
    valuation: comparison.valuation,
    confidence: comparison.confidence,
    explanation: comparison.deterministicDeltaExplanation,
    engineFinancialDeltas: comparison.financialDeltas,
    scoreSource: 'personal-decision-whatif-1.0.0',
  };
}

function toPublicWhatIfHttp(result, access) {
  if (!result || !result.success) return result;
  const publicResult = { ...result };
  delete publicResult.engineFinancialDeltas;
  return {
    ...publicResult,
    persistence: 'request_scoped',
    notSaved: true,
    notPropertyTruth: true,
    notUserFinanceProfile: true,
    listingAskingNotOverwritten: true,
    accessContext: access
      ? {
          relationship: access.relationship,
          accessLevel: access.accessLevel,
        }
      : null,
  };
}

function intelligenceFromStoredAnalysis(item) {
  const output = parseJsonMaybe(item?.output_data || item?.outputData);
  const report = Object.keys(output).length ? output : item?.marketIntelligence ? item : {};
  return intelligenceFromCanonicalReport(report);
}

function baselineOptionsFromStoredAnalysis(item) {
  const input = parseJsonMaybe(item?.input_data || item?.inputData);
  if (input.finance?.options && typeof input.finance.options === 'object') {
    return input.finance.options;
  }
  if (input.options && typeof input.options === 'object') {
    return input.options;
  }
  return {};
}

function storedAnalysisMatchesTarget(item, { propertyId, subjectId } = {}) {
  if (!item) return false;
  const type = item.request_type || item.requestType;
  if (type && type !== 'property_intelligence') return false;
  const output = parseJsonMaybe(item.output_data || item.outputData);
  const itemPropertyId = Number(item.property_id ?? item.propertyId);
  if (propertyId != null) {
    if (!Number.isFinite(itemPropertyId) || itemPropertyId !== Number(propertyId)) return false;
    const outputPropertyId = Number(output.property?.id ?? output.identity?.listingId);
    if (Number.isFinite(outputPropertyId) && outputPropertyId !== Number(propertyId)) return false;
    return true;
  }
  const itemSubjectId = Number(item.subject_id ?? item.subjectId);
  if (subjectId != null) {
    if (!Number.isFinite(itemSubjectId) || itemSubjectId !== Number(subjectId)) return false;
    const outputSubjectId = Number(output.property?.subjectId ?? output.identity?.subjectId);
    if (Number.isFinite(outputSubjectId) && outputSubjectId !== Number(subjectId)) return false;
    return true;
  }
  return false;
}

function prepareIntelligenceWhatIfRun({ parsed, liveProperty, storedItem = null }) {
  if (parsed.analysisId) {
    if (!storedItem || !storedAnalysisMatchesTarget(storedItem, parsed)) {
      return {
        ok: false,
        status: 404,
        success: false,
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Saved analysis not found for this property.',
      };
    }
    const resolved = resolveSavedWhatIfBaseline(storedItem, { liveProperty });
    if (!resolved.ok) {
      return {
        ok: false,
        status: 400,
        success: false,
        ...resolved,
      };
    }
    return {
      ok: true,
      property: resolved.property,
      baselineOptions: resolved.financeOptions,
      intelligence: resolved.intelligence,
      asOf: resolved.evidenceAsOf,
      baselineContext: resolved.context,
      liveListing: liveProperty,
    };
  }

  return {
    ok: true,
    property: liveProperty,
    baselineOptions: parsed.baselineOptions || {},
    intelligence: {},
    asOf: null,
    baselineContext: liveBaselineContext(),
    liveListing: liveProperty,
  };
}

module.exports = {
  ALLOWED_HTTP_KEYS,
  parseWhatIfHttpBody,
  executeIntelligenceWhatIf,
  toPublicWhatIfHttp,
  scenarioPatchFromOptions,
  intelligenceFromStoredAnalysis,
  baselineOptionsFromStoredAnalysis,
  storedAnalysisMatchesTarget,
  prepareIntelligenceWhatIfRun,
};
