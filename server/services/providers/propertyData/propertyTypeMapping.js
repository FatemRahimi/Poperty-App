/**
 * Map internal listing property_type values to PropertyData valuation-sale enums.
 * Unmapped or missing type is unavailable — never defaulted to flat or another generic.
 * @see https://propertydata.co.uk/api/documentation/valuation-sale
 */

const { createProvenance } = require('../../../utils/provenance');

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
  if (propertyType === undefined || propertyType === null || String(propertyType).trim() === '') {
    return null;
  }
  const raw = String(propertyType).trim();
  if (PROPERTY_DATA_TYPE_ENUMS.has(raw)) return raw;
  const t = raw.toLowerCase().replace(/[\s_]+/g, '-');
  return Object.prototype.hasOwnProperty.call(PROPERTY_DATA_TYPES, t) ? PROPERTY_DATA_TYPES[t] : null;
}

function mapConstructionDate(yearBuilt) {
  if (yearBuilt === undefined || yearBuilt === null || yearBuilt === '') return null;
  const y = Number(yearBuilt);
  if (!Number.isFinite(y) || y <= 0) return null;
  if (y < 1914) return 'pre_1914';
  if (y < 2000) return '1914_2000';
  return '2000_onwards';
}

function mapFinishQuality(condition) {
  const c = (condition || '').toLowerCase().trim();
  if (!c) return null;
  if (c.includes('excellent') || c.includes('high')) return 'high';
  if (c.includes('poor') || c.includes('renovation')) return 'below_average';
  if (c.includes('fair')) return 'average';
  if (c.includes('good')) return 'average';
  return null;
}

function mapOutdoorSpace(property) {
  if (property.has_garden || property.hasGarden) return 'garden';
  if (property.has_balcony || property.hasBalcony || property.has_balcony_terrace) return 'balcony_terrace';
  return null;
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

function describeConstructionMapping(yearBuilt) {
  const mapped = mapConstructionDate(yearBuilt);
  if (mapped) {
    return {
      available: true,
      value: mapped,
      state: 'mapped',
      field: 'construction_date',
      provenance: createProvenance({
        source: 'InternalListing',
        method: 'construction_date_mapping',
        notes: `Mapped year_built ${yearBuilt} to PropertyData band ${mapped}.`,
      }),
    };
  }
  return unavailableField(
    'construction_date',
    'Build year was not supplied. construction_date was omitted; age was not inferred from style, postcode or listing copy, and 1914_2000 was not used as a default.'
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
  const construction = describeConstructionMapping(property.year_built);
  const unavailable = {};
  if (!type.available) unavailable.property_type = type;
  if (!construction.available) unavailable.construction_date = construction;

  if (!postcode || internalArea < 300) {
    return {
      params: null,
      canRequestAvm: false,
      unavailable,
      type,
      construction,
    };
  }

  const params = {
    postcode,
    internal_area: internalArea,
    output: 'json',
  };
  if (type.available) params.property_type = type.value;
  if (construction.available) params.construction_date = construction.value;

  const bedrooms = Number(property.bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms > 0) {
    params.bedrooms = Math.min(5, bedrooms);
  }
  const bathrooms = Number(property.bathrooms);
  if (Number.isFinite(bathrooms) && bathrooms > 0) {
    params.bathrooms = Math.min(5, Math.floor(bathrooms));
  }
  const finish = mapFinishQuality(property.condition);
  if (finish) params.finish_quality = finish;
  const outdoor = mapOutdoorSpace(property);
  if (outdoor) params.outdoor_space = outdoor;
  const parking = Number(property.parking_spaces);
  if (Number.isFinite(parking) && parking > 0) {
    params.off_street_parking = Math.min(3, parking);
  }

  const sendable = omitAbsentProviderParams(params);
  return {
    params: type.available ? sendable : null,
    canRequestAvm: type.available,
    unavailable,
    type,
    construction,
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
  describeTypeMapping,
  describeConstructionMapping,
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
