/**
 * Read-only aggregate of existing planning evidence on saved PI reports.
 * Does not re-query planning, backfill, or print private listing details.
 * Run: node scripts/audit-planning-domain.js
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
    withPlanningFact: 0,
    withPlanningDomain: 0,
    subjectApplicationRecords: 0,
    nearbyApplicationRecords: 0,
    available: 0,
    notAssessed: 0,
    unavailable: 0,
    missingCoordinates: 0,
    withProvenanceSource: 0,
    emptyReturned: 0,
  };

  result.rows.forEach((row) => {
    const output = row.output_data || {};
    const fact = output.propertyFacts?.facts?.planning || output.property?.propertyFacts?.facts?.planning;
    const envelope = output.planningDomain;
    if (envelope) counts.withPlanningDomain += 1;
    if (!fact) return;
    counts.withPlanningFact += 1;
    if (fact.available === true) counts.available += 1;
    else if (fact.unavailableReason === 'provider_unavailable' || fact.unavailableReason === 'malformed_provider_response') {
      counts.unavailable += 1;
    } else {
      counts.notAssessed += 1;
    }
    if (fact.unavailableReason === 'property_location_unavailable') counts.missingCoordinates += 1;
    if (fact.source || fact.provenance?.source) counts.withProvenanceSource += 1;
    const subject = Array.isArray(fact.subjectApplications) ? fact.subjectApplications.length : 0;
    const nearby = Array.isArray(fact.nearbyApplications) ? fact.nearbyApplications.length : 0;
    counts.subjectApplicationRecords += subject;
    counts.nearbyApplicationRecords += nearby;
    if (fact.available === true && subject === 0 && nearby === 0) counts.emptyReturned += 1;
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
