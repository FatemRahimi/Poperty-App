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
    soldWithAchievedPrice: 0,
    let: 0,
    letWithAchievedRent: 0,
    underOffer: 0,
    withdrawn: 0,
  };
  if (!(await tableExists('properties'))) return empty;
  const hasSoldAt = await columnExists('properties', 'sold_at');
  const hasLetAt = await columnExists('properties', 'let_at');
  if (!hasSoldAt && !hasLetAt) return empty;
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sold' OR sold_at IS NOT NULL)::int AS sold,
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
  return {
    sold: row.sold,
    soldWithAchievedPrice: row.sold_with_achieved_price,
    let: row.let,
    letWithAchievedRent: row.let_with_achieved_rent,
    underOffer: row.under_offer,
    withdrawn: row.withdrawn,
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

function publicAudit(listings, outcomes, backtest, issues, schema) {
  return {
    listings,
    outcomes,
    backtesting: {
      historicalSnapshots: backtest.historicalPredictionSnapshots,
      eligibleSalePairs: backtest.eligibleSalePairs,
      eligibleRentPairs: backtest.eligibleRentPairs,
      state: backtest.state,
    },
    issues: {
      temporalConflicts: issues.temporalConflicts,
      categoryConflicts: issues.categoryConflicts,
      terminalStateConflicts: issues.terminalStateConflicts,
      missingAchievedSaleAmount: issues.missingAchievedSaleAmount,
      missingAchievedRentAmount: issues.missingAchievedRentAmount,
    },
    schema,
    note: 'Aggregates only. Zero outcome counts are valid. No historical backfill was performed.',
  };
}

async function runAudit() {
  const listings = await listingCounts();
  const outcomes = await outcomeCounts();
  const qualityRows = await loadOutcomeQualityRows();
  const issues = aggregateOutcomeIssues(qualityRows);

  let historicalSnapshots = 0;
  let eligibleSalePairs = 0;
  let eligibleRentPairs = 0;
  let state = 'insufficientData';
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
    { historicalPredictionSnapshots: historicalSnapshots, eligibleSalePairs, eligibleRentPairs, state },
    issues,
    schema
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
