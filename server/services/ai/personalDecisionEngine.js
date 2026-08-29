/**
 * Personal Decision Intelligence — personal-decision-1.0.0
 *
 * Pure function. Enabled profiles come from versioned config plus a collector
 * for that profile's dimensionSet. Numeric scores are never produced by an LLM.
 * Profile collectors supply evidenced dimensions into one aggregation: coverage,
 * renormalisation, hard constraints, fit outcomes and confidence separation.
 */

const {
  scoreBudget,
  scoreLocation,
  scoreBedrooms,
  scoreLifestyle,
  scoreTransport,
} = require('./buyerMatchEngine');
const { calculatePricePosition } = require('./pricePositionEngine');
const {
  personalDecisionConfig,
  getProfile,
  enabledProfiles,
  CONFIDENCE_MODEL_VERSION,
} = require('../../config/personalDecision.config');
const { buildDeterministicExplanation } = require('./personalDecisionWhyEngine');
const { scoreLandlordDimensions } = require('./personalDecisionLandlord');

const DIMENSION_COLLECTORS = {
  buyer_general: collectBuyerGeneralRaw,
  landlord: scoreLandlordDimensions,
};

const SUPPORTED_PROFILES = enabledProfiles()
  .filter((profile) => DIMENSION_COLLECTORS[profile.dimensionSet])
  .map((profile) => profile.name);

function profileIsSupported(name) {
  const profile = getProfile(name);
  return Boolean(profile?.enabled && profile.dimensionSet && DIMENSION_COLLECTORS[profile.dimensionSet]);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pickConfidence(intelligence) {
  const raw =
    intelligence?.confidence?.assessment ||
    intelligence?.confidence ||
    intelligence?.sale?.confidenceAssessment ||
    intelligence?.marketIntelligence?.sale?.confidenceAssessment ||
    null;
  if (!raw) return { level: null, assessed: null };
  const level = raw.level || intelligence?.confidence?.level || null;
  const assessed =
    typeof raw.assessed === 'boolean'
      ? raw.assessed
      : level
        ? !['Not assessed', 'Insufficient'].includes(level)
        : null;
  return { level, assessed, assessment: raw.assessment || raw };
}

function pickPricePosition(property, intelligence) {
  const asking = Number(property?.price || 0);
  const existing =
    intelligence?.pricePosition ||
    intelligence?.marketIntelligence?.pricePosition ||
    null;

  const valuation =
    intelligence?.sale ||
    intelligence?.marketIntelligence?.sale ||
    intelligence?.valuation ||
    null;

  // Recompute position when the asking/offer price no longer matches a cached
  // result. Valuation evidence is reused; it is not rerun.
  const cachedAsking = Number(existing?.askingPrice);
  const cacheMatchesAsking =
    existing?.success && Number.isFinite(cachedAsking) && cachedAsking === asking;
  if (cacheMatchesAsking) return existing;

  if (valuation?.success && asking > 0) {
    return calculatePricePosition(asking, valuation);
  }
  if (existing && existing.success === false) return existing;
  return existing || null;
}

function scorePriceFairness(property, intelligence) {
  const position = pickPricePosition(property, intelligence);
  if (!position) {
    return {
      available: false,
      score: null,
      state: 'no_valuation',
      reasons: [],
      unavailableReason:
        'No valuation or price-position evidence is available, so price fairness cannot be assessed.',
      evidence: [],
    };
  }
  if (!position.success) {
    return {
      available: false,
      score: null,
      state: 'no_valuation',
      reasons: [],
      unavailableReason:
        position.message ||
        'Valuation unavailable — price fairness cannot be assessed.',
      evidence: [],
    };
  }

  const percent = Number(position.differenceFromCentral?.percent);
  let score;
  if (position.position === 'potentially_underpriced') score = 95;
  else if (position.position === 'fairly_priced') score = 85;
  else if (position.position === 'potentially_overpriced') {
    score = Number.isFinite(percent) && percent >= 12 ? 25 : 40;
  } else {
    score = 60;
  }

  const evidence = [
    position.label,
    position.summary,
    Number.isFinite(percent)
      ? `Asking is ${percent > 0 ? '+' : ''}${percent}% vs central estimate`
      : null,
  ].filter(Boolean);

  return {
    available: true,
    score,
    state: position.position,
    reasons: evidence,
    unavailableReason: null,
    evidence,
    pricePosition: {
      position: position.position,
      label: position.label,
      differencePercent: Number.isFinite(percent) ? percent : null,
    },
  };
}

function scorePropertyType(property, prefs) {
  const want = String(prefs.propertyType || prefs.type || '')
    .toLowerCase()
    .trim();
  const have = String(property.property_type || property.type || '')
    .toLowerCase()
    .trim();
  if (!want) {
    return {
      available: false,
      score: null,
      state: 'no_type_preference',
      reasons: [],
      unavailableReason: 'No property-type preference supplied — type fit cannot be assessed.',
    };
  }
  if (!have) {
    return {
      available: false,
      score: null,
      state: 'no_property_type',
      reasons: [],
      unavailableReason: 'Property has no type recorded — type fit cannot be assessed.',
    };
  }
  const match = have === want || have.includes(want) || want.includes(have);
  return {
    available: true,
    score: match ? 100 : 25,
    state: match ? 'type_match' : 'type_mismatch',
    reasons: [match ? `${have} matches preferred ${want}` : `${have} vs preferred ${want}`],
    unavailableReason: null,
  };
}

function combineSpace(bedrooms, propertyType, weights = { bedrooms: 0.7, type: 0.3 }) {
  const parts = [];
  if (bedrooms.available) parts.push([bedrooms, weights.bedrooms]);
  if (propertyType.available) parts.push([propertyType, weights.type]);
  if (!parts.length) {
    return {
      available: false,
      score: null,
      state: bedrooms.state || propertyType.state,
      reasons: [],
      unavailableReason:
        bedrooms.unavailableReason ||
        propertyType.unavailableReason ||
        'Space fit cannot be assessed without a bedroom or property-type preference.',
      components: { bedrooms, propertyType },
    };
  }
  const total = parts.reduce((s, [, w]) => s + w, 0);
  const score = clampScore(parts.reduce((s, [d, w]) => s + d.score * w, 0) / total);
  return {
    available: true,
    score,
    state: bedrooms.available ? bedrooms.state : propertyType.state,
    reasons: [...(bedrooms.reasons || []), ...(propertyType.reasons || [])],
    unavailableReason: null,
    components: { bedrooms, propertyType },
  };
}

function toDimension(key, weight, raw) {
  return {
    key,
    weight,
    available: Boolean(raw.available),
    score: raw.available ? raw.score : null,
    state: raw.state,
    evidence: raw.reasons || raw.evidence || [],
    unavailableReason: raw.available ? null : raw.unavailableReason || null,
    ...(typeof raw.complete === 'boolean' ? { complete: raw.complete } : {}),
    ...(raw.components ? { components: raw.components } : {}),
    ...(raw.pricePosition ? { pricePosition: raw.pricePosition } : {}),
  };
}

function askingPrice(property) {
  const n = Number(property?.price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function budgetMaxOf(prefs) {
  const n = Number(prefs?.budgetMax || prefs?.budget);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasConstraint(profile, name) {
  return (profile.hardConstraints || []).includes(name);
}

function evaluateHardConstraints(property, prefs, profile, evidenced = {}) {
  const failures = [];
  const price = askingPrice(property);
  const budgetMax = budgetMaxOf(prefs);
  const stretch = profile.stretch;
  const ceiling = budgetMax && stretch ? budgetMax * stretch : null;

  if (hasConstraint(profile, 'budget') && price && ceiling && price > ceiling) {
    failures.push({
      constraint: 'budget',
      state: 'over_budget',
      detail: `Asking price £${price.toLocaleString()} exceeds budget of £${budgetMax.toLocaleString()}${
        stretch !== 1 ? ` (stretch ${stretch})` : ''
      }.`,
    });
  }

  const mustHaveBeds =
    prefs.bedroomsMustHave === true ||
    prefs.mustHaveBedrooms === true ||
    String(prefs.bedroomsMustHave || '').toLowerCase() === 'true';
  const want = Number(prefs.bedrooms);
  const have = Number(property.bedrooms);
  if (
    hasConstraint(profile, 'bedrooms') &&
    mustHaveBeds &&
    want > 0 &&
    Number.isFinite(have) &&
    have > 0 &&
    have < want
  ) {
    failures.push({
      constraint: 'bedrooms',
      state: 'below_must_have',
      detail: `Property has ${have} bedroom${have === 1 ? '' : 's'}; ${want}+ required.`,
    });
  }

  const minYield = Number(prefs.minYield ?? prefs.minimumYield);
  if (
    hasConstraint(profile, 'minYield') &&
    Number.isFinite(minYield) &&
    minYield > 0 &&
    evidenced.grossYield != null
  ) {
    if (evidenced.grossYield < minYield) {
      failures.push({
        constraint: 'minYield',
        state: 'below_minimum_yield',
        detail: `Gross yield ${evidenced.grossYield}% is below the required minimum of ${minYield}%.`,
      });
    }
  }

  const minDscr = Number(prefs.minDscr ?? prefs.minimumDscr);
  if (
    hasConstraint(profile, 'minDscr') &&
    Number.isFinite(minDscr) &&
    minDscr > 0 &&
    evidenced.dscr != null
  ) {
    if (evidenced.dscr < minDscr) {
      failures.push({
        constraint: 'minDscr',
        state: 'below_minimum_dscr',
        detail: `DSCR ${evidenced.dscr} is below the required minimum of ${minDscr}.`,
      });
    }
  }

  return failures;
}

function decisionStrengthFrom(confidenceLevel, scoreAvailable, constraintFailures) {
  if (!scoreAvailable) return 'none';
  if (['Low', 'Not assessed', 'Insufficient'].includes(confidenceLevel) || !confidenceLevel) {
    return 'weak';
  }
  if (confidenceLevel === 'Medium') return 'moderate';
  if (constraintFailures.length) return 'moderate';
  return 'strong';
}

function outcomeOf({ available, constraintFailures, score, thresholds }) {
  if (!available) return null;
  if (constraintFailures.length) return 'unsuitable';
  if (score >= thresholds.strong_fit) return 'strong_fit';
  if (score >= thresholds.good_fit) return 'good_fit';
  if (score >= thresholds.mixed_fit) return 'mixed_fit';
  return 'weak_fit';
}

function finalise(result) {
  return {
    ...result,
    deterministicExplanation: buildDeterministicExplanation(result),
  };
}

function collectBuyerGeneralRaw({ property, preferences, intelligence }) {
  const prefs = preferences || {};
  const bedrooms = scoreBedrooms(property, prefs);
  const propertyType = scorePropertyType(property, prefs);
  return {
    dimensions: {
      affordability: scoreBudget(property, prefs),
      location: scoreLocation(property, prefs, intelligence),
      space: combineSpace(bedrooms, propertyType),
      priceFairness: scorePriceFairness(property, intelligence),
      lifestyle: scoreLifestyle(property, prefs),
      transport: scoreTransport(property, prefs, intelligence),
    },
    evidenced: {},
  };
}

function collectDimensions(profile, property, prefs, intelligence, finance) {
  const collector = DIMENSION_COLLECTORS[profile.dimensionSet];
  if (!collector) {
    return { dimensions: {}, evidenced: {}, unimplemented: true };
  }

  const collected = collector({
    profile,
    property,
    preferences: prefs,
    intelligence,
    finance,
  });

  const dimensions = {};
  Object.keys(profile.weights).forEach((key) => {
    const raw = collected.dimensions?.[key];
    if (raw && typeof raw === 'object') {
      dimensions[key] = toDimension(key, profile.weights[key], raw);
    } else {
      dimensions[key] = toDimension(key, profile.weights[key], {
        available: false,
        score: null,
        state: 'notAssessed',
        unavailableReason: `No evidenced ${key} was supplied for this profile.`,
      });
    }
  });
  return { dimensions, evidenced: collected.evidenced || {}, marketContext: collected.marketContext || null };
}

/**
 * @param {object} input
 * @param {object} input.property
 * @param {object} input.preferences
 * @param {object} [input.intelligence]  Existing Property Intelligence report (or subset)
 * @param {object} [input.finance]
 */
function scorePersonalDecision(input = {}) {
  const asOf = input.asOf ? new Date(input.asOf) : new Date(0);
  const profileName = input.profile || 'buyer_general';
  const property = input.property || null;
  const prefs = input.preferences || {};
  const intelligence = input.intelligence || {};
  const finance = input.finance || {};

  const model = {
    version: personalDecisionConfig.version,
    baseVersion: personalDecisionConfig.baseVersion,
    customised: personalDecisionConfig.customised,
    profile: profileName,
    confidenceModel: CONFIDENCE_MODEL_VERSION,
    weights: null,
    minCoverage: null,
    stretch: null,
    outcomeThresholds: null,
  };

  if (!profileIsSupported(profileName)) {
    return finalise({
      model,
      profile: profileName,
      available: false,
      score: null,
      decision: 'insufficient_evidence',
      decisionStrength: 'none',
      outcome: null,
      constraintFailures: [],
      dimensions: {},
      notAssessed: [],
      coverage: { weightRetained: 0, dimensionsAssessed: 0, dimensionsTotal: 0, minRequired: 0.5 },
      confidence: pickConfidence(intelligence),
      why: [],
      unavailableReason: `Profile "${profileName}" is not implemented in ${personalDecisionConfig.version}.`,
      assessedAt: asOf.toISOString(),
    });
  }

  const profile = getProfile(profileName);
  model.weights = { ...profile.weights };
  model.dimensionSet = profile.dimensionSet;
  model.hardConstraints = [...(profile.hardConstraints || [])];
  model.minCoverage = profile.minCoverage;
  model.stretch = profile.stretch;
  model.outcomeThresholds = { ...profile.outcomeThresholds };

  if (!property || typeof property !== 'object') {
    return finalise({
      model,
      profile: profileName,
      available: false,
      score: null,
      decision: 'insufficient_evidence',
      decisionStrength: 'none',
      outcome: null,
      constraintFailures: [],
      dimensions: {},
      notAssessed: [],
      coverage: {
        weightRetained: 0,
        dimensionsAssessed: 0,
        dimensionsTotal: Object.keys(profile.weights).length,
        minRequired: profile.minCoverage,
      },
      confidence: pickConfidence(intelligence),
      why: [],
      unavailableReason: 'No property was supplied.',
      assessedAt: asOf.toISOString(),
    });
  }

  const { dimensions, evidenced, marketContext } = collectDimensions(profile, property, prefs, intelligence, finance);

  const totalWeight = Object.values(profile.weights).reduce((s, w) => s + w, 0);
  let weightedSum = 0;
  let retainedWeight = 0;
  Object.values(dimensions).forEach((d) => {
    if (!d.available) return;
    weightedSum += d.score * d.weight;
    retainedWeight += d.weight;
  });

  const weightRetained = totalWeight ? round2(retainedWeight / totalWeight) : 0;
  const assessed = Object.values(dimensions).filter((d) => d.available);
  const notAssessed = Object.values(dimensions)
    .filter((d) => !d.available)
    .map((d) => ({
      dimension: d.key,
      weight: d.weight,
      state: d.state,
      reason: d.unavailableReason,
    }));

  const coverageOk = retainedWeight > 0 && weightRetained >= profile.minCoverage;
  const score = coverageOk ? clampScore(weightedSum / retainedWeight) : null;
  const available = score !== null;

  const constraintFailures = evaluateHardConstraints(property, prefs, profile, evidenced);
  const confidence = pickConfidence(intelligence);
  const strength = decisionStrengthFrom(confidence.level, available, constraintFailures);

  let decision = 'insufficient_evidence';
  if (available && constraintFailures.length) decision = 'unsuitable';
  else if (available) decision = 'suitable';

  const why = Object.values(dimensions).map((d) => ({
    dimension: d.key,
    available: d.available,
    score: d.score,
    weight: d.weight,
    state: d.state,
    evidence: d.evidence,
    unavailableReason: d.unavailableReason,
    ...(typeof d.complete === 'boolean' ? { complete: d.complete } : {}),
  }));

  return finalise({
    model,
    profile: profileName,
    available,
    score,
    decision,
    decisionStrength: strength,
    outcome: outcomeOf({
      available,
      constraintFailures,
      score,
      thresholds: profile.outcomeThresholds,
    }),
    constraintFailures,
    dimensions,
    notAssessed,
    coverage: {
      weightRetained,
      dimensionsAssessed: assessed.length,
      dimensionsTotal: Object.keys(dimensions).length,
      minRequired: profile.minCoverage,
    },
    confidence: {
      level: confidence.level,
      assessed: confidence.assessed,
      model: CONFIDENCE_MODEL_VERSION,
      note:
        'Estimate confidence is a separate axis. It sets decisionStrength only. It does not change the numeric fit score or the fit outcome.',
    },
    why,
    ...(marketContext ? { marketContext } : {}),
    unavailableReason: available
      ? null
      : `Only ${Math.round(weightRetained * 100)}% of scoring weight could be evidenced (minimum ${Math.round(profile.minCoverage * 100)}%).`,
    assessedAt: asOf.toISOString(),
  });
}

module.exports = {
  scorePersonalDecision,
  SUPPORTED_PROFILES,
  profileIsSupported,
};
