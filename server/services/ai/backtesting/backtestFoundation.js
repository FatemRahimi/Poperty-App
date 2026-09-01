/**
 * Deterministic Property Intelligence backtesting foundation.
 *
 * PredictionSnapshot (persisted historical report) + LaterOutcome (genuine).
 * Never recomputes production valuation/rent/finance/confidence.
 * Never treats asking, updated_at, area /rents, or current provider calls as history.
 */

const {
  BACKTEST_ENGINE_VERSION,
  CONFIDENCE_MODEL_VERSION,
  STATE,
  EXCLUSION,
  MATCH_STATE,
  OUTCOME_TRUST,
  SAMPLE_SUFFICIENCY,
  MIN_SEGMENT_SAMPLE,
  MIN_CONFIDENCE_GROUP_SAMPLE,
  PERSONAL_DECISION_REQUIRED_LABELS,
} = require('./constants');

function isPresent(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return true;
}

function positiveNumber(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && isPresent(value.value)) {
    return positiveNumber(value.value);
  }
  if (!isPresent(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function finiteNumber(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.value != null) {
    return finiteNumber(value.value);
  }
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTime(value) {
  if (!isPresent(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function timeMs(value) {
  const iso = parseTime(value);
  return iso ? new Date(iso).getTime() : null;
}

function isBefore(earlier, later) {
  const a = timeMs(earlier);
  const b = timeMs(later);
  if (a == null || b == null) return false;
  return a < b;
}

function sameText(a, b) {
  if (!isPresent(a) || !isPresent(b)) return false;
  return String(a).trim() === String(b).trim();
}

function median(values) {
  const list = (values || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function mean(values) {
  const list = (values || []).filter((n) => Number.isFinite(n));
  if (!list.length) return null;
  return list.reduce((s, n) => s + n, 0) / list.length;
}

function round4(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 10000;
}

function sampleSufficiencyOf(n) {
  if (!n) return SAMPLE_SUFFICIENCY.noData;
  if (n <= 2) return SAMPLE_SUFFICIENCY.verySparse;
  if (n <= 4) return SAMPLE_SUFFICIENCY.limited;
  return SAMPLE_SUFFICIENCY.sufficient;
}

function emptyMetricBlock(state, extra = {}) {
  return {
    state,
    sampleSize: 0,
    sampleSufficiency: SAMPLE_SUFFICIENCY.noData,
    mae: null,
    medianAbsoluteError: null,
    mape: null,
    medianAbsolutePercentageError: null,
    signedBias: null,
    medianSignedPercentageError: null,
    boundsCoverage: null,
    ...extra,
  };
}

function reportConfidence(report = {}) {
  const confidence = report.confidence || {};
  const assessment = confidence.assessment || {};
  const model =
    assessment.model?.baseVersion ||
    assessment.model?.version ||
    assessment.modelVersion ||
    confidence.modelVersion ||
    null;
  return {
    level: confidence.level || null,
    score: finiteNumber(confidence.score),
    assessed: confidence.assessed !== false && Boolean(confidence.level),
    modelVersion: model,
  };
}

function extractSalePrediction(report = {}) {
  const sale = report.marketIntelligence?.sale || report.saleValuation || report.sale || null;
  if (!sale) {
    return {
      available: false,
      assessed: false,
      reason: EXCLUSION.not_assessed,
      central: null,
      lower: null,
      upper: null,
      boundsAvailable: false,
      lastSoldPrice: null,
      lastSoldDate: null,
      evidenceSources: [],
      methodFamilies: [],
      evidenceEligibility: null,
    };
  }
  if (sale.success === false || sale.insufficientEvidence) {
    return {
      available: false,
      assessed: false,
      reason: EXCLUSION.not_assessed,
      central: null,
      lower: null,
      upper: null,
      boundsAvailable: false,
      lastSoldPrice: null,
      lastSoldDate: null,
      evidenceSources: [],
      methodFamilies: sale.evidenceEligibility?.methodFamilies || [],
      evidenceEligibility: sale.evidenceEligibility || null,
    };
  }
  const central = positiveNumber(sale.centralEstimate);
  const lower = positiveNumber(sale.lowerEstimate);
  const upper = positiveNumber(sale.upperEstimate);
  const lastSold = sale.lastSold || {};
  const components = Array.isArray(sale.components) ? sale.components : [];
  const eligibility = sale.evidenceEligibility || report.evidenceEligibility || null;
  if (central == null) {
    return {
      available: false,
      assessed: false,
      reason: EXCLUSION.invalid_prediction,
      central: null,
      lower: null,
      upper: null,
      boundsAvailable: false,
      lastSoldPrice: positiveNumber(lastSold.price),
      lastSoldDate: parseTime(lastSold.date || lastSold.observedAt),
      evidenceSources: components.map((c) => c.method).filter(Boolean),
      methodFamilies: eligibility?.methodFamilies || [],
      evidenceEligibility: eligibility,
    };
  }
  return {
    available: true,
    assessed: true,
    reason: null,
    central,
    lower,
    upper,
    boundsAvailable: Boolean(sale.boundsAvailable) && lower != null && upper != null,
    lastSoldPrice: positiveNumber(lastSold.price),
    lastSoldDate: parseTime(lastSold.date || lastSold.observedAt),
    evidenceSources: components.map((c) => c.method).filter(Boolean),
    methodFamilies: eligibility?.methodFamilies || eligibility?.assessedMethods || [],
    evidenceEligibility: eligibility,
    confidence: sale.confidence || sale.confidenceAssessment?.level || null,
  };
}

function extractRentPrediction(report = {}) {
  const rent = report.marketIntelligence?.rent || report.rentIntel || null;
  if (!rent || rent.success === false) {
    return {
      available: false,
      predictedRent: null,
      lower: null,
      upper: null,
      boundsAvailable: false,
      askingRentAtT: null,
    };
  }
  const predicted = positiveNumber(rent.recommendedRent || rent.estimatedRent);
  const lower = positiveNumber(rent.marketRange?.low);
  const upper = positiveNumber(rent.marketRange?.high);
  return {
    available: predicted != null,
    predictedRent: predicted,
    lower,
    upper,
    boundsAvailable: lower != null && upper != null,
    askingRentAtT: positiveNumber(rent.currentRent),
  };
}

function coerceReport(row = {}) {
  if (row.output_data && typeof row.output_data === 'object' && !Array.isArray(row.output_data)) {
    return row.output_data;
  }
  if (row.outputData && typeof row.outputData === 'object' && !Array.isArray(row.outputData)) {
    return row.outputData;
  }
  if (row.report && typeof row.report === 'object' && !Array.isArray(row.report)) {
    return row.report;
  }
  if (row.engineVersion || row.marketIntelligence || row.analysisMode === 'canonical') {
    return row;
  }
  return null;
}

/**
 * Build a PredictionSnapshot from a persisted ai_requests row / in-memory fixture.
 * Does not recompute analysis. Synthetic fixtures must set `synthetic: true`.
 */
function extractPredictionSnapshot(row = {}) {
  const report = coerceReport(row);
  if (!report) {
    return { available: false, reason: EXCLUSION.missing_historical_snapshot };
  }

  const identity = report.identity || {};
  const property = report.property || {};
  const evidenceAsOf = parseTime(report.evidenceAsOf || report.analysisDate);
  const persistedAt = parseTime(row.created_at || row.createdAt);
  const analysisAt = evidenceAsOf || persistedAt;
  if (!analysisAt) {
    return { available: false, reason: EXCLUSION.missing_historical_snapshot };
  }

  const listingId =
    identity.listingId ??
    property.listingId ??
    property.id ??
    row.property_id ??
    row.propertyId ??
    null;
  const subjectId =
    identity.subjectId ?? property.subjectId ?? row.subject_id ?? row.subjectId ?? null;
  const uprn = identity.uprn || property.uprn || row.uprn || null;
  const sale = extractSalePrediction(report);
  const rent = extractRentPrediction(report);
  const confidence = reportConfidence(report);
  const askingPrice = positiveNumber(property.price);
  const askingRent = positiveNumber(property.monthly_rent ?? rent.askingRentAtT);
  const valuationMeasurementVersion =
    report.valuationMeasurementVersion ||
    sale.valuationMeasurementVersion ||
    (sale.evidenceEligibility ? 'post-1B' : null);

  return {
    available: true,
    synthetic: Boolean(row.synthetic || report.synthetic),
    requestId: row.id ?? null,
    listingId: listingId != null ? listingId : null,
    subjectId: subjectId != null ? subjectId : null,
    uprn: uprn ? String(uprn) : null,
    analysisAt,
    timestampSource: evidenceAsOf ? 'evidenceAsOf' : 'ai_requests.created_at',
    engineVersion: report.engineVersion || report.modelVersion || row.model_version || 'UNKNOWN',
    valuationMeasurementVersion: valuationMeasurementVersion || 'UNKNOWN',
    evidenceAsOf: evidenceAsOf,
    persistedAt,
    askingPriceAtT: askingPrice,
    askingRentAtT: askingRent,
    propertyType: property.property_type || null,
    postcode: property.zip_code || property.postcode || null,
    bedrooms: finiteNumber(property.bedrooms),
    epcRating: property.epc_rating || null,
    category: property.category || null,
    sale,
    rent,
    confidence,
    areaBuyerMarketBand: report.marketIntelligence?.areaMarketDemand?.band || null,
    areaRentalMarketBand: report.marketIntelligence?.areaRentalDemand?.band || null,
    personalDecision: report.personalDecision || report.personal_decision || null,
    lastSoldInSnapshot: {
      price: sale.lastSoldPrice,
      date: sale.lastSoldDate,
      propertyLastSoldPrice: positiveNumber(property.last_sold_price),
      propertyLastSoldDate: parseTime(property.last_sold_date),
    },
    leakageFlags: {
      usedCurrentProviderAsHistory: Boolean(row.recomputed || report.recomputed),
    },
  };
}

function invalidOutcomeTime(outcome) {
  const source = String(outcome?.timestampSource || '');
  if (source === 'updated_at') return EXCLUSION.updated_at_used_as_outcome_time;
  if (source === 'created_at') return EXCLUSION.created_at_used_as_outcome_time;
  if (source === 'status') return EXCLUSION.status_used_as_achieved_value;
  if (source === 'asking') return outcome.kind === 'rent'
    ? EXCLUSION.asking_used_as_achieved_rent
    : EXCLUSION.asking_used_as_achieved_price;
  if (source === 'valuation') return EXCLUSION.valuation_used_as_outcome;
  if (source === 'area_rents' || source === '/rents') return EXCLUSION.area_rents_used_as_achieved_rent;
  return null;
}

/**
 * First-party sale/let outcome. Requires dedicated achieved_* plus sold_at/let_at.
 * Asking, updated_at, created_at, and status are never outcomes.
 */
function extractListingOutcomes(listing = {}) {
  const listingId = listing.id ?? listing.listingId ?? listing.property_id ?? null;
  const uprn = listing.uprn ? String(listing.uprn) : null;
  const results = [];

  const achievedPrice = positiveNumber(listing.achieved_price);
  const soldAt = parseTime(listing.sold_at);
  if (achievedPrice && soldAt) {
    results.push({
      kind: 'sale',
      source: 'first_party_listing',
      matchBasis: 'listingId',
      listingId,
      uprn,
      value: achievedPrice,
      observedAt: soldAt,
      timestampSource: 'sold_at',
      trust: OUTCOME_TRUST.userReported,
      verificationState: 'user_reported',
      sourceRecordId: listingId != null ? `listing:${listingId}:sold` : null,
      provenance: {
        source: 'ApplicationDatabase',
        field: 'achieved_price',
        observedAt: soldAt,
      },
    });
  }

  const achievedRent = positiveNumber(listing.achieved_rent);
  const letAt = parseTime(listing.let_at);
  if (achievedRent && letAt) {
    results.push({
      kind: 'rent',
      source: 'first_party_listing',
      matchBasis: 'listingId',
      listingId,
      uprn,
      value: achievedRent,
      observedAt: letAt,
      timestampSource: 'let_at',
      trust: OUTCOME_TRUST.userReported,
      verificationState: 'user_reported',
      sourceRecordId: listingId != null ? `listing:${listingId}:let` : null,
      provenance: {
        source: 'ApplicationDatabase',
        field: 'achieved_rent',
        observedAt: letAt,
      },
    });
  }

  return results;
}

/**
 * Later HMLR-style transaction. Requires price, date, and exact UPRN.
 * last_sold_date is the observation time — never retrievedAt or listing updated_at.
 */
function extractTransactionOutcome(tx = {}) {
  const price = positiveNumber(tx.price || tx.lastSoldPrice || tx.last_sold_price);
  const observedAt = parseTime(tx.date || tx.lastSoldDate || tx.last_sold_date);
  const uprn = tx.uprn ? String(tx.uprn) : null;
  if (!price || !observedAt || !uprn) return null;
  if (tx.timestampSource === 'updated_at' || tx.timestampSource === 'created_at') return null;
  if (tx.timestampSource === 'retrievedAt' || tx.timestampSource === 'retrieved_at') return null;
  return {
    kind: 'sale',
    source: tx.source || 'hmlr_via_propertydata',
    matchBasis: 'uprn',
    listingId: tx.listingId ?? tx.property_id ?? null,
    uprn,
    value: price,
    observedAt,
    timestampSource: 'transaction_date',
    trust: OUTCOME_TRUST.verifiedObserved,
    verificationState: 'verified_observed',
    sourceRecordId: tx.sourceRecordId || tx.id || tx.transaction_id || null,
    provenance: {
      source: tx.provider || 'PropertyData',
      method: 'later_sold_transaction',
      observedAt,
      matchBasis: 'uprn',
    },
  };
}

function outcomeDedupeKeys(outcome) {
  const keys = [];
  if (outcome.source && outcome.sourceRecordId) {
    keys.push(`src:${outcome.source}:${outcome.sourceRecordId}`);
  }
  const date = parseTime(outcome.observedAt);
  if (outcome.uprn && outcome.value != null && date) {
    keys.push(`uprn:${outcome.kind}:${outcome.uprn}:${outcome.value}:${date}`);
  }
  if (isPresent(outcome.listingId) && outcome.value != null && date) {
    keys.push(`listing:${outcome.kind}:${outcome.listingId}:${outcome.value}:${date}`);
  }
  if (!keys.length) {
    keys.push(`raw:${outcome.kind}:${outcome.source}:${outcome.value}:${date}`);
  }
  return keys;
}

/**
 * One real transaction from multiple sources is counted once.
 * Same source+record, same UPRN+price+date, or same listing+price+date.
 */
function dedupeOutcomes(outcomes = []) {
  const seenKeys = new Set();
  const unique = [];
  outcomes.forEach((outcome) => {
    const keys = outcomeDedupeKeys(outcome);
    if (keys.some((key) => seenKeys.has(key))) return;
    keys.forEach((key) => seenKeys.add(key));
    unique.push(outcome);
  });
  return unique;
}

function identityCompatible(snapshot, outcome) {
  if (outcome.matchBasis === 'address' || outcome.matchBasis === 'fuzzy') {
    return { ok: false, reason: EXCLUSION.weak_identity_match, matchState: MATCH_STATE.ambiguous };
  }
  if (outcome.matchBasis === 'listingId') {
    if (!isPresent(snapshot.listingId) || !isPresent(outcome.listingId)) {
      return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.unmatched };
    }
    if (!sameText(snapshot.listingId, outcome.listingId)) {
      return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.unmatched };
    }
    if (snapshot.uprn && outcome.uprn && !sameText(snapshot.uprn, outcome.uprn)) {
      return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.ambiguous };
    }
    return { ok: true, matchState: MATCH_STATE.verified };
  }
  if (outcome.matchBasis === 'uprn') {
    if (!snapshot.uprn || !outcome.uprn || !sameText(snapshot.uprn, outcome.uprn)) {
      return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.unmatched };
    }
    if (
      isPresent(snapshot.listingId) &&
      isPresent(outcome.listingId) &&
      !sameText(snapshot.listingId, outcome.listingId)
    ) {
      return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.ambiguous };
    }
    return { ok: true, matchState: MATCH_STATE.verified };
  }
  return { ok: false, reason: EXCLUSION.ambiguous_identity, matchState: MATCH_STATE.unmatched };
}

function outcomeKnownAtPrediction(snapshot, outcome) {
  const knownDates = [
    snapshot.lastSoldInSnapshot?.date,
    snapshot.lastSoldInSnapshot?.propertyLastSoldDate,
  ].filter(Boolean);
  const knownPrices = [
    snapshot.lastSoldInSnapshot?.price,
    snapshot.lastSoldInSnapshot?.propertyLastSoldPrice,
  ].filter((n) => n != null);
  if (!knownDates.length) return false;
  const sameDate = knownDates.some((d) => parseTime(d) === outcome.observedAt);
  const samePrice = knownPrices.some((p) => p === outcome.value);
  return sameDate && (samePrice || knownPrices.length === 0);
}

function pairSnapshotWithOutcome(snapshot, outcome, { asOf = Date.now() } = {}) {
  if (!snapshot?.available) {
    return { eligible: false, reason: EXCLUSION.missing_historical_snapshot, matchState: MATCH_STATE.unmatched };
  }
  if (outcome && isPresent(outcome.value) && positiveNumber(outcome.value) == null) {
    return { eligible: false, reason: EXCLUSION.invalid_outcome_value, matchState: MATCH_STATE.unmatched };
  }
  if (outcome && isPresent(outcome.observedAt) && !parseTime(outcome.observedAt)) {
    return { eligible: false, reason: EXCLUSION.malformed_outcome_date, matchState: MATCH_STATE.unmatched };
  }
  if (!outcome || !positiveNumber(outcome.value) || !parseTime(outcome.observedAt)) {
    return { eligible: false, reason: EXCLUSION.missing_outcome, matchState: MATCH_STATE.unmatched };
  }
  if (outcome.trust === OUTCOME_TRUST.notSuitable) {
    return { eligible: false, reason: EXCLUSION.unverified_outcome, matchState: MATCH_STATE.unmatched };
  }

  const badTime = invalidOutcomeTime(outcome);
  if (badTime) return { eligible: false, reason: badTime, matchState: MATCH_STATE.unmatched };

  if (timeMs(outcome.observedAt) > asOf) {
    return { eligible: false, reason: EXCLUSION.future_outcome_date, matchState: MATCH_STATE.verified };
  }

  if (snapshot.leakageFlags?.usedCurrentProviderAsHistory) {
    return { eligible: false, reason: EXCLUSION.current_provider_response_as_history, matchState: MATCH_STATE.unmatched };
  }

  const identity = identityCompatible(snapshot, outcome);
  if (!identity.ok) return { eligible: false, reason: identity.reason, matchState: identity.matchState };

  if (outcomeKnownAtPrediction(snapshot, outcome)) {
    return {
      eligible: false,
      reason: EXCLUSION.outcome_already_known_at_prediction,
      matchState: identity.matchState,
    };
  }

  const futureEvidence = [
    snapshot.lastSoldInSnapshot?.date,
    snapshot.lastSoldInSnapshot?.propertyLastSoldDate,
  ].some((d) => d && timeMs(d) > timeMs(snapshot.analysisAt));
  if (futureEvidence) {
    return { eligible: false, reason: EXCLUSION.later_evidence_leakage, matchState: identity.matchState };
  }

  if (!isBefore(snapshot.analysisAt, outcome.observedAt)) {
    return { eligible: false, reason: EXCLUSION.prediction_not_before_outcome, matchState: identity.matchState };
  }

  if (outcome.kind === 'sale') {
    if (!snapshot.sale?.available || snapshot.sale.central == null) {
      return {
        eligible: false,
        reason: snapshot.sale?.reason || EXCLUSION.missing_historical_valuation,
        matchState: identity.matchState,
      };
    }
    if (snapshot.sale.central === outcome.value && outcome.source === 'valuation') {
      return { eligible: false, reason: EXCLUSION.valuation_used_as_outcome, matchState: identity.matchState };
    }
  }
  if (outcome.kind === 'rent') {
    if (!snapshot.rent?.available || snapshot.rent.predictedRent == null) {
      return {
        eligible: false,
        reason: EXCLUSION.missing_historical_rent_prediction,
        matchState: identity.matchState,
      };
    }
  }

  return { eligible: true, snapshot, outcome, matchState: identity.matchState };
}

function valuationCaseMetrics(snapshot, outcome) {
  const predicted = snapshot.sale.central;
  const achieved = outcome.value;
  const absoluteError = Math.abs(predicted - achieved);
  const signedError = predicted - achieved;
  const absolutePercentageError = absoluteError / achieved;
  const percentageError = absolutePercentageError;
  const signedPercentageError = signedError / achieved;
  const predictionToOutcomeDays = Math.round(
    (timeMs(outcome.observedAt) - timeMs(snapshot.analysisAt)) / (24 * 60 * 60 * 1000)
  );
  const boundsAvailable = Boolean(snapshot.sale.boundsAvailable);
  const withinBounds = boundsAvailable
    ? achieved >= snapshot.sale.lower && achieved <= snapshot.sale.upper
    : null;
  return {
    kind: 'sale',
    requestId: snapshot.requestId,
    listingId: snapshot.listingId,
    subjectId: snapshot.subjectId,
    uprn: snapshot.uprn,
    analysisAt: snapshot.analysisAt,
    outcomeAt: outcome.observedAt,
    predicted,
    achieved,
    absoluteError,
    percentageError,
    absolutePercentageError,
    signedError,
    signedPercentageError,
    predictionToOutcomeDays,
    matchState: MATCH_STATE.verified,
    outcomeTrust: outcome.trust || null,
    methodFamilies: snapshot.sale.methodFamilies || [],
    engineVersion: snapshot.engineVersion || 'UNKNOWN',
    valuationMeasurementVersion: snapshot.valuationMeasurementVersion || 'UNKNOWN',
    boundsAvailable,
    withinBounds,
    lower: boundsAvailable ? snapshot.sale.lower : null,
    upper: boundsAvailable ? snapshot.sale.upper : null,
    confidenceLevel: snapshot.confidence.level,
    propertyType: snapshot.propertyType,
    postcode: snapshot.postcode,
    bedrooms: snapshot.bedrooms,
    epcAvailable: Boolean(snapshot.epcRating),
    evidenceSources: snapshot.sale.evidenceSources,
    synthetic: snapshot.synthetic === true,
  };
}

function rentCaseMetrics(snapshot, outcome) {
  const predicted = snapshot.rent.predictedRent;
  const achieved = outcome.value;
  const absoluteError = Math.abs(predicted - achieved);
  const percentageError = absoluteError / achieved;
  const signedError = predicted - achieved;
  const boundsAvailable = Boolean(snapshot.rent.boundsAvailable);
  const withinBounds = boundsAvailable
    ? achieved >= snapshot.rent.lower && achieved <= snapshot.rent.upper
    : null;
  return {
    kind: 'rent',
    requestId: snapshot.requestId,
    listingId: snapshot.listingId,
    subjectId: snapshot.subjectId,
    uprn: snapshot.uprn,
    analysisAt: snapshot.analysisAt,
    outcomeAt: outcome.observedAt,
    predicted,
    achieved,
    absoluteError,
    percentageError,
    signedError,
    boundsAvailable,
    withinBounds,
    lower: boundsAvailable ? snapshot.rent.lower : null,
    upper: boundsAvailable ? snapshot.rent.upper : null,
    confidenceLevel: snapshot.confidence.level,
    synthetic: snapshot.synthetic === true,
  };
}

function aggregateCases(cases, { includeBounds = true } = {}) {
  if (!cases.length) return emptyMetricBlock(STATE.insufficientData);
  const mae = mean(cases.map((c) => c.absoluteError));
  const medianAbsoluteError = median(cases.map((c) => c.absoluteError));
  const mape = mean(cases.map((c) => c.absolutePercentageError ?? c.percentageError));
  const mdape = median(cases.map((c) => c.absolutePercentageError ?? c.percentageError));
  const bias = mean(cases.map((c) => c.signedError));
  const medianSignedPercentageError = median(
    cases.map((c) => c.signedPercentageError ?? (c.achieved ? c.signedError / c.achieved : null))
  );
  const withBounds = cases.filter((c) => c.boundsAvailable);
  let boundsCoverage = null;
  if (includeBounds && withBounds.length) {
    const covered = withBounds.filter((c) => c.withinBounds === true).length;
    boundsCoverage = {
      sampleSize: withBounds.length,
      rate: covered / withBounds.length,
      covered,
    };
  }
  return {
    state: STATE.available,
    sampleSize: cases.length,
    sampleSufficiency: sampleSufficiencyOf(cases.length),
    mae: round4(mae),
    medianAbsoluteError: round4(medianAbsoluteError),
    mape: round4(mape),
    medianAbsolutePercentageError: round4(mdape),
    signedBias: round4(bias),
    medianSignedPercentageError: round4(medianSignedPercentageError),
    boundsCoverage,
    limitation:
      cases.length < MIN_SEGMENT_SAMPLE
        ? `Sample ${cases.length} is ${sampleSufficiencyOf(cases.length)}; this is not a calibration result.`
        : null,
  };
}

function outwardPostcode(postcode) {
  if (!isPresent(postcode)) return null;
  const compact = String(postcode).toUpperCase().replace(/\s+/g, ' ').trim();
  const parts = compact.split(' ');
  if (parts.length >= 2) return parts[0];
  const m = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return m ? m[1] : null;
}

function priceBand(asking) {
  if (asking == null) return null;
  if (asking < 250000) return 'under_250k';
  if (asking < 500000) return '250k_to_500k';
  if (asking < 1000000) return '500k_to_1m';
  return 'over_1m';
}

function segmentKey(caseRow, name) {
  if (name === 'propertyType') return caseRow.propertyType || null;
  if (name === 'outwardPostcode') return outwardPostcode(caseRow.postcode);
  if (name === 'bedrooms') return caseRow.bedrooms == null ? null : String(caseRow.bedrooms);
  if (name === 'priceBand') return priceBand(caseRow.predicted ? null : null);
  if (name === 'epcAvailability') return caseRow.epcAvailable ? 'epc_present' : 'epc_missing';
  if (name === 'confidenceBand') return caseRow.confidenceLevel || null;
  if (name === 'valuationEvidenceSource') {
    const sources = caseRow.evidenceSources || [];
    if (!sources.length) return null;
    if (sources.length === 1) return sources[0];
    return 'blended';
  }
  if (name === 'methodFamily') {
    const families = caseRow.methodFamilies || [];
    return families.length === 1 ? families[0] : families.length ? 'multiple' : null;
  }
  if (name === 'engineVersion') return caseRow.engineVersion || 'UNKNOWN';
  if (name === 'horizonBand') {
    const days = caseRow.predictionToOutcomeDays;
    if (!Number.isFinite(days)) return null;
    if (days <= 90) return '0_to_90_days';
    if (days <= 365) return '91_to_365_days';
    return 'over_365_days';
  }
  return null;
}

function segmentSaleCases(cases, askingByRequestId = {}) {
  const names = [
    'propertyType',
    'outwardPostcode',
    'bedrooms',
    'priceBand',
    'epcAvailability',
      'confidenceBand',
      'valuationEvidenceSource',
      'methodFamily',
      'engineVersion',
      'horizonBand',
  ];
  const segments = [];
  names.forEach((name) => {
    const groups = new Map();
    cases.forEach((row) => {
      let key;
      if (name === 'priceBand') {
        const asking = askingByRequestId[String(row.requestId)] ?? null;
        key = priceBand(asking);
      } else {
        key = segmentKey(row, name);
      }
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    groups.forEach((rows, key) => {
      const metrics =
        rows.length >= MIN_SEGMENT_SAMPLE
          ? aggregateCases(rows)
          : emptyMetricBlock(STATE.insufficientData, {
              sampleSize: rows.length,
              note: `Segment sample ${rows.length} is below ${MIN_SEGMENT_SAMPLE}; no conclusion is drawn.`,
            });
      segments.push({
        name,
        key,
        sampleSize: rows.length,
        ...metrics,
        state: rows.length >= MIN_SEGMENT_SAMPLE ? STATE.available : STATE.insufficientData,
      });
    });
  });
  return segments;
}

function confidenceEvaluation(cases) {
  if (!cases.length) {
    return {
      state: STATE.insufficientData,
      sampleSize: 0,
      modelVersion: CONFIDENCE_MODEL_VERSION,
      calibrated: false,
      groups: [],
    };
  }
  const groupsMap = new Map();
  cases.forEach((row) => {
    const level = row.confidenceLevel || 'unknown';
    if (!groupsMap.has(level)) groupsMap.set(level, []);
    groupsMap.get(level).push(row);
  });
  const groups = [];
  groupsMap.forEach((rows, level) => {
    const metrics =
      rows.length >= MIN_CONFIDENCE_GROUP_SAMPLE
        ? aggregateCases(rows)
        : emptyMetricBlock(STATE.insufficientData, { sampleSize: rows.length });
    groups.push({
      level,
      sampleSize: rows.length,
      mae: metrics.mae,
      medianAbsolutePercentageError: metrics.medianAbsolutePercentageError,
      signedBias: metrics.signedBias,
      boundsCoverage: metrics.boundsCoverage,
      state: rows.length >= MIN_CONFIDENCE_GROUP_SAMPLE ? STATE.available : STATE.insufficientData,
    });
  });
  const evaluated = groups.some((g) => g.state === STATE.available);
  return {
    state: evaluated ? STATE.available : STATE.insufficientData,
    sampleSize: cases.length,
    modelVersion: CONFIDENCE_MODEL_VERSION,
    calibrated: false,
    groups,
  };
}

function chooseOutcome(snapshot, kind, outcomes) {
  const compatible = [];
  const exclusions = [];
  outcomes.forEach((outcome) => {
    if (outcome.kind !== kind) return;
    const paired = pairSnapshotWithOutcome(snapshot, outcome);
    if (paired.eligible) compatible.push({ outcome, paired });
    else exclusions.push(paired.reason);
  });
  if (!compatible.length) {
    return { eligible: false, reason: exclusions[0] || EXCLUSION.missing_outcome, exclusions };
  }
  const firstParty = compatible.filter((c) => c.outcome.source === 'first_party_listing');
  const pool = firstParty.length ? firstParty : compatible;
  pool.sort((a, b) => timeMs(a.outcome.observedAt) - timeMs(b.outcome.observedAt));
  const selected = pool[0];
  const distinctValues = new Set(pool.map((c) => `${c.outcome.observedAt}:${c.outcome.value}`));
  if (firstParty.length && pool.length > 1) {
    const prices = new Set(pool.map((c) => c.outcome.value));
    if (prices.size > 1 && timeMs(pool[0].outcome.observedAt) === timeMs(pool[1].outcome.observedAt)) {
      return { eligible: false, reason: EXCLUSION.conflicting_outcomes, matchState: MATCH_STATE.ambiguous };
    }
  }
  if (!firstParty.length && distinctValues.size > 1) {
    const earliest = pool[0].outcome.observedAt;
    const sameTime = pool.filter((c) => c.outcome.observedAt === earliest);
    const prices = new Set(sameTime.map((c) => c.outcome.value));
    if (prices.size > 1) {
      return { eligible: false, reason: EXCLUSION.conflicting_outcomes, matchState: MATCH_STATE.ambiguous };
    }
  }
  return selected.paired;
}

function incrementReason(map, reason) {
  const key = reason || EXCLUSION.missing_outcome;
  map[key] = (map[key] || 0) + 1;
}

/**
 * Run the observational backtest over in-memory snapshots and outcomes.
 * `productionAudit: true` excludes synthetic fixtures from aggregates.
 */
function runBacktest({
  snapshots = [],
  outcomes = [],
  generatedAt = new Date().toISOString(),
  productionAudit = false,
} = {}) {
  const exclusionReasons = {};
  const extracted = snapshots.map((row) =>
    row.available && row.analysisAt ? row : extractPredictionSnapshot(row)
  );
  const normalisedOutcomes = dedupeOutcomes(
    outcomes
      .map((o) => (o.kind && o.value && o.observedAt ? o : extractTransactionOutcome(o) || o))
      .filter(Boolean)
  );

  const saleCases = [];
  const rentCases = [];
  const snapshotRecords = [];
  let snapshotsWithPair = 0;

  extracted.forEach((snapshot) => {
    if (!snapshot?.available) {
      incrementReason(exclusionReasons, snapshot?.reason || EXCLUSION.missing_historical_snapshot);
      snapshotRecords.push({
        requestId: snapshot?.requestId ?? null,
        state: STATE.notBacktestable,
        reason: snapshot?.reason || EXCLUSION.missing_historical_snapshot,
      });
      return;
    }

    const salePair = chooseOutcome(snapshot, 'sale', normalisedOutcomes);
    const rentPair = chooseOutcome(snapshot, 'rent', normalisedOutcomes);
    const record = {
      requestId: snapshot.requestId,
      listingId: snapshot.listingId,
      subjectId: snapshot.subjectId,
      uprn: snapshot.uprn,
      analysisAt: snapshot.analysisAt,
      synthetic: snapshot.synthetic === true,
      sale: { state: STATE.notBacktestable, reason: null },
      rent: { state: STATE.notBacktestable, reason: null },
    };

    if (salePair.eligible) {
      if (productionAudit && snapshot.synthetic) {
        record.sale = {
          state: STATE.notBacktestable,
          reason: EXCLUSION.synthetic_fixture_not_production_evidence,
        };
        incrementReason(exclusionReasons, EXCLUSION.synthetic_fixture_not_production_evidence);
      } else {
        const metrics = valuationCaseMetrics(snapshot, salePair.outcome);
        saleCases.push({ ...metrics, askingPriceAtT: snapshot.askingPriceAtT });
        record.sale = { state: STATE.available, absoluteError: metrics.absoluteError };
      }
    } else {
      record.sale.reason = salePair.reason;
      incrementReason(exclusionReasons, salePair.reason);
    }

    if (rentPair.eligible) {
      if (productionAudit && snapshot.synthetic) {
        record.rent = {
          state: STATE.notBacktestable,
          reason: EXCLUSION.synthetic_fixture_not_production_evidence,
        };
        incrementReason(exclusionReasons, EXCLUSION.synthetic_fixture_not_production_evidence);
      } else {
        const metrics = rentCaseMetrics(snapshot, rentPair.outcome);
        rentCases.push(metrics);
        record.rent = { state: STATE.available, absoluteError: metrics.absoluteError };
      }
    } else {
      record.rent.reason = rentPair.reason;
      incrementReason(exclusionReasons, rentPair.reason);
    }

    if (record.sale.state === STATE.available || record.rent.state === STATE.available) {
      snapshotsWithPair += 1;
    }
    snapshotRecords.push(record);
  });

  const askingByRequestId = {};
  saleCases.forEach((c) => {
    if (c.requestId != null) askingByRequestId[String(c.requestId)] = c.askingPriceAtT;
  });

  const valuation = aggregateCases(saleCases);
  const rent = aggregateCases(rentCases);
  const historicalPersonalDecision = extracted.filter((s) => s.available && s.personalDecision).length;

  const limitations = [
    'Historical predictions are persisted ai_requests snapshots only; analysis is never recomputed as of T.',
    'First-party sold/let outcomes are captured only through the explicit outcome API; missing achieved_price/sold_at or achieved_rent/let_at stays notBacktestable.',
    'property_enrichments are current-only upserts and are not used to reconstruct prediction evidence.',
    'Personal Decision scores are suitability measures and are not labelled from sale or let outcomes.',
    'Property-specific demand is not assessed and lifecycle events are not converted into demand scores.',
    'confidence-1.1.0 is evaluated, not recalibrated.',
  ];
  if (extracted.some((s) => s.available && s.timestampSource === 'ai_requests.created_at')) {
    limitations.push(
      'Some snapshots lack evidenceAsOf; persist time is used as analysis time and is never used as an outcome timestamp.'
    );
  }

  const totalSnapshots = extracted.length;
  const excluded = Math.max(0, totalSnapshots - snapshotsWithPair);

  return {
    state:
      saleCases.length || rentCases.length ? STATE.available : STATE.insufficientData,
    generatedAt: parseTime(generatedAt) || new Date().toISOString(),
    engineVersion: BACKTEST_ENGINE_VERSION,
    observational: true,
    productionFormulasChanged: false,
    demandScoreCreated: false,
    confidenceModel: CONFIDENCE_MODEL_VERSION,
    eligibility: {
      totalSnapshots,
      eligibleSale: saleCases.length,
      eligibleRent: rentCases.length,
      eligible: saleCases.length + rentCases.length,
      excluded,
      exclusionReasons,
    },
    valuation,
    rent: {
      ...rent,
      requiresAchievedRent: true,
      askingRentNeverUsedAsOutcome: true,
    },
    confidence: confidenceEvaluation(saleCases),
    segments: segmentSaleCases(saleCases, askingByRequestId),
    personalDecision: {
      state: STATE.notEvaluated,
      historicalScoresPreserved: historicalPersonalDecision,
      calibrated: false,
      requiredFutureLabels: [...PERSONAL_DECISION_REQUIRED_LABELS],
    },
    demand: {
      propertySpecific: { available: false, state: 'notAssessed', activated: false },
      lifecycleConvertedToDemand: false,
      areaBuyerMarketPreserved: extracted.filter((s) => s.available && s.areaBuyerMarketBand).length,
      areaRentalMarketPreserved: extracted.filter((s) => s.available && s.areaRentalMarketBand).length,
    },
    cases: {
      sale: saleCases.map((c) => ({
        requestId: c.requestId,
        listingId: c.listingId,
        uprn: c.uprn,
        analysisAt: c.analysisAt,
        outcomeAt: c.outcomeAt,
        predicted: c.predicted,
        achieved: c.achieved,
        absoluteError: c.absoluteError,
        percentageError: c.percentageError,
        absolutePercentageError: c.absolutePercentageError,
        signedError: c.signedError,
        signedPercentageError: c.signedPercentageError,
        predictionToOutcomeDays: c.predictionToOutcomeDays,
        matchState: c.matchState,
        outcomeTrust: c.outcomeTrust,
        methodFamilies: c.methodFamilies,
        engineVersion: c.engineVersion,
        valuationMeasurementVersion: c.valuationMeasurementVersion,
        boundsAvailable: c.boundsAvailable,
        withinBounds: c.withinBounds,
        confidenceLevel: c.confidenceLevel,
        synthetic: c.synthetic,
      })),
      rent: rentCases.map((c) => ({
        requestId: c.requestId,
        listingId: c.listingId,
        analysisAt: c.analysisAt,
        outcomeAt: c.outcomeAt,
        predicted: c.predicted,
        achieved: c.achieved,
        absoluteError: c.absoluteError,
        percentageError: c.percentageError,
        signedError: c.signedError,
        boundsAvailable: c.boundsAvailable,
        withinBounds: c.withinBounds,
        synthetic: c.synthetic,
      })),
    },
    snapshotRecords,
    limitations,
  };
}

module.exports = {
  BACKTEST_ENGINE_VERSION,
  STATE,
  EXCLUSION,
  MATCH_STATE,
  OUTCOME_TRUST,
  SAMPLE_SUFFICIENCY,
  MIN_SEGMENT_SAMPLE,
  sampleSufficiencyOf,
  extractPredictionSnapshot,
  extractListingOutcomes,
  extractTransactionOutcome,
  dedupeOutcomes,
  pairSnapshotWithOutcome,
  valuationCaseMetrics,
  rentCaseMetrics,
  aggregateCases,
  runBacktest,
  positiveNumber,
  parseTime,
  isBefore,
  outwardPostcode,
  priceBand,
};
