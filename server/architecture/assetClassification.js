/**
 * Extensible asset classification. Does not guess a class from weak listing fields.
 * UNKNOWN is a valid, first-class result.
 */

const { ASSET_CLASSIFICATION_VERSION } = require('./versions');

const ASSET_CLASS = Object.freeze({
  RESIDENTIAL: 'RESIDENTIAL',
  COMMERCIAL: 'COMMERCIAL',
  INDUSTRIAL: 'INDUSTRIAL',
  AGRICULTURAL: 'AGRICULTURAL',
  LAND: 'LAND',
  DEVELOPMENT_SITE: 'DEVELOPMENT_SITE',
  MIXED_USE: 'MIXED_USE',
  UNKNOWN: 'UNKNOWN',
});

const CLASSIFICATION_METHOD = Object.freeze({
  DECLARED: 'DECLARED',
  AUTHORITATIVE: 'AUTHORITATIVE',
  INFERRED: 'INFERRED',
  UNKNOWN: 'UNKNOWN',
});

/** How the class became known. UNKNOWN is valid, not an error. */
const CLASSIFICATION_STATE = Object.freeze({
  DECLARED: 'DECLARED',
  AUTHORITATIVE: 'AUTHORITATIVE',
  INFERRED: 'INFERRED',
  UNKNOWN: 'UNKNOWN',
});

const CLASSIFICATION_STRENGTH = Object.freeze({
  UNKNOWN: 0,
  INFERRED: 1,
  DECLARED: 2,
  AUTHORITATIVE: 3,
});

const CLASSIFICATION_CONFIDENCE = Object.freeze({
  STATED: 'stated',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

/** Known subtype IDs — extensible. Not a classifier. */
const ASSET_SUBTYPES = Object.freeze({
  RESIDENTIAL: Object.freeze([
    'flat',
    'detached',
    'semi_detached',
    'terraced',
    'bungalow',
    'hmo',
    'other',
  ]),
  COMMERCIAL: Object.freeze(['office', 'retail', 'hospitality', 'leisure', 'mixed_commercial', 'other']),
  INDUSTRIAL: Object.freeze(['warehouse', 'logistics', 'manufacturing', 'workshop', 'other']),
  AGRICULTURAL: Object.freeze(['farmland', 'pasture', 'arable', 'agricultural_holding', 'other']),
  LAND: Object.freeze(['bare_land', 'amenity_land', 'strategic_land', 'other']),
  DEVELOPMENT_SITE: Object.freeze(['development_site', 'redevelopment_opportunity', 'other']),
  MIXED_USE: Object.freeze(['other']),
  UNKNOWN: Object.freeze(['other']),
});

function isKnownAssetClass(value) {
  return Object.values(ASSET_CLASS).includes(value);
}

/**
 * Resolve asset class without inventing one.
 * Inference is accepted only when an explicit source and confidence are supplied.
 */
function resolveAssetClass({ declared = null, inferred = null, inference = null } = {}) {
  if (isKnownAssetClass(declared) && declared !== ASSET_CLASS.UNKNOWN) {
    return {
      class: declared,
      method: CLASSIFICATION_METHOD.DECLARED,
      confidence: 'stated',
      provenance: inference?.declaredProvenance || null,
      version: ASSET_CLASSIFICATION_VERSION,
    };
  }

  const inferenceReady = Boolean(
    inference && inference.source && inference.confidence && isKnownAssetClass(inferred) && inferred !== ASSET_CLASS.UNKNOWN
  );
  if (inferenceReady) {
    return {
      class: inferred,
      method: CLASSIFICATION_METHOD.INFERRED,
      confidence: inference.confidence,
      provenance: {
        source: inference.source,
        method: inference.method || 'explicit_inference',
        limitations: inference.limitations || ['Inferred class is not observed fact.'],
      },
      version: ASSET_CLASSIFICATION_VERSION,
    };
  }

  return {
    class: ASSET_CLASS.UNKNOWN,
    method: CLASSIFICATION_METHOD.UNKNOWN,
    confidence: null,
    provenance: null,
    version: ASSET_CLASSIFICATION_VERSION,
  };
}

function resolveAssetSubtype(assetClass, subtype) {
  const cls = isKnownAssetClass(assetClass) ? assetClass : ASSET_CLASS.UNKNOWN;
  if (subtype == null || subtype === '') {
    return { class: cls, subtype: null, registered: false };
  }
  const known = ASSET_SUBTYPES[cls] || ASSET_SUBTYPES.UNKNOWN;
  const id = String(subtype);
  return {
    class: cls,
    subtype: id,
    registered: known.includes(id),
  };
}

function listingDoesNotImplyAssetClass(listing = {}) {
  return resolveAssetClass({
    declared: listing.assetClass || listing.asset_class || null,
    inferred: null,
    inference: null,
  });
}

function isKnownClassificationState(value) {
  return Object.values(CLASSIFICATION_STATE).includes(value);
}

function classificationStrength(state) {
  return CLASSIFICATION_STRENGTH[state] || 0;
}

/**
 * Snapshot for persistence and analysis. Does not invent a class.
 * `method` remains an alias of `state` for kernel compatibility.
 */
function createClassificationSnapshot({
  assetClass = ASSET_CLASS.UNKNOWN,
  subtype = null,
  state = CLASSIFICATION_STATE.UNKNOWN,
  provenance = null,
  confidence = null,
} = {}) {
  const cls = isKnownAssetClass(assetClass) ? assetClass : null;
  if (!cls) {
    return { ok: false, error: 'INVALID_ASSET_CLASS', assetClass };
  }
  const resolvedState = isKnownClassificationState(state) ? state : null;
  if (!resolvedState) {
    return { ok: false, error: 'INVALID_CLASSIFICATION_STATE', state };
  }
  if (cls !== ASSET_CLASS.UNKNOWN && resolvedState === CLASSIFICATION_STATE.UNKNOWN) {
    return { ok: false, error: 'CLASS_REQUIRES_KNOWN_STATE' };
  }
  if (cls === ASSET_CLASS.UNKNOWN && resolvedState !== CLASSIFICATION_STATE.UNKNOWN) {
    return { ok: false, error: 'UNKNOWN_CLASS_REQUIRES_UNKNOWN_STATE' };
  }
  if (cls !== ASSET_CLASS.UNKNOWN && !provenance) {
    return { ok: false, error: 'PROVENANCE_REQUIRED' };
  }
  if (resolvedState === CLASSIFICATION_STATE.INFERRED && !(provenance && provenance.source)) {
    return { ok: false, error: 'INFERRED_REQUIRES_PROVENANCE' };
  }
  const sub = resolveAssetSubtype(cls, subtype);
  return {
    ok: true,
    assetClass: cls,
    subtype: sub.subtype,
    subtypeRegistered: sub.registered,
    state: resolvedState,
    method: resolvedState,
    confidence: cls === ASSET_CLASS.UNKNOWN ? null : confidence,
    provenance: cls === ASSET_CLASS.UNKNOWN ? null : provenance,
    version: ASSET_CLASSIFICATION_VERSION,
  };
}

/**
 * Deterministic conflict rules. Same-strength conflicting classes are not
 * overwritten unless the caller marks the change as an explicit declaration.
 */
function applyClassificationChange({ existing = null, incoming, explicit = false } = {}) {
  if (!incoming || incoming.ok === false) {
    return { applied: false, reason: 'INVALID_INCOMING', existing: existing || null };
  }
  if (!existing || existing.assetClass === ASSET_CLASS.UNKNOWN) {
    return { applied: true, action: existing ? 'replaced_unknown' : 'created', result: incoming };
  }
  if (existing.assetClass === incoming.assetClass) {
    const stronger = classificationStrength(incoming.state) > classificationStrength(existing.state);
    if (stronger || explicit) {
      return { applied: true, action: stronger ? 'upgraded' : 'updated', result: incoming, previous: existing };
    }
    return { applied: false, reason: 'WEAKER_OR_EQUAL_SAME_CLASS', existing };
  }
  const incomingStronger = classificationStrength(incoming.state) > classificationStrength(existing.state);
  if (incomingStronger && incoming.state === CLASSIFICATION_STATE.AUTHORITATIVE) {
    return { applied: true, action: 'superseded_by_authoritative', result: incoming, previous: existing };
  }
  if (explicit && incoming.state === CLASSIFICATION_STATE.DECLARED) {
    return { applied: true, action: 'explicit_declaration_replaced', result: incoming, previous: existing };
  }
  return {
    applied: false,
    reason: 'CONFLICTING_CLASSIFICATION',
    existing,
    incoming,
  };
}

module.exports = {
  ASSET_CLASS,
  ASSET_SUBTYPES,
  CLASSIFICATION_METHOD,
  CLASSIFICATION_STATE,
  CLASSIFICATION_STRENGTH,
  CLASSIFICATION_CONFIDENCE,
  ASSET_CLASSIFICATION_VERSION,
  isKnownAssetClass,
  isKnownClassificationState,
  classificationStrength,
  resolveAssetClass,
  resolveAssetSubtype,
  listingDoesNotImplyAssetClass,
  createClassificationSnapshot,
  applyClassificationChange,
};
