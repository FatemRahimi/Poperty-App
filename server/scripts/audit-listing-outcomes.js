/**
 * Read-only first-party listing outcome audit.
 * Aggregates only — no addresses, owner names, actor IDs, or provider payloads.
 * Does not insert or backfill outcomes.
 *
 * Run: node scripts/audit-listing-outcomes.js
 */
require('dotenv').config();
const pool = require('../models/db');
const { loadBacktestDataset } = require('../services/ai/backtesting/backtestRepository');
const { runBacktest } = require('../services/ai/backtesting/backtestFoundation');
const { aggregateOutcomeIssues } = require('../services/ai/listingOutcomeQuality');
const { auditOutcomeCollection } = require('../services/ai/outcomeCollectionService');

async function tableExists(table) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

async function columnExists(table, column) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return result.rows.length > 0;
}

async function indexExists(name) {
  const result = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [name]
  );
  return result.rows.length > 0;
}

async function listingCounts() {
  if (!(await tableExists('properties'))) {
    return { total: 0, sale: 0, rent: 0 };
  }
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE category = 'sale')::int AS sale,
      COUNT(*) FILTER (WHERE category = 'rent')::int AS rent
    FROM properties
  `);
  return result.rows[0];
}

async function outcomeCounts() {
  const empty = {
    sold: 0,
    soldListings: 0,
    soldAtPresent: 0,
    achievedPricePresent: 0,
    soldAtWithoutAchievedPrice: 0,
    achievedPriceWithoutSoldAt: 0,
    completeSaleOutcomes: 0,
    soldWithAchievedPrice: 0,
    let: 0,
    letWithAchievedRent: 0,
    underOffer: 0,
    withdrawn: 0,
    soldEvents: 0,
    saleOutcomeCompletedEvents: 0,
    duplicateSoldEventGroups: 0,
  };
  if (!(await tableExists('properties'))) return empty;
  const hasSoldAt = await columnExists('properties', 'sold_at');
  const hasLetAt = await columnExists('properties', 'let_at');
  if (!hasSoldAt && !hasLetAt) return empty;
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sold' OR sold_at IS NOT NULL)::int AS sold,
      COUNT(*) FILTER (WHERE status = 'sold')::int AS sold_listings,
      COUNT(*) FILTER (WHERE sold_at IS NOT NULL)::int AS sold_at_present,
      COUNT(*) FILTER (WHERE achieved_price IS NOT NULL AND achieved_price > 0)::int AS achieved_price_present,
      COUNT(*) FILTER (
        WHERE sold_at IS NOT NULL AND (achieved_price IS NULL OR achieved_price <= 0)
      )::int AS sold_at_without_achieved_price,
      COUNT(*) FILTER (
        WHERE achieved_price IS NOT NULL AND achieved_price > 0 AND sold_at IS NULL
      )::int AS achieved_price_without_sold_at,
      COUNT(*) FILTER (
        WHERE sold_at IS NOT NULL AND achieved_price IS NOT NULL AND achieved_price > 0
      )::int AS complete_sale_outcomes,
      COUNT(*) FILTER (
        WHERE (status = 'sold' OR sold_at IS NOT NULL)
          AND achieved_price IS NOT NULL AND achieved_price > 0
      )::int AS sold_with_achieved_price,
      COUNT(*) FILTER (WHERE status = 'let' OR let_at IS NOT NULL)::int AS let,
      COUNT(*) FILTER (
        WHERE (status = 'let' OR let_at IS NOT NULL)
          AND achieved_rent IS NOT NULL AND achieved_rent > 0
      )::int AS let_with_achieved_rent,
      COUNT(*) FILTER (WHERE status = 'under_offer' OR under_offer_at IS NOT NULL)::int AS under_offer,
      COUNT(*) FILTER (WHERE status = 'withdrawn' OR withdrawn_at IS NOT NULL)::int AS withdrawn
    FROM properties
  `);
  const row = result.rows[0];
  let soldEvents = 0;
  let saleOutcomeCompletedEvents = 0;
  let duplicateSoldEventGroups = 0;
  if (await tableExists('listing_events')) {
    const events = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'sold')::int AS sold_events,
        COUNT(*) FILTER (WHERE event_type = 'sale_outcome_completed')::int AS completed_events
      FROM listing_events
    `);
    soldEvents = events.rows[0].sold_events;
    saleOutcomeCompletedEvents = events.rows[0].completed_events;
    const dupes = await pool.query(`
      SELECT COUNT(*)::int AS groups
      FROM (
        SELECT property_id
        FROM listing_events
        WHERE event_type = 'sold'
        GROUP BY property_id
        HAVING COUNT(*) > 1
      ) d
    `);
    duplicateSoldEventGroups = dupes.rows[0].groups;
  }
  return {
    sold: row.sold,
    soldListings: row.sold_listings,
    soldAtPresent: row.sold_at_present,
    achievedPricePresent: row.achieved_price_present,
    soldAtWithoutAchievedPrice: row.sold_at_without_achieved_price,
    achievedPriceWithoutSoldAt: row.achieved_price_without_sold_at,
    completeSaleOutcomes: row.complete_sale_outcomes,
    soldWithAchievedPrice: row.sold_with_achieved_price,
    let: row.let,
    letWithAchievedRent: row.let_with_achieved_rent,
    underOffer: row.under_offer,
    withdrawn: row.withdrawn,
    soldEvents,
    saleOutcomeCompletedEvents,
    duplicateSoldEventGroups,
  };
}

async function loadOutcomeQualityRows() {
  if (!(await tableExists('properties'))) return [];
  const result = await pool.query(`
    SELECT id, category, status,
           first_published_at, sold_at, let_at, under_offer_at, withdrawn_at,
           achieved_price, achieved_rent
    FROM properties
  `);
  return result.rows;
}

function publicAudit(listings, outcomes, backtest, issues, schema, collection) {
  return {
    listings,
    outcomes,
    backtesting: {
      historicalSnapshots: backtest.historicalPredictionSnapshots,
      assessedSalePredictions: backtest.assessedSalePredictions,
      eligibleSalePairs: backtest.eligibleSalePairs,
      eligibleRentPairs: backtest.eligibleRentPairs,
      state: backtest.state,
      sufficiency: backtest.sufficiency,
    },
    collection: collection
      ? {
          sampleUnit: collection.sampleUnit,
          predictions: collection.predictions,
          outcomes: {
            candidateSale: collection.outcomes.candidateSale,
            firstPartySale: collection.outcomes.firstPartySale,
          },
          matches: collection.matches,
          evaluation: {
            n: collection.evaluation.n,
            uniqueSaleOutcomes: collection.evaluation.uniqueSaleOutcomes,
            sufficiency: collection.evaluation.sufficiency,
            exclusions: collection.evaluation.exclusions,
          },
          collectionGaps: collection.collectionGaps,
          collectionGapRows: collection.collectionGapRows || [],
          pairingExclusions: collection.pairingExclusions || [],
          firstOutcomePipeline: collection.firstOutcomePipeline || null,
          firstOutcomeBlockers: collection.firstOutcomeBlockers || null,
          verifiedObservedAccumulation: collection.verifiedObservedAccumulation,
          measurementSemantics: collection.measurementSemantics,
        }
      : null,
    issues: {
      temporalConflicts: issues.temporalConflicts,
      categoryConflicts: issues.categoryConflicts,
      terminalStateConflicts: issues.terminalStateConflicts,
      missingAchievedSaleAmount: issues.missingAchievedSaleAmount,
      missingAchievedRentAmount: issues.missingAchievedRentAmount,
      incompleteSaleOutcomes: issues.incompleteSaleOutcomes,
      completeSaleOutcomes: issues.completeSaleOutcomes,
      completedAfterInitialRecord: issues.completedAfterInitialRecord,
    },
    schema,
    firstOutcomeReadiness: {
      pipeline: collection?.firstOutcomePipeline || 'READY',
      currentNIsNotReadiness: true,
      note:
        'READY means a genuine later sale on a listing with an earlier assessed immutable prediction can be captured and evaluated. N=0 with no completed sales is a valid successful measurement.',
    },
    note: 'Aggregates only. Zero outcome counts are valid. No historical backfill was performed. No addresses, emails, tokens, or provider payloads.',
  };
}

async function runAudit() {
  const listings = await listingCounts();
  const outcomes = await outcomeCounts();
  const qualityRows = await loadOutcomeQualityRows();
  let lifecycleEvents = [];
  if (await tableExists('listing_events')) {
    const eventRows = await pool.query(`
      SELECT property_id, event_type
      FROM listing_events
      WHERE event_type IN ('sold', 'sale_outcome_completed')
    `);
    lifecycleEvents = eventRows.rows;
  }
  const issues = aggregateOutcomeIssues(qualityRows, { events: lifecycleEvents });

  let historicalSnapshots = 0;
  let assessedSalePredictions = 0;
  let eligibleSalePairs = 0;
  let eligibleRentPairs = 0;
  let state = 'insufficientData';
  let sufficiency = 'NO_DATA';
  let collection = null;
  try {
    const dataset = await loadBacktestDataset(pool);
    historicalSnapshots = dataset.audit.historicalPredictionSnapshots;
    const result = runBacktest({
      snapshots: dataset.snapshots,
      outcomes: dataset.outcomes,
    });
    eligibleSalePairs = result.eligibility.eligibleSale;
    eligibleRentPairs = result.eligibility.eligibleRent;
    state = result.state;
    sufficiency = result.valuation.sampleSufficiency || 'NO_DATA';
    collection = auditOutcomeCollection({
      listings: qualityRows,
      snapshots: dataset.snapshots,
      outcomes: dataset.outcomes,
    });
    assessedSalePredictions = collection.predictions.assessedSale;
  } catch {
    /* schema or DB unavailable — leave zeros */
  }

  const schema = {
    columns: {
      sold_at: await columnExists('properties', 'sold_at'),
      let_at: await columnExists('properties', 'let_at'),
      achieved_price: await columnExists('properties', 'achieved_price'),
      achieved_rent: await columnExists('properties', 'achieved_rent'),
    },
    indexes: {
      listing_events_one_sold: await indexExists('listing_events_one_sold'),
      listing_events_one_let: await indexExists('listing_events_one_let'),
      listing_events_one_under_offer: await indexExists('listing_events_one_under_offer'),
      listing_events_one_withdrawn: await indexExists('listing_events_one_withdrawn'),
    },
  };

  return publicAudit(
    listings,
    outcomes,
    {
      historicalPredictionSnapshots: historicalSnapshots,
      assessedSalePredictions,
      eligibleSalePairs,
      eligibleRentPairs,
      state,
      sufficiency,
    },
    issues,
    schema,
    collection
  );
}

async function main() {
  try {
    const report = await runAudit();
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err.message);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
}

module.exports = { runAudit, publicAudit };
