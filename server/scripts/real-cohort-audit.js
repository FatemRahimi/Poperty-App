/**
 * V1.2 — Real Residential Validation Cohort: pre-flight audit.
 * Read-only. Identifies genuine-address properties already in the database.
 */
require('../config/loadEnv');
const pool = require('../models/db');

// UK postcode regex (tolerant of spacing, case-insensitive stored values)
const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i;

(async () => {
  const all = await pool.query(`
    SELECT p.id, p.category, p.property_type, p.zip_code, p.price, p.monthly_rent,
           p.square_feet, p.floor_area, p.floor_area_unit, p.status,
           pi.paon, pi.saon, pi.uprn, pi.building_name,
           e.attachment_status AS epb_status,
           e.facts->>'totalFloorAreaSqm' AS epb_sqm,
           e.certificate_type AS epb_cert_type
    FROM properties p
    LEFT JOIN property_identities pi ON pi.property_id = p.id
    LEFT JOIN official_epb_certificates e ON e.property_id = p.id AND e.is_current = TRUE
    ORDER BY p.id
  `);

  const rows = all.rows.map((r) => {
    const postcodeRaw = (r.zip_code || '').trim();
    const isValidPostcode = UK_POSTCODE_RE.test(postcodeRaw);
    const hasPaon = Boolean(r.paon && r.paon.trim() !== '');
    const hasSaon = Boolean(r.saon && r.saon.trim() !== '');
    const hasUprn = Boolean(r.uprn && r.uprn.trim() !== '');
    const isUnitLike = /flat|apartment|maisonette|studio/i.test(r.property_type || '');
    const hasEpbFloorArea = r.epb_sqm != null;
    const hasListingArea = r.square_feet != null || r.floor_area != null;
    const isResidential = !/commercial|warehouse|office|retail|industrial|land/i.test(r.property_type || '');

    // Compute a "real address confidence" score
    const realScore = (isValidPostcode ? 2 : 0) + (hasPaon ? 1 : 0) + (hasUprn ? 2 : 0);

    return {
      id: r.id,
      category: r.category,
      property_type: r.property_type,
      postcode: postcodeRaw,
      valid_postcode: isValidPostcode,
      paon: r.paon,
      saon: r.saon,
      uprn: r.uprn,
      has_paon: hasPaon,
      has_saon: hasSaon,
      has_uprn: hasUprn,
      is_unit_like: isUnitLike,
      is_residential: isResidential,
      epb_status: r.epb_status,
      epb_sqm: r.epb_sqm,
      epb_cert_type: r.epb_cert_type,
      has_epb_floor_area: hasEpbFloorArea,
      has_listing_area: hasListingArea,
      price: r.price,
      monthly_rent: r.monthly_rent,
      real_score: realScore,
    };
  });

  // Tier 1: UPRN confirmed (proven real by EPB unique attach)
  const tier1 = rows.filter((r) => r.has_uprn && r.valid_postcode && r.is_residential);
  // Tier 2: Valid postcode + PAON + no UPRN yet
  const tier2 = rows.filter((r) => !r.has_uprn && r.valid_postcode && r.has_paon && r.is_residential);
  // Synthetic: malformed postcode
  const synthetic = rows.filter((r) => !r.valid_postcode && r.is_residential);

  console.log(JSON.stringify({
    total: rows.length,
    tier1_uprn_confirmed: tier1.length,
    tier2_valid_postcode_paon: tier2.length,
    synthetic_malformed_postcode: synthetic.length,
    tier1,
    tier2: tier2.slice(0, 20), // first 20
    synthetic_ids: synthetic.map((r) => r.id),
  }, null, 2));

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
