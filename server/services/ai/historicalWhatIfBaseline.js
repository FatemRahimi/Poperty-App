/**
 * Historical What-if baseline from a saved Property Intelligence analysis.
 * Temporal / snapshot integrity only — does not change scoring formulas.
 *
 * Saved baseline = persisted snapshot at analysis time.
 * Live baseline = current listing. The two must not be mixed silently.
 */

const { parseAnalyseFinanceRequest } = require('./financeInputContract');
const { intelligenceFromCanonicalReport } = require('./personalDecisionCanonical');
const { buildDeterministicDeltaExplanation } = require('./personalDecisionWhyEngine');
const {
  personalDecisionConfig,
  WHAT_IF_VERSION,
} = require('../../config/personalDecision.config');
const { CANONICAL_ENGINE_VERSION } = require('./propertyIntelligenceEngine');

function parseJsonMaybe(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function numeric(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value) && value.value != null) {
    const n = Number(value.value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function hasPersonalDecisionStamp(stamp) {
  if (!stamp || typeof stamp !== 'object' || Array.isArray(stamp)) return false;
  if (stamp.score != null && Number.isFinite(Number(stamp.score))) return true;
  if (stamp.dimensions && typeof stamp.dimensions === 'object' && Object.keys(stamp.dimensions).length) {
    return true;
  }
  if (stamp.available === true || stamp.outcome) return true;
  return false;
}

function applyObservedListingCosts(target, observed) {
  if (!observed || typeof observed !== 'object') return target;
  const sc = observed.serviceCharge;
  if (sc?.available && numeric(sc.value) != null) {
    if (sc.field === 'service_charge') target.service_charge = numeric(sc.value);
    else target.service_charges = numeric(sc.value);
  }
  const gr = observed.groundRent;
  if (gr?.available && numeric(gr.value) != null) {
    target.ground_rent = numeric(gr.value);
  }
  const band = observed.councilTax?.band;
  if (band?.available && band.value) {
    target.council_tax_band = band.value;
  }
  const status = observed.councilTax?.status;
  if (status?.available && status.value) {
    target.council_tax_status = status.value;
  }
  return target;
}

/**
 * Reconstruct the listing as it was stored on the report.
 * Does not use snapshot.rent when that field can be recommended rent, not listing rent.
 */
function propertyFromSavedReport(report = {}) {
  const p = report.property && typeof report.property === 'object' ? { ...report.property } : {};
  const snap = report.snapshot && typeof report.snapshot === 'object' ? report.snapshot : {};
  const reconstructed = { ...p };

  if (reconstructed.price == null && snap.price != null) reconstructed.price = snap.price;
  if (reconstructed.bedrooms == null && snap.bedrooms != null) reconstructed.bedrooms = snap.bedrooms;
  if (reconstructed.bathrooms == null && snap.bathrooms != null) reconstructed.bathrooms = snap.bathrooms;
  if (reconstructed.square_feet == null && snap.size != null) reconstructed.square_feet = snap.size;
  if (!reconstructed.property_type && snap.propertyType) reconstructed.property_type = snap.propertyType;
  if (!reconstructed.tenure && snap.tenure) reconstructed.tenure = snap.tenure;
  if (!reconstructed.epc_rating && snap.epc) reconstructed.epc_rating = snap.epc;
  if (!reconstructed.council_tax_band && snap.councilTaxBand) {
    reconstructed.council_tax_band = snap.councilTaxBand;
  }

  applyObservedListingCosts(reconstructed, p.observedFields);
  if (reconstructed.listedPrice == null && reconstructed.price != null) {
    reconstructed.listedPrice = reconstructed.price;
  }
  return reconstructed;
}

function financeOptionsFromStoredAnalysis(item, report = {}) {
  const input = parseJsonMaybe(item?.input_data || item?.inputData);
  const candidates = [];
  if (input.finance?.options && typeof input.finance.options === 'object') {
    candidates.push(input.finance.options);
  }
  if (report.inputSnapshot?.finance?.submitted && typeof report.inputSnapshot.finance.submitted === 'object') {
    candidates.push(report.inputSnapshot.finance.submitted);
  }
  if (report.inputSnapshot?.options && typeof report.inputSnapshot.options === 'object') {
    candidates.push(report.inputSnapshot.options);
  }
  if (report.financeRequest?.submitted && typeof report.financeRequest.submitted === 'object') {
    candidates.push(report.financeRequest.submitted);
  }
  if (input.options && typeof input.options === 'object') {
    candidates.push(input.options);
  }

  for (const candidate of candidates) {
    const parsed = parseAnalyseFinanceRequest({ finance: candidate });
    if (parsed.ok && parsed.options && Object.keys(parsed.options).length) {
      return { ...parsed.options };
    }
  }
  return {};
}

function reportFromStoredItem(item) {
  return parseJsonMaybe(item?.output_data || item?.outputData);
}

function snapshotHasListingSlice(report, property) {
  if (report.property && typeof report.property === 'object') return true;
  if (report.snapshot && (report.snapshot.price != null || report.snapshot.bedrooms != null)) return true;
  if (property && (property.price != null || property.monthly_rent != null || property.id != null)) return true;
  return false;
}

function detectListingChangedSinceAnalysis(liveProperty, savedProperty) {
  if (!liveProperty || !savedProperty) {
    return { detectable: false, changed: null, fields: [] };
  }
  const fields = [];
  let comparable = false;
  const livePrice = numeric(liveProperty.price);
  const savedPrice = numeric(savedProperty.price);
  const liveRent = numeric(liveProperty.monthly_rent);
  const savedRent = numeric(savedProperty.monthly_rent);
  if (livePrice != null && savedPrice != null) {
    comparable = true;
    if (livePrice !== savedPrice) fields.push('askingPrice');
  }
  if (liveRent != null && savedRent != null) {
    comparable = true;
    if (liveRent !== savedRent) fields.push('monthlyRent');
  }
  if (!comparable) return { detectable: false, changed: null, fields: [] };
  return { detectable: true, changed: fields.length > 0, fields };
}

function dimensionDeltasFromStamp(stamp, scenarioDecision) {
  const keys = new Set([
    ...Object.keys(stamp?.dimensions || {}),
    ...Object.keys(scenarioDecision?.dimensions || {}),
  ]);
  const deltas = {};
  keys.forEach((key) => {
    const b = stamp?.dimensions?.[key] || {};
    const s = scenarioDecision?.dimensions?.[key] || {};
    const both = b.available && s.available && Number.isFinite(b.score) && Number.isFinite(s.score);
    deltas[key] = {
      before: b.available ? b.score : null,
      after: s.available ? s.score : null,
      delta: both ? s.score - b.score : null,
      availableBefore: Boolean(b.available),
      availableAfter: Boolean(s.available),
      stateBefore: b.state || null,
      stateAfter: s.state || null,
    };
  });
  return deltas;
}

function applySavedPersonalDecisionStamp(comparison, stamp) {
  if (!hasPersonalDecisionStamp(stamp)) {
    const next = {
      ...comparison,
      baseScore: null,
      scoreDelta: null,
      outcomeBefore: null,
      decisionBefore: null,
      base: null,
      dimensionDeltas: {},
      baselinePinnedToStamp: false,
    };
    next.deterministicDeltaExplanation = {
      overall:
        'A historical Personal Decision was not stored on this saved analysis, so a baseline score comparison is not available.',
      improved: [],
      worsened: [],
      unchanged: [],
      financeChanges: [],
    };
    return {
      comparison: next,
      baselineDecision: 'notAvailableForHistoricalSnapshot',
      baselineDecisionReason: 'personal_decision_not_persisted_in_legacy_analysis',
      baselinePinnedToStamp: false,
    };
  }

  const baseScore = Number.isFinite(Number(stamp.score)) ? Number(stamp.score) : null;
  const scenarioScore = Number.isFinite(comparison.scenarioScore) ? comparison.scenarioScore : null;
  const stampedBase = {
    score: baseScore,
    outcome: stamp.outcome || null,
    available: Boolean(stamp.available),
    decision: stamp.decision || null,
    decisionStrength: stamp.decisionStrength || null,
    dimensions: stamp.dimensions || {},
    constraintFailures: stamp.constraintFailures || [],
  };
  const next = {
    ...comparison,
    baseScore,
    scoreDelta: baseScore != null && scenarioScore != null ? scenarioScore - baseScore : null,
    outcomeBefore: stamp.outcome || null,
    decisionBefore: stamp.decision || null,
    base: stampedBase,
    dimensionDeltas: dimensionDeltasFromStamp(stampedBase, comparison.scenarioResult),
    baselinePinnedToStamp: true,
  };
  next.deterministicDeltaExplanation = buildDeterministicDeltaExplanation(next);
  return {
    comparison: next,
    baselineDecision: 'stamped',
    baselineDecisionReason: null,
    baselinePinnedToStamp: true,
  };
}

function crossVersionState(report, stamp, item) {
  const baselineEngineVersion =
    report.engineVersion || report.modelVersion || item?.model_version || item?.modelVersion || null;
  const baselineDecisionModel = stamp?.model?.version || null;
  const scenarioDecisionModel = personalDecisionConfig.version;
  const scenarioEngineVersion = WHAT_IF_VERSION;
  const decisionModelDiffers = Boolean(
    baselineDecisionModel && baselineDecisionModel !== scenarioDecisionModel
  );
  const engineDiffers = Boolean(
    baselineEngineVersion && baselineEngineVersion !== CANONICAL_ENGINE_VERSION
  );
  const whatIfEngineDiffers = Boolean(
    stamp?.model?.whatIfVersion && stamp.model.whatIfVersion !== WHAT_IF_VERSION
  );
  const crossVersionComparison = decisionModelDiffers || engineDiffers || whatIfEngineDiffers;
  return {
    baselineEngineVersion,
    baselineModelVersion: report.modelVersion || item?.model_version || item?.modelVersion || null,
    baselineDecisionModel,
    scenarioDecisionModel,
    scenarioEngineVersion,
    crossVersionComparison,
    scoreComparison: crossVersionComparison ? 'cross_version' : 'same_model',
  };
}

function collectLimitations({ item, report, property, stamp }) {
  const limitations = [];
  const input = parseJsonMaybe(item?.input_data || item?.inputData);
  if (!hasPersonalDecisionStamp(stamp)) {
    limitations.push({
      code: 'personal_decision_not_persisted_in_legacy_analysis',
      field: 'personalDecision',
    });
  }
  const financeRecorded = Boolean(
    input.finance ||
      input.options ||
      report.inputSnapshot?.finance ||
      report.inputSnapshot?.options ||
      report.financeRequest
  );
  if (!financeRecorded) {
    limitations.push({
      code: 'finance_snapshot_not_persisted',
      field: 'financeRequest',
    });
  }
  if (!report.propertyFacts && !property.propertyFacts) {
    limitations.push({
      code: 'property_facts_not_persisted',
      field: 'propertyFacts',
    });
  }
  if (!report.identity && property.id == null) {
    limitations.push({
      code: 'identity_not_persisted',
      field: 'identity',
    });
  }
  if (!report.engineVersion && !report.modelVersion && !item?.model_version && !item?.modelVersion) {
    limitations.push({
      code: 'engine_version_not_persisted',
      field: 'engineVersion',
    });
  }
  return limitations;
}

function resolveSavedWhatIfBaseline(item, { liveProperty = null } = {}) {
  const report = reportFromStoredItem(item);
  const hasCanonical =
    Boolean(report.property) ||
    Boolean(report.snapshot) ||
    Boolean(report.marketIntelligence) ||
    Boolean(report.personalDecision) ||
    Boolean(report.investment);

  if (!item || !hasCanonical) {
    return {
      ok: false,
      code: 'HISTORICAL_BASELINE_UNAVAILABLE',
      baselineMode: 'saved_snapshot',
      baselineState: 'notAvailable',
      baselineDecision: 'notAvailableForHistoricalSnapshot',
      reason: 'historical_snapshot_insufficient',
      limitations: [{ code: 'historical_snapshot_insufficient', field: 'output_data' }],
      message: 'This saved analysis does not contain a historical snapshot that What-if can use.',
    };
  }

  const property = propertyFromSavedReport(report);
  if (!snapshotHasListingSlice(report, property)) {
    return {
      ok: false,
      code: 'HISTORICAL_BASELINE_UNAVAILABLE',
      baselineMode: 'saved_snapshot',
      baselineState: 'notAvailable',
      baselineDecision: 'notAvailableForHistoricalSnapshot',
      reason: 'historical_listing_not_persisted',
      limitations: [{ code: 'historical_listing_not_persisted', field: 'property' }],
      message: 'This saved analysis does not include the listing values from analysis time.',
    };
  }

  const financeOptions = financeOptionsFromStoredAnalysis(item, report);
  const stamp = hasPersonalDecisionStamp(report.personalDecision) ? report.personalDecision : null;
  const limitations = collectLimitations({ item, report, property, stamp });
  const versions = crossVersionState(report, stamp, item);
  const listingChange = detectListingChangedSinceAnalysis(liveProperty, property);
  const evidenceAsOf = report.evidenceAsOf || report.analysisDate || null;
  const createdAt = isoTimestamp(item.created_at || item.createdAt);
  const baselineState = limitations.some((row) =>
    [
      'personal_decision_not_persisted_in_legacy_analysis',
      'finance_snapshot_not_persisted',
      'property_facts_not_persisted',
    ].includes(row.code)
  )
    ? 'partial'
    : 'complete';

  return {
    ok: true,
    property: cloneJson(property),
    financeOptions: cloneJson(financeOptions),
    intelligence: intelligenceFromCanonicalReport(report),
    evidenceAsOf,
    stamp: stamp ? cloneJson(stamp) : null,
    context: {
      baselineMode: 'saved_snapshot',
      baselineState,
      baselineAnalysisId: item.id != null ? Number(item.id) : null,
      baselineCreatedAt: createdAt,
      baselineEvidenceAsOf: evidenceAsOf,
      baselineEngineVersion: versions.baselineEngineVersion,
      baselineModelVersion: versions.baselineModelVersion,
      baselineDecisionModel: versions.baselineDecisionModel,
      scenarioDecisionModel: versions.scenarioDecisionModel,
      scenarioEngineVersion: versions.scenarioEngineVersion,
      crossVersionComparison: versions.crossVersionComparison,
      scoreComparison: versions.scoreComparison,
      currentListingChangedSinceAnalysis: listingChange.detectable ? listingChange.changed : null,
      listingChangedFields: listingChange.detectable ? listingChange.fields : [],
      limitations,
      stampedPersonalDecision: stamp ? cloneJson(stamp) : null,
      baselineSource: 'saved_analysis',
    },
  };
}

function liveBaselineContext() {
  return {
    baselineMode: 'live',
    baselineState: 'current',
    baselineAnalysisId: null,
    baselineCreatedAt: null,
    baselineEvidenceAsOf: null,
    baselineEngineVersion: CANONICAL_ENGINE_VERSION,
    baselineModelVersion: CANONICAL_ENGINE_VERSION,
    baselineDecisionModel: personalDecisionConfig.version,
    scenarioDecisionModel: personalDecisionConfig.version,
    scenarioEngineVersion: WHAT_IF_VERSION,
    crossVersionComparison: false,
    scoreComparison: 'same_model',
    currentListingChangedSinceAnalysis: null,
    listingChangedFields: [],
    limitations: [],
    stampedPersonalDecision: null,
    baselineSource: 'current_listing',
  };
}

module.exports = {
  parseJsonMaybe,
  cloneJson,
  propertyFromSavedReport,
  financeOptionsFromStoredAnalysis,
  resolveSavedWhatIfBaseline,
  detectListingChangedSinceAnalysis,
  applySavedPersonalDecisionStamp,
  hasPersonalDecisionStamp,
  liveBaselineContext,
  reportFromStoredItem,
};
