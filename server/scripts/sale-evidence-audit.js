/**
 * V1.2 — Residential Sale Evidence Activation: Audit Script
 * Read-only. No production code changes.
 * Run: node server/scripts/sale-evidence-audit.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { canonicalPropertyTypeToken } = require('../utils/canonicalPropertyType');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const {
  buildValuationSaleRequest,
  mapToPropertyDataType,
} = require('../services/providers/propertyData/propertyTypeMapping');

function extractAreaFromDescription(desc) {
  if (!desc) return null;
  const sqft = desc.match(/(\d[\d,]*)\s*(sq\.?\s*ft|sqft|square\s*feet)/i);
  const sqm = desc.match(/(\d[\d,]*)\s*(sq\.?\s*m|sqm|square\s*met)/i);
  return {
    sqftMention: sqft ? sqft[0] : null,
    sqmMention: sqm ? sqm[0] : null,
  };
}

(async () => {
  // Load all sale+price subjects
  const sale = await pool.query(`
    SELECT p.id, p.property_type, p.square_feet, p.floor_area, p.floor_area_unit,
           p.zip_code, p.bedrooms, p.year_built, p.description,
           p.price, p.user_id,
           pi.uprn, pi.paon, pi.saon, pi.building_name,
           e.attachment_status AS epb_status,
           e.facts->>'totalFloorAreaSqm' AS epb_sqm,
           e.certificate_type AS epb_cert_type
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    LEFT JOIN official_epb_certificates e
      ON e.property_id = p.id AND e.is_current = TRUE
    WHERE p.category = 'sale' AND p.price > 0
    ORDER BY p.id
  `);

  const ids = sale.rows.map((r) => r.id);

  // Load uprn_profile enrichments
  const enrichRows = await pool.query(
    `SELECT property_id, enrichment_type, payload FROM property_enrichments
     WHERE property_id = ANY($1) AND enrichment_type = 'uprn_profile'`,
    [ids]
  );
  const uprnProfiles = {};
  enrichRows.rows.forEach((e) => {
    const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : (e.payload || {});
    uprnProfiles[e.property_id] = p;
  });

  // Load all enrichment types present for sale subjects
  const allEnrich = await pool.query(
    `SELECT property_id, enrichment_type FROM property_enrichments WHERE property_id = ANY($1)`,
    [ids]
  );
  const enrichTypes = {};
  allEnrich.rows.forEach((e) => {
    if (!enrichTypes[e.property_id]) enrichTypes[e.property_id] = [];
    if (!enrichTypes[e.property_id].includes(e.enrichment_type)) {
      enrichTypes[e.property_id].push(e.enrichment_type);
    }
  });

  const matrix = [];
  for (const row of sale.rows) {
    const token = canonicalPropertyTypeToken(row.property_type);
    const mapped = mapToPropertyDataType(row.property_type);
    const profile = uprnProfiles[row.id] || null;
    const uprnArea = profile
      ? (profile.internalArea || profile.internal_area || profile.data?.internal_area || null)
      : null;
    const descMentions = extractAreaFromDescription(row.description);
    const featMentions = { sqftMention: null, sqmMention: null };

    // Run canonical resolver
    const resolution = await resolveCanonicalInternalArea({
      property: row,
      identity: { uprn: row.uprn, saon: row.saon },
      loadPersistedEpb: true,
    });
    const applied = applyCanonicalInternalAreaToProperty(row, resolution);
    const avm = buildValuationSaleRequest(applied);

    // Detect latent structured evidence not yet consumed
    const latentStructured = [];
    if (uprnArea && !resolution.available) {
      latentStructured.push('uprn_profile_has_area_but_not_in_resolver_path');
    }
    if (row.epb_sqm && row.epb_status !== 'UNIQUE_ATTACH' && !resolution.available) {
      latentStructured.push(`epb_sqm_present_but_status_${row.epb_status}_not_UNIQUE_ATTACH`);
    }

    matrix.push({
      id: row.id,
      property_type_raw: row.property_type,
      canonical_type_token: token,
      canonical_type_mapped: mapped,
      type_blocker:
        !mapped
          ? (token ? 'token_not_in_propertydata_map' : 'token_ambiguous_or_null')
          : null,
      raw_square_feet: row.square_feet,
      raw_floor_area: row.floor_area,
      raw_floor_area_unit: row.floor_area_unit,
      epb_status: row.epb_status,
      epb_sqm: row.epb_sqm,
      epb_cert_type: row.epb_cert_type,
      uprn: row.uprn,
      saon: row.saon,
      uprn_profile_area: uprnArea,
      description_sqft_mention: descMentions.sqftMention,
      description_sqm_mention: descMentions.sqmMention,
      feature_sqft_mention: featMentions.sqftMention,
      feature_sqm_mention: featMentions.sqmMention,
      persisted_enrichment_types: enrichTypes[row.id] || [],
      canonical_area_available: resolution.available,
      canonical_area_source: resolution.selectedSource,
      canonical_area_sqft: resolution.normalisedValueSqft,
      canonical_readiness: resolution.readiness,
      avm_readiness: avm.readiness,
      provider_eligible: avm.readiness?.state === 'PROVIDER_ELIGIBLE',
      latent_structured_evidence: latentStructured,
    });
  }

  // Summarise unmapped types
  const unmapped = matrix.filter((r) => !r.canonical_type_mapped);
  const missingArea = matrix.filter(
    (r) => r.avm_readiness?.reasonCode === 'MISSING_INTERNAL_AREA'
  );
  const invalidArea = matrix.filter(
    (r) => r.avm_readiness?.reasonCode === 'INVALID_INTERNAL_AREA'
  );
  const eligible = matrix.filter((r) => r.provider_eligible);

  const output = {
    study: 'V1.2_SALE_EVIDENCE_ACTIVATION_AUDIT',
    measuredAt: new Date().toISOString(),
    summary: {
      totalSaleSubjects: matrix.length,
      providerEligible: eligible.length,
      missingInternalArea: missingArea.length,
      invalidInternalArea: invalidArea.length,
      unmappedPropertyType: unmapped.length,
      withEpbArea: matrix.filter((r) => r.epb_sqm).length,
      withUprnProfile: matrix.filter((r) => r.uprn_profile_area != null).length,
      withDescriptionAreaMention: matrix.filter(
        (r) => r.description_sqft_mention || r.description_sqm_mention
      ).length,
      withLatentStructuredEvidence: matrix.filter((r) => r.latent_structured_evidence.length > 0).length,
    },
    unmappedTypes: unmapped.map((r) => ({
      id: r.id,
      raw: r.property_type_raw,
      token: r.canonical_type_token,
    })),
    invalidAreaSubjects: invalidArea.map((r) => ({
      id: r.id,
      raw_square_feet: r.raw_square_feet,
      raw_floor_area: r.raw_floor_area,
      raw_floor_area_unit: r.raw_floor_area_unit,
      readiness: r.canonical_readiness,
    })),
    matrix,
  };

  const outPath = path.join(__dirname, 'sale-evidence-audit-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify(output.summary, null, 2));
  console.log('\nUnmapped types:');
  console.log(JSON.stringify(output.unmappedTypes, null, 2));
  console.log('\nInvalid area subjects:');
  console.log(JSON.stringify(output.invalidAreaSubjects, null, 2));
  console.log('\nEligible subjects:');
  console.log(JSON.stringify(eligible.map((r) => ({ id: r.id, src: r.canonical_area_source, sqft: r.canonical_area_sqft })), null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
