/**
 * V1.2 — Official construction age wiring validation + optional live gate.
 * Reuses the exact 6 genuine HMLR subjects. Max 3 live /valuation-sale calls.
 * node server/scripts/official-construction-age-wiring.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { acquireOfficialEpbEvidence } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const {
  buildOfficialConstructionAgeEvidence,
} = require('../services/providers/mhclgEpb/officialConstructionAgeEvidence');
const {
  buildSubjectNativeValuationProperty,
  ensureOfficialValidationSubject,
  executeSubjectNativeSaleValuation,
  assertTemporalLeakageFirewall,
} = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');

const COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

const TYPE = { D: 'detached', S: 'semi-detached', T: 'terraced' };
const MAX_LIVE = 3;

(async () => {
  await ensureIntelligenceSchema();
  const rows = (await pool.query(
    `SELECT source_transaction_id, postcode, paon, saon, street, uprn, property_type_code, price_gbp, transfer_date
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
    const evidence = buildOfficialConstructionAgeEvidence({
      facts,
      certificateNumber: epb.currentCertificate?.certificateNumber || null,
      uprn: row.uprn,
    });
    const areaResolution = await resolveCanonicalInternalArea({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      loadPersistedEpb: false,
      epbEvidence: epb,
    });
    const applied = applyCanonicalInternalAreaToProperty(property, areaResolution);
    if (evidence.normalizedOfficialPeriod && !applied.year_built) {
      applied.construction_age_band = evidence.normalizedOfficialPeriod;
      applied.constructionAgeBand = evidence.normalizedOfficialPeriod;
      applied.officialConstructionAge = evidence;
    }
    const readiness = buildValuationSaleRequest(applied);
    const leak = assertTemporalLeakageFirewall({
      property: applied,
      providerParams: readiness.params,
      historicalSoldPrice: row.price_gbp,
    });

    matrix.push({
      tx: row.source_transaction_id,
      postcode: row.postcode,
      paon: row.paon,
      uprn: row.uprn,
      certificateNumber: epb.currentCertificate?.certificateNumber || null,
      attachment: epb.attachmentStatus || epb.status,
      schemaType: facts.schemaType || null,
      rawCodes: (evidence.buildingParts || []).map((p) => ({
        identifier: p.identifier,
        code: p.rawCode,
      })),
      mainDwellingCode: evidence.rawOfficialAgeCode,
      decodedPeriod: evidence.normalizedOfficialPeriod,
      assessment: evidence.assessment,
      ambiguity: evidence.ambiguity,
      propertyDataMappable: evidence.propertyDataMappable,
      propertyDataConstructionDate: evidence.propertyDataConstructionDate,
      propertyDataMappingReason: evidence.propertyDataMappingReason,
      floorAreaSqm: facts.totalFloorAreaSqm || null,
      canRequestAvm: readiness.canRequestAvm === true,
      readinessState: readiness.readiness?.state || null,
      readinessReason: readiness.readiness?.reasonCode || null,
      providerParams: readiness.params
        ? { ...readiness.params } // no secrets in params object
        : null,
      leakageSafe: leak.leakageSafe,
      historicalPriceGbp: row.price_gbp,
      transferDate: row.transfer_date,
    });
  }

  const funnel = {
    genuine_hmlr_subjects: matrix.length,
    raw_age_evidence: matrix.filter((s) => (s.rawCodes || []).some((p) => p.code)).length,
    parsed: matrix.filter((s) => s.mainDwellingCode).length,
    authoritatively_decoded: matrix.filter((s) => s.decodedPeriod).length,
    canonical: matrix.filter((s) => s.assessment === 'ASSESSED').length,
    safely_pd_mappable: matrix.filter((s) => s.propertyDataMappable).length,
    provider_eligible: matrix.filter((s) => s.canRequestAvm).length,
  };

  const liveEligible = matrix.filter((s) => s.canRequestAvm && s.leakageSafe);
  const liveCalls = [];
  let liveCount = 0;

  for (const subject of liveEligible) {
    if (liveCount >= MAX_LIVE) break;
    const row = rows.find((r) => r.source_transaction_id === subject.tx);
    const ensured = await ensureOfficialValidationSubject({
      uprn: row.uprn,
      postcode: row.postcode,
      paon: row.paon,
      saon: row.saon,
      street: row.street,
      propertyType: TYPE[row.property_type_code] || 'terraced',
    });
    const property = buildSubjectNativeValuationProperty({
      subjectId: ensured.id,
      uprn: row.uprn,
      postcode: row.postcode,
      propertyType: TYPE[row.property_type_code] || 'terraced',
      paon: row.paon,
      saon: row.saon,
      constructionAgeBand: subject.decodedPeriod,
    });
    property.officialConstructionAge = {
      propertyDataMappable: subject.propertyDataMappable,
      propertyDataConstructionDate: subject.propertyDataConstructionDate,
      normalizedOfficialPeriod: subject.decodedPeriod,
      rawOfficialAgeCode: subject.mainDwellingCode,
      schemaType: subject.schemaType,
      provenance: 'OFFICIAL_EPB',
    };

    const epb = await acquireOfficialEpbEvidence({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      deps: { skipCoalesce: true, persistOfficialEpbUprn: async () => ({ skipped: true }) },
    });

    liveCount += 1;
    const result = await executeSubjectNativeSaleValuation({
      subject: ensured,
      property,
      historicalOutcome: { priceGbp: row.price_gbp, transferDate: row.transfer_date },
      deps: { epbEvidence: epb },
    });

    liveCalls.push({
      tx: subject.tx,
      postcode: subject.postcode,
      subjectId: ensured.id,
      requestParams: subject.providerParams,
      success: result.success === true,
      reasonCode: result.reasonCode || null,
      providerCalled: result.providerCalled !== false && result.success !== false
        ? result.providerCalled !== false
        : result.providerCalled,
      providerStatus: result.provider?.status || result.providerStatus || null,
      enrichmentSubjectId: result.enrichment?.subject_id || result.persisted?.subjectId || null,
      valuationComponent: result.valuation?.state || result.component?.state || null,
      safety: result.safety || null,
      assessed: result.valuation?.state === 'ASSESSED' || result.assessed === true,
      message: result.message || null,
      leakage: result.leakage || null,
    });
  }

  const output = {
    study: 'V1.2_OFFICIAL_CONSTRUCTION_AGE_WIRING',
    measuredAt: new Date().toISOString(),
    authoritativeMapping: {
      source: 'MHCLG communitiesuk/epb-view-models Helper::XmlEnumsToOutput',
      file: 'lib/helper/xml_enums_to_output.rb',
      repository: 'https://github.com/communitiesuk/epb-view-models',
      applicability: 'E&W CONSTRUCTION_AGE_BAND; schema_type selects K/L overrides; NI table unused for this E&W cohort',
    },
    funnel,
    matrix,
    live: {
      maxAllowed: MAX_LIVE,
      attempted: liveCalls.length,
      calls: liveCalls,
    },
  };

  const outPath = path.join(__dirname, 'official-construction-age-wiring-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    funnel,
    liveAttempted: liveCalls.length,
    liveSummaries: liveCalls.map((c) => ({
      tx: c.tx,
      success: c.success,
      reasonCode: c.reasonCode,
      assessed: c.assessed,
    })),
    outPath,
  }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
