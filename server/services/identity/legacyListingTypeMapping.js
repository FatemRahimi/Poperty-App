/**
 * Explicit adapter from existing listing fields to canonical asset class.
 * Not used by resolveAssetClass / listingDoesNotImplyAssetClass.
 * Only EXACT_SAFE_MAPPING may be persisted. Conditional/ambiguous stay UNKNOWN.
 */

const { ASSET_CLASS } = require('../../architecture/assetClassification');

const MAPPING_KIND = Object.freeze({
  EXACT_SAFE_MAPPING: 'EXACT_SAFE_MAPPING',
  CONDITIONAL_MAPPING: 'CONDITIONAL_MAPPING',
  AMBIGUOUS: 'AMBIGUOUS',
  UNSUPPORTED: 'UNSUPPORTED',
});

const EXACT_CATEGORY = Object.freeze({
  residential: ASSET_CLASS.RESIDENTIAL,
  commercial: ASSET_CLASS.COMMERCIAL,
  industrial: ASSET_CLASS.INDUSTRIAL,
  agricultural: ASSET_CLASS.AGRICULTURAL,
  agriculture: ASSET_CLASS.AGRICULTURAL,
  land: ASSET_CLASS.LAND,
  development_site: ASSET_CLASS.DEVELOPMENT_SITE,
  'development-site': ASSET_CLASS.DEVELOPMENT_SITE,
  developmentsite: ASSET_CLASS.DEVELOPMENT_SITE,
  mixed_use: ASSET_CLASS.MIXED_USE,
  'mixed-use': ASSET_CLASS.MIXED_USE,
  mixeduse: ASSET_CLASS.MIXED_USE,
});

const EXACT_TYPE = Object.freeze({
  commercial: ASSET_CLASS.COMMERCIAL,
  industrial: ASSET_CLASS.INDUSTRIAL,
  agricultural: ASSET_CLASS.AGRICULTURAL,
  farmland: ASSET_CLASS.AGRICULTURAL,
  land: ASSET_CLASS.LAND,
  development_site: ASSET_CLASS.DEVELOPMENT_SITE,
  'development-site': ASSET_CLASS.DEVELOPMENT_SITE,
  mixed_use: ASSET_CLASS.MIXED_USE,
  'mixed-use': ASSET_CLASS.MIXED_USE,
});

const CONDITIONAL_RESIDENTIAL_TYPES = Object.freeze([
  'detached',
  'semi-detached',
  'semi_detached',
  'terraced',
  'terrace',
  'flat',
  'apartment',
  'studio',
  'duplex',
  'maisonette',
  'bungalow',
  'cottage',
  'townhouse',
  'penthouse',
  'house',
  'park-home',
  'park_home',
  'mobile-home',
  'mobile_home',
  'student-halls',
  'student_halls',
  'house-share',
  'house_share',
  'retirement-home',
  'retirement_home',
  'hmo',
]);

const CONDITIONAL_COMMERCIAL_TYPES = Object.freeze([
  'office',
  'retail',
  'restaurant',
  'shop',
  'hospitality',
  'leisure',
]);

const CONDITIONAL_INDUSTRIAL_TYPES = Object.freeze([
  'warehouse',
  'workshop',
  'logistics',
  'manufacturing',
]);

const CONDITIONAL_LAND_TYPES = Object.freeze([
  'plot',
  'plot-of-land',
  'site',
]);

function normalizeToken(value) {
  if (value == null || value === '') return '';
  return String(value).trim().toLowerCase().replace(/[\s]+/g, '-');
}

function classifyListingFieldValue(field, raw) {
  const token = normalizeToken(raw);
  if (!token) {
    return { kind: MAPPING_KIND.UNSUPPORTED, assetClass: ASSET_CLASS.UNKNOWN, field, value: raw || null };
  }

  if (field === 'property_category' && Object.prototype.hasOwnProperty.call(EXACT_CATEGORY, token)) {
    return {
      kind: MAPPING_KIND.EXACT_SAFE_MAPPING,
      assetClass: EXACT_CATEGORY[token],
      field,
      value: token,
    };
  }
  if (field === 'property_type' && Object.prototype.hasOwnProperty.call(EXACT_TYPE, token)) {
    return {
      kind: MAPPING_KIND.EXACT_SAFE_MAPPING,
      assetClass: EXACT_TYPE[token],
      field,
      value: token,
    };
  }
  if (CONDITIONAL_RESIDENTIAL_TYPES.includes(token)) {
    return { kind: MAPPING_KIND.CONDITIONAL_MAPPING, assetClass: ASSET_CLASS.RESIDENTIAL, field, value: token };
  }
  if (CONDITIONAL_COMMERCIAL_TYPES.includes(token)) {
    return { kind: MAPPING_KIND.CONDITIONAL_MAPPING, assetClass: ASSET_CLASS.COMMERCIAL, field, value: token };
  }
  if (CONDITIONAL_INDUSTRIAL_TYPES.includes(token)) {
    return { kind: MAPPING_KIND.CONDITIONAL_MAPPING, assetClass: ASSET_CLASS.INDUSTRIAL, field, value: token };
  }
  if (CONDITIONAL_LAND_TYPES.includes(token)) {
    return { kind: MAPPING_KIND.CONDITIONAL_MAPPING, assetClass: ASSET_CLASS.LAND, field, value: token };
  }
  if (token === 'special-purpose' || token === 'other' || token === 'unknown') {
    return { kind: MAPPING_KIND.AMBIGUOUS, assetClass: ASSET_CLASS.UNKNOWN, field, value: token };
  }
  return { kind: MAPPING_KIND.AMBIGUOUS, assetClass: ASSET_CLASS.UNKNOWN, field, value: token };
}

/**
 * Read-only mapping decision. Never invents a class from weak dwelling words.
 */
function mapLegacyListingFields(listing = {}) {
  const category = classifyListingFieldValue('property_category', listing.property_category);
  const type = classifyListingFieldValue('property_type', listing.property_type || listing.propertyType);

  const exact = [category, type].filter((row) => row.kind === MAPPING_KIND.EXACT_SAFE_MAPPING);
  const exactClasses = [...new Set(exact.map((row) => row.assetClass))];

  if (exactClasses.length > 1) {
    return {
      kind: MAPPING_KIND.AMBIGUOUS,
      assetClass: ASSET_CLASS.UNKNOWN,
      reason: 'CONFLICTING_EXACT_FIELDS',
      fields: exact,
      persistable: false,
    };
  }

  if (exactClasses.length === 1) {
    return {
      kind: MAPPING_KIND.EXACT_SAFE_MAPPING,
      assetClass: exactClasses[0],
      reason: 'EXACT_FIRST_PARTY_FIELD',
      fields: exact,
      persistable: true,
      sourceField: exact[0].field,
      sourceValue: exact[0].value,
    };
  }

  if (category.kind === MAPPING_KIND.CONDITIONAL_MAPPING || type.kind === MAPPING_KIND.CONDITIONAL_MAPPING) {
    return {
      kind: MAPPING_KIND.CONDITIONAL_MAPPING,
      assetClass: ASSET_CLASS.UNKNOWN,
      suggestedClass: (category.kind === MAPPING_KIND.CONDITIONAL_MAPPING ? category : type).assetClass,
      reason: 'CONDITIONAL_NOT_BACKFILLED',
      fields: [category, type],
      persistable: false,
    };
  }

  if (category.value || type.value) {
    return {
      kind: MAPPING_KIND.AMBIGUOUS,
      assetClass: ASSET_CLASS.UNKNOWN,
      reason: 'AMBIGUOUS_LEGACY_TYPE',
      fields: [category, type],
      persistable: false,
    };
  }

  return {
    kind: MAPPING_KIND.UNSUPPORTED,
    assetClass: ASSET_CLASS.UNKNOWN,
    reason: 'NO_CLASSIFICATION_EVIDENCE',
    fields: [category, type],
    persistable: false,
  };
}

function previewLegacyBackfill(rows = []) {
  const counts = {
    total: rows.length,
    persistable: 0,
    skipped: 0,
    byClass: {},
    byKind: {},
    ambiguousValues: {},
  };
  const decisions = rows.map((row) => {
    const mapped = mapLegacyListingFields(row);
    counts.byKind[mapped.kind] = (counts.byKind[mapped.kind] || 0) + 1;
    counts.byClass[mapped.assetClass] = (counts.byClass[mapped.assetClass] || 0) + 1;
    if (mapped.persistable) counts.persistable += 1;
    else counts.skipped += 1;
    if (!mapped.persistable && (row.property_type || row.property_category)) {
      const key = `${row.property_category || ''}::${row.property_type || ''}`;
      counts.ambiguousValues[key] = (counts.ambiguousValues[key] || 0) + 1;
    }
    return { id: row.id || null, mapped };
  });
  return { counts, decisions };
}

module.exports = {
  MAPPING_KIND,
  EXACT_CATEGORY,
  EXACT_TYPE,
  CONDITIONAL_RESIDENTIAL_TYPES,
  normalizeToken,
  classifyListingFieldValue,
  mapLegacyListingFields,
  previewLegacyBackfill,
};
