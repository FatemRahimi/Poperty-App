/**
 * Map internal listing property_type values to PropertyData valuation-sale enums.
 * Unmapped or missing type is unavailable — never defaulted to flat or another generic.
 * @see https://propertydata.co.uk/api/documentation/valuation-sale
 */

const { createProvenance } = require('../../../utils/provenance');
const { canonicalPropertyTypeToken } = require('../../../utils/canonicalPropertyType');
const { isPlausibleSqft } = require('../../../architecture/canonicalInternalArea');

const PROPERTY_DATA_TYPES = {
  flat: 'flat',
  apartment: 'flat',
  studio: 'flat',
  maisonette: 'flat',
  house: 'detached_house',
  detached: 'detached_house',
  'semi-detached': 'semi-detached_house',
  'semi detached': 'semi-detached_house',
  terraced: 'terraced_house',
  terrace: 'terraced_house',
  bungalow: 'detached_house',
  duplex: 'flat',
};

const PROPERTY_DATA_TYPE_ENUMS = new Set(Object.values(PROPERTY_DATA_TYPES));

function omitAbsentProviderParams(params) {
  const out = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = value;
  });
  return out;
}

function unavailableField(field, reason) {
  return {
    available: false,
    value: null,
    state: 'notAssessed',
    field,
    provenance: createProvenance({
      source: 'InternalListing',
      method: 'property_attribute_mapping',
      notes: reason,
    }),
  };
}

function mapToPropertyDataType(propertyType) {
  const token = canonicalPropertyTypeToken(propertyType);
  if (!token) return null;
  if (PROPERTY_DATA_TYPE_ENUMS.has(token)) return token;
  const normalised = token.replace(/[\s_]+/g, '-');
  return Object.prototype.hasOwnProperty.call(PROPERTY_DATA_TYPES, normalised)
    ? PROPERTY_DATA_TYPES[normalised]
    : null;
}

function mapConstructionDate(yearBuilt) {
  if (yearBuilt === undefined || yearBuilt === null || yearBuilt === '') return null;
  const y = Number(yearBuilt);
  if (!Number.isFinite(y) || y <= 0) return null;
  if (y < 1914) return 'pre_1914';
  if (y < 2000) return '1914_2000';
  return '2000_onwards';
}

const PROPERTY_DATA_CONSTRUCTION_ENUMS = new Set(['pre_1914', '1914_2000', '2000_onwards']);

const {
  mapOfficialPeriodLabelToPropertyData,
  mapRdSapCodeToPropertyData,
} = require('../mhclgEpb/rdSapConstructionAgeBand');

/**
 * Map an official construction age band to PropertyData construction_date
 * ONLY when the entire defensible source period maps unambiguously into
 * exactly one provider enum. No midpoint mapping.
 */
function mapConstructionDateFromAgeBand(ageBand, schemaType = null) {
  if (ageBand === undefined || ageBand === null || ageBand === '') return null;
  const text = String(ageBand).trim();
  if (!text || /not recorded|unknown|n\/?a|not available|not applicable/i.test(text)) return null;

  const normalised = text.replace(/[\s-]+/g, '_').toLowerCase();
  if (PROPERTY_DATA_CONSTRUCTION_ENUMS.has(normalised)) return normalised;

  // Single RdSAP letter code
  if (/^[A-Ma-m]$/.test(text)) {
    const mapped = mapRdSapCodeToPropertyData(text, schemaType);
    return mapped.mappable ? mapped.value : null;
  }

  // Authoritative period label (or year-range substring) — wholly-inside only
  const fromLabel = mapOfficialPeriodLabelToPropertyData(text);
  if (fromLabel.mappable) return fromLabel.value;

  // If a bare letter was embedded after a prefix decode attempt failed, refuse.
  return null;
}

function mapFinishQuality(conditionOrFinish) {
  if (conditionOrFinish === undefined || conditionOrFinish === null || conditionOrFinish === '') return null;
  const normalised = String(conditionOrFinish).trim().toLowerCase().replace(/[\s-]+/g, '_');
  const ENUMS = new Set(['very_high', 'high', 'average', 'below_average', 'unmodernised']);
  if (ENUMS.has(normalised)) return normalised;
  // Legacy free-text condition → enum only when explicit; never default average.
  const c = normalised.replace(/_/g, ' ');
  if (c.includes('unmodernised') || c.includes('unmodernized')) return 'unmodernised';
  if (c.includes('very high') || c.includes('excellent')) return 'very_high';
  if (c.includes('high')) return 'high';
  if (c.includes('poor') || c.includes('renovation')) return 'below_average';
  if (c.includes('fair') || c === 'average' || c.includes('good')) return 'average';
  return null;
}

/**
 * Map outdoor evidence to PropertyData outdoor_space.
 * Confirmed none → 'none'. Unknown → null (not eligible).
 * Never treat absent garden flag as none.
 */
function mapOutdoorSpace(property) {
  if (!property || typeof property !== 'object') return null;
  const explicit = property.outdoor ?? property.outdoor_space ?? property.outdoorSpace ?? null;
  if (explicit != null && explicit !== '') {
    const text = String(explicit).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'none' || text === 'no') return 'none';
    if (text === 'garden') return 'garden';
    if (text === 'balcony_terrace' || text === 'balcony' || text === 'terrace') return 'balcony_terrace';
    if (text === 'garden_very_large') return 'garden_very_large';
  }
  if (property.outdoor_none_confirmed === true || property.outdoorNoneConfirmed === true) {
    return 'none';
  }
  if (property.has_garden === true || property.hasGarden === true) return 'garden';
  if (property.has_balcony || property.hasBalcony || property.has_balcony_terrace) return 'balcony_terrace';
  return null;
}

/**
 * Map parking. Confirmed zero is valid. Unknown (incl. ambiguous DB default 0) → null.
 */
function mapOffStreetParking(property) {
  if (!property || typeof property !== 'object') return null;
  const confirmed = property.parking_confirmed === true
    || property.parkingConfirmed === true
    || property.parkingProvenance != null
    || (property.subjectPropertyAttributes?.offStreetParking?.available === true);
  const raw = property.parking_spaces ?? property.parkingSpaces ?? property.off_street_parking;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const capped = Math.min(3, Math.floor(n));
  if (confirmed) return capped;
  // Positive counts from listing without explicit confirm still accepted as observed presence.
  if (capped > 0) return capped;
  return null;
}

function describeBedroomsMapping(property = {}) {
  if (property.bedrooms === undefined || property.bedrooms === null || property.bedrooms === '') {
    return unavailableField('bedrooms', 'Bedroom count was not supplied. Unknown is not sent as zero.');
  }
  const n = Number(property.bedrooms);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return unavailableField('bedrooms', 'Bedroom count was invalid.');
  }
  return {
    available: true,
    value: Math.min(5, n),
    state: 'mapped',
    field: 'bedrooms',
    provenance: createProvenance({
      source: property.bedroomsProvenance || 'InternalListing',
      method: 'bedroom_count_mapping',
      notes: `Bedroom count ${n} mapped for PropertyData (capped at 5).`,
    }),
  };
}

function describeBathroomsMapping(property = {}) {
  if (property.bathrooms === undefined || property.bathrooms === null || property.bathrooms === '') {
    return unavailableField('bathrooms', 'Bathroom count was not supplied. Unknown is not sent as zero.');
  }
  const n = Number(property.bathrooms);
  if (!Number.isFinite(n) || n < 0) {
    return unavailableField('bathrooms', 'Bathroom count was invalid.');
  }
  return {
    available: true,
    value: Math.min(5, Math.floor(n)),
    state: 'mapped',
    field: 'bathrooms',
    provenance: createProvenance({
      source: property.bathroomsProvenance || 'InternalListing',
      method: 'bathroom_count_mapping',
      notes: `Bathroom count ${n} mapped for PropertyData (capped at 5).`,
    }),
  };
}

function describeOutdoorMapping(property = {}) {
  const mapped = mapOutdoorSpace(property);
  if (!mapped) {
    return unavailableField(
      'outdoor_space',
      'Outdoor space was not confirmed. Unknown is not mapped to none.'
    );
  }
  return {
    available: true,
    value: mapped,
    state: 'mapped',
    field: 'outdoor_space',
    provenance: createProvenance({
      source: property.outdoorProvenance || 'InternalListing',
      method: 'outdoor_space_mapping',
      notes: `Outdoor evidence mapped to PropertyData ${mapped}.`,
    }),
  };
}

function describeParkingMapping(property = {}) {
  const mapped = mapOffStreetParking(property);
  if (mapped === null || mapped === undefined) {
    return unavailableField(
      'off_street_parking',
      'Off-street parking was not confirmed. Unknown is not mapped to zero.'
    );
  }
  return {
    available: true,
    value: mapped,
    state: 'mapped',
    field: 'off_street_parking',
    provenance: createProvenance({
      source: property.parkingProvenance || 'InternalListing',
      method: 'off_street_parking_mapping',
      notes: `Parking count ${mapped} mapped for PropertyData (0–3).`,
    }),
  };
}

function describeFinishQualityMapping(property = {}) {
  // Prefer explicit provider-request finish_quality; never invent average.
  const explicit = property.finish_quality ?? property.finishQuality ?? null;
  const fromExplicit = mapFinishQuality(explicit);
  if (fromExplicit) {
    return {
      available: true,
      value: fromExplicit,
      state: 'mapped',
      field: 'finish_quality',
      provenance: createProvenance({
        source: property.finishQualityProvenance || 'USER_REPORTED',
        method: 'finish_quality_provider_request_input',
        notes: 'Subjective PropertyData finish_quality from explicit user/provider-request input. Not an official condition assessment.',
      }),
    };
  }
  const fromCondition = mapFinishQuality(property.condition);
  if (fromCondition) {
    return {
      available: true,
      value: fromCondition,
      state: 'mapped',
      field: 'finish_quality',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'condition_text_finish_quality_mapping',
        notes: `Mapped listing condition text to PropertyData ${fromCondition}. Not EPC-derived.`,
      }),
    };
  }
  return unavailableField(
    'finish_quality',
    'Property finish/condition was not supplied. finish_quality is a subjective provider-required input and was not defaulted to average or inferred from EPC.'
  );
}

function describeTypeMapping(propertyType) {
  const mapped = mapToPropertyDataType(propertyType);
  if (mapped) {
    return {
      available: true,
      value: mapped,
      state: 'mapped',
      field: 'property_type',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'property_type_mapping',
        notes: `Mapped listing type ${String(propertyType)} to PropertyData enum ${mapped}.`,
      }),
    };
  }
  return unavailableField(
    'property_type',
    'Property type was unavailable or could not be mapped to a PropertyData enum. It was not defaulted to flat.'
  );
}

function describeConstructionMapping(yearBuiltOrProperty, ageBandMaybe) {
  let yearBuilt = yearBuiltOrProperty;
  let ageBand = ageBandMaybe;
  let schemaType = null;
  let yearProvenance = 'InternalListing';
  let officialEvidence = null;
  if (yearBuiltOrProperty && typeof yearBuiltOrProperty === 'object' && !Array.isArray(yearBuiltOrProperty)) {
    yearBuilt = yearBuiltOrProperty.year_built ?? yearBuiltOrProperty.yearBuilt ?? null;
    ageBand = yearBuiltOrProperty.construction_age_band
      ?? yearBuiltOrProperty.constructionAgeBand
      ?? ageBandMaybe
      ?? null;
    schemaType = yearBuiltOrProperty.schemaType
      || yearBuiltOrProperty.schema_type
      || yearBuiltOrProperty.officialConstructionAge?.schemaType
      || null;
    officialEvidence = yearBuiltOrProperty.officialConstructionAge
      || yearBuiltOrProperty.constructionAgeEvidence
      || null;
    if (yearBuiltOrProperty.yearBuiltProvenance === 'USER_DECLARED'
      || yearBuiltOrProperty.year_built_provenance === 'USER_DECLARED') {
      yearProvenance = 'USER_DECLARED';
    }
  }

  // Exact legitimate year path — provenance stays distinct from official EPB band.
  const fromYear = mapConstructionDate(yearBuilt);
  if (fromYear) {
    return {
      available: true,
      value: fromYear,
      state: 'mapped',
      field: 'construction_date',
      provenance: createProvenance({
        source: yearProvenance,
        method: 'construction_date_mapping',
        notes: `Mapped year_built ${yearBuilt} to PropertyData band ${fromYear}.`,
      }),
    };
  }

  // Prefer precomputed official evidence when PropertyData-mappable.
  if (officialEvidence?.propertyDataMappable && officialEvidence.propertyDataConstructionDate) {
    return {
      available: true,
      value: officialEvidence.propertyDataConstructionDate,
      state: 'mapped',
      field: 'construction_date',
      provenance: createProvenance({
        source: 'MHCLG_EPBD',
        method: 'official_construction_age_wholly_inside_mapping',
        notes: `Mapped official period "${officialEvidence.normalizedOfficialPeriod || officialEvidence.periodLabel}" (code ${officialEvidence.rawOfficialAgeCode || officialEvidence.rawCode || 'n/a'}) wholly inside PropertyData ${officialEvidence.propertyDataConstructionDate}.`,
      }),
    };
  }

  const fromBand = mapConstructionDateFromAgeBand(ageBand, schemaType);
  if (fromBand) {
    return {
      available: true,
      value: fromBand,
      state: 'mapped',
      field: 'construction_date',
      provenance: createProvenance({
        source: 'MHCLG_EPBD',
        method: 'construction_age_band_wholly_inside_mapping',
        notes: `Mapped construction age band "${ageBand}" wholly inside PropertyData band ${fromBand}. No midpoint mapping.`,
      }),
    };
  }

  return unavailableField(
    'construction_date',
    'Build year / construction age band was not supplied or did not map wholly inside a single PropertyData enum. construction_date was omitted; age was not inferred from style, postcode or listing copy, midpoint mapping was not used, and 1914_2000 was not used as a default.'
  );
}

/**
 * Optional sold-price query filters. Unmapped type is omitted, never sent as
 * null, empty string, or a generic fallback such as flat.
 */
function buildSoldPriceFilters(property = {}) {
  const filters = {};
  const bedrooms = Number(property.bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms > 0) {
    filters.bedrooms = Math.min(5, bedrooms);
  }
  const propertyType = mapToPropertyDataType(property.property_type || property.propertyType);
  if (propertyType) filters.propertyType = propertyType;
  return filters;
}

const COMMERCIAL_TYPE_PATTERN = /commercial|office|retail|industrial|warehouse|shop|unit/i;

function isResidentialRentsEligible(property = {}) {
  const category = String(property.category || '').toLowerCase();
  if (category === 'lease') return false;
  const type = `${property.property_type || ''} ${property.property_category || ''}`;
  return !COMMERCIAL_TYPE_PATTERN.test(type);
}

/**
 * HTTP query params for /rents. Live payload echoes `type` (not property_type)
 * and `bedrooms` when those filters are sent. Unknown type is omitted.
 */
function buildRentsQueryParams(postcode, filters = {}) {
  const pc = (postcode || '').replace(/\s+/g, '');
  if (!pc) return null;
  const params = { postcode: pc };
  const bedrooms = Number(filters.bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms >= 0) {
    params.bedrooms = Math.min(5, Math.floor(bedrooms));
  }
  const mappedType = mapToPropertyDataType(
    filters.propertyType || filters.property_type || filters.type
  );
  if (mappedType) params.type = mappedType;
  return omitAbsentProviderParams(params);
}

/**
 * HTTP query params for /demand. Live payload accepted postcode only;
 * bedrooms/type filters were not verified and are omitted.
 */
function buildDemandQueryParams(postcode) {
  const pc = (postcode || '').replace(/\s+/g, '');
  if (!pc) return null;
  return omitAbsentProviderParams({ postcode: pc });
}

/**
 * HTTP query params for /demand-rent. Live payload accepted postcode only;
 * bedrooms/type filters were not verified and are omitted.
 */
function buildDemandRentQueryParams(postcode) {
  return buildDemandQueryParams(postcode);
}

/**
 * HTTP query params for /sold-prices and /sold-prices-per-sqf.
 * Unknown type is omitted from the object — never property_type: null or ''.
 */
function buildSoldPricesQueryParams(postcode, filters = {}) {
  const pc = (postcode || '').replace(/\s+/g, '');
  if (!pc) return null;
  const params = { postcode: pc };
  const bedrooms = Number(filters.bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms > 0) {
    params.bedrooms = Math.min(5, bedrooms);
  }
  const mappedType = mapToPropertyDataType(filters.propertyType || filters.property_type);
  if (mappedType) params.property_type = mappedType;
  return omitAbsentProviderParams(params);
}

function buildValuationSaleRequest(property = {}) {
  const postcode = (property.zip_code || property.postcode || '').replace(/\s+/g, '');
  const internalArea = Number(property.square_feet) || 0;
  const type = describeTypeMapping(property.property_type);
  const construction = describeConstructionMapping(property);
  const bedrooms = describeBedroomsMapping(property);
  const bathrooms = describeBathroomsMapping(property);
  const outdoor = describeOutdoorMapping(property);
  const parking = describeParkingMapping(property);
  const finish = describeFinishQualityMapping(property);

  const unavailable = {};
  if (!type.available) unavailable.property_type = type;
  if (!construction.available) unavailable.construction_date = construction;
  if (!bedrooms.available) unavailable.bedrooms = bedrooms;
  if (!bathrooms.available) unavailable.bathrooms = bathrooms;
  if (!outdoor.available) unavailable.outdoor_space = outdoor;
  if (!parking.available) unavailable.off_street_parking = parking;
  if (!finish.available) unavailable.finish_quality = finish;

  const missingFields = [];
  if (!type.available) missingFields.push('property_type');
  if (!postcode) missingFields.push('postcode');
  if (internalArea < 300 || !isPlausibleSqft(internalArea)) {
    missingFields.push('internal_area');
  }
  if (!construction.available) missingFields.push('construction_date');
  if (!bedrooms.available) missingFields.push('bedrooms');
  if (!bathrooms.available) missingFields.push('bathrooms');
  if (!finish.available) missingFields.push('finish_quality');
  if (!outdoor.available) missingFields.push('outdoor_space');
  if (!parking.available) missingFields.push('off_street_parking');

  const baseMeta = {
    unavailable,
    type,
    construction,
    bedrooms,
    bathrooms,
    outdoor,
    parking,
    finish,
  };

  if (!type.available) {
    return {
      params: null,
      canRequestAvm: false,
      readiness: {
        state: 'PROVIDER_NOT_CALLED_MISSING_INPUT',
        reasonCode: 'UNMAPPED_PROPERTY_TYPE',
        missingFields,
      },
      ...baseMeta,
    };
  }

  if (!postcode) {
    return {
      params: null,
      canRequestAvm: false,
      readiness: {
        state: 'PROVIDER_NOT_CALLED_MISSING_INPUT',
        reasonCode: 'MISSING_POSTCODE',
        missingFields,
      },
      ...baseMeta,
    };
  }

  if (internalArea < 300 || !isPlausibleSqft(internalArea)) {
    const resolutionReadiness = property.internalAreaResolution?.readiness;
    const belowMin = internalArea > 0 && internalArea < 300;
    const reasonCode =
      resolutionReadiness?.reasonCode === 'INVALID_INTERNAL_AREA' || (!belowMin && internalArea > 0)
        ? 'INVALID_INTERNAL_AREA'
        : resolutionReadiness?.reasonCode === 'UNIT_UNKNOWN'
          ? 'UNIT_UNKNOWN'
          : 'MISSING_INTERNAL_AREA';
    return {
      params: null,
      canRequestAvm: false,
      readiness: {
        state: 'PROVIDER_NOT_CALLED_MISSING_INPUT',
        reasonCode,
        missingFields,
        note: resolutionReadiness?.note || null,
      },
      ...baseMeta,
    };
  }

  if (!construction.available) {
    return {
      params: null,
      canRequestAvm: false,
      readiness: {
        state: 'PROVIDER_NOT_CALLED_MISSING_INPUT',
        reasonCode: 'MISSING_CONSTRUCTION_DATE',
        missingFields,
      },
      ...baseMeta,
    };
  }

  if (!bedrooms.available || !bathrooms.available || !finish.available
    || !outdoor.available || !parking.available) {
    const reasonCode = !bedrooms.available ? 'MISSING_BEDROOMS'
      : !bathrooms.available ? 'MISSING_BATHROOMS'
        : !finish.available ? 'MISSING_FINISH_QUALITY'
          : !outdoor.available ? 'MISSING_OUTDOOR_SPACE'
            : 'MISSING_OFF_STREET_PARKING';
    return {
      params: null,
      canRequestAvm: false,
      readiness: {
        state: 'PROVIDER_NOT_CALLED_MISSING_INPUT',
        reasonCode,
        missingFields,
      },
      ...baseMeta,
    };
  }

  const params = {
    postcode,
    internal_area: internalArea,
    output: 'json',
    property_type: type.value,
    construction_date: construction.value,
    bedrooms: bedrooms.value,
    bathrooms: bathrooms.value,
    finish_quality: finish.value,
    outdoor_space: outdoor.value,
    off_street_parking: parking.value,
  };

  const sendable = omitAbsentProviderParams(params);
  return {
    params: sendable,
    canRequestAvm: true,
    readiness: {
      state: 'PROVIDER_ELIGIBLE',
      reasonCode: null,
      missingFields: [],
    },
    ...baseMeta,
  };
}

function buildValuationSaleParams(property) {
  const built = buildValuationSaleRequest(property);
  if (!built.params || !built.canRequestAvm) return null;
  return built.params;
}

module.exports = {
  mapToPropertyDataType,
  mapConstructionDate,
  mapConstructionDateFromAgeBand,
  mapFinishQuality,
  mapOutdoorSpace,
  mapOffStreetParking,
  describeTypeMapping,
  describeConstructionMapping,
  describeBedroomsMapping,
  describeBathroomsMapping,
  describeOutdoorMapping,
  describeParkingMapping,
  describeFinishQualityMapping,
  omitAbsentProviderParams,
  buildSoldPriceFilters,
  buildSoldPricesQueryParams,
  buildRentsQueryParams,
  buildDemandQueryParams,
  buildDemandRentQueryParams,
  isResidentialRentsEligible,
  buildValuationSaleRequest,
  buildValuationSaleParams,
};
