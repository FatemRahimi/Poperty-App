/**
 * Six-subject readiness matrix after attribute contract + readiness fix.
 * ZERO /valuation-sale calls. Does not invent facts for the genuine cohort.
 * node server/scripts/subject-property-attributes-readiness.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { acquireOfficialEpbEvidence } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const {
  buildOfficialConstructionAgeEvidence,
} = require('../services/providers/mhclgEpb/officialConstructionAgeEvidence');
const { buildSubjectNativeValuationProperty } = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { mapToPropertyDataType } = require('../services/providers/propertyData/propertyTypeMapping');

const COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];
const TYPE = { D: 'detached', S: 'semi-detached', T: 'terraced' };

(async () => {
  const rows = (await pool.query(
    `SELECT source_transaction_id, postcode, paon, saon, street, uprn, property_type_code
     FROM official_sale_transactions WHERE live AND source_transaction_id = ANY($1)
     ORDER BY source_transaction_id`,
    [COHORT]
  )).rows;

  const matrix = [];
  for (const row of rows) {
    const property = buildSubjectNativeValuationProperty({
      uprn: row.uprn,
      postcode: row.postcode,
      propertyType: TYPE[row.property_type_code] || 'terraced',
      paon: row.paon,
      saon: row.saon,
    });
    const epb = await acquireOfficialEpbEvidence({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      deps: { skipCoalesce: true, persistOfficialEpbUprn: async () => ({ skipped: true }) },
    });
    const facts = epb.currentCertificate?.facts || {};
    const age = buildOfficialConstructionAgeEvidence({
      facts,
      certificateNumber: epb.currentCertificate?.certificateNumber,
      uprn: row.uprn,
    });
    const areaResolution = await resolveCanonicalInternalArea({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      loadPersistedEpb: false,
      epbEvidence: epb,
    });
    const applied = applyCanonicalInternalAreaToProperty(property, areaResolution);
    if (age.normalizedOfficialPeriod) {
      applied.construction_age_band = age.normalizedOfficialPeriod;
      applied.officialConstructionAge = age;
    }
    const readiness = buildValuationSaleRequest(applied);
    matrix.push({
      tx: row.source_transaction_id,
      postcode: row.postcode,
      fields: {
        postcode: Boolean(row.postcode),
        property_type: Boolean(mapToPropertyDataType(TYPE[row.property_type_code])),
        internal_area: Number(applied.square_feet) >= 300,
        construction_date: age.propertyDataMappable === true,
        bedrooms: false,
        bathrooms: false,
        finish_quality: false,
        outdoor_space: false,
        off_street_parking: false,
      },
      canRequestAvm: readiness.canRequestAvm === true,
      readinessState: readiness.readiness?.state,
      reasonCode: readiness.readiness?.reasonCode,
      missingFields: readiness.readiness?.missingFields || [],
      note: 'Genuine cohort: no synthetic USER_REPORTED facts written.',
    });
  }

  const output = {
    study: 'V1.2_AVM_COMPLETION_UX_COHORT_READINESS',
    measuredAt: new Date().toISOString(),
    liveValuationSaleCalls: 0,
    funnel: {
      genuine_hmlr_subjects: matrix.length,
      provider_eligible: matrix.filter((s) => s.canRequestAvm).length,
      blocked_finish_quality: matrix.filter((s) => (s.missingFields || []).includes('finish_quality')).length,
      blocked_bedrooms: matrix.filter((s) => (s.missingFields || []).includes('bedrooms')).length,
    },
    matrix,
    classificationHint: 'E_FINISH_QUALITY_INPUT_IS_DOMINANT_BLOCKER_OR_MULTI_FIELD_USER_INPUT',
  };
  const outPath = path.join(__dirname, 'avm-completion-ux-cohort-readiness-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ funnel: output.funnel, outPath }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
