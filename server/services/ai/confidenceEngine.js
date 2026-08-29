/**
 * Confidence engine — the single source of truth for "how reliable is this estimate?".
 *
 * Consolidates the confidence logic that was previously duplicated across
 * propertyScoring.calculateConfidence, valuationEngine.confidenceFromEvidence,
 * rentIntelligenceService (inline formula) and postcodeMarketIntelligenceService.
 *
 * Two concepts are kept deliberately separate and must not be conflated:
 *   Data Quality — how complete the *property information* is (propertyDataQuality).
 *   Confidence   — how reliable the *estimate* is, given the evidence behind it.
 * Data completeness is only one low-weighted input here, which is why a property
 * with High data quality can still legitimately produce Low confidence.
 *
 * Confidence is never presented as a percentage. The numeric `score` is an internal
 * ordering index only; consumers must display `level` plus `reasons`.
 */

const BASE_MODEL_VERSION = 'confidence-1.1.0';

/** Below this, evidence is treated as sparse and confidence is capped at Low. */
const MIN_RELIABLE_COMPARABLES = 3;
/** Median comparable age beyond which evidence is treated as stale. */
const STALE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Weights are fixed and versioned so a level can always be reproduced.
 * dataCompleteness is intentionally small: complete paperwork is not evidence.
 */
const FACTOR_WEIGHTS = {
  sampleSize: 0.2,
  similarity: 0.18,
  attributeMatch: 0.15,
  methodAgreement: 0.15,
  recency: 0.12,
  geographicProximity: 0.1,
  dataCompleteness: 0.06,
  providerCoverage: 0.04,
};

const LEVEL_ORDER = { Low: 0, Medium: 1, High: 2 };

/** Floor applied before log aggregation so a single zero factor cannot annihilate the score. */
const SCORE_FLOOR = 0.05;

/** The four states a confidence result may take. */
const NOT_ASSESSED = 'Not assessed';
const CONFIDENCE_LEVELS = ['High', 'Medium', 'Low', NOT_ASSESSED];

const DEFAULT_THRESHOLDS = {
  /**
   * Minimum share of factor weight that must be measurable before a confidence
   * level can be stated at all. Below this the result is "Not assessed" —
   * reporting "Low" would imply evidence was examined and found weak, rather
   * than absent. Justified by boundary tests in confidenceSensitivity.test.js.
   */
  minAssessableWeight: 0.35,
  high: 78,
  medium: 55,
};

function resolveThresholds() {
  let configured = {};
  try {
    // Optional: the engine must remain usable without the app config loaded.
    configured =
      require('../../config/propertyIntelligence.config').propertyIntelligenceConfig
        .confidence || {};
  } catch (err) {
    configured = {};
  }
  return {
    minAssessableWeight: Number.isFinite(configured.minAssessableWeight)
      ? configured.minAssessableWeight
      : DEFAULT_THRESHOLDS.minAssessableWeight,
    high: Number.isFinite(configured.highThreshold)
      ? configured.highThreshold
      : DEFAULT_THRESHOLDS.high,
    medium: Number.isFinite(configured.mediumThreshold)
      ? configured.mediumThreshold
      : DEFAULT_THRESHOLDS.medium,
  };
}

const THRESHOLDS = resolveThresholds();

// A level is only reproducible if the thresholds that produced it are known, so
// any deviation from the shipped defaults is recorded in the version string.
const CUSTOMISED = Object.keys(DEFAULT_THRESHOLDS).some(
  (k) => THRESHOLDS[k] !== DEFAULT_THRESHOLDS[k]
);
const MODEL_VERSION = CUSTOMISED ? `${BASE_MODEL_VERSION}+custom` : BASE_MODEL_VERSION;

/** The complete, versioned confidence model. Stamped onto every assessment. */
const CONFIDENCE_MODEL = {
  version: MODEL_VERSION,
  baseVersion: BASE_MODEL_VERSION,
  customised: CUSTOMISED,
  levels: CONFIDENCE_LEVELS,
  factorWeights: FACTOR_WEIGHTS,
  thresholds: THRESHOLDS,
  scoreFloor: SCORE_FLOOR,
  minReliableComparables: MIN_RELIABLE_COMPARABLES,
  staleDays: STALE_DAYS,
};

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function median(nums) {
  const list = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function normStr(v) {
  return (v || '').toString().toLowerCase().trim();
}

/** Maps a value onto 0..1 using ascending thresholds. */
function bandScore(value, bands) {
  if (!Number.isFinite(value)) return 0;
  let score = 0;
  bands.forEach(([threshold, s]) => {
    if (value >= threshold) score = s;
  });
  return score;
}

/** Fresher evidence scores higher; anything past STALE_DAYS is heavily discounted. */
function recencyScore(medianAgeDays) {
  if (!Number.isFinite(medianAgeDays)) return 0;
  if (medianAgeDays <= 30) return 1;
  if (medianAgeDays <= 90) return 0.85;
  if (medianAgeDays <= 180) return 0.7;
  if (medianAgeDays <= STALE_DAYS) return 0.5;
  if (medianAgeDays <= 1000) return 0.25;
  return 0.1;
}

function lowerLevel(a, b) {
  return LEVEL_ORDER[a] <= LEVEL_ORDER[b] ? a : b;
}

function ageInDays(row, asOf) {
  const raw = row.sold_date || row.last_sold_date || row.transfer_date || row.observedAt || row.date || null;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, (asOf - d.getTime()) / DAY_MS);
}

/**
 * Reads proximity from whatever the comparable happens to expose:
 * an explicit distance, the comparableEngine location sub-score, or a tier label.
 */
function proximityScore(comp) {
  if (Number.isFinite(comp.distanceKm)) {
    if (comp.distanceKm <= 0.5) return 1;
    if (comp.distanceKm <= 1) return 0.92;
    if (comp.distanceKm <= 3) return 0.8;
    if (comp.distanceKm <= 5) return 0.65;
    if (comp.distanceKm <= 15) return 0.45;
    return 0.2;
  }
  if (Number.isFinite(comp.breakdown?.location)) return clamp01(comp.breakdown.location);

  const tier = normStr(comp.locationTier);
  if (!tier || tier.includes('not comparable')) return null;
  if (tier.includes('same postcode') && !tier.includes('district')) return 1;
  if (tier.includes('within 1km')) return 0.92;
  if (tier.includes('district') || tier.includes('nearby')) return 0.8;
  if (tier.includes('distant')) return 0.45;
  if (tier.includes('same city')) return 0.6;
  return 0.25;
}

/**
 * Reduces a comparable set to the evidence statistics confidence is judged on.
 * Pure: `asOf` is injected so the same inputs always yield the same output.
 */
function summariseComparableEvidence(comparables = [], { target = null, asOf = Date.now() } = {}) {
  const rows = Array.isArray(comparables) ? comparables.filter(Boolean) : [];
  const similarities = rows.map((c) => Number(c.similarity)).filter((n) => Number.isFinite(n));
  const ages = rows.map((c) => ageInDays(c, asOf)).filter((n) => Number.isFinite(n));
  const proximities = rows.map(proximityScore).filter((n) => Number.isFinite(n));

  const targetType = normStr(target?.property_type);
  const targetBeds = Number(target?.bedrooms);

  let typeMatches = 0;
  let typeComparisons = 0;
  let bedroomMatches = 0;
  let bedroomComparisons = 0;
  let floorAreaKnown = 0;

  rows.forEach((c) => {
    const compType = normStr(c.property_type);
    if (targetType && compType) {
      typeComparisons += 1;
      if (compType === targetType) typeMatches += 1;
    }
    const compBeds = Number(c.bedrooms);
    if (Number.isFinite(targetBeds) && targetBeds > 0 && Number.isFinite(compBeds) && compBeds > 0) {
      bedroomComparisons += 1;
      if (compBeds === targetBeds) bedroomMatches += 1;
    }
    if (Number(c.square_feet) > 0) floorAreaKnown += 1;
  });

  const medianAgeDays = median(ages);
  const coverages = rows
    .map((c) => (Number.isFinite(c.similarityCoverage) ? c.similarityCoverage : null))
    .filter((n) => Number.isFinite(n));

  return {
    comparableCount: rows.length,
    medianSimilarity: median(similarities),
    medianComparisonCoverage: median(coverages),
    medianAgeDays: medianAgeDays === null ? null : Math.round(medianAgeDays),
    staleCount: ages.filter((a) => a > STALE_DAYS).length,
    datedCount: ages.length,
    medianProximity: median(proximities),
    typeMatchRate: typeComparisons ? typeMatches / typeComparisons : null,
    bedroomMatchRate: bedroomComparisons ? bedroomMatches / bedroomComparisons : null,
    floorAreaCoverage: rows.length ? floorAreaKnown / rows.length : null,
    targetFloorAreaKnown: Number(target?.square_feet) > 0,
    sparseEvidence: rows.length < MIN_RELIABLE_COMPARABLES,
  };
}

/**
 * Dispersion between independent estimate methods. Wide disagreement means the
 * methods do not corroborate each other, however many of them there are.
 */
function assessMethodAgreement(methodEstimates = []) {
  const values = (methodEstimates || [])
    .map((m) => (typeof m === 'number' ? m : Number(m?.value ?? m?.centralEstimate)))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!values.length) return { available: false, methodCount: 0 };
  if (values.length === 1) {
    return {
      available: true,
      methodCount: 1,
      coefficientOfVariation: null,
      label: 'single_method',
      spreadPercent: null,
    };
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : null;
  const spread = mean > 0 ? (Math.max(...values) - Math.min(...values)) / mean : null;

  let label = 'strong';
  if (cv > 0.2) label = 'weak';
  else if (cv > 0.1) label = 'moderate';
  else if (cv > 0.05) label = 'good';

  return {
    available: true,
    methodCount: values.length,
    coefficientOfVariation: cv === null ? null : Math.round(cv * 1000) / 1000,
    spreadPercent: spread === null ? null : Math.round(spread * 100),
    label,
  };
}

function normaliseProviderConfidence(providerConfidence) {
  if (providerConfidence === null || providerConfidence === undefined) return null;
  if (Number.isFinite(providerConfidence)) {
    return clamp01(providerConfidence > 1 ? providerConfidence / 100 : providerConfidence);
  }
  const s = normStr(providerConfidence);
  if (['high', 'strong'].includes(s)) return 0.9;
  if (['medium', 'moderate'].includes(s)) return 0.6;
  if (['low', 'weak'].includes(s)) return 0.3;
  if (['insufficient', 'none', 'unavailable'].includes(s)) return 0.1;
  return null;
}

/**
 * Core assessment. Every factor is optional; unavailable factors are dropped and
 * the remaining weights renormalised, so absent data lowers *coverage* rather
 * than silently scoring as mediocre.
 */
function assessConfidence({
  scope = 'estimate',
  comparables = null,
  evidence = null,
  target = null,
  dataQuality = null,
  methodEstimates = [],
  providerConfidence = null,
  providerCoverageAvailable = null,
  sampleSize = null,
  asOf = Date.now(),
} = {}) {
  const stats =
    evidence || summariseComparableEvidence(comparables || [], { target, asOf });
  const effectiveSample = Number.isFinite(sampleSize) ? sampleSize : stats.comparableCount;
  const agreement = assessMethodAgreement(methodEstimates);
  const provider = normaliseProviderConfidence(providerConfidence);

  const factors = [];
  const addFactor = (key, { available, score, state, detail }) => {
    factors.push({
      key,
      weight: FACTOR_WEIGHTS[key],
      available: Boolean(available),
      score: available ? clamp01(score) : null,
      state,
      detail,
    });
  };

  addFactor('sampleSize', {
    available: Number.isFinite(effectiveSample),
    score: bandScore(effectiveSample, [
      [0, 0],
      [1, 0.2],
      [3, 0.5],
      [5, 0.7],
      [10, 0.88],
      [20, 1],
    ]),
    state:
      effectiveSample >= 10
        ? 'strong'
        : effectiveSample >= MIN_RELIABLE_COMPARABLES
          ? 'adequate'
          : 'sparse',
    detail: Number.isFinite(effectiveSample)
      ? `${effectiveSample} comparable record${effectiveSample === 1 ? '' : 's'} in the evidence set`
      : 'Comparable count unknown',
  });

  addFactor('similarity', {
    available: Number.isFinite(stats.medianSimilarity),
    score: Number.isFinite(stats.medianSimilarity) ? stats.medianSimilarity / 100 : 0,
    state:
      stats.medianSimilarity >= 75
        ? 'strong'
        : stats.medianSimilarity >= 55
          ? 'adequate'
          : 'weak',
    detail: Number.isFinite(stats.medianSimilarity)
      ? `Median comparable similarity ${Math.round(stats.medianSimilarity)}/100`
      : 'Comparable similarity not scored',
  });

  const matchParts = [];
  if (Number.isFinite(stats.typeMatchRate)) matchParts.push([stats.typeMatchRate, 0.34]);
  if (Number.isFinite(stats.bedroomMatchRate)) matchParts.push([stats.bedroomMatchRate, 0.28]);
  if (Number.isFinite(stats.floorAreaCoverage)) matchParts.push([stats.floorAreaCoverage, 0.2]);
  // How much of the similarity weight vector could actually be compared at all.
  if (Number.isFinite(stats.medianComparisonCoverage)) {
    matchParts.push([stats.medianComparisonCoverage, 0.18]);
  }
  const matchWeight = matchParts.reduce((s, [, w]) => s + w, 0);
  const matchScore = matchWeight
    ? matchParts.reduce((s, [v, w]) => s + v * w, 0) / matchWeight
    : null;

  addFactor('attributeMatch', {
    available: matchScore !== null,
    score: matchScore ?? 0,
    state: matchScore === null ? 'unknown' : matchScore >= 0.75 ? 'strong' : matchScore >= 0.5 ? 'partial' : 'mismatched',
    detail:
      matchScore === null
        ? 'Property type, bedroom and floor-area matching could not be assessed'
        : [
            Number.isFinite(stats.typeMatchRate)
              ? `${Math.round(stats.typeMatchRate * 100)}% same property type`
              : null,
            Number.isFinite(stats.bedroomMatchRate)
              ? `${Math.round(stats.bedroomMatchRate * 100)}% same bedroom count`
              : null,
            Number.isFinite(stats.floorAreaCoverage)
              ? `${Math.round(stats.floorAreaCoverage * 100)}% with floor area recorded`
              : null,
            Number.isFinite(stats.medianComparisonCoverage)
              ? `${Math.round(stats.medianComparisonCoverage * 100)}% of attributes comparable`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
  });

  addFactor('methodAgreement', {
    // A single method cannot agree or disagree with anything, so agreement is
    // unmeasured rather than average. Scoring it 0.5 inflated thin evidence and
    // deflated well-corroborated evidence. The single_method cap below still fires.
    available: agreement.available && agreement.methodCount > 1,
    score: clamp01(1 - (agreement.coefficientOfVariation ?? 0) * 4),
    state: agreement.label || 'unknown',
    detail: !agreement.available
      ? 'No independent estimate methods supplied'
      : agreement.methodCount === 1
        ? 'Only one estimate method available — no corroboration'
        : `${agreement.methodCount} methods, ${agreement.spreadPercent}% spread between highest and lowest`,
  });

  addFactor('recency', {
    available: Number.isFinite(stats.medianAgeDays),
    score: recencyScore(stats.medianAgeDays),
    state:
      !Number.isFinite(stats.medianAgeDays)
        ? 'unknown'
        : stats.medianAgeDays > STALE_DAYS
          ? 'stale'
          : stats.medianAgeDays > 180
            ? 'dated'
            : 'current',
    detail: Number.isFinite(stats.medianAgeDays)
      ? `Median comparable age ${stats.medianAgeDays} days${stats.staleCount ? ` · ${stats.staleCount} older than ${STALE_DAYS} days` : ''}`
      : 'Comparable dates unavailable',
  });

  addFactor('geographicProximity', {
    available: Number.isFinite(stats.medianProximity),
    score: stats.medianProximity ?? 0,
    state:
      !Number.isFinite(stats.medianProximity)
        ? 'unknown'
        : stats.medianProximity >= 0.8
          ? 'local'
          : stats.medianProximity >= 0.55
            ? 'wider_area'
            : 'distant',
    detail: Number.isFinite(stats.medianProximity)
      ? `Median geographic closeness ${Math.round(stats.medianProximity * 100)}/100`
      : 'Comparable locations could not be compared',
  });

  addFactor('dataCompleteness', {
    available: Number.isFinite(dataQuality?.score),
    score: Number.isFinite(dataQuality?.score) ? dataQuality.score / 100 : 0,
    state: dataQuality?.level ? normStr(dataQuality.level) : 'unknown',
    detail: Number.isFinite(dataQuality?.score)
      ? `Property information ${dataQuality.score}% complete (data quality, not estimate reliability)`
      : 'Property data completeness not assessed',
  });

  addFactor('providerCoverage', {
    available: provider !== null || providerCoverageAvailable !== null,
    score: provider !== null ? provider : providerCoverageAvailable ? 0.7 : 0.15,
    state:
      provider !== null
        ? provider >= 0.75
          ? 'strong'
          : provider >= 0.5
            ? 'partial'
            : 'weak'
        : providerCoverageAvailable
          ? 'partial'
          : 'absent',
    detail:
      provider !== null
        ? `External provider reported ${Math.round(provider * 100)}/100 coverage confidence`
        : providerCoverageAvailable
          ? 'External provider data available for this area'
          : 'No external provider coverage — internal evidence only',
  });

  const availableFactors = factors.filter((f) => f.available);
  const weightCovered = availableFactors.reduce((s, f) => s + f.weight, 0);

  // Weighted *geometric* mean. Confidence is conjunctive — strong comparables cannot
  // compensate for stale or dissimilar ones — so a weak factor must drag the whole
  // result down rather than be averaged away by healthy ones.
  const logSum = availableFactors.reduce(
    (s, f) => s + Math.log(Math.max(f.score, SCORE_FLOOR)) * f.weight,
    0
  );
  // Below the assessable floor there is nothing to average: report no level and no
  // score rather than a number that reads as a measured weakness.
  const assessed = weightCovered >= THRESHOLDS.minAssessableWeight;
  const score = assessed ? Math.round(Math.exp(logSum / weightCovered) * 100) : null;

  let level = NOT_ASSESSED;
  if (assessed) {
    level = 'Low';
    if (score >= THRESHOLDS.high) level = 'High';
    else if (score >= THRESHOLDS.medium) level = 'Medium';
  }

  // Caps express non-negotiable evidence problems that a good average must not mask.
  const caps = [];
  const applyCap = (condition, rule, capLevel, reason) => {
    if (!condition) return;
    caps.push({ rule, capLevel, reason });
    // A cap can only lower a stated level. It must never promote "Not assessed"
    // into Low or Medium.
    if (assessed) level = lowerLevel(level, capLevel);
  };

  applyCap(
    Number.isFinite(effectiveSample) && effectiveSample < MIN_RELIABLE_COMPARABLES,
    'sparse_evidence',
    'Low',
    `Fewer than ${MIN_RELIABLE_COMPARABLES} comparable records — too little evidence for a reliable estimate.`
  );
  applyCap(
    agreement.available && agreement.methodCount === 1,
    'single_method',
    'Medium',
    'Only one estimate method was available, so no independent method corroborates it.'
  );
  applyCap(
    agreement.methodCount > 1 && (agreement.coefficientOfVariation ?? 0) > 0.2,
    'methods_disagree',
    'Low',
    `Estimate methods disagree materially (${agreement.spreadPercent}% spread), so no single figure is dependable.`
  );
  applyCap(
    agreement.methodCount > 1 &&
      (agreement.coefficientOfVariation ?? 0) > 0.1 &&
      (agreement.coefficientOfVariation ?? 0) <= 0.2,
    'methods_partially_disagree',
    'Medium',
    `Estimate methods vary by ${agreement.spreadPercent}%, which limits precision.`
  );
  applyCap(
    Number.isFinite(stats.medianAgeDays) && stats.medianAgeDays > STALE_DAYS,
    'stale_evidence',
    'Medium',
    `Comparable evidence has a median age of ${stats.medianAgeDays} days and may not reflect current conditions.`
  );
  applyCap(
    Number.isFinite(stats.typeMatchRate) && stats.typeMatchRate < 0.34,
    'property_type_mismatch',
    'Medium',
    'Most comparables are a different property type to the subject property.'
  );
  applyCap(
    Number.isFinite(stats.bedroomMatchRate) && stats.bedroomMatchRate < 0.34,
    'bedroom_mismatch',
    'Medium',
    'Most comparables have a different bedroom count to the subject property.'
  );
  applyCap(
    Number.isFinite(stats.medianSimilarity) && stats.medianSimilarity < 55,
    'weak_similarity',
    'Medium',
    `Median comparable similarity is only ${Math.round(stats.medianSimilarity)}/100 — the evidence set is loosely comparable.`
  );
  applyCap(
    Number.isFinite(stats.medianProximity) && stats.medianProximity < 0.55,
    'distant_evidence',
    'Medium',
    'Comparable evidence is drawn from outside the immediate area.'
  );
  applyCap(
    Number.isFinite(stats.medianComparisonCoverage) && stats.medianComparisonCoverage < 0.6,
    'thin_comparisons',
    'Medium',
    `Comparables could only be matched on ${Math.round(stats.medianComparisonCoverage * 100)}% of the comparison attributes — the similarity scores rest on few fields.`
  );
  applyCap(
    weightCovered < 0.6,
    'thin_factor_coverage',
    'Medium',
    'Too few confidence factors could be assessed to support a high-confidence conclusion.'
  );

  const reasons = factors
    .filter((f) => f.available)
    .map((f) => ({
      key: f.key,
      state: f.state,
      detail: f.detail,
      direction: f.score >= 0.7 ? 'supports' : f.score >= 0.45 ? 'neutral' : 'limits',
    }));

  const limitations = factors
    .filter((f) => !f.available)
    .map((f) => ({ key: f.key, detail: f.detail }));

  return {
    level,
    assessed,
    unassessedReason: assessed
      ? null
      : `Only ${Math.round(weightCovered * 100)}% of the confidence factors could be measured (a minimum of ${Math.round(THRESHOLDS.minAssessableWeight * 100)}% is required) — there is not enough evidence to state a confidence level.`,
    score,
    scoreBasis: 'internal_index',
    scoreNote:
      'Internal ordering index only — do not display as a percentage or accuracy figure. Null when no level could be assessed.',
    scope,
    reasons,
    limitations,
    caps,
    evidence: {
      ...stats,
      sampleSize: effectiveSample,
      methodAgreement: agreement,
      providerConfidence: provider,
    },
    dataQuality: dataQuality
      ? {
          level: dataQuality.level ?? null,
          score: dataQuality.score ?? null,
          note: 'Completeness of property information — a separate concept from estimate confidence.',
        }
      : null,
    coverage: {
      factorsAvailable: availableFactors.length,
      factorsTotal: factors.length,
      weightCovered: Math.round(weightCovered * 100) / 100,
      minRequired: THRESHOLDS.minAssessableWeight,
    },
    factors,
    weights: FACTOR_WEIGHTS,
    modelVersion: MODEL_VERSION,
    // The thresholds are part of the result: a level cannot be reproduced without them.
    model: CONFIDENCE_MODEL,
    assessedAt: new Date(asOf).toISOString(),
    methodology:
      'Weighted assessment of comparable sample size, similarity, attribute match, method agreement, recency, geographic proximity, data completeness and provider coverage. Unavailable factors are dropped and remaining weights renormalised. A minimum share of factor weight must be measurable before any level is stated; below it the result is "Not assessed" rather than Low. Hard caps apply for sparse, stale, mismatched or conflicting evidence.',
  };
}

/**
 * Area-level confidence for postcode aggregates.
 *
 * Area aggregates have no per-comparable similarity, distance or attribute match,
 * so the property-level factor model does not apply. Rather than pretend those
 * factors exist, this uses an explicit sample-size ladder — but it lives here so
 * there is still exactly one owner of confidence levels in the codebase.
 *
 * Marketplace-only evidence is capped at Medium by design: our own listings
 * cannot represent a whole postcode market however many of them there are.
 */
function assessAreaEvidenceConfidence(sampleSize = 0, externalBacked = false) {
  const count = Number(sampleSize) || 0;
  const sparseEvidence = count < MIN_RELIABLE_COMPARABLES;

  let level;
  let note;
  if (!count) {
    level = 'Insufficient';
    note = 'No evidence available';
  } else if (sparseEvidence) {
    level = 'Low';
    note = `Limited evidence — ${count} comparable record${count === 1 ? '' : 's'}. Treat as an indication only, not a market value.`;
  } else if (externalBacked && count >= 20) {
    level = 'High';
    note = `${count} external records`;
  } else if (externalBacked) {
    level = 'Medium';
    note = `${count} external records`;
  } else if (count >= 10) {
    level = 'Medium';
    note = `${count} marketplace listings`;
  } else {
    level = 'Low';
    note = `Limited evidence — ${count} records`;
  }

  return {
    level,
    note,
    sampleSize: count,
    sparseEvidence,
    scope: 'area_aggregate',
    externalBacked: Boolean(externalBacked),
    modelVersion: MODEL_VERSION,
    reasons: [
      {
        key: 'sampleSize',
        state: sparseEvidence ? 'sparse' : count >= 20 ? 'strong' : 'adequate',
        detail: note,
        direction: sparseEvidence ? 'limits' : 'supports',
      },
      {
        key: 'providerCoverage',
        state: externalBacked ? 'partial' : 'absent',
        detail: externalBacked
          ? 'Includes external market evidence for this area.'
          : 'Marketplace listings only — capped at Medium because they cannot represent the full postcode market.',
        direction: externalBacked ? 'supports' : 'limits',
      },
    ],
  };
}

module.exports = {
  assessConfidence,
  assessAreaEvidenceConfidence,
  summariseComparableEvidence,
  assessMethodAgreement,
  FACTOR_WEIGHTS,
  MIN_RELIABLE_COMPARABLES,
  STALE_DAYS,
  MODEL_VERSION,
  CONFIDENCE_MODEL,
  CONFIDENCE_LEVELS,
  NOT_ASSESSED,
  THRESHOLDS,
};
