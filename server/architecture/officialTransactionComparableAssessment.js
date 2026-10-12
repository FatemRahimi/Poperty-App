/**
 * Official HMLR residential comparable assessment — methodology contract constants.
 * Selection + evidence assessment only. Not a valuation.
 *
 * v1.1.0 — sufficiency closure: MARKET CONTEXT ≠ DEFENSIBLE COMPARABLE ASSESSMENT.
 */

const METHODOLOGY_ID = 'official-hmlr-residential-comparable-assessment';
const METHODOLOGY_VERSION = '1.1.0';

const ASSESSMENT = Object.freeze({
  ASSESSED: 'ASSESSED',
  MARKET_CONTEXT: 'MARKET_CONTEXT',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID_INPUT: 'INVALID_INPUT',
});

const SIMILARITY = Object.freeze({
  HIGH: 'HIGH_SIMILARITY',
  MEDIUM: 'MEDIUM_SIMILARITY',
  LOW: 'LOW_SIMILARITY',
  INSUFFICIENT: 'INSUFFICIENT_COMPARABILITY_EVIDENCE',
});

/**
 * Defensible comparable set = HIGH only (same postcode + type + ≤3y).
 * Count of HIGH must meet this floor for ASSESSED.
 * MEDIUM/LOW never promote to ASSESSED by volume alone.
 */
const SUFFICIENCY_MIN_HIGH_COMPARABLES = 3;

/** Minimum relevant market transactions (HIGH+MEDIUM+LOW) for MARKET_CONTEXT. */
const MARKET_CONTEXT_MIN_TRANSACTIONS = 3;

/** @deprecated Use SUFFICIENCY_MIN_HIGH_COMPARABLES — kept as alias for test migration. */
const SUFFICIENCY_MIN_COMPARABLES = SUFFICIENCY_MIN_HIGH_COMPARABLES;

/** Hard eligibility: max age of transaction relative to asOf (years). */
const MAX_RECENCY_YEARS = 5;

const HIGH_RECENCY_YEARS = 3;

const CANDIDATE_LIMIT_POSTCODE = 80;
const CANDIDATE_LIMIT_DISTRICT = 120;
const UX_COMPARABLE_LIMIT = 8;
const UX_MARKET_CONTEXT_LIMIT = 8;

const PPD_TYPE_TO_LABEL = Object.freeze({
  D: 'detached',
  S: 'semi_detached',
  T: 'terraced',
  F: 'flat_maisonette',
});

const LABEL_TO_PPD = Object.freeze({
  detached: 'D',
  semi_detached: 'S',
  'semi-detached': 'S',
  terraced: 'T',
  terrace: 'T',
  flat: 'F',
  flat_maisonette: 'F',
  maisonette: 'F',
  apartment: 'F',
});

const DEFAULT_LIMITATIONS = Object.freeze([
  'Observed sold-price range/median are statistics of selected historical transactions — not a property valuation, fair value, recommended offer, or asking-price target.',
  'HM Land Registry Price Paid Data does not include bedrooms, bathrooms, internal area, or condition for these transactions.',
  'Same postcode or district does not mean identical properties.',
  'No time-price inflation, size, or condition adjustments are applied in this methodology.',
  'Broad local / district transaction context is not a defensible property-comparable assessment.',
  'Contains HM Land Registry data © Crown copyright and database right (OGL v3.0). Address field uses beyond residential property price information may require further licensing review.',
]);

module.exports = {
  METHODOLOGY_ID,
  METHODOLOGY_VERSION,
  ASSESSMENT,
  SIMILARITY,
  SUFFICIENCY_MIN_HIGH_COMPARABLES,
  SUFFICIENCY_MIN_COMPARABLES,
  MARKET_CONTEXT_MIN_TRANSACTIONS,
  MAX_RECENCY_YEARS,
  HIGH_RECENCY_YEARS,
  CANDIDATE_LIMIT_POSTCODE,
  CANDIDATE_LIMIT_DISTRICT,
  UX_COMPARABLE_LIMIT,
  UX_MARKET_CONTEXT_LIMIT,
  PPD_TYPE_TO_LABEL,
  LABEL_TO_PPD,
  DEFAULT_LIMITATIONS,
};
