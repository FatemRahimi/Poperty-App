/**
 * Analyse-time classification + residential methodology gate.
 * Does not implement non-residential valuation or rental engines.
 */

const {
  ASSET_CLASS,
  CLASSIFICATION_STATE,
  ASSET_CLASSIFICATION_VERSION,
} = require('../../architecture/assetClassification');
const {
  unknownSnapshot,
  publicClassification,
  snapshotFromPersisted,
  declareAssetClass,
  resolveFromListingFields,
} = require('./assetClassificationService');

const LEGACY_RESIDENTIAL_COMPATIBILITY_VERSION = 'legacy-residential-compatibility-1.0.0';

const NON_RESIDENTIAL_CLASSES = Object.freeze([
  ASSET_CLASS.COMMERCIAL,
  ASSET_CLASS.INDUSTRIAL,
  ASSET_CLASS.AGRICULTURAL,
  ASSET_CLASS.LAND,
  ASSET_CLASS.DEVELOPMENT_SITE,
  ASSET_CLASS.MIXED_USE,
]);

function readInlineClassification(source = {}) {
  if (!source || typeof source !== 'object') return null;
  const inline = source.assetClassification || source.asset_classification || null;
  if (inline && inline.assetClass) return inline;
  if (source.assetClass || source.asset_class) {
    return { assetClass: source.assetClass || source.asset_class, subtype: source.subtype || source.assetSubtype };
  }
  return null;
}

function snapshotFromInline(inline) {
  if (!inline) return null;
  if (inline.state && inline.assetClass) {
    const fromPersisted = snapshotFromPersisted({
      assetClass: inline.assetClass,
      subtype: inline.subtype,
      state: inline.state,
      confidence: inline.confidence,
      provenance: inline.provenance,
    });
    if (fromPersisted && fromPersisted.ok) return fromPersisted;
  }
  if (inline.assetClass) {
    const declared = declareAssetClass({
      assetClass: inline.assetClass,
      subtype: inline.subtype,
      source: inline.provenance?.source || 'AnalysisInput',
      sourceField: 'assetClassification',
    });
    if (declared && declared.ok) return declared;
  }
  return null;
}

/**
 * Runtime resolution. Persisted / explicit declaration wins.
 * Exact-safe first-party class words may classify at analyse time.
 * Dwelling types (flat, terraced, office, …) never invent a class.
 */
function resolveRuntimeClassification({
  property = {},
  access = {},
  target = {},
  options = {},
  persisted = null,
} = {}) {
  const inline = snapshotFromInline(
    readInlineClassification(options)
    || readInlineClassification(property)
    || persisted
  );
  if (inline && inline.ok !== false && inline.assetClass && inline.assetClass !== ASSET_CLASS.UNKNOWN) {
    return publicClassification(inline);
  }
  const fromFields = resolveFromListingFields(property);
  if (fromFields && fromFields.ok !== false && fromFields.assetClass !== ASSET_CLASS.UNKNOWN) {
    return publicClassification(fromFields);
  }
  return publicClassification(unknownSnapshot());
}

function residentialMethodologyGate(classification) {
  const assetClass = classification?.assetClass || ASSET_CLASS.UNKNOWN;
  if (assetClass === ASSET_CLASS.RESIDENTIAL) {
    return {
      allowed: true,
      mode: 'RESIDENTIAL_SUPPORTED',
      assetClass,
      version: ASSET_CLASSIFICATION_VERSION,
      note: 'Current residential Property Intelligence methodology is supported for this asset class.',
    };
  }
  if (NON_RESIDENTIAL_CLASSES.includes(assetClass)) {
    return {
      allowed: false,
      mode: 'NOT_SUPPORTED_FOR_ASSET_CLASS',
      code: 'NOT_SUPPORTED_FOR_ASSET_CLASS',
      assetClass,
      version: ASSET_CLASSIFICATION_VERSION,
      note: `Residential valuation and rental methodology is not valid for ${assetClass}. No substitute multi-asset valuation was generated.`,
    };
  }
  return {
    allowed: true,
    mode: 'LEGACY_RESIDENTIAL_COMPATIBILITY',
    assetClass: ASSET_CLASS.UNKNOWN,
    version: LEGACY_RESIDENTIAL_COMPATIBILITY_VERSION,
    temporary: true,
    equivalentToResidentialClass: false,
    note: 'Classification is UNKNOWN. The current residential product ran for compatibility. This does not classify the asset as RESIDENTIAL.',
  };
}

function unsupportedResidentialValuation(gate) {
  return {
    success: false,
    notAssessed: true,
    assessmentState: 'notAssessed',
    code: gate.code || 'NOT_SUPPORTED_FOR_ASSET_CLASS',
    message: gate.note,
    residentialMethodology: gate,
  };
}

function unsupportedResidentialRent(gate) {
  return {
    success: false,
    notAssessed: true,
    assessmentState: 'notAssessed',
    code: gate.code || 'NOT_SUPPORTED_FOR_ASSET_CLASS',
    message: gate.note,
    comparables: [],
    residentialMethodology: gate,
  };
}

async function attachPersistedClassification(property, access = {}, target = {}) {
  if (!property) return property;
  try {
    const {
      loadPersistedClassification,
      publicClassification,
    } = require('./assetClassificationService');
    const loaded = await loadPersistedClassification({
      listingId: property.id ?? access.propertyId ?? target.propertyId ?? null,
      subjectId: property.subjectId ?? access.subjectId ?? target.subjectId ?? null,
    });
    if (!loaded.snapshot) return property;
    return { ...property, assetClassification: publicClassification(loaded.snapshot) };
  } catch {
    return property;
  }
}

function attachIdentityBoundary(identity = {}, classification) {
  return {
    ...identity,
    entityKind: identity.listingId ? 'LISTING' : identity.subjectId ? 'SUBJECT' : 'PROPERTY',
    uprnIdentifiesAddressableContext: Boolean(identity.uprn),
    uprnIsNotAssetClass: true,
    uprnIsNotLandParcel: true,
    uprnIsNotTitle: true,
    uprnIsNotSite: true,
    classificationState: classification?.state || CLASSIFICATION_STATE.UNKNOWN,
  };
}

module.exports = {
  LEGACY_RESIDENTIAL_COMPATIBILITY_VERSION,
  NON_RESIDENTIAL_CLASSES,
  resolveRuntimeClassification,
  residentialMethodologyGate,
  unsupportedResidentialValuation,
  unsupportedResidentialRent,
  attachIdentityBoundary,
  attachPersistedClassification,
};
