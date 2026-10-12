/**
 * Genuine HMLR cohort — official comparable assessment funnel.
 * ZERO paid provider calls. No invented subject facts.
 * node server/scripts/official-hmlr-comparable-assessment-validation.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const {
  buildOfficialTransactionComparableAssessment,
} = require('../services/market/officialTransactionComparableAssessment');
const { createPostgresOfficialSaleStore } = require('../services/market/officialSaleTransactionRepository');

const COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

const TYPE = { D: 'detached', S: 'semi-detached', T: 'terraced', F: 'flat' };

(async () => {
  const store = createPostgresOfficialSaleStore();
  const rows = (await pool.query(
    `SELECT source_transaction_id, postcode, paon, saon, street, uprn, property_type_code, price_gbp, transfer_date
     FROM official_sale_transactions WHERE live AND source_transaction_id = ANY($1)
     ORDER BY source_transaction_id`,
    [COHORT]
  )).rows;

  // Attribute coverage reality check (PPD columns)
  const coverage = await pool.query(
    `SELECT
       COUNT(*)::int AS n,
       COUNT(property_type_code)::int AS with_type,
       COUNT(tenure_code)::int AS with_tenure,
       COUNT(uprn)::int AS with_uprn,
       0 AS with_bedrooms,
       0 AS with_bathrooms,
       0 AS with_internal_area
     FROM official_sale_transactions WHERE live AND postcode_compact IS NOT NULL
     LIMIT 1`
  );

  // EXPLAIN for bounded postcode candidate query (safe read-only)
  let explainPostcode = null;
  try {
    const samplePc = rows[0] && String(rows[0].postcode || '').replace(/\s+/g, '');
    if (samplePc) {
      const plan = await pool.query(
        `EXPLAIN (FORMAT TEXT)
         SELECT * FROM official_sale_transactions
         WHERE live
           AND postcode_compact = $1
           AND property_type_code = $2
           AND transfer_date <= CURRENT_DATE
         ORDER BY transfer_date DESC NULLS LAST
         LIMIT 80`,
        [samplePc, rows[0].property_type_code || 'T']
      );
      explainPostcode = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
    }
  } catch (err) {
    explainPostcode = String(err.message || err);
  }

  const matrix = [];
  for (const row of rows) {
    const result = await buildOfficialTransactionComparableAssessment({
      property: {
        postcode: row.postcode,
        property_type: TYPE[row.property_type_code] || 'terraced',
        property_type_code: row.property_type_code,
        paon: row.paon,
        saon: row.saon,
        uprn: row.uprn,
        excludeTransactionIds: [row.source_transaction_id],
      },
      identity: {
        postcode: row.postcode,
        paon: row.paon,
        saon: row.saon,
        uprn: row.uprn,
      },
      asOf: new Date().toISOString().slice(0, 10),
      store,
    });
    matrix.push({
      tx: row.source_transaction_id,
      postcode: row.postcode,
      propertyTypeCode: row.property_type_code,
      subjectSoldPriceGbp: row.price_gbp != null ? Number(row.price_gbp) : null,
      subjectTransferDate: row.transfer_date,
      assessment: result.assessment,
      candidateCount: result.candidateCount,
      eligibleCount: result.eligibleCount,
      relevantMarketTransactionCount: result.relevantMarketTransactionCount,
      highCount: result.similarityQuality?.high ?? 0,
      mediumCount: result.similarityQuality?.medium ?? 0,
      lowCount: result.similarityQuality?.low ?? 0,
      defensibleComparableCount: result.defensibleComparableCount,
      comparableCount: result.comparableCount,
      evidenceStrength: result.evidenceStrength,
      exclusionTallies: result.exclusionTallies,
      observedLocalTransactionRange: result.observedLocalTransactionRange,
      observedLocalMedian: result.observedLocalMedian,
      observedComparableRange: result.observedComparableRange,
      observedComparableMedian: result.observedComparableMedian,
      searchHierarchy: result.searchHierarchy,
      limitations: (result.limitations || []).slice(0, 4),
      unresolved: (result.unresolvedDependencies || []).slice(0, 2),
      note: 'Subject own transaction excluded. Market context ≠ defensible comparable. Not a valuation.',
    });
  }

  const output = {
    study: 'V1.2_OFFICIAL_HMLR_COMPARABLE_ASSESSMENT_SUFFICIENCY_CLOSURE',
    measuredAt: new Date().toISOString(),
    methodologyId: 'official-hmlr-residential-comparable-assessment',
    methodologyVersion: '1.1.0',
    paidProviderCalls: 0,
    cohortSelection: {
      criteria: 'Same 6 genuine HMLR Price Paid subjects used in prior AVM readiness studies (deterministic IDs).',
      n: matrix.length,
    },
    comparableSideAttributeCoverage: {
      note: 'HMLR PPD does not store bedrooms/bathrooms/internal area. Counts below are schema reality, not enrichment.',
      sample: coverage.rows[0] || null,
    },
    explainPostcodeCandidateQuery: explainPostcode,
    funnel: {
      subjects: matrix.length,
      withCandidates: matrix.filter((s) => (s.candidateCount || 0) > 0).length,
      hardEligible: matrix.filter((s) => (s.eligibleCount || 0) > 0).length,
      relevantMarket: matrix.filter((s) => (s.relevantMarketTransactionCount || 0) > 0).length,
      defensibleComparables: matrix.filter((s) => (s.defensibleComparableCount || 0) > 0).length,
      assessed: matrix.filter((s) => s.assessment === 'ASSESSED').length,
      marketContext: matrix.filter((s) => s.assessment === 'MARKET_CONTEXT').length,
      insufficient: matrix.filter((s) => s.assessment === 'INSUFFICIENT_EVIDENCE').length,
      notApplicable: matrix.filter((s) => s.assessment === 'NOT_APPLICABLE').length,
      unavailable: matrix.filter((s) => s.assessment === 'UNAVAILABLE').length,
    },
    matrix,
  };

  const outPath = path.join(__dirname, 'official-hmlr-comparable-assessment-validation-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ funnel: output.funnel, outPath }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
