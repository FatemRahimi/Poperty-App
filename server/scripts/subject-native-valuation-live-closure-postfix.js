/**
 * Post-fix cohort eligibility check — no live PropertyData calls.
 * Confirms 6-subject HMLR cohort still EPB-unique and that construction_date
 * now correctly blocks PROVIDER_ELIGIBLE when official age is absent.
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const {
  buildSubjectNativeValuationProperty,
  assertTemporalLeakageFirewall,
} = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const { classifyProviderFailure } = require('../services/providers/cache/providerCostProtection');

const TYPE_TO_LISTING = { D: 'detached', S: 'semi-detached', T: 'terraced' };
const COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

(async () => {
  await ensureIntelligenceSchema();
  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);
  const rows = (await pool.query(
    `SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
            town_city, property_type_code, uprn
     FROM official_sale_transactions
     WHERE live AND source_transaction_id = ANY($1)`,
    [COHORT]
  )).rows;

  const subjects = [];
  for (const row of rows) {
    const propertyType = TYPE_TO_LISTING[row.property_type_code];
    const property = buildSubjectNativeValuationProperty({
      uprn: row.uprn,
      postcode: row.postcode,
      propertyType,
      paon: row.paon,
      saon: row.saon,
      normalizedAddress: [row.paon, row.street, row.town_city, row.postcode].filter(Boolean).join(', '),
    });
    const result = await acquireOfficialEpbEvidence({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      deps: { skipCoalesce: true, persistOfficialEpbUprn: async () => ({ skipped: true }) },
    });
    const status = result.status || result.attachmentStatus;
    const sqm = result.client?.current?.floorAreaSqm;
    const ageBand = result.client?.current?.constructionAgeBand || null;
    let readiness = null;
    let leak = null;
    if (status === EPB_ATTACHMENT.UNIQUE_ATTACH && sqm != null) {
      const epbEvidence = {
        client: {
          attachmentStatus: 'UNIQUE_ATTACH',
          certificateType: 'DOMESTIC',
          current: { floorAreaSqm: Number(sqm), constructionAgeBand: ageBand },
        },
      };
      const resolution = await resolveCanonicalInternalArea({
        property,
        identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
        epbEvidence,
        loadPersistedEpb: false,
      });
      const applied = applyCanonicalInternalAreaToProperty(property, resolution);
      if (ageBand) {
        applied.construction_age_band = ageBand;
        applied.constructionAgeBand = ageBand;
      }
      readiness = buildValuationSaleRequest(applied);
      leak = assertTemporalLeakageFirewall({
        property: applied,
        providerParams: readiness.params,
        historicalSoldPrice: row.price_gbp,
      });
    }
    subjects.push({
      tx: row.source_transaction_id,
      postcode: row.postcode,
      uprn: row.uprn,
      epbStatus: status,
      floorAreaSqm: sqm,
      constructionAgeBand: ageBand,
      readinessState: readiness?.readiness?.state || null,
      reasonCode: readiness?.readiness?.reasonCode || null,
      canRequestAvm: readiness?.canRequestAvm === true,
      leakageSafe: leak?.leakageSafe ?? null,
      params: readiness?.params || null,
    });
  }

  const priorForensic = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'subject-native-valuation-live-closure-output.json'), 'utf8')
  ).forensicFirst || JSON.parse(
    fs.readFileSync(path.join(__dirname, 'subject-native-valuation-live-closure-output.json'), 'utf8')
  ).forensic;

  // Re-read carefully - structure may vary
  let forensic = null;
  try {
    const prior = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'subject-native-valuation-live-closure-output.json'), 'utf8')
    );
    forensic = prior.forensicFirst || prior.forensic || prior.traces?.find((t) => t.kind === 'forensic_raw')?.forensic;
  } catch (_) {}

  const classified = classifyProviderFailure(new Error('Missing input: construction_date'));

  const output = {
    study: 'V1.2_SUBJECT_NATIVE_VALUATION_LIVE_CLOSURE_POSTFIX',
    measuredAt: new Date().toISOString(),
    epbCapability: capability.available,
    cohortSize: subjects.length,
    uniqueEpbWithArea: subjects.filter((s) => s.epbStatus === 'UNIQUE_ATTACH' && s.floorAreaSqm != null).length,
    withOfficialAgeBand: subjects.filter((s) => s.constructionAgeBand).length,
    providerEligibleAfterFix: subjects.filter((s) => s.canRequestAvm).length,
    subjects,
    priorLiveForensicPreserved: forensic,
    adapterClassificationNow: classified,
    additionalLiveCallsAfterFix: 0,
    note: 'No further live /valuation-sale calls: cohort lacks official construction age; inventing construction_date is forbidden.',
  };

  const outPath = path.join(__dirname, 'subject-native-valuation-live-closure-postfix-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify({
    cohortSize: output.cohortSize,
    uniqueEpbWithArea: output.uniqueEpbWithArea,
    withOfficialAgeBand: output.withOfficialAgeBand,
    providerEligibleAfterFix: output.providerEligibleAfterFix,
    adapterClassificationNow: classified,
    priorHttp: forensic?.httpStatus,
    priorMessage: forensic?.providerMessage,
  }, null, 2));

  await pool.end();
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
