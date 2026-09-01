/**
 * Read-only aggregate of tenure / lease / designation fields.
 * Does not print private document content or invent title numbers.
 * Run: node scripts/audit-legal-title.js
 */
require('dotenv').config();
const pool = require('../models/db');

function bump(map, key) {
  const label = key == null || key === '' ? '(empty)' : String(key);
  map[label] = (map[label] || 0) + 1;
}

async function run() {
  const properties = await pool.query(
    `SELECT tenure, lease_term
       FROM properties`
  );
  const analyses = await pool.query(
    `SELECT output_data
       FROM ai_requests
      WHERE request_type = 'property_intelligence'
        AND output_data IS NOT NULL`
  );

  const counts = {
    properties: properties.rows.length,
    propertiesWithTenure: 0,
    tenureFrequencies: {},
    storedTitleNumbers: 0,
    storedLegalTitleDocuments: 0,
    analyses: analyses.rows.length,
    analysesWithTenureFact: 0,
    analysesWithLeaseStart: 0,
    analysesWithLeaseEnd: 0,
    analysesWithListedBuilding: 0,
    analysesWithConservationArea: 0,
    analysesWithArticle4: 0,
    analysesWithLegalTitleDomain: 0,
    tenureSources: {},
    missingTenureProvenance: 0,
    assetClassBreakdown: {},
  };

  properties.rows.forEach((row) => {
    if (row.tenure) {
      counts.propertiesWithTenure += 1;
      bump(counts.tenureFrequencies, String(row.tenure).toLowerCase());
    }
  });

  analyses.rows.forEach((row) => {
    const output = row.output_data || {};
    const facts = output.propertyFacts?.facts || {};
    if (output.legalTitleDomain) counts.analysesWithLegalTitleDomain += 1;
    if (facts.tenure) {
      counts.analysesWithTenureFact += 1;
      if (facts.tenure.source) bump(counts.tenureSources, facts.tenure.source);
      else if (facts.tenure.available === true) counts.missingTenureProvenance += 1;
    }
    if (facts.leaseStart?.available === true) counts.analysesWithLeaseStart += 1;
    if (facts.leaseEnd?.available === true) counts.analysesWithLeaseEnd += 1;
    if (facts.listedBuilding?.available === true) counts.analysesWithListedBuilding += 1;
    if (facts.conservationArea?.available === true) counts.analysesWithConservationArea += 1;
    if (facts.article4?.available === true) counts.analysesWithArticle4 += 1;
    const cls = output.assetClassification?.assetClass || '(none)';
    bump(counts.assetClassBreakdown, cls);
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
