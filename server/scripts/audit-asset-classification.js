/**
 * Read-only asset classification / listing-type audit.
 * Does not backfill, rewrite snapshots, or print private listing details.
 * Run: node scripts/audit-asset-classification.js
 */
require('dotenv').config();
const pool = require('../models/db');
const { previewLegacyBackfill } = require('../services/identity/legacyListingTypeMapping');
const repo = require('../services/identity/assetClassificationRepository');

async function run() {
  const totalProperties = await repo.countProperties();
  const frequencies = await repo.listListingTypeFrequencies();
  const preview = previewLegacyBackfill(
    frequencies.flatMap((row) => Array.from({ length: row.n }, () => ({
      property_category: row.property_category,
      property_type: row.property_type,
    })))
  );
  const stored = await repo.countByClass();

  const storedCounts = {
    UNKNOWN: 0,
    RESIDENTIAL: 0,
    COMMERCIAL: 0,
    INDUSTRIAL: 0,
    AGRICULTURAL: 0,
    LAND: 0,
    DEVELOPMENT_SITE: 0,
    MIXED_USE: 0,
  };
  const byState = {};
  const bySource = {};
  stored.forEach((row) => {
    storedCounts[row.asset_class] = (storedCounts[row.asset_class] || 0) + row.n;
    byState[row.classification_state] = (byState[row.classification_state] || 0) + row.n;
    bySource[row.source_type] = (bySource[row.source_type] || 0) + row.n;
  });

  const report = {
    totalProperties,
    listingTypeFrequencies: frequencies,
    mappingPreview: preview.counts,
    storedClassifications: storedCounts,
    storedByState: byState,
    storedBySource: bySource,
    unclassifiedListings: Math.max(0, totalProperties - stored.reduce((sum, row) => sum + row.n, 0)),
  };
  console.log(JSON.stringify(report, null, 2));
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
