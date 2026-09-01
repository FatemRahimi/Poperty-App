/**
 * Read-only audit of saved Property Intelligence finance snapshots.
 * Does not UPDATE, DELETE, or rewrite ai_requests.output_data.
 *
 * Run: node scripts/audit-finance-semantics.js
 */
require('dotenv').config();
const pool = require('../models/db');

async function tableExists(table) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

function metricState(presented, key) {
  const field = presented?.[key];
  if (!field) return 'absent';
  if (field.available === false || field.state === 'notAssessed') return 'notAssessed';
  if (field.available === true) return 'assessed';
  return 'unknown';
}

async function main() {
  if (!(await tableExists('ai_requests'))) {
    console.log(JSON.stringify({ available: false, reason: 'ai_requests missing' }, null, 2));
    return;
  }

  const rows = await pool.query(
    `SELECT id, request_type, output_data
       FROM ai_requests
      WHERE request_type IN ('property_intelligence', 'property_intelligence_v2')
         OR (output_data ? 'investment')`
  );

  const counts = {
    reportsWithFinance: 0,
    grossYieldAssessed: 0,
    marketRentBasedYield: 0,
    noiAssessed: 0,
    noiNotAssessed: 0,
    cashFlowAssessed: 0,
    cashFlowNotAssessed: 0,
    dscrAssessed: 0,
    dscrNotAssessed: 0,
    rawExistsWhilePresentedNotAssessed: 0,
    missingInputBecameRawZero: 0,
    marketSubstitutedForListing: 0,
    scanned: rows.rows.length,
  };

  rows.rows.forEach((row) => {
    const output = row.output_data || {};
    const investment = output.investment || output.report?.investment;
    if (!investment) return;
    counts.reportsWithFinance += 1;
    const presented = investment.presented || {};
    const metrics = investment.metrics || {};

    if (metricState(presented, 'grossYield') === 'assessed' || (presented.grossYield == null && metrics.grossYield != null)) {
      counts.grossYieldAssessed += 1;
    }
    if (
      presented.grossYield?.basis === 'MARKET_RENT'
      || investment.rentBasis?.kind === 'MARKET'
      || investment.expectedRentIsNotMarketRent === false
    ) {
      counts.marketRentBasedYield += 1;
    }
    if (metricState(presented, 'noi') === 'assessed') counts.noiAssessed += 1;
    if (metricState(presented, 'noi') === 'notAssessed') counts.noiNotAssessed += 1;
    if (metricState(presented, 'annualCashFlow') === 'assessed') counts.cashFlowAssessed += 1;
    if (metricState(presented, 'annualCashFlow') === 'notAssessed') counts.cashFlowNotAssessed += 1;
    if (metricState(presented, 'dscr') === 'assessed') counts.dscrAssessed += 1;
    if (metricState(presented, 'dscr') === 'notAssessed') counts.dscrNotAssessed += 1;

    ['noi', 'netYield', 'annualCashFlow', 'dscr'].forEach((key) => {
      const presentedField = presented[key];
      const raw = metrics[key];
      if (
        presentedField
        && (presentedField.available === false || presentedField.state === 'notAssessed')
        && raw != null
        && Number(raw) !== 0
      ) {
        counts.rawExistsWhilePresentedNotAssessed += 1;
      }
      if (
        presentedField
        && (presentedField.available === false || presentedField.state === 'notAssessed')
        && Number(raw) === 0
      ) {
        counts.missingInputBecameRawZero += 1;
      }
    });

    if (
      investment.rentBasis?.marketSubstitutedForMissingListing
      || (investment.expectedRentIsNotMarketRent === false)
    ) {
      counts.marketSubstitutedForListing += 1;
    }
  });

  console.log(JSON.stringify({ available: true, readOnly: true, rewritten: false, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
