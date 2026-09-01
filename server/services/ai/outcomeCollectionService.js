/**
 * Operational sale-outcome collection audit.
 * Read-only. Reuses listing outcomes, quality, and backtest pairing.
 * Does not recompute valuations, call providers, or invent labels.
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
const { detectListingOutcomeIssues } = require('./listingOutcomeQuality');
const { evaluateSaleBacktest } = require('./valuationBacktestService');

const COLLECTION_GAP = Object.freeze({
  assessed_listing_awaiting_sale_outcome: 'assessed_listing_awaiting_sale_outcome',
  sold_missing_achieved_price: 'sold_missing_achieved_price',
  achieved_price_missing_sold_at: 'achieved_price_missing_sold_at',
  sold_status_without_sold_at: 'sold_status_without_sold_at',
  no_assessed_prediction: 'no_assessed_prediction',
  not_assessed_prediction: 'not_assessed_prediction',
  asking_is_not_an_outcome: 'asking_is_not_an_outcome',
});

const HMLR_LEDGER_LIMITATION =
  'property_enrichments is a current-state upsert store. It cannot safely accumulate later verified HMLR transactions as a historical ledger. Backtesting never calls providers.';

/**
 * Operator taxonomy for why N is zero or an observation was excluded.
 * Maps existing gap/exclusion codes. Does not invent a score or weaken gates.
 */
const FIRST_OUTCOME_BLOCKER = Object.freeze({
  NO_REAL_COMPLETED_SALES: 'NO_REAL_COMPLETED_SALES',
  NO_PRIOR_ASSESSED_PREDICTION: 'NO_PRIOR_ASSESSED_PREDICTION',
  MISSING_ACHIEVED_PRICE: 'MISSING_ACHIEVED_PRICE',
  MISSING_SOLD_DATE: 'MISSING_SOLD_DATE',
  IDENTITY_NOT_VERIFIED: 'IDENTITY_NOT_VERIFIED',
  PREDICTION_AFTER_OUTCOME: 'PREDICTION_AFTER_OUTCOME',
  CONFLICTING_OUTCOME: 'CONFLICTING_OUTCOME',
  UNASSESSED_VALUATION: 'UNASSESSED_VALUATION',
  TRUST_NOT_ELIGIBLE: 'TRUST_NOT_ELIGIBLE',
  OTHER_EXISTING_RULE: 'OTHER_EXISTING_RULE',
});

const FIRST_OUTCOME_PIPELINE = 'READY';

const EXCLUSION_TO_BLOCKER = Object.freeze({
  missing_outcome: FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES,
  assessed_listing_awaiting_sale_outcome: FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES,
  no_assessed_prediction: FIRST_OUTCOME_BLOCKER.NO_PRIOR_ASSESSED_PREDICTION,
  missing_historical_snapshot: FIRST_OUTCOME_BLOCKER.NO_PRIOR_ASSESSED_PREDICTION,
  missing_historical_valuation: FIRST_OUTCOME_BLOCKER.UNASSESSED_VALUATION,
  not_assessed: FIRST_OUTCOME_BLOCKER.UNASSESSED_VALUATION,
  invalid_prediction: FIRST_OUTCOME_BLOCKER.UNASSESSED_VALUATION,
  sold_missing_achieved_price: FIRST_OUTCOME_BLOCKER.MISSING_ACHIEVED_PRICE,
  incomplete_sale_outcome: FIRST_OUTCOME_BLOCKER.MISSING_ACHIEVED_PRICE,
  missing_achieved_amount: FIRST_OUTCOME_BLOCKER.MISSING_ACHIEVED_PRICE,
  achieved_price_missing_sold_at: FIRST_OUTCOME_BLOCKER.MISSING_SOLD_DATE,
  sold_status_without_sold_at: FIRST_OUTCOME_BLOCKER.MISSING_SOLD_DATE,
  weak_identity_match: FIRST_OUTCOME_BLOCKER.IDENTITY_NOT_VERIFIED,
  ambiguous_identity: FIRST_OUTCOME_BLOCKER.IDENTITY_NOT_VERIFIED,
  prediction_not_before_outcome: FIRST_OUTCOME_BLOCKER.PREDICTION_AFTER_OUTCOME,
  conflicting_outcomes: FIRST_OUTCOME_BLOCKER.CONFLICTING_OUTCOME,
  unverified_outcome: FIRST_OUTCOME_BLOCKER.TRUST_NOT_ELIGIBLE,
});

function classifyFirstOutcomeBlockers({
  gaps = {},
  exclusions = {},
  completeSaleOutcomes = 0,
} = {}) {
  const counts = {};
  const add = (key, n) => {
    const value = Number(n) || 0;
    if (!value) return;
    counts[key] = (counts[key] || 0) + value;
  };

  Object.entries(gaps || {}).forEach(([code, n]) => {
    add(EXCLUSION_TO_BLOCKER[code] || FIRST_OUTCOME_BLOCKER.OTHER_EXISTING_RULE, n);
  });
  Object.entries(exclusions || {}).forEach(([code, n]) => {
    add(EXCLUSION_TO_BLOCKER[code] || FIRST_OUTCOME_BLOCKER.OTHER_EXISTING_RULE, n);
  });

  if (completeSaleOutcomes === 0 && !counts[FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES]) {
    add(FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES, 1);
  }

  return {
    primary:
      completeSaleOutcomes === 0
        ? FIRST_OUTCOME_BLOCKER.NO_REAL_COMPLETED_SALES
        : Object.keys(counts)[0] || null,
    counts,
  };
}

function publicPairingExclusions(snapshotRecords = []) {
  return (snapshotRecords || [])
    .filter((row) => row?.sale?.reason)
    .map((row) => ({
      requestId: row.requestId ?? null,
      listingId: row.listingId ?? null,
      saleExclusion: row.sale.reason,
      saleState: row.sale.state || 'notBacktestable',
    }));
}

function positiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseTime(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function increment(map, key) {
  const name = key || 'unknown';
  map[name] = (map[name] || 0) + 1;
}

function snapshotListingKey(snapshot) {
  if (snapshot?.listingId == null) return null;
  return String(snapshot.listingId);
}

/**
 * Measurement unit is the eligible prediction, not the unique sale transaction.
 * Several immutable analyses of the same listing before one later sale each count.
 */
function uniqueSaleOutcomeCount(cases = []) {
  const keys = new Set();
  cases.forEach((row) => {
    keys.add(`${row.listingId || row.uprn || ''}:${row.outcomeAt}:${row.achieved}`);
  });
  return keys.size;
}

function classifyListingCollectionGaps(listing = {}, snapshotsForListing = []) {
  const reasons = [];
  const category = String(listing.category || '').trim().toLowerCase();
  const status = String(listing.status || '').trim().toLowerCase();
  const soldAt = parseTime(listing.sold_at);
  const achieved = positiveNumber(listing.achieved_price);
  const qualityIssues = detectListingOutcomeIssues(listing);
  qualityIssues.forEach((code) => reasons.push(code));

  if (status === 'sold' && !soldAt) {
    reasons.push(COLLECTION_GAP.sold_status_without_sold_at);
  }
  if (soldAt && !achieved) {
    reasons.push(COLLECTION_GAP.sold_missing_achieved_price);
  }
  if (achieved && !soldAt) {
    reasons.push(COLLECTION_GAP.achieved_price_missing_sold_at);
  }

  const assessed = snapshotsForListing.filter((s) => s.sale?.available && s.sale?.assessed);
  const present = snapshotsForListing.filter((s) => s.available);
  const notAssessed = present.filter((s) => s.sale && !s.sale.available);

  if (category === 'sale' && assessed.length && !soldAt) {
    reasons.push(COLLECTION_GAP.assessed_listing_awaiting_sale_outcome);
  }
  if (soldAt && achieved && !assessed.length) {
    if (notAssessed.length) reasons.push(COLLECTION_GAP.not_assessed_prediction);
    else if (!present.length) reasons.push(COLLECTION_GAP.no_assessed_prediction);
  }

  return [...new Set(reasons)];
}

function auditOutcomeCollection({
  listings = [],
  snapshots = [],
  outcomes = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const extracted = snapshots.map((row) =>
    row.available && row.analysisAt ? row : extractPredictionSnapshot(row)
  );
  const byListing = new Map();
  extracted.forEach((snapshot) => {
    const key = snapshotListingKey(snapshot);
    if (!key) return;
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(snapshot);
  });

  const exclusionReasons = {};
  const gapReasons = {};
  const rows = [];
  let assessedPredictions = 0;
  let candidateOutcomes = 0;
  let userReportedMatches = 0;
  let verifiedObservedMatches = 0;

  extracted.forEach((snapshot) => {
    if (snapshot.available && snapshot.sale?.available && snapshot.sale?.assessed) {
      assessedPredictions += 1;
    }
  });

  const listingOutcomes = listings.flatMap((listing) => extractListingOutcomes(listing));
  const combinedOutcomes = [...listingOutcomes, ...(outcomes || [])];
  candidateOutcomes = combinedOutcomes.filter((o) => o.kind === 'sale').length;

  listings.forEach((listing) => {
    const listingSnapshots = byListing.get(String(listing.id)) || [];
    const gaps = classifyListingCollectionGaps(listing, listingSnapshots);
    gaps.forEach((code) => increment(gapReasons, code));
    if (gaps.length) {
      rows.push({
        listingId: listing.id,
        status: listing.status || null,
        category: listing.category || null,
        reasons: gaps,
      });
    }
  });

  const measured = evaluateSaleBacktest({
    snapshots,
    outcomes: combinedOutcomes,
    generatedAt,
    productionAudit: false,
  });

  measured.observations.forEach((obs) => {
    if (obs.outcomeTrust === OUTCOME_TRUST.userReported) userReportedMatches += 1;
    if (obs.outcomeTrust === OUTCOME_TRUST.verifiedObserved) verifiedObservedMatches += 1;
  });
  Object.entries(measured.exclusions || {}).forEach(([reason, count]) => {
    exclusionReasons[reason] = (exclusionReasons[reason] || 0) + Number(count || 0);
  });

  const evaluableN = measured.sample.n;
  return {
    generatedAt,
    observational: true,
    manufacturedOutcomes: false,
    recomputedPredictions: false,
    providerCalls: false,
    llmCalls: false,
    sampleUnit: 'eligible_predictions',
    predictions: {
      totalSaved: extracted.length,
      available: extracted.filter((s) => s.available).length,
      assessedSale: assessedPredictions,
    },
    outcomes: {
      candidateSale: candidateOutcomes,
      firstPartySale: listingOutcomes.filter((o) => o.kind === 'sale').length,
      trust: {
        userReported: OUTCOME_TRUST.userReported,
        verifiedObserved: OUTCOME_TRUST.verifiedObserved,
      },
    },
    matches: {
      userReported: userReportedMatches,
      verifiedObserved: verifiedObservedMatches,
      verifiedIdentity: measured.observations.filter((o) => o.matchState === MATCH_STATE.verified)
        .length,
    },
    evaluation: {
      n: evaluableN,
      uniqueSaleOutcomes: uniqueSaleOutcomeCount(measured.observations),
      sufficiency: measured.sample.sufficiency || SAMPLE_SUFFICIENCY.noData,
      limitation: measured.sample.limitation,
      exclusions: exclusionReasons,
    },
    collectionGaps: {
      listingsWithGaps: rows.length,
      reasons: gapReasons,
    },
    verifiedObservedAccumulation: {
      possibleFromCurrentEnrichments: false,
      reason: HMLR_LEDGER_LIMITATION,
    },
    measurementSemantics: {
      nRepresents: 'eligible_predictions',
      multiplePredictionsBeforeOneSale: 'each_immutable_prediction_is_evaluated_independently',
      duplicateTransactions: 'deduped_before_pairing',
    },
    firstOutcomePipeline: FIRST_OUTCOME_PIPELINE,
    firstOutcomeBlockers: classifyFirstOutcomeBlockers({
      gaps: gapReasons,
      exclusions: exclusionReasons,
      completeSaleOutcomes: listings.filter(
        (listing) => parseTime(listing.sold_at) && positiveNumber(listing.achieved_price)
      ).length,
    }),
    pairingExclusions: publicPairingExclusions(measured.snapshotRecords),
    collectionGapRows: rows.map((row) => ({
      listingId: row.listingId,
      status: row.status,
      category: row.category,
      reasons: row.reasons,
    })),
    metrics: measured.metrics,
    limitations: [
      ...(measured.limitations || []),
      HMLR_LEDGER_LIMITATION,
      'N is eligible predictions, not unique sale transactions.',
      'Owner/admin achieved sale remains USER_REPORTED and is never relabelled VERIFIED_OBSERVED.',
      'Zero genuine outcomes is a valid NO_DATA result.',
    ],
  };
}

function runCollectionBacktest(dataset) {
  return runBacktest({
    snapshots: dataset.snapshots || [],
    outcomes: dataset.outcomes || [],
    productionAudit: true,
  });
}

module.exports = {
  COLLECTION_GAP,
  HMLR_LEDGER_LIMITATION,
  FIRST_OUTCOME_BLOCKER,
  FIRST_OUTCOME_PIPELINE,
  classifyListingCollectionGaps,
  classifyFirstOutcomeBlockers,
  publicPairingExclusions,
  auditOutcomeCollection,
  uniqueSaleOutcomeCount,
  runCollectionBacktest,
};
