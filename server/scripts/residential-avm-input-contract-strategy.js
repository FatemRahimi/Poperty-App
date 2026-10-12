/**
 * V1.2 — Residential AVM input contract & evidence strategy (diagnostic only).
 * ZERO /valuation-sale calls. No attribute acquisition implementation.
 * node server/scripts/residential-avm-input-contract-strategy.js
 */
require('../config/loadEnv');
const fs = require('fs');
const path = require('path');
const pool = require('../models/db');
const { propertyIntelligenceConfig } = require('../config/propertyIntelligence.config');
const { createMhclgEpbClient } = require('../services/providers/mhclgEpb/mhclgEpbClient');
const { acquireOfficialEpbEvidence } = require('../services/providers/mhclgEpb/mhclgEpbAcquisition');
const { buildSubjectNativeValuationProperty } = require('../services/ai/subjectNativeSaleValuation');
const {
  buildOfficialConstructionAgeEvidence,
} = require('../services/providers/mhclgEpb/officialConstructionAgeEvidence');
const { mapToPropertyDataType } = require('../services/providers/propertyData/propertyTypeMapping');
const { resolveCanonicalInternalArea, applyCanonicalInternalAreaToProperty } = require('../services/identity/internalAreaResolution');

const COHORT = [
  '{5834E4E8-9B5E-29C7-E063-4804A8C015BC}',
  '{5834E4E8-F46B-29C7-E063-4804A8C015BC}',
  '{5834E4E9-880F-29C7-E063-4804A8C015BC}',
  '{5834E4E8-66CF-29C7-E063-4804A8C015BC}',
  '{5834E4E8-7736-29C7-E063-4804A8C015BC}',
  '{5834E4E8-DAC3-29C7-E063-4804A8C015BC}',
];

const TYPE = { D: 'detached', S: 'semi-detached', T: 'terraced', F: 'flat', O: 'other' };

/** Authoritative PropertyData /valuation-sale contract (docs + valuation-options). */
const PROVIDER_CONTRACT = {
  sourceDocs: [
    'https://propertydata.co.uk/api/documentation/valuation-sale',
    'https://propertydata.co.uk/api/documentation/valuation-options',
  ],
  liveEvidence: [
    'HTTP 400 Missing input: construction_date (prior live)',
    'HTTP 400-class request_contract after construction_date supplied (3 live calls; scrubbed message)',
  ],
  fields: [
    {
      name: 'key',
      required: true,
      semantic: 'API authentication key',
      type: 'string',
      enums: null,
      units: null,
      constraints: 'account key',
      unknownAllowed: false,
      sentByAdapter: true,
      omissionRejects: true,
      note: 'Injected by client, not property attribute',
    },
    {
      name: 'postcode',
      required: true,
      semantic: 'Full UK postcode',
      type: 'string',
      enums: null,
      units: null,
      constraints: 'full postcode',
      unknownAllowed: false,
      sentByAdapter: true,
      omissionRejects: true,
    },
    {
      name: 'property_type',
      required: true,
      semantic: 'Dwelling type enum',
      type: 'enum',
      enums: ['flat', 'detached_house', 'terraced_house', 'semi-detached_house'],
      units: null,
      constraints: 'exact enum',
      unknownAllowed: false,
      sentByAdapter: true,
      omissionRejects: true,
    },
    {
      name: 'construction_date',
      required: true,
      semantic: 'Construction age band enum',
      type: 'enum',
      enums: ['pre_1914', '1914_2000', '2000_onwards'],
      units: null,
      constraints: 'exact enum; exact year not accepted',
      unknownAllowed: false,
      sentByAdapter: true,
      omissionRejects: true,
    },
    {
      name: 'internal_area',
      required: true,
      semantic: 'Internal floor area',
      type: 'number',
      enums: null,
      units: 'sqft',
      constraints: 'min 300',
      unknownAllowed: false,
      sentByAdapter: true,
      omissionRejects: true,
    },
    {
      name: 'bedrooms',
      required: true,
      semantic: 'Bedroom count',
      type: 'integer',
      enums: null,
      units: 'count',
      constraints: '0-5',
      unknownAllowed: false,
      sentByAdapter: 'conditional_if_gt_0',
      omissionRejects: true,
    },
    {
      name: 'bathrooms',
      required: true,
      semantic: 'Bathroom count',
      type: 'integer',
      enums: null,
      units: 'count',
      constraints: '0-5',
      unknownAllowed: false,
      sentByAdapter: 'conditional_if_gt_0',
      omissionRejects: true,
    },
    {
      name: 'finish_quality',
      required: true,
      semantic: 'Interior finish quality band',
      type: 'enum',
      enums: ['very_high', 'high', 'average', 'below_average', 'unmodernised'],
      units: null,
      constraints: 'exact enum',
      unknownAllowed: false,
      sentByAdapter: 'conditional_from_condition',
      omissionRejects: true,
    },
    {
      name: 'outdoor_space',
      required: true,
      semantic: 'Outdoor space category',
      type: 'enum',
      enums: ['none', 'balcony_terrace', 'garden', 'garden_very_large'],
      units: null,
      constraints: 'exact enum',
      unknownAllowed: false,
      sentByAdapter: 'conditional_garden_or_balcony',
      omissionRejects: true,
      note: 'Adapter never sends outdoor_space=none when garden absent',
    },
    {
      name: 'off_street_parking',
      required: true,
      semantic: 'Off-street parking spaces',
      type: 'integer',
      enums: null,
      units: 'count',
      constraints: '0-3',
      unknownAllowed: false,
      sentByAdapter: 'conditional_if_gt_0',
      omissionRejects: true,
      note: 'Adapter never sends 0 when parking unknown',
    },
    {
      name: 'output',
      required: false,
      semantic: 'Response format',
      type: 'enum',
      enums: ['json', 'pdf'],
      units: null,
      constraints: "default 'json'",
      unknownAllowed: true,
      sentByAdapter: true,
      omissionRejects: false,
    },
    {
      name: 'pdf_heading',
      required: false,
      semantic: 'Custom PDF heading when output=pdf',
      type: 'string',
      enums: null,
      units: null,
      constraints: 'only with pdf output',
      unknownAllowed: true,
      sentByAdapter: false,
      omissionRejects: false,
    },
  ],
};

const INTERESTING_KEY_RE = /bedroom|bathroom|habitable|room|floor|built.?form|property.?type|parking|garage|garden|outdoor|open.?space|construction|age|finish|condition|tenure|wall|roof|window|extension|storey|level|dwelling|sap_building|total_floor|number_habitable|heated_room/i;

function flattenKeys(obj, prefix = '', out = new Set(), depth = 0) {
  if (obj == null || depth > 6) return out;
  if (Array.isArray(obj)) {
    obj.slice(0, 5).forEach((item, i) => flattenKeys(item, `${prefix}[]`, out, depth + 1));
    return out;
  }
  if (typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${k}` : k;
    out.add(pathKey);
    if (v && typeof v === 'object') flattenKeys(v, pathKey, out, depth + 1);
  }
  return out;
}

function pickInteresting(raw) {
  const keys = [...flattenKeys(raw)];
  const interesting = keys.filter((k) => INTERESTING_KEY_RE.test(k));
  const samples = {};
  for (const key of interesting) {
    const parts = key.split('.');
    let cur = raw;
    for (const p of parts) {
      if (p === '[]') {
        cur = Array.isArray(cur) ? cur[0] : undefined;
      } else if (cur && typeof cur === 'object') {
        cur = cur[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur != null && typeof cur !== 'object') samples[key] = cur;
    else if (Array.isArray(cur)) samples[key] = `[array:${cur.length}]`;
  }
  return { interestingKeys: interesting.sort(), samples };
}

(async () => {
  const client = createMhclgEpbClient(propertyIntelligenceConfig.providers.mhclgEpb);
  const rows = (await pool.query(
    `SELECT source_transaction_id, postcode, paon, saon, street, uprn, property_type_code, price_gbp, transfer_date
     FROM official_sale_transactions WHERE live AND source_transaction_id = ANY($1)
     ORDER BY source_transaction_id`,
    [COHORT]
  )).rows;

  const subjects = [];
  const unionInterestingKeys = new Set();

  for (const row of rows) {
    const propertyType = TYPE[row.property_type_code] || null;
    const property = buildSubjectNativeValuationProperty({
      uprn: row.uprn,
      postcode: row.postcode,
      propertyType,
      paon: row.paon,
      saon: row.saon,
    });
    const epb = await acquireOfficialEpbEvidence({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      deps: { skipCoalesce: true, persistOfficialEpbUprn: async () => ({ skipped: true }) },
    });
    const certNo = epb.currentCertificate?.certificateNumber;
    const fetched = certNo ? await client.fetchCertificate(certNo) : { ok: false, data: null };
    const data = Array.isArray(fetched.data)
      ? fetched.data[0]
      : (fetched.data?.data || fetched.data);

    const interesting = pickInteresting(data || {});
    interesting.interestingKeys.forEach((k) => unionInterestingKeys.add(k));

    const facts = epb.currentCertificate?.facts || {};
    const age = buildOfficialConstructionAgeEvidence({
      facts,
      certificateNumber: certNo,
      uprn: row.uprn,
    });
    const areaResolution = await resolveCanonicalInternalArea({
      property,
      identity: { postcode: row.postcode, paon: row.paon, saon: row.saon, uprn: row.uprn },
      loadPersistedEpb: false,
      epbEvidence: epb,
    });
    const applied = applyCanonicalInternalAreaToProperty(property, areaResolution);
    const mappedType = mapToPropertyDataType(propertyType);

    // Explicit non-equivalence checks on raw EPB
    const rawHabitable =
      data?.number_habitable_rooms
      ?? data?.numberHabitableRooms
      ?? data?.habitable_rooms
      ?? null;
    const rawBedrooms =
      data?.bedrooms
      ?? data?.number_of_bedrooms
      ?? data?.numberOfBedrooms
      ?? null;
    const rawBathrooms =
      data?.bathrooms
      ?? data?.number_of_bathrooms
      ?? data?.numberOfBathrooms
      ?? null;
    const rawParking =
      data?.parking
      ?? data?.off_street_parking
      ?? data?.has_garage
      ?? null;
    const rawOutdoor =
      data?.outdoor_space
      ?? data?.has_garden
      ?? data?.garden
      ?? null;
    const rawFinish =
      data?.finish_quality
      ?? data?.condition
      ?? null;

    const cells = {
      postcode: {
        value: row.postcode,
        source: 'HMLR_PRICE_PAID',
        provenance: 'OFFICIAL_HMLR',
        assessment: 'ASSESSED',
        providerMappable: true,
      },
      property_type: {
        value: mappedType,
        source: 'HMLR_property_type_code',
        provenance: 'OFFICIAL_HMLR',
        assessment: mappedType ? 'ASSESSED' : 'NOT_ASSESSED',
        providerMappable: Boolean(mappedType),
        rawCode: row.property_type_code,
      },
      construction_date: {
        value: age.propertyDataConstructionDate,
        source: 'MHCLG_EPB_RdSAP_MainDwelling',
        provenance: 'OFFICIAL_EPB',
        assessment: age.propertyDataMappable ? 'ASSESSED' : 'NOT_ASSESSED',
        providerMappable: age.propertyDataMappable === true,
        rawCode: age.rawOfficialAgeCode,
        period: age.normalizedOfficialPeriod,
        reason: age.propertyDataMappingReason,
      },
      internal_area: {
        value: applied.square_feet || null,
        source: areaResolution.selectedSource || 'MHCLG_EPB',
        provenance: 'OFFICIAL_EPB',
        assessment: Number(applied.square_feet) >= 300 ? 'ASSESSED' : 'NOT_ASSESSED',
        providerMappable: Number(applied.square_feet) >= 300,
        sqm: facts.totalFloorAreaSqm || null,
      },
      bedrooms: {
        value: rawBedrooms,
        source: rawBedrooms != null ? 'EPB_RAW' : null,
        provenance: null,
        assessment: 'NOT_ASSESSED',
        providerMappable: false,
        note: rawHabitable != null
          ? `habitable_rooms=${rawHabitable} present but NOT equated to bedrooms`
          : 'no bedrooms field in raw certificate',
        relatedHabitableRooms: rawHabitable,
      },
      bathrooms: {
        value: rawBathrooms,
        source: null,
        provenance: null,
        assessment: 'NOT_ASSESSED',
        providerMappable: false,
        note: 'no bathrooms field observed',
      },
      finish_quality: {
        value: rawFinish,
        source: null,
        provenance: null,
        assessment: 'NOT_ASSESSED',
        providerMappable: false,
        note: 'EPC energy ratings are NOT finish_quality',
        energyRating: facts.currentEnergyRating || null,
      },
      outdoor_space: {
        value: rawOutdoor,
        source: null,
        provenance: null,
        assessment: 'NOT_ASSESSED',
        providerMappable: false,
        note: 'no outdoor_space/garden field observed as PD enum',
      },
      off_street_parking: {
        value: rawParking,
        source: null,
        provenance: null,
        assessment: 'NOT_ASSESSED',
        providerMappable: false,
        note: 'no parking field observed',
      },
    };

    const requiredOk = {
      postcode: cells.postcode.providerMappable,
      property_type: cells.property_type.providerMappable,
      construction_date: cells.construction_date.providerMappable,
      internal_area: cells.internal_area.providerMappable,
      bedrooms: cells.bedrooms.providerMappable,
      bathrooms: cells.bathrooms.providerMappable,
      finish_quality: cells.finish_quality.providerMappable,
      outdoor_space: cells.outdoor_space.providerMappable,
      off_street_parking: cells.off_street_parking.providerMappable,
    };

    subjects.push({
      tx: row.source_transaction_id,
      postcode: row.postcode,
      paon: row.paon,
      uprn: row.uprn,
      certificateNumber: certNo,
      schemaType: facts.schemaType || data?.schema_type || null,
      builtForm: facts.builtForm || data?.built_form || null,
      propertyTypeEpb: facts.propertyType || data?.property_type || null,
      epbInteresting: interesting,
      cells,
      requiredOk,
      completeProviderContract: Object.values(requiredOk).every(Boolean),
    });
  }

  // Listing field availability (platform capability — not this cohort's values)
  const listingCols = (await pool.query(
    `SELECT
       COUNT(*)::int AS n,
       COUNT(bedrooms) FILTER (WHERE bedrooms IS NOT NULL)::int AS bedrooms,
       COUNT(bathrooms) FILTER (WHERE bathrooms IS NOT NULL)::int AS bathrooms,
       COUNT(parking_spaces) FILTER (WHERE parking_spaces IS NOT NULL)::int AS parking,
       COUNT(*) FILTER (WHERE has_garden IS TRUE)::int AS has_garden_true,
       COUNT(*) FILTER (WHERE has_garage IS TRUE)::int AS has_garage_true,
       COUNT(year_built) FILTER (WHERE year_built IS NOT NULL)::int AS year_built,
       COUNT(square_feet) FILTER (WHERE square_feet IS NOT NULL AND square_feet > 0)::int AS square_feet
     FROM properties`
  )).rows[0];
  listingCols.condition_column = false;
  listingCols.condition_note = 'properties.condition column does not exist; finish_quality has no first-party listing field';

  const fieldCoverage = (field) => subjects.filter((s) => s.requiredOk[field]).length;
  const funnel = {
    genuine_hmlr_subjects: subjects.length,
    identity_complete: fieldCoverage('postcode'),
    area_complete: fieldCoverage('internal_area'),
    type_complete: fieldCoverage('property_type'),
    construction_complete: fieldCoverage('construction_date'),
    bedrooms_complete: fieldCoverage('bedrooms'),
    bathrooms_complete: fieldCoverage('bathrooms'),
    finish_complete: fieldCoverage('finish_quality'),
    outdoor_complete: fieldCoverage('outdoor_space'),
    parking_complete: fieldCoverage('off_street_parking'),
    COMPLETE_PROVIDER_CONTRACT: subjects.filter((s) => s.completeProviderContract).length,
  };

  const output = {
    study: 'V1.2_RESIDENTIAL_AVM_INPUT_CONTRACT_STRATEGY',
    measuredAt: new Date().toISOString(),
    liveValuationSaleCalls: 0,
    providerContract: PROVIDER_CONTRACT,
    adapterAudit: {
      readinessGatesToday: ['property_type', 'postcode', 'internal_area', 'construction_date'],
      claimedEligibleWithout: ['bedrooms', 'bathrooms', 'finish_quality', 'outdoor_space', 'off_street_parking'],
      mechanicalBug:
        'buildValuationSaleRequest marks PROVIDER_ELIGIBLE while omitting five documented required fields — local contract incomplete/wrong relative to authoritative docs and live rejections',
      classifications: {
        postcode: 'A_CORRECTLY_SUPPORTED',
        property_type: 'A_CORRECTLY_SUPPORTED',
        construction_date: 'A_CORRECTLY_SUPPORTED',
        internal_area: 'A_CORRECTLY_SUPPORTED',
        bedrooms: 'B_SUPPORTED_BUT_NOT_SUBJECT_NATIVE_AND_NOT_GATED',
        bathrooms: 'B_SUPPORTED_BUT_NOT_SUBJECT_NATIVE_AND_NOT_GATED',
        finish_quality: 'B_SUPPORTED_BUT_NOT_SUBJECT_NATIVE_AND_NOT_GATED',
        outdoor_space: 'F_LOCAL_MAPPING_INCORRECT_OR_INCOMPLETE',
        off_street_parking: 'F_LOCAL_MAPPING_INCORRECT_OR_INCOMPLETE',
        overall: 'G_LOCAL_REQUEST_CONTRACT_STILL_INCOMPLETE_OR_WRONG',
      },
      outdoorNote: 'mapOutdoorSpace omits outdoor_space entirely when no garden/balcony; docs require enum including none',
      parkingNote: 'parking 0 never sent; docs require 0-3 including zero',
      bedroomsNote: 'bedrooms 0 never sent; only >0; not readiness-gated',
    },
    rawEpbUnionInterestingKeys: [...unionInterestingKeys].sort(),
    listingInventoryCapability: listingCols,
    funnel,
    subjects,
  };

  const outPath = path.join(__dirname, 'residential-avm-input-contract-strategy-output.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    funnel,
    interestingKeyCount: unionInterestingKeys.size,
    adapterOverall: output.adapterAudit.classifications.overall,
    outPath,
    sampleKeys: [...unionInterestingKeys].filter((k) =>
      /bedroom|bathroom|habitable|parking|garden|finish|condition/i.test(k)
    ),
  }, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
