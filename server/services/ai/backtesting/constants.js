/**
 * Property Intelligence backtesting foundation — observational evaluation only.
 * Does not train, calibrate, or change production engines.
 */

const BACKTEST_ENGINE_VERSION = 'backtest-foundation-1.0.0';
const CONFIDENCE_MODEL_VERSION = 'confidence-1.1.0';

const STATE = Object.freeze({
  available: 'available',
  insufficientData: 'insufficientData',
  notBacktestable: 'notBacktestable',
  notEvaluated: 'notEvaluated',
});

const EXCLUSION = Object.freeze({
  missing_historical_snapshot: 'missing_historical_snapshot',
  missing_outcome: 'missing_outcome',
  prediction_not_before_outcome: 'prediction_not_before_outcome',
  outcome_already_known_at_prediction: 'outcome_already_known_at_prediction',
  asking_used_as_achieved_price: 'asking_used_as_achieved_price',
  asking_used_as_achieved_rent: 'asking_used_as_achieved_rent',
  updated_at_used_as_outcome_time: 'updated_at_used_as_outcome_time',
  created_at_used_as_outcome_time: 'created_at_used_as_outcome_time',
  status_used_as_achieved_value: 'status_used_as_achieved_value',
  area_rents_used_as_achieved_rent: 'area_rents_used_as_achieved_rent',
  valuation_used_as_outcome: 'valuation_used_as_outcome',
  ambiguous_identity: 'ambiguous_identity',
  conflicting_outcomes: 'conflicting_outcomes',
  missing_historical_valuation: 'missing_historical_valuation',
  missing_historical_rent_prediction: 'missing_historical_rent_prediction',
  later_evidence_leakage: 'later_evidence_leakage',
  current_provider_response_as_history: 'current_provider_response_as_history',
  synthetic_fixture_not_production_evidence: 'synthetic_fixture_not_production_evidence',
  not_assessed: 'not_assessed',
  invalid_prediction: 'invalid_prediction',
  future_outcome_date: 'future_outcome_date',
  malformed_outcome_date: 'malformed_outcome_date',
  invalid_outcome_value: 'invalid_outcome_value',
  unverified_outcome: 'unverified_outcome',
  weak_identity_match: 'weak_identity_match',
});

const MATCH_STATE = Object.freeze({
  verified: 'VERIFIED',
  probable: 'PROBABLE',
  ambiguous: 'AMBIGUOUS',
  unmatched: 'UNMATCHED',
});

const OUTCOME_TRUST = Object.freeze({
  verifiedObserved: 'VERIFIED_OBSERVED',
  userReported: 'USER_REPORTED',
  context: 'CONTEXT',
  notSuitable: 'NOT_SUITABLE',
});

const SAMPLE_SUFFICIENCY = Object.freeze({
  noData: 'NO_DATA',
  verySparse: 'VERY_SPARSE',
  limited: 'LIMITED',
  sufficient: 'SUFFICIENT',
});

const MIN_SEGMENT_SAMPLE = 5;
const MIN_CONFIDENCE_GROUP_SAMPLE = 5;

const PERSONAL_DECISION_REQUIRED_LABELS = Object.freeze([
  'buyer_general requires later occupancy/suitability feedback against the original living requirements — a sale price is not a correctness label',
  'landlord requires later achieved letting performance (achieved rent, vacancy, evidenced costs) against the original income requirements — a sale or let event is not proof the score was correct',
]);

module.exports = {
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
};
