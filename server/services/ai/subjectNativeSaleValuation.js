/**
 * Subject-native sale valuation execution boundary.
 * Reuses buildValuationSaleRequest, PropertyData adapter, valuationEngine, safety.
 * Does not fabricate listings, asking prices, or listing category as identity.
 */

const { buildValuationSaleRequest } = require('../providers/propertyData/propertyTypeMapping');
const {
  applyCanonicalInternalAreaToProperty,
  resolveCanonicalInternalArea,
} = require('../identity/internalAreaResolution');
const {
  upsertSubject,
  upsertSubjectEnrichment,
  findEnrichmentBySubject,
} = require('../enrichment/intelligenceSubjectRepository');
const { propertyIntelligenceConfig } = require('../../config/propertyIntelligence.config');
const { getProviderRegistry } = require('../providers/ProviderRegistry');

const EXECUTION_MODE = 'subject_native';

/**
 * True when valuation should run against a SUBJECT, not a marketplace listing row.
 * Listing rows always have properties.id — never treat them as subject-native.
 */
function isSubjectNativeValuationContext(property = {}) {
  if (property?.valuationExecutionMode === EXECUTION_MODE) return true;
  if (property?.subjectId != null && (property.id == null || property.id === '')) return true;
  return false;
}

/**
 * Whether the existing sale-valuation provider path may be requested.
 * Listing: category === 'sale' (unchanged compatibility).
 * Subject: subject-native context + AVM readiness (category not required).
 */
function mayRequestSaleValuation(property = {}, readiness = null) {
  const ready = readiness?.canRequestAvm === true
    || readiness?.readiness?.state === 'PROVIDER_ELIGIBLE';
  if (isSubjectNativeValuationContext(property)) {
    return ready || readiness == null; // caller may still check readiness separately
  }
  return property.category === 'sale';
}

/**
 * Build a valuation property from canonical subject attributes.
 * Never sets listing id. Never copies historical sold price into asking price.
 * Does not claim category=sale as property identity.
 */
function buildSubjectNativeValuationProperty({
  subjectId = null,
  uprn = null,
  postcode = null,
  propertyType = null,
  squareFeet = null,
  floorArea = null,
  floorAreaUnit = null,
  yearBuilt = null,
  constructionAgeBand = null,
  bedrooms = null,
  bathrooms = null,
  outdoor = null,
  parkingSpaces = null,
  parkingConfirmed = false,
  finishQuality = null,
  paon = null,
  saon = null,
  normalizedAddress = null,
  city = null,
} = {}) {
  return {
    id: null,
    subjectId: subjectId != null ? subjectId : null,
    valuationExecutionMode: EXECUTION_MODE,
    uprn: uprn || null,
    zip_code: postcode || null,
    postcode: postcode || null,
    property_type: propertyType || null,
    // Listing workflow category is intentionally unset — not fabricated as 'sale'.
    category: null,
    square_feet: squareFeet != null ? Number(squareFeet) : null,
    floor_area: floorArea != null ? Number(floorArea) : null,
    floor_area_unit: floorAreaUnit || null,
    year_built: yearBuilt != null ? yearBuilt : null,
    construction_age_band: constructionAgeBand || null,
    constructionAgeBand: constructionAgeBand || null,
    bedrooms: bedrooms != null ? bedrooms : null,
    bathrooms: bathrooms != null ? bathrooms : null,
    outdoor: outdoor || null,
    parking_spaces: parkingSpaces != null ? parkingSpaces : null,
    parking_confirmed: parkingConfirmed === true,
    finish_quality: finishQuality || null,
    paon: paon || null,
    saon: saon || null,
    title: normalizedAddress || null,
    address_display: normalizedAddress || null,
    city: city || null,
    // CRITICAL temporal firewall: no asking / sold price as generation input
    price: null,
    last_sold_price: null,
    last_sold_date: null,
    sold_date: null,
    source: 'subject_native_valuation',
  };
}

/**
 * Prove historical outcome fields are absent from provider request params
 * and from the valuation property generation surface.
 */
function assertTemporalLeakageFirewall({
  property = {},
  providerParams = null,
  historicalSoldPrice = null,
} = {}) {
  const forbiddenPropertyKeys = [
    'price',
    'askingPrice',
    'asking_price',
    'last_sold_price',
    'lastSoldPrice',
    'sold_price',
    'hmlr_price',
    'transaction_price',
  ];
  const propertyLeaks = [];
  for (const key of forbiddenPropertyKeys) {
    const val = property[key];
    if (val != null && val !== '' && Number(val) !== 0) {
      propertyLeaks.push({ key, value: val });
    }
  }

  const params = providerParams && typeof providerParams === 'object' ? providerParams : {};
  const paramKeys = Object.keys(params);
  const forbiddenParamKeys = paramKeys.filter((k) =>
    /price|asking|sold|hmlr|transaction/i.test(k) && !/^output$/i.test(k)
  );

  const hist = historicalSoldPrice != null ? String(historicalSoldPrice) : null;
  const histInParams =
    hist
    && paramKeys.some((k) => String(params[k]) === hist);

  const leakageSafe =
    propertyLeaks.length === 0
    && forbiddenParamKeys.length === 0
    && !histInParams
    && property.category !== 'sale'; // category must not be fabricated as sale identity

  return {
    leakageSafe,
    propertyLeaks,
    forbiddenParamKeys,
    historicalPricePresentInParams: Boolean(histInParams),
    fabricatedSaleCategory: property.category === 'sale',
    valuationExecutionMode: property.valuationExecutionMode || null,
  };
}

function ttlToExpiresAt(ttlMs) {
  return new Date(Date.now() + ttlMs);
}

/**
 * Execute subject-native sale valuation using existing provider + engine + safety.
 * Persists enrichment on subject_id only — never creates a listing row.
 */
async function executeSubjectNativeSaleValuation({
  subject,
  property,
  userId = null,
  historicalOutcome = null, // must NOT be used until after valuation frozen
  deps = {},
} = {}) {
  if (!subject?.id) {
    return {
      success: false,
      reasonCode: 'MISSING_SUBJECT',
      message: 'Subject-native valuation requires an intelligence_subjects row.',
    };
  }

  const valuationProperty = {
    ...property,
    id: null,
    subjectId: subject.id,
    valuationExecutionMode: EXECUTION_MODE,
    category: property.category === 'sale' ? null : property.category, // strip fabricated sale category
    price: null,
    last_sold_price: null,
    last_sold_date: null,
    sold_date: null,
  };

  const identity = {
    uprn: subject.uprn || valuationProperty.uprn,
    postcode: subject.postcode || valuationProperty.zip_code || valuationProperty.postcode,
    paon: valuationProperty.paon || null,
    saon: valuationProperty.saon || null,
    subjectId: subject.id,
  };

  const areaResolution = deps.areaResolution || await resolveCanonicalInternalArea({
    property: valuationProperty,
    identity,
    loadPersistedEpb: false,
    epbEvidence: deps.epbEvidence || null,
  });
  const applied = applyCanonicalInternalAreaToProperty(valuationProperty, areaResolution);
  // Official EPB construction-age evidence may supply construction_date when
  // the decoded period maps wholly inside one PropertyData enum. Never invent.
  const epbCurrent = deps.epbEvidence?.client?.current || null;
  const ageEvidence = epbCurrent?.constructionAgeEvidence || null;
  const epbAge =
    ageEvidence?.periodLabel
    || epbCurrent?.constructionAgeBand
    || applied.construction_age_band
    || applied.constructionAgeBand
    || null;
  if (epbAge && !applied.year_built) {
    applied.construction_age_band = epbAge;
    applied.constructionAgeBand = epbAge;
  }
  if (ageEvidence && !applied.year_built) {
    applied.officialConstructionAge = ageEvidence;
    applied.constructionAgeEvidence = ageEvidence;
    if (ageEvidence.schemaType) applied.schemaType = ageEvidence.schemaType;
  }

  // Subject property attributes (beds/baths/outdoor/parking) + optional finish provider-request.
  const {
    resolveSubjectPropertyAttributes,
    applySubjectAttributesToProperty,
  } = require('../identity/subjectPropertyAttributeService');
  const resolvedAttrs = deps.subjectPropertyAttributes
    || resolveSubjectPropertyAttributes({
      subject,
      listingProperty: deps.listingProperty || null,
    });
  const withAttrs = applySubjectAttributesToProperty(applied, resolvedAttrs);
  Object.assign(applied, withAttrs);

  const readiness = buildValuationSaleRequest(applied);

  const leakPre = assertTemporalLeakageFirewall({
    property: applied,
    providerParams: readiness.params,
    historicalSoldPrice: historicalOutcome?.priceGbp ?? null,
  });
  if (!leakPre.leakageSafe) {
    return {
      success: false,
      reasonCode: 'TEMPORAL_LEAKAGE_BLOCKED',
      message: 'Historical outcome or fabricated sale category detected before provider call.',
      leakage: leakPre,
      readiness: readiness.readiness,
    };
  }

  if (!readiness.canRequestAvm) {
    return {
      success: false,
      reasonCode: readiness.readiness?.reasonCode || 'NOT_PROVIDER_ELIGIBLE',
      message: 'Subject not PROVIDER_ELIGIBLE for /valuation-sale.',
      readiness: readiness.readiness,
      leakage: leakPre,
      providerCalled: false,
    };
  }

  const registry = deps.getProviderRegistry ? deps.getProviderRegistry() : getProviderRegistry();
  const marketProvider = deps.marketProvider || registry.getPrimaryMarketDataProvider();
  if (!marketProvider?.isAvailable?.()) {
    return {
      success: false,
      reasonCode: 'PROVIDER_UNAVAILABLE',
      message: 'Market data provider unavailable.',
      readiness: readiness.readiness,
      leakage: leakPre,
      providerCalled: false,
    };
  }

  const findCached = deps.findEnrichmentBySubject || findEnrichmentBySubject;
  const persist = deps.upsertSubjectEnrichment || upsertSubjectEnrichment;
  const cached = await findCached(subject.id, 'valuation_sale', 'PropertyData');

  let valuationEnrichment;
  let providerCalled = false;
  let creditsUsed = 0;
  if (cached && !deps.forceRefresh) {
    valuationEnrichment = {
      success: true,
      data: cached.payload,
      provenance: cached.provenance,
      fromPersistence: true,
      inputParams: readiness.params,
    };
  } else {
    providerCalled = true;
    const ctx = { userId, propertyId: null, subjectId: subject.id };
    let fetched;
    try {
      fetched = await marketProvider.getSaleValuation(applied, ctx);
    } catch (err) {
      return {
        success: false,
        reasonCode: err.code || 'PROVIDER_ERROR',
        message: err.message || 'Provider call failed.',
        providerCalled: true,
        creditsUsed: 0,
        readiness: readiness.readiness,
        providerParams: readiness.params,
        leakage: leakPre,
        subjectId: subject.id,
        area: {
          available: areaResolution.available,
          sqft: areaResolution.normalisedValueSqft,
          source: areaResolution.selectedSource,
        },
      };
    }
    valuationEnrichment = fetched;
    if (fetched?.creditsUsed) creditsUsed += fetched.creditsUsed;
    if (fetched?.success) {
      await persist({
        subjectId: subject.id,
        enrichmentType: 'valuation_sale',
        source: 'PropertyData',
        payload: fetched.valuation || fetched.data,
        provenance: fetched.provenance || { source: 'PropertyData', method: 'valuation_sale_avm' },
        expiresAt: ttlToExpiresAt(propertyIntelligenceConfig.cacheTtl.valuation),
      });
      valuationEnrichment = {
        ...fetched,
        data: fetched.valuation || fetched.data,
        inputParams: fetched.inputParams || readiness.params,
      };
    }
  }

  const leakPost = assertTemporalLeakageFirewall({
    property: applied,
    providerParams: valuationEnrichment?.inputParams || readiness.params,
    historicalSoldPrice: historicalOutcome?.priceGbp ?? null,
  });
  if (!leakPost.leakageSafe) {
    return {
      success: false,
      reasonCode: 'TEMPORAL_LEAKAGE_BLOCKED',
      message: 'Leakage detected after provider call; valuation not assessed.',
      leakage: leakPost,
      providerCalled,
      creditsUsed,
    };
  }

  const externalEnrichment = {
    enrichments: {
      valuation_sale: valuationEnrichment?.success
        ? {
            success: true,
            data: valuationEnrichment.data,
            provenance: valuationEnrichment.provenance,
            inputParams: valuationEnrichment.inputParams,
          }
        : valuationEnrichment,
    },
    identity,
  };

  // Freeze valuation BEFORE any historical outcome comparison.
  // Lazy require avoids circular dependency with valuationEngine.
  const valuationFn = deps.calculatePropertyValuation
    || require('./valuationEngine').calculatePropertyValuation;
  const { isDefensibleAssessedValuation } = require('./valuationAssessmentSafety');
  const valuation = await valuationFn(applied, externalEnrichment);

  const frozen = {
    success: valuation?.success === true,
    valuation,
    assessed: isDefensibleAssessedValuation(valuation),
    assessmentState: valuation?.assessmentState || (valuation?.success ? 'assessed' : 'notAssessed'),
    providerCalled,
    creditsUsed,
    readiness: readiness.readiness,
    providerParams: readiness.params,
    leakage: leakPost,
    subjectId: subject.id,
    area: {
      available: areaResolution.available,
      sqft: areaResolution.normalisedValueSqft,
      source: areaResolution.selectedSource,
    },
  };

  // Observational outcome only after freeze
  let outcomeComparison = null;
  if (historicalOutcome && frozen.valuation) {
    outcomeComparison = compareHistoricalOutcome(frozen.valuation, historicalOutcome);
  }

  return {
    ...frozen,
    outcomeComparison,
    historicalOutcomeAttachedAfterFreeze: Boolean(outcomeComparison),
  };
}

function compareHistoricalOutcome(valuation, historicalOutcome = {}) {
  const estimate = Number(
    valuation?.centralEstimate?.value
      ?? valuation?.centralEstimate
      ?? valuation?.estimate
      ?? valuation?.value
  );
  const sold = Number(historicalOutcome.priceGbp);
  const txDate = historicalOutcome.transferDate || null;
  const asOf = valuation?.asOf || valuation?.provenance?.retrievedAt || null;

  const temporallyComparable = false; // N<=3 and typically years-old HMLR vs current AVM — not accuracy
  const classification = 'temporally_non_comparable_observational_only';

  if (!Number.isFinite(estimate) || !Number.isFinite(sold) || sold <= 0) {
    return {
      available: false,
      temporallyComparable,
      classification,
      estimate: Number.isFinite(estimate) ? estimate : null,
      historicalSoldPrice: Number.isFinite(sold) ? sold : null,
      transferDate: txDate,
      valuationAsOf: asOf,
      limitations: ['Missing estimate or historical price for observational compare.'],
    };
  }

  const ae = Math.abs(estimate - sold);
  const signed = estimate - sold;
  const ape = (ae / sold) * 100;

  return {
    available: true,
    temporallyComparable,
    classification,
    estimate,
    historicalSoldPrice: sold,
    absoluteError: ae,
    signedError: signed,
    absolutePercentageError: ape,
    transferDate: txDate,
    valuationAsOf: asOf,
    limitations: [
      'Historical HMLR sold price is an OUTCOME/BENCHMARK, not valuation input.',
      'Comparison is observational only — not calibration and not present-model accuracy.',
      'Material time gap between transfer date and current AVM context is expected.',
    ],
  };
}

/**
 * Ensure a subject row exists for an official HMLR validation subject (UPRN-keyed).
 */
async function ensureOfficialValidationSubject({
  uprn,
  postcode,
  paon,
  saon = null,
  street = null,
  town = null,
  propertyType = null,
  createdBy = null,
  deps = {},
} = {}) {
  const upsert = deps.upsertSubject || upsertSubject;
  const address = [paon, saon, street, town, postcode].filter(Boolean).join(', ');
  return upsert({
    uprn: uprn ? String(uprn) : null,
    normalizedAddress: address || postcode || `official-subject-${uprn}`,
    postcode,
    propertyId: null,
    attributes: {
      property_type: propertyType || null,
      paon: paon || null,
      saon: saon || null,
      source: 'HMLR_PRICE_PAID_VALIDATION',
      // Explicitly do not store sold price as an attribute used for valuation generation
    },
    profileSnapshot: {},
    provider: 'HMLR_OFFICIAL_VALIDATION',
    matchConfidence: 'high',
    matchMethod: 'official_price_paid_uprn',
    createdBy,
  });
}

module.exports = {
  EXECUTION_MODE,
  isSubjectNativeValuationContext,
  mayRequestSaleValuation,
  buildSubjectNativeValuationProperty,
  assertTemporalLeakageFirewall,
  executeSubjectNativeSaleValuation,
  compareHistoricalOutcome,
  ensureOfficialValidationSubject,
};
