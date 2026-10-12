/**
 * Bounded validation: listing capture → canonical resolver → AVM readiness.
 * Run: node server/scripts/listing-internal-area-capture-validation.js
 */
require('../config/loadEnv');
const pool = require('../models/db');
const {
  parseListingInternalAreaInput,
} = require('../services/identity/listingInternalAreaCapture');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');

async function ensureSchema() {
  await pool.query('ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_area NUMERIC');
}

async function analyseRow(row, label) {
  const beforeProperty = { ...row };
  const before = buildValuationSaleRequest(beforeProperty);
  const beforeResolution = await resolveCanonicalInternalArea({
    property: row,
    loadPersistedEpb: true,
  });

  return {
    id: row.id,
    label,
    before: {
      readiness: before.readiness,
      resolution: beforeResolution.readiness,
      square_feet: row.square_feet,
      floor_area: row.floor_area,
    },
  };
}

(async () => {
  await ensureSchema();

  const control = await pool.query(
    `SELECT * FROM properties WHERE id = 155`
  );
  const sample = control.rows[0];
  if (!sample) throw new Error('Property 155 not found');

  const before = await analyseRow(sample, 'control-before');

  const parsed = parseListingInternalAreaInput(
    { floor_area: 1200, floor_area_unit: 'sq_ft' },
    { mode: 'edit' }
  );
  const simulated = {
    ...sample,
    floor_area: parsed.fields.floor_area,
    square_feet: parsed.fields.square_feet,
    floor_area_unit: parsed.fields.floor_area_unit,
  };

  const resolution = await resolveCanonicalInternalArea({
    property: simulated,
    loadPersistedEpb: true,
  });
  const applied = applyCanonicalInternalAreaToProperty(simulated, resolution);
  const after = buildValuationSaleRequest(applied);

  const inventory = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE (square_feet > 0 OR floor_area > 0))::int AS with_area,
      COUNT(*) FILTER (WHERE category = 'sale' AND price > 0)::int AS sale_with_price,
      COUNT(*) FILTER (
        WHERE category = 'sale' AND price > 0 AND square_feet >= 300 AND square_feet <= 100000
      )::int AS sale_avm_area_listing_only
    FROM properties
  `);

  console.log(
    JSON.stringify(
      {
        note: 'Simulated TEST USER-SUPPLIED EVIDENCE on property 155 — not persisted unless separately saved',
        inventory: inventory.rows[0],
        controlProperty155: before,
        afterSimulatedCapture: {
          selectedSource: resolution.selectedSource,
          canonical_sqft: resolution.normalisedValueSqft,
          readiness: after.readiness,
          providerEligible: after.readiness?.state === 'PROVIDER_ELIGIBLE',
        },
        controlStillMissingWithoutInput: before.before.readiness.reasonCode,
      },
      null,
      2
    )
  );

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
