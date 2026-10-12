/**
 * Bounded validation for provenanced internal-area readiness.
 * Run: node server/scripts/internal-area-readiness-validation.js
 */
require('../config/loadEnv');
const pool = require('../models/db');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const { mapToPropertyDataType } = require('../services/providers/propertyData/propertyTypeMapping');
const { listEnrichmentsForProperty } = require('../services/enrichment/propertyEnrichmentService');

const SAMPLE_IDS = [155, 149, 147, 63, 123, 148, 133];

async function inventoryCounts() {
  const r = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE square_feet IS NOT NULL AND square_feet > 0)::int AS listing_sqft,
      COUNT(*) FILTER (WHERE category = 'sale' AND price > 0)::int AS sale_with_price
    FROM properties
  `);
  return r.rows[0];
}

async function propertyRow(id) {
  const r = await pool.query(
    `SELECT p.*, pi.uprn, pi.saon,
      e.attachment_status AS epb_status,
      e.facts->>'totalFloorAreaSqm' AS epb_sqm,
      e.certificate_type AS epb_cert_type
     FROM properties p
     LEFT JOIN property_identities pi ON pi.property_id = p.id
     LEFT JOIN official_epb_certificates e ON e.property_id = p.id AND e.is_current = TRUE
     WHERE p.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function uprnInternalArea(propertyId) {
  const rows = await listEnrichmentsForProperty(propertyId);
  const uprn = rows.find((r) => r.enrichment_type === 'uprn_profile' && r.source === 'PropertyData');
  if (!uprn?.payload) return null;
  const data = typeof uprn.payload === 'string' ? JSON.parse(uprn.payload) : uprn.payload;
  return data.internalArea || data.internal_area || data.data?.internal_area || null;
}

async function analyseProperty(row) {
  const before = buildValuationSaleRequest(row);
  const resolution = await resolveCanonicalInternalArea({
    property: row,
    identity: { uprn: row.uprn, saon: row.saon },
    loadPersistedEpb: true,
  });
  const applied = applyCanonicalInternalAreaToProperty(row, resolution);
  const after = buildValuationSaleRequest(applied);
  const enrichments = await listEnrichmentsForProperty(row.id);
  const valSale = enrichments.find((e) => e.enrichment_type === 'valuation_sale');
  return {
    id: row.id,
    subject: {
      uprn: row.uprn || null,
      saon: row.saon || null,
      property_type: row.property_type,
      mapped_type: mapToPropertyDataType(row.property_type),
    },
    listing_sqft: row.square_feet,
    epb_sqm: row.epb_sqm,
    uprn_area: await uprnInternalArea(row.id),
    observations: resolution.observations?.map((o) => ({
      source: o.source,
      rawValue: o.rawValue,
      rawUnit: o.rawUnit,
      normalisedValueSqft: o.normalisedValueSqft,
      subjectScope: o.subjectScope,
    })),
    selectedSource: resolution.selectedSource,
    canonical_sqft: resolution.normalisedValueSqft,
    provenance: resolution.provenance?.source || null,
    readiness_before: before.readiness,
    readiness_after: after.readiness,
    valuation_sale_persisted: Boolean(valSale),
    conflicts: resolution.conflicts?.length || 0,
  };
}

(async () => {
  const inventory = await inventoryCounts();
  const samples = [];
  for (const id of SAMPLE_IDS) {
    const row = await propertyRow(id);
    if (row) samples.push(await analyseProperty(row));
  }

  const afterReady = samples.filter((s) => s.readiness_after?.state === 'PROVIDER_ELIGIBLE').length;
  const stillMissing = samples.filter(
    (s) => s.readiness_after?.reasonCode === 'MISSING_INTERNAL_AREA'
  ).length;

  console.log(
    JSON.stringify(
      {
        inventory,
        sampleCount: samples.length,
        avmReadyAfter: afterReady,
        stillMissingInternalArea: stillMissing,
        samples,
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
