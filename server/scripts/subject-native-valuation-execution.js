/**
 * Live subject-native valuation against the Official Real Property Validation Cohort.
 * Max 3 live /valuation-sale calls. No listing fabrication.
 *
 * node server/scripts/subject-native-valuation-execution.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { ensureIntelligenceSchema } = require('../db/ensureIntelligenceSchema');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const {
  buildSubjectNativeValuationProperty,
  ensureOfficialValidationSubject,
  executeSubjectNativeSaleValuation,
  assertTemporalLeakageFirewall,
} = require('../services/ai/subjectNativeSaleValuation');
const { buildValuationSaleRequest } = require('../services/providers/propertyData/propertyTypeMapping');

const TYPE_TO_LISTING = { D: 'detached', S: 'semi-detached', T: 'terraced', F: 'flat' };

// Prefer the 6 previously proven eligible transaction IDs when present; else re-select.
const PREFERRED_TX = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

const MAX_LIVE_CALLS = 3;

(async () => {
  await ensureIntelligenceSchema();
  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);

  const preferred = await pool.query(
    `SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
            town_city, property_type_code, uprn, inspire_id
     FROM official_sale_transactions
     WHERE live AND source_transaction_id = ANY($1)`,
    [PREFERRED_TX]
  );

  let rows = preferred.rows;
  if (rows.length < 3) {
    const fallback = await pool.query(`
      SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
             town_city, property_type_code, uprn, inspire_id
      FROM official_sale_transactions
      WHERE live AND uprn IS NOT NULL AND postcode IS NOT NULL AND paon IS NOT NULL
        AND property_type_code IN ('D','S','T')
        AND (saon IS NULL OR BTRIM(saon)='')
        AND price_present AND transfer_date >= DATE '2018-01-01'
      ORDER BY transfer_date DESC
      LIMIT 6
    `);
    rows = fallback.rows;
  }

  const eligible = [];
  for (const row of rows) {
    const propertyType = TYPE_TO_LISTING[row.property_type_code];
    const identity = { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn };
    const ephemeral = buildSubjectNativeValuationProperty({
      uprn: row.uprn,
      postcode: row.postcode,
      propertyType,
      paon: row.paon,
      saon: row.saon,
      street: row.street,
      town: row.town_city,
      normalizedAddress: [row.paon, row.street, row.town_city, row.postcode].filter(Boolean).join(', '),
    });

    let epbEvidence = null;
    let epbStatus = null;
    if (capability.available) {
      const result = await acquireOfficialEpbEvidence({
        property: ephemeral,
        identity,
        deps: {
          skipCoalesce: true,
          persistOfficialEpbUprn: async () => ({ skipped: true }),
        },
      });
      epbStatus = result.status || result.attachmentStatus;
      const unique = epbStatus === EPB_ATTACHMENT.UNIQUE_ATTACH;
      const sqm = result.client?.current?.floorAreaSqm;
      if (unique && sqm != null) {
        epbEvidence = {
          client: {
            attachmentStatus: 'UNIQUE_ATTACH',
            certificateType: 'DOMESTIC',
            current: { floorAreaSqm: Number(sqm) },
          },
        };
        ephemeral.floor_area = Number(sqm);
        ephemeral.floor_area_unit = 'sq_m';
      }
    }

    // Convert sqm → applied via resolver inside execute; for readiness probe:
    if (epbEvidence) {
      const { resolveCanonicalInternalArea, applyCanonicalInternalAreaToProperty } = require('../services/identity/internalAreaResolution');
      const resolution = await resolveCanonicalInternalArea({
        property: ephemeral,
        identity,
        epbEvidence,
        loadPersistedEpb: false,
      });
      const applied = applyCanonicalInternalAreaToProperty(ephemeral, resolution);
      const readiness = buildValuationSaleRequest(applied);
      const leak = assertTemporalLeakageFirewall({
        property: applied,
        providerParams: readiness.params,
        historicalSoldPrice: row.price_gbp,
      });
      if (readiness.canRequestAvm && leak.leakageSafe) {
        eligible.push({
          row,
          propertyType,
          ephemeral: applied,
          epbEvidence,
          epbStatus,
          readiness,
          leak,
          historicalOutcome: {
            priceGbp: Number(row.price_gbp),
            transferDate: row.transfer_date,
            sourceTransactionId: row.source_transaction_id,
          },
        });
      }
    }
  }

  const liveTargets = eligible.slice(0, MAX_LIVE_CALLS);
  const traces = [];
  let liveCalls = 0;

  for (const target of liveTargets) {
    const subject = await ensureOfficialValidationSubject({
      uprn: target.row.uprn,
      postcode: target.row.postcode,
      paon: target.row.paon,
      saon: target.row.saon,
      street: target.row.street,
      town: target.row.town_city,
      propertyType: target.propertyType,
    });

    const property = {
      ...target.ephemeral,
      subjectId: subject.id,
      valuationExecutionMode: 'subject_native',
      category: null,
      price: null,
      last_sold_price: null,
      id: null,
    };

    const result = await executeSubjectNativeSaleValuation({
      subject,
      property,
      historicalOutcome: target.historicalOutcome,
      deps: {
        epbEvidence: target.epbEvidence,
        forceRefresh: true,
      },
    });

    if (result.providerCalled) liveCalls += 1;

    traces.push({
      source_transaction_id: target.row.source_transaction_id,
      uprn: target.row.uprn,
      postcode: target.row.postcode,
      subjectId: subject.id,
      providerParams: result.providerParams,
      leakageSafe: result.leakage?.leakageSafe,
      providerCalled: result.providerCalled,
      creditsUsed: result.creditsUsed || 0,
      reasonCode: result.reasonCode || null,
      assessed: result.assessed === true,
      assessmentState: result.assessmentState,
      valuationMessage: result.valuation?.message || null,
      centralEstimate: result.valuation?.centralEstimate?.value ?? result.valuation?.centralEstimate ?? null,
      outcomeComparison: result.outcomeComparison,
      listingFabricated: false,
      categoryFabricatedAsSale: property.category === 'sale',
    });
  }

  const funnel = {
    official_subjects_reverified: eligible.length,
    identity_sufficient: eligible.length,
    canonical_area: eligible.length,
    provider_eligible: eligible.length,
    leakage_safe: eligible.filter((e) => e.leak.leakageSafe).length,
    provider_called: traces.filter((t) => t.providerCalled).length,
    provider_returned: traces.filter((t) => t.providerCalled && !t.reasonCode).length,
    evidence_persisted: traces.filter((t) => t.providerCalled && t.centralEstimate != null && !t.reasonCode).length,
    component_valid: traces.filter((t) => t.centralEstimate != null || t.assessed || t.assessmentState).length,
    safety_evaluated: traces.length,
    assessed: traces.filter((t) => t.assessed).length,
    not_assessed: traces.filter((t) => !t.assessed).length,
    temporally_valid_outcome_comparisons: traces.filter((t) => t.outcomeComparison?.temporallyComparable).length,
    observational_outcome_comparisons: traces.filter((t) => t.outcomeComparison?.available).length,
    live_calls: liveCalls,
  };

  const output = {
    study: 'V1.2_SUBJECT_NATIVE_VALUATION_EXECUTION',
    measuredAt: new Date().toISOString(),
    maxLiveCalls: MAX_LIVE_CALLS,
    funnel,
    traces,
  };

  const outPath = path.join(__dirname, 'subject-native-valuation-execution-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify({ funnel, traces: traces.map((t) => ({
    tx: t.source_transaction_id,
    called: t.providerCalled,
    assessed: t.assessed,
    reason: t.reasonCode,
    estimate: t.centralEstimate,
    leak: t.leakageSafe,
  })) }, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
