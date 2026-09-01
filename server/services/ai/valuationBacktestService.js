/**
 * Sale-valuation outcome measurement. Observational only.
 * Loads saved predictions + canonical outcomes. Does not recompute valuation,
 * call providers, or invoke an LLM.
 */

const {
  extractPredictionSnapshot,
  extractListingOutcomes,
  pairSnapshotWithOutcome,
  runBacktest,
  MATCH_STATE,
  OUTCOME_TRUST,
  SAMPLE_SUFFICIENCY,
} = require('./backtesting/backtestFoundation');

function evaluateSaleBacktest({
  snapshots = [],
  outcomes = [],
  listings = [],
  generatedAt,
  productionAudit = false,
} = {}) {
  const listingOutcomes = (listings || []).flatMap((listing) => extractListingOutcomes(listing));
  const combinedOutcomes = [...listingOutcomes, ...(outcomes || [])];
  const result = runBacktest({
    snapshots,
    outcomes: combinedOutcomes,
    generatedAt,
    productionAudit,
  });

  const uniqueSaleOutcomes = (() => {
    const keys = new Set();
    result.cases.sale.forEach((row) => {
      keys.add(`${row.listingId || row.uprn || ''}:${row.outcomeAt}:${row.achieved}`);
    });
    return keys.size;
  })();

  return {
    cohort: 'sale_valuation',
    observational: true,
    recomputedPredictions: false,
    providerCalls: false,
    llmCalls: false,
    sampleUnit: 'eligible_predictions',
    sample: {
      n: result.valuation.sampleSize,
      unit: 'eligible_predictions',
      uniqueSaleOutcomes,
      sufficiency: result.valuation.sampleSufficiency || SAMPLE_SUFFICIENCY.noData,
      limitation: result.valuation.limitation,
    },
    metrics: result.valuation,
    exclusions: result.eligibility.exclusionReasons,
    eligibility: result.eligibility,
    observations: result.cases.sale,
    snapshotRecords: result.snapshotRecords,
    outcomeTrustLevels: {
      userReported: OUTCOME_TRUST.userReported,
      verifiedObserved: OUTCOME_TRUST.verifiedObserved,
    },
    matchStates: MATCH_STATE,
    limitations: result.limitations,
    generatedAt: result.generatedAt,
    engineVersion: result.engineVersion,
  };
}

module.exports = {
  evaluateSaleBacktest,
  extractPredictionSnapshot,
  extractListingOutcomes,
  pairSnapshotWithOutcome,
};
