/**
 * Personal Decision Intelligence — versioned expert-designed rules.
 *
 * These weights are not scientifically validated accuracy figures. A stored
 * score is only meaningful alongside the model version stamped on the result.
 * Override via env only; any override appends +custom to the version string.
 *
 * Confidence remains confidence-1.1.0 and is not modified here.
 *
 * buyer_general and landlord are implemented. Other profile keys are reserved
 * and disabled — do not score them in this version. Enablement is the config
 * `enabled` flag plus a collector for `dimensionSet`; the engine does not keep
 * a separate hard-coded profile list.
 */

const parseFloatEnv = (val, defaultValue) => {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : defaultValue;
};

const BASE_VERSION = 'personal-decision-1.0.0';
const CONFIDENCE_MODEL_VERSION = 'confidence-1.1.0';
const WHY_ENGINE_VERSION = 'personal-decision-why-1.0.0';
const WHAT_IF_VERSION = 'personal-decision-whatif-1.0.0';

/**
 * buyer_general — typical owner-occupier.
 *
 * Question: how well does this property fit the person's stated living
 * requirements? The engine reports personal suitability, not whether they
 * should purchase, offer, or proceed.
 *
 * Not this profile: school-catchment family search (buyer_family), first-time
 * buyer products (buyer_ftb), yield/rent (landlord), or investment return
 * (investor_yield).
 *
 * Dimensions (weights sum to 1):
 *   affordability  0.30  budget vs asking — reused scoreBudget
 *   location       0.22  area/postcode/radius/destination — reused scoreLocation
 *   space          0.18  bedrooms + property type — reused scoreBedrooms
 *   priceFairness  0.15  asking vs existing Property Intelligence valuation
 *   lifestyle      0.08  garden, family-space, parking, quiet — not commute
 *   transport      0.07  commute/transit only when real evidence exists
 *
 * Fit outcomes (from score + hard constraints; confidence does not change them):
 *   strong_fit >= 80, good_fit >= 65, mixed_fit >= 50, weak_fit < 50,
 *   unsuitable when a hard constraint fails.
 */
const BUYER_GENERAL_WEIGHTS = {
  affordability: 0.3,
  location: 0.22,
  space: 0.18,
  priceFairness: 0.15,
  lifestyle: 0.08,
  transport: 0.07,
};

/**
 * landlord — buy-to-let suitability against stated income requirements.
 *
 * Question: how well does this property fit as a rental holding for this
 * person? Not a purchase recommendation, and not the investor_yield profile.
 *
 * Dimensions reuse rent intelligence, financialEngine investment components,
 * propertyScoring demand/risk, and decisionContext rent baselines when present.
 * Missing costs or finance are notAssessed — never defaulted into the score.
 */
const LANDLORD_WEIGHTS = {
  rentPosition: 0.2,
  grossYield: 0.18,
  netOperating: 0.14,
  cashFlow: 0.12,
  vacancy: 0.08,
  dscr: 0.1,
  risk: 0.1,
  demand: 0.08,
};

const DIMENSION_LABELS = {
  affordability: 'affordability',
  location: 'location',
  space: 'space',
  priceFairness: 'price fairness',
  lifestyle: 'lifestyle',
  transport: 'transport and commute',
  rentPosition: 'rent position',
  grossYield: 'gross yield',
  netOperating: 'net operating position',
  cashFlow: 'cash flow',
  vacancy: 'vacancy',
  dscr: 'DSCR',
  risk: 'rental risk',
  demand: 'demand',
};

const FIT_OUTCOMES = ['strong_fit', 'good_fit', 'mixed_fit', 'weak_fit', 'unsuitable'];

const OUTCOME_THRESHOLDS = {
  strong_fit: 80,
  good_fit: 65,
  mixed_fit: 50,
};

const profiles = {
  buyer_general: {
    enabled: true,
    definition:
      'Owner-occupier suitability against stated living requirements. Not purchase advice.',
    weights: BUYER_GENERAL_WEIGHTS,
    dimensionSet: 'buyer_general',
    requirementPhrase: 'stated living requirements',
    minCoverage: parseFloatEnv(process.env.PERSONAL_DECISION_MIN_COVERAGE, 0.5),
    /** Asking price may not exceed budgetMax × stretch. Default 1.00 = no stretch. */
    stretch: parseFloatEnv(process.env.PERSONAL_DECISION_BUDGET_STRETCH, 1),
    hardConstraints: ['budget', 'bedrooms'],
    outcomeThresholds: OUTCOME_THRESHOLDS,
    outcomes: FIT_OUTCOMES,
  },
  landlord: {
    enabled: true,
    definition:
      'Buy-to-let suitability against evidenced rent, yield and financing. Not purchase advice.',
    weights: LANDLORD_WEIGHTS,
    dimensionSet: 'landlord',
    requirementPhrase: 'stated rental requirements',
    minCoverage: parseFloatEnv(process.env.PERSONAL_DECISION_MIN_COVERAGE, 0.5),
    hardConstraints: ['minYield', 'minDscr'],
    outcomeThresholds: OUTCOME_THRESHOLDS,
    outcomes: FIT_OUTCOMES,
  },
  // Specified, not implemented in this version.
  buyer_family: { enabled: false },
  buyer_ftb: { enabled: false },
  investor_yield: { enabled: false },
};

const configuredMin = profiles.buyer_general.minCoverage;
const configuredStretch = profiles.buyer_general.stretch;
const landlordMin = profiles.landlord.minCoverage;
const customised =
  configuredMin !== 0.5 ||
  landlordMin !== 0.5 ||
  Math.abs(configuredStretch - 1) > 1e-9;
const VERSION = customised ? `${BASE_VERSION}+custom` : BASE_VERSION;

const personalDecisionConfig = {
  version: VERSION,
  baseVersion: BASE_VERSION,
  customised,
  confidenceModel: CONFIDENCE_MODEL_VERSION,
  whyEngineVersion: WHY_ENGINE_VERSION,
  whatIfVersion: WHAT_IF_VERSION,
  profiles,
};

function getProfile(name) {
  return profiles[name] || null;
}

function enabledProfiles() {
  return Object.entries(profiles)
    .filter(([, profile]) => profile.enabled && profile.dimensionSet)
    .map(([name, profile]) => ({ name, ...profile }));
}

module.exports = {
  personalDecisionConfig,
  getProfile,
  enabledProfiles,
  BASE_VERSION,
  CONFIDENCE_MODEL_VERSION,
  WHY_ENGINE_VERSION,
  WHAT_IF_VERSION,
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
  DIMENSION_LABELS,
  FIT_OUTCOMES,
  OUTCOME_THRESHOLDS,
};
