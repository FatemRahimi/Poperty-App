/**
 * Read-only first-party outcome data-quality and backtest-label classification.
 * Detects suspicious records. Does not repair, backfill, or change engines.
 */

const {
  extractListingOutcomes,
  extractPredictionSnapshot,
  pairSnapshotWithOutcome,
} = require('./backtesting/backtestFoundation');

const ISSUE = Object.freeze({
  sold_at_before_first_published: 'sold_at_before_first_published',
  let_at_before_first_published: 'let_at_before_first_published',
  under_offer_at_after_sold_at: 'under_offer_at_after_sold_at',
  sold_and_let_both_present: 'sold_and_let_both_present',
  sale_category_has_let_at: 'sale_category_has_let_at',
  rent_category_has_sold_at: 'rent_category_has_sold_at',
  withdrawn_with_sold_or_let: 'withdrawn_with_sold_or_let',
  achieved_price_without_sold_at: 'achieved_price_without_sold_at',
  achieved_rent_without_let_at: 'achieved_rent_without_let_at',
});

const TEMPORAL_ISSUES = new Set([
  ISSUE.sold_at_before_first_published,
  ISSUE.let_at_before_first_published,
  ISSUE.under_offer_at_after_sold_at,
]);

const CATEGORY_ISSUES = new Set([
  ISSUE.sale_category_has_let_at,
  ISSUE.rent_category_has_sold_at,
]);

const TERMINAL_ISSUES = new Set([
  ISSUE.sold_and_let_both_present,
  ISSUE.withdrawn_with_sold_or_let,
]);

function parseTime(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function timeMs(value) {
  const iso = parseTime(value);
  return iso ? new Date(iso).getTime() : null;
}

function positiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function detectListingOutcomeIssues(listing = {}) {
  const issues = [];
  const category = String(listing.category || '').trim().toLowerCase();
  const status = String(listing.status || '').trim().toLowerCase();
  const firstPublished = timeMs(listing.first_published_at);
  const soldAt = timeMs(listing.sold_at);
  const letAt = timeMs(listing.let_at);
  const underOfferAt = timeMs(listing.under_offer_at);
  const withdrawnAt = timeMs(listing.withdrawn_at);
  const achievedPrice = positiveNumber(listing.achieved_price);
  const achievedRent = positiveNumber(listing.achieved_rent);

  if (soldAt != null && firstPublished != null && soldAt < firstPublished) {
    issues.push(ISSUE.sold_at_before_first_published);
  }
  if (letAt != null && firstPublished != null && letAt < firstPublished) {
    issues.push(ISSUE.let_at_before_first_published);
  }
  if (underOfferAt != null && soldAt != null && underOfferAt > soldAt) {
    issues.push(ISSUE.under_offer_at_after_sold_at);
  }
  if (soldAt != null && letAt != null) {
    issues.push(ISSUE.sold_and_let_both_present);
  }
  if (category === 'sale' && letAt != null) {
    issues.push(ISSUE.sale_category_has_let_at);
  }
  if (category === 'rent' && soldAt != null) {
    issues.push(ISSUE.rent_category_has_sold_at);
  }
  if ((status === 'withdrawn' || withdrawnAt != null) && (soldAt != null || letAt != null)) {
    issues.push(ISSUE.withdrawn_with_sold_or_let);
  }
  if (achievedPrice != null && soldAt == null) {
    issues.push(ISSUE.achieved_price_without_sold_at);
  }
  if (achievedRent != null && letAt == null) {
    issues.push(ISSUE.achieved_rent_without_let_at);
  }

  return issues;
}

function aggregateOutcomeIssues(listings = []) {
  const counts = {
    temporalConflicts: 0,
    categoryConflicts: 0,
    terminalStateConflicts: 0,
    missingAchievedSaleAmount: 0,
    missingAchievedRentAmount: 0,
    achievedPriceWithoutSoldAt: 0,
    achievedRentWithoutLetAt: 0,
  };
  listings.forEach((listing) => {
    const found = detectListingOutcomeIssues(listing);
    if (found.some((code) => TEMPORAL_ISSUES.has(code))) counts.temporalConflicts += 1;
    if (found.some((code) => CATEGORY_ISSUES.has(code))) counts.categoryConflicts += 1;
    if (found.some((code) => TERMINAL_ISSUES.has(code))) counts.terminalStateConflicts += 1;
    if (found.includes(ISSUE.achieved_price_without_sold_at)) counts.achievedPriceWithoutSoldAt += 1;
    if (found.includes(ISSUE.achieved_rent_without_let_at)) counts.achievedRentWithoutLetAt += 1;
    if (parseTime(listing.sold_at) && !positiveNumber(listing.achieved_price)) {
      counts.missingAchievedSaleAmount += 1;
    }
    if (parseTime(listing.let_at) && !positiveNumber(listing.achieved_rent)) {
      counts.missingAchievedRentAmount += 1;
    }
  });
  return counts;
}

/**
 * Distinguishes recorded completions from numeric backtest eligibility.
 * Uses existing Backtesting Foundation extract/pair functions unchanged.
 */
function classifyFirstPartyBacktestEligibility(listing = {}, snapshotRow = null) {
  const saleOutcomeRecorded = Boolean(parseTime(listing.sold_at));
  const rentOutcomeRecorded = Boolean(parseTime(listing.let_at));
  const extracted = extractListingOutcomes(listing);
  let saleMetricEligible = false;
  let rentMetricEligible = false;
  let saleReason = null;
  let rentReason = null;

  if (!snapshotRow) {
    return {
      outcomeRecorded: saleOutcomeRecorded || rentOutcomeRecorded,
      saleOutcomeRecorded,
      rentOutcomeRecorded,
      metricEligible: false,
      saleMetricEligible: false,
      rentMetricEligible: false,
      saleReason: saleOutcomeRecorded ? 'missing_historical_snapshot' : 'missing_outcome',
      rentReason: rentOutcomeRecorded ? 'missing_historical_snapshot' : 'missing_outcome',
    };
  }

  const snapshot = extractPredictionSnapshot(snapshotRow);
  const saleExtracted = extracted.find((o) => o.kind === 'sale');
  const rentExtracted = extracted.find((o) => o.kind === 'rent');

  if (saleExtracted) {
    const paired = pairSnapshotWithOutcome(snapshot, saleExtracted);
    saleMetricEligible = Boolean(paired.eligible);
    saleReason = paired.reason || null;
  } else if (saleOutcomeRecorded) {
    saleReason = 'missing_achieved_amount';
  } else {
    saleReason = 'missing_outcome';
  }

  if (rentExtracted) {
    const paired = pairSnapshotWithOutcome(snapshot, rentExtracted);
    rentMetricEligible = Boolean(paired.eligible);
    rentReason = paired.reason || null;
  } else if (rentOutcomeRecorded) {
    rentReason = 'missing_achieved_amount';
  } else {
    rentReason = 'missing_outcome';
  }

  return {
    outcomeRecorded: saleOutcomeRecorded || rentOutcomeRecorded,
    saleOutcomeRecorded,
    rentOutcomeRecorded,
    metricEligible: saleMetricEligible || rentMetricEligible,
    saleMetricEligible,
    rentMetricEligible,
    saleReason,
    rentReason,
  };
}

module.exports = {
  ISSUE,
  detectListingOutcomeIssues,
  aggregateOutcomeIssues,
  classifyFirstPartyBacktestEligibility,
};
