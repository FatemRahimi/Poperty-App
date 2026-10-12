/**
 * V1.2 — Official Real Property Validation Cohort
 * Read-only validation using existing HMLR Price Paid subjects.
 * Does NOT create listings. Does NOT fabricate attributes.
 * EPB may be called with ephemeral identity (no property.id → no EPB persist).
 * Live /valuation-sale is NOT called unless production path can run without a listing.
 *
 * node server/scripts/official-real-property-validation-cohort.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { acquireOfficialEpbEvidence, getEpbCapability } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const {
  resolveCanonicalInternalArea,
  applyCanonicalInternalAreaToProperty,
} = require('../services/identity/internalAreaResolution');
const {
  buildValuationSaleRequest,
  mapToPropertyDataType,
} = require('../services/providers/propertyData/propertyTypeMapping');
const { EPB_ATTACHMENT } = require('../architecture/epbEvidenceContract');
const { PPD_PROPERTY_TYPE } = require('../architecture/officialSaleTransaction');

const TYPE_TO_LISTING = {
  D: 'detached',
  S: 'semi-detached',
  T: 'terraced',
  F: 'flat',
};

function leakageAudit(avmRequest, historicalPrice) {
  const params = avmRequest?.params || {};
  const serialized = JSON.stringify(params);
  const priceStr = historicalPrice != null ? String(historicalPrice) : null;
  const priceInParams =
    priceStr
    && (serialized.includes(priceStr)
      || Object.values(params).some((v) => String(v) === priceStr));
  const forbiddenKeys = ['price', 'asking_price', 'askingPrice', 'sold_price', 'transaction_price', 'hmlr_price'];
  const forbiddenPresent = forbiddenKeys.filter((k) => Object.prototype.hasOwnProperty.call(params, k));
  return {
    historicalPriceGbp: historicalPrice,
    avmParamsKeys: Object.keys(params),
    historicalPricePresentInAvmParams: Boolean(priceInParams),
    forbiddenPriceKeysInParams: forbiddenPresent,
    leakageSafe: !priceInParams && forbiddenPresent.length === 0,
  };
}

function listingCouplingEvidence() {
  return {
    architectureIdentityKinds: ['LISTING', 'SUBJECT', 'PROPERTY', '...'],
    nonEquivalence: 'listingIsNotSubject: true (identityModel.js)',
    enrichmentGate: 'propertyEnrichmentService.js: fetchSaleValuation requires property.category === \'sale\'',
    lateFetchGate: 'fetchSaleValuationIfEligible: property.category !== \'sale\' → skip',
    persistenceGate: 'fetchAndPersistEnrichment / property_enrichments keyed by property.id (listing FK)',
    engineGate: 'propertyIntelligenceEngine assemblePropertyIntelligenceReport expects a properties-row listing',
    epbPersistGate: 'acquireOfficialEpbEvidence persists certificates only when property.id present',
    conclusion:
      'Production valuation-sale path is listing-coupled: requires an active properties row with category=sale and property.id. HMLR SUBJECT alone cannot enter that path without fabricating a listing.',
  };
}

(async () => {
  // Strongest identity: UPRN + postcode + PAON, residential D/S/T (houses) and F with SAON
  const houseCandidates = await pool.query(`
    SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
           town_city, property_type_code, tenure_code, uprn, inspire_id, category_type
    FROM official_sale_transactions
    WHERE live = TRUE
      AND uprn IS NOT NULL AND BTRIM(uprn) <> ''
      AND postcode IS NOT NULL AND BTRIM(postcode) <> ''
      AND paon IS NOT NULL AND BTRIM(paon) <> ''
      AND property_type_code IN ('D','S','T')
      AND (saon IS NULL OR BTRIM(saon) = '')
      AND price_present = TRUE
      AND transfer_date >= DATE '2018-01-01'
    ORDER BY transfer_date DESC
    LIMIT 8
  `);

  const flatCandidates = await pool.query(`
    SELECT source_transaction_id, price_gbp, transfer_date, postcode, paon, saon, street,
           town_city, property_type_code, tenure_code, uprn, inspire_id, category_type
    FROM official_sale_transactions
    WHERE live = TRUE
      AND uprn IS NOT NULL AND BTRIM(uprn) <> ''
      AND postcode IS NOT NULL AND BTRIM(postcode) <> ''
      AND paon IS NOT NULL AND BTRIM(paon) <> ''
      AND saon IS NOT NULL AND BTRIM(saon) <> ''
      AND property_type_code = 'F'
      AND price_present = TRUE
      AND transfer_date >= DATE '2018-01-01'
    ORDER BY transfer_date DESC
    LIMIT 2
  `);

  const picked = [...houseCandidates.rows.slice(0, 6), ...flatCandidates.rows.slice(0, 2)];
  const capability = getEpbCapability(propertyIntelligenceConfig.providers.mhclgEpb);

  const subjects = [];
  for (const row of picked) {
    const listingType = TYPE_TO_LISTING[row.property_type_code] || null;
    const identity = {
      postcode: row.postcode,
      paon: row.paon,
      saon: row.saon || null,
      uprn: row.uprn,
      street: row.street,
    };
    // Ephemeral property — NO id → EPB search allowed, no listing fabricate, no EPB persist
    const ephemeralProperty = {
      // deliberately no id
      zip_code: row.postcode,
      property_type: listingType,
      category: 'sale', // only for readiness probe of request builder — NOT a persisted listing
      price: null, // CRITICAL: do not seed historical HMLR price as asking price
      square_feet: null,
      floor_area: null,
      floor_area_unit: null,
      year_built: null,
    };

    let epb = {
      attempted: false,
      status: null,
      unique: false,
      floorAreaSqm: null,
      domestic: null,
      uprnFromEpb: null,
    };

    if (capability.available) {
      try {
        const result = await acquireOfficialEpbEvidence({
          property: ephemeralProperty,
          identity,
          deps: {
            skipCoalesce: true,
            // Do not persist UPRN into property_identities — no listing id
            persistOfficialEpbUprn: async () => ({ skipped: true }),
          },
        });
        const status = result.status || result.attachmentStatus;
        const unique =
          status === EPB_ATTACHMENT.UNIQUE_ATTACH
          || result.attachmentStatus === EPB_ATTACHMENT.UNIQUE_ATTACH;
        const sqm = result.client?.current?.floorAreaSqm
          ?? result.currentCertificate?.facts?.totalFloorAreaSqm
          ?? null;
        const certType = result.client?.certificateType
          || result.currentCertificate?.certificateType
          || null;
        epb = {
          attempted: Boolean(result.searchAttempted) || status === EPB_ATTACHMENT.UNRESOLVED_UNIT_IDENTITY,
          status,
          unique: Boolean(unique),
          floorAreaSqm: sqm != null ? Number(sqm) : null,
          domestic: certType ? !String(certType).toUpperCase().includes('NON_DOMESTIC') : null,
          uprnFromEpb: result.uprn || result.client?.current?.uprn || null,
          reason: result.reason || null,
        };
      } catch (err) {
        epb = { attempted: true, status: 'SOURCE_ERROR', unique: false, floorAreaSqm: null, error: err.message };
      }
    } else {
      epb = { attempted: false, status: 'UNAVAILABLE_MISSING_CREDENTIAL', unique: false, floorAreaSqm: null };
    }

    // Feed EPB observation into resolver without DB property id
    const epbEvidence = epb.unique && epb.floorAreaSqm != null
      ? {
          client: {
            attachmentStatus: 'UNIQUE_ATTACH',
            certificateType: epb.domestic === false ? 'NON_DOMESTIC' : 'DOMESTIC',
            current: { floorAreaSqm: epb.floorAreaSqm },
          },
        }
      : null;

    const resolution = await resolveCanonicalInternalArea({
      property: ephemeralProperty,
      identity,
      epbEvidence,
      loadPersistedEpb: false,
    });
    const applied = applyCanonicalInternalAreaToProperty(ephemeralProperty, resolution);
    const avm = buildValuationSaleRequest(applied);
    const leak = leakageAudit(avm, row.price_gbp);

    subjects.push({
      source_transaction_id: row.source_transaction_id,
      transfer_date: row.transfer_date,
      historical_sold_price_gbp: Number(row.price_gbp),
      postcode: row.postcode,
      paon: row.paon,
      saon: row.saon || null,
      street: row.street,
      town: row.town_city,
      property_type_code: row.property_type_code,
      property_type_label: PPD_PROPERTY_TYPE[row.property_type_code] || null,
      listing_type_token: listingType,
      mapped_propertydata_type: mapToPropertyDataType(listingType),
      uprn: row.uprn,
      inspire_id: row.inspire_id,
      identity_sufficient: Boolean(row.postcode && row.paon),
      epb,
      canonical_area_available: resolution.available,
      canonical_area_sqft: resolution.normalisedValueSqft,
      canonical_area_source: resolution.selectedSource,
      provider_eligible: avm.readiness?.state === 'PROVIDER_ELIGIBLE',
      avm_readiness: avm.readiness,
      can_request_avm: avm.canRequestAvm === true,
      leakage: leak,
      valuation_sale_called: false,
      valuation_sale_skipped_reason:
        'Production path requires properties.id + category=sale listing; fabricating a listing is forbidden in this phase.',
      assessed: null,
    });
  }

  const funnel = {
    hmlr_candidates_selected: subjects.length,
    sufficient_identity: subjects.filter((s) => s.identity_sufficient).length,
    epb_attempted: subjects.filter((s) => s.epb.attempted).length,
    unique_epb: subjects.filter((s) => s.epb.unique).length,
    official_area: subjects.filter((s) => s.epb.floorAreaSqm != null && s.epb.unique).length,
    canonical_area: subjects.filter((s) => s.canonical_area_available).length,
    provider_eligible: subjects.filter((s) => s.provider_eligible).length,
    leakage_safe: subjects.filter((s) => s.leakage.leakageSafe).length,
    valuation_sale_called: 0,
    provider_evidence_returned: 0,
    valid_valuation_component: 0,
    assessed: 0,
    historical_outcome_comparison: 0,
  };

  const coupling = listingCouplingEvidence();

  const output = {
    study: 'V1.2_OFFICIAL_REAL_PROPERTY_VALIDATION_COHORT',
    measuredAt: new Date().toISOString(),
    preflight: {
      residential_sale_evidence_activation: 'ALREADY_COMPLETED — not repeated',
      synthetic_sale_inventory: 'NOT_REUSED',
      listing_vs_subject: 'DISTINCT (IDENTITY_NON_EQUIVALENCE.listingIsNotSubject)',
      owner_listings_required: false,
    },
    hmlr_stock: {
      note: 'From prior count query',
      total_live: 31525946,
      with_uprn: 94112,
    },
    epb_credential_available: capability.available,
    funnel,
    listing_coupling: coupling,
    subjects,
    next_classification_candidate: 'B_SUBJECT_MODEL_TOO_LISTING_COUPLED',
  };

  const outPath = path.join(__dirname, 'official-real-property-validation-cohort-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify({ funnel, eligible: subjects.filter((s) => s.provider_eligible).map((s) => s.source_transaction_id), epb_unique: subjects.filter((s) => s.epb.unique).length }, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
