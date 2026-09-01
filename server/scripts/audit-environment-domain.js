/**
 * Read-only aggregate of existing flood evidence on saved PI reports.
 * Does not re-query EA, backfill, or print private listing details.
 * Run: node scripts/audit-environment-domain.js
 */
require('dotenv').config();
const pool = require('../models/db');

async function run() {
  const result = await pool.query(
    `SELECT output_data
       FROM ai_requests
      WHERE request_type = 'property_intelligence'
        AND output_data IS NOT NULL`
  );

  const counts = {
    analyses: result.rows.length,
    withFloodFact: 0,
    assessedFloodFacts: 0,
    notAssessedFloodFacts: 0,
    unavailableFloodFacts: 0,
    zoneCategoryCounts: {},
    withProvenanceSource: 0,
    withEnvironmentDomain: 0,
  };

  result.rows.forEach((row) => {
    const output = row.output_data || {};
    const fact = output.propertyFacts?.facts?.flood || output.property?.propertyFacts?.facts?.flood;
    if (output.environmentDomain) counts.withEnvironmentDomain += 1;
    if (!fact) return;
    counts.withFloodFact += 1;
    if (fact.available === true) {
      counts.assessedFloodFacts += 1;
      const zone = fact.value || fact.categories?.riversAndSea || 'unknown_zone';
      counts.zoneCategoryCounts[zone] = (counts.zoneCategoryCounts[zone] || 0) + 1;
    } else if (
      fact.unavailableReason === 'provider_unavailable'
      || fact.unavailableReason === 'malformed_provider_response'
    ) {
      counts.unavailableFloodFacts += 1;
    } else {
      counts.notAssessedFloodFacts += 1;
    }
    if (fact.source || fact.provenance?.source) counts.withProvenanceSource += 1;
  });

  console.log(JSON.stringify(counts, null, 2));
}

run()
  .catch((err) => {
    console.error('Audit failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
