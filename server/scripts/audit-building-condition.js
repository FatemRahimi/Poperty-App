/**
 * Read-only aggregate of physical/energy artefacts.
 * Does not print private file contents or invent surveys.
 * Run: node scripts/audit-building-condition.js
 */
require('dotenv').config();
const pool = require('../models/db');

function bump(map, key) {
  const label = key == null || key === '' ? '(empty)' : String(key);
  map[label] = (map[label] || 0) + 1;
}

async function run() {
  const properties = await pool.query(
    `SELECT epc_rating, layout_file_url, epc_document_url
       FROM properties`
  );
  let photoRows = { rows: [{ n: 0 }] };
  try {
    photoRows = await pool.query(`SELECT COUNT(*)::int AS n FROM property_images`);
  } catch {
    /* table may be absent in some environments */
  }
  const analyses = await pool.query(
    `SELECT output_data
       FROM ai_requests
      WHERE request_type = 'property_intelligence'
        AND output_data IS NOT NULL`
  );

  const counts = {
    properties: properties.rows.length,
    listingsWithEpcRating: 0,
    epcRatingFrequencies: {},
    listingsWithFloorPlan: 0,
    listingsWithEpcDocument: 0,
    photoRows: photoRows.rows[0]?.n || 0,
    conditionLabels: 0,
    renovationLabels: 0,
    surveysStored: 0,
    structuralDocumentsStored: 0,
    analyses: analyses.rows.length,
    analysesWithBuildRisks: 0,
    analysesWithBuildingConditionDomain: 0,
    analysesWithEpcFact: 0,
    assetClassBreakdown: {},
  };

  properties.rows.forEach((row) => {
    if (row.epc_rating) {
      counts.listingsWithEpcRating += 1;
      bump(counts.epcRatingFrequencies, String(row.epc_rating).toUpperCase());
    }
    if (row.layout_file_url) counts.listingsWithFloorPlan += 1;
    if (row.epc_document_url) counts.listingsWithEpcDocument += 1;
  });

  analyses.rows.forEach((row) => {
    const output = row.output_data || {};
    if (output.buildingConditionDomain) counts.analysesWithBuildingConditionDomain += 1;
    if (Array.isArray(output.risks) && output.risks.length) counts.analysesWithBuildRisks += 1;
    if (output.propertyFacts?.facts?.epcRating?.available === true) counts.analysesWithEpcFact += 1;
    bump(counts.assetClassBreakdown, output.assetClassification?.assetClass || '(none)');
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
