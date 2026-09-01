/**
 * Live-safe asset classification. Display and persistence only.
 * Does not calculate valuation, rent, finance, PD, or DI.
 */

const {
  ASSET_CLASS,
  CLASSIFICATION_STATE,
  CLASSIFICATION_CONFIDENCE,
  ASSET_CLASSIFICATION_VERSION,
  isKnownAssetClass,
  createClassificationSnapshot,
  applyClassificationChange,
  resolveAssetSubtype,
} = require('../../architecture/assetClassification');
const { mapLegacyListingFields } = require('./legacyListingTypeMapping');
const repo = require('./assetClassificationRepository');

const PROVIDER_TYPE_MAPPING_KIND = Object.freeze({
  CONDITIONAL_MAPPING: 'CONDITIONAL_MAPPING',
  UNSUPPORTED: 'UNSUPPORTED',
});

function unknownSnapshot() {
  return createClassificationSnapshot({
    assetClass: ASSET_CLASS.UNKNOWN,
    state: CLASSIFICATION_STATE.UNKNOWN,
  });
}

function snapshotFromPersisted(row) {
  if (!row) return null;
  return createClassificationSnapshot({
    assetClass: row.assetClass,
    subtype: row.subtype,
    state: row.state,
    confidence: row.confidence,
    provenance: row.provenance && Object.keys(row.provenance).length ? row.provenance : null,
  });
}

function declaredProvenance({ source, sourceField, sourceValue, actorUserId = null } = {}) {
  return {
    sourceType: 'FIRST_PARTY',
    source: source || 'UserDeclaration',
    sourceField: sourceField || 'assetClass',
    sourceValue: sourceValue || null,
    classificationMethod: CLASSIFICATION_STATE.DECLARED,
    actorUserId,
  };
}

function legacyMappingProvenance(mapped) {
  return {
    sourceType: 'FIRST_PARTY',
    source: 'LegacyListingField',
    sourceField: mapped.sourceField,
    sourceValue: mapped.sourceValue,
    classificationMethod: CLASSIFICATION_STATE.DECLARED,
    mappingKind: mapped.kind,
    mappingVersion: 'legacy-listing-type-mapping-1.0.0',
  };
}

function declareAssetClass({
  assetClass,
  subtype = null,
  source = 'UserDeclaration',
  sourceField = 'assetClass',
  actorUserId = null,
} = {}) {
  if (!isKnownAssetClass(assetClass)) {
    return { ok: false, error: 'INVALID_ASSET_CLASS', assetClass };
  }
  if (subtype && !assetClass) {
    return { ok: false, error: 'SUBTYPE_CANNOT_CREATE_CLASS' };
  }
  const sub = resolveAssetSubtype(assetClass, subtype);
  return createClassificationSnapshot({
    assetClass,
    subtype: sub.subtype,
    state: assetClass === ASSET_CLASS.UNKNOWN
      ? CLASSIFICATION_STATE.UNKNOWN
      : CLASSIFICATION_STATE.DECLARED,
    confidence: assetClass === ASSET_CLASS.UNKNOWN ? null : CLASSIFICATION_CONFIDENCE.STATED,
    provenance: assetClass === ASSET_CLASS.UNKNOWN
      ? null
      : declaredProvenance({
        source,
        sourceField,
        sourceValue: assetClass,
        actorUserId,
      }),
  });
}

function inferredAssetClass({ assetClass, subtype = null, inference } = {}) {
  if (!inference || !inference.source || !inference.confidence) {
    return unknownSnapshot();
  }
  if (!isKnownAssetClass(assetClass) || assetClass === ASSET_CLASS.UNKNOWN) {
    return unknownSnapshot();
  }
  return createClassificationSnapshot({
    assetClass,
    subtype,
    state: CLASSIFICATION_STATE.INFERRED,
    confidence: inference.confidence,
    provenance: {
      sourceType: inference.sourceType || 'DERIVED',
      source: inference.source,
      classificationMethod: CLASSIFICATION_STATE.INFERRED,
      method: inference.method || 'explicit_inference',
      limitations: inference.limitations || ['Inferred class is not observed fact.'],
    },
  });
}

function authoritativeAssetClass({ assetClass, subtype = null, provenance } = {}) {
  if (!provenance || !provenance.source) {
    return { ok: false, error: 'AUTHORITATIVE_REQUIRES_PROVENANCE' };
  }
  if (!isKnownAssetClass(assetClass) || assetClass === ASSET_CLASS.UNKNOWN) {
    return unknownSnapshot();
  }
  return createClassificationSnapshot({
    assetClass,
    subtype,
    state: CLASSIFICATION_STATE.AUTHORITATIVE,
    confidence: CLASSIFICATION_CONFIDENCE.STATED,
    provenance: {
      ...provenance,
      sourceType: provenance.sourceType || 'OFFICIAL',
      classificationMethod: CLASSIFICATION_STATE.AUTHORITATIVE,
    },
  });
}

/**
 * PropertyData / listing dwelling strings are residential-leaning but not
 * authoritative class evidence. This adapter never persists a class.
 */
function mapProviderPropertyType(providerType) {
  if (providerType == null || providerType === '') {
    return {
      kind: PROVIDER_TYPE_MAPPING_KIND.UNSUPPORTED,
      assetClass: ASSET_CLASS.UNKNOWN,
      persistable: false,
      reason: 'NO_PROVIDER_TYPE',
    };
  }
  return {
    kind: PROVIDER_TYPE_MAPPING_KIND.CONDITIONAL_MAPPING,
    assetClass: ASSET_CLASS.UNKNOWN,
    suggestedClass: ASSET_CLASS.RESIDENTIAL,
    persistable: false,
    reason: 'PROVIDER_TYPE_IS_NOT_CANONICAL_CLASS',
    sourceValue: String(providerType),
  };
}

function resolveFromListingFields(listing = {}) {
  const mapped = mapLegacyListingFields(listing);
  if (!mapped.persistable) return unknownSnapshot();
  return createClassificationSnapshot({
    assetClass: mapped.assetClass,
    state: CLASSIFICATION_STATE.DECLARED,
    confidence: CLASSIFICATION_CONFIDENCE.STATED,
    provenance: legacyMappingProvenance(mapped),
  });
}

function publicClassification(snapshot) {
  const resolved = snapshot && snapshot.ok !== false ? snapshot : unknownSnapshot();
  return {
    assetClass: resolved.assetClass,
    subtype: resolved.subtype || null,
    subtypeRegistered: Boolean(resolved.subtypeRegistered),
    state: resolved.state,
    provenance: resolved.provenance
      ? {
        sourceType: resolved.provenance.sourceType || null,
        source: resolved.provenance.source || null,
        sourceField: resolved.provenance.sourceField || null,
        classificationMethod: resolved.provenance.classificationMethod || resolved.state,
        mappingKind: resolved.provenance.mappingKind || null,
      }
      : null,
    version: resolved.version || ASSET_CLASSIFICATION_VERSION,
    confidence: resolved.confidence,
  };
}

async function loadPersistedClassification({ listingId = null, subjectId = null } = {}) {
  if (listingId != null) {
    const row = await repo.findByListingId(listingId);
    const snap = snapshotFromPersisted(row);
    if (snap && snap.ok) return { snapshot: snap, persisted: row };
  }
  if (subjectId != null) {
    const row = await repo.findBySubjectId(subjectId);
    const snap = snapshotFromPersisted(row);
    if (snap && snap.ok) return { snapshot: snap, persisted: row };
  }
  return { snapshot: null, persisted: null };
}

async function applyAndPersist({
  existing = null,
  incoming,
  listingId = null,
  subjectId = null,
  explicit = false,
  actorUserId = null,
  client,
} = {}) {
  const decision = applyClassificationChange({ existing, incoming, explicit });
  const queryClient = client || undefined;
  if (!decision.applied) {
    await repo.recordEvent({
      listingId,
      subjectId,
      previousAssetClass: existing?.assetClass,
      nextAssetClass: incoming?.assetClass,
      previousState: existing?.state,
      nextState: incoming?.state,
      action: 'conflict_rejected',
      reason: decision.reason,
      actorUserId,
      payload: { explicit },
    }, queryClient);
    return { ...decision, persisted: existing };
  }
  let persisted = decision.result;
  try {
    persisted = await repo.upsertClassification({
      snapshot: decision.result,
      listingId,
      subjectId,
      actorUserId,
    }, queryClient);
  } catch (error) {
    if (repo.isMissingTable(error)) {
      return { ...decision, persisted: decision.result, persistence: 'schema_missing' };
    }
    throw error;
  }
  await repo.recordEvent({
    classificationId: persisted?.id,
    listingId,
    subjectId,
    previousAssetClass: existing?.assetClass,
    nextAssetClass: decision.result.assetClass,
    previousState: existing?.state,
    nextState: decision.result.state,
    action: decision.action,
    actorUserId,
    payload: { explicit },
  }, queryClient);
  return { ...decision, persisted: persisted || decision.result };
}

async function persistListingClassificationFromSubmission({
  listingId,
  userId = null,
  assetClass = null,
  subtype = null,
  propertyCategory = null,
  propertyType = null,
  explicit = false,
  client,
} = {}) {
  const existingLoad = await loadPersistedClassification({ listingId });
  const existing = existingLoad.snapshot;

  let incoming = null;
  if (explicit && assetClass != null && assetClass !== '') {
    incoming = declareAssetClass({
      assetClass,
      subtype,
      actorUserId: userId,
    });
  } else {
    incoming = resolveFromListingFields({
      property_category: propertyCategory,
      property_type: propertyType,
    });
  }

  if (!incoming || incoming.ok === false) {
    return incoming;
  }
  if (incoming.assetClass === ASSET_CLASS.UNKNOWN && !existing) {
    return { applied: false, reason: 'REMAINS_UNKNOWN', result: incoming };
  }

  return applyAndPersist({
    existing,
    incoming,
    listingId,
    explicit: Boolean(explicit && assetClass),
    actorUserId: userId,
    client,
  });
}

function previewLegacyClassificationBackfill(rows) {
  const { previewLegacyBackfill } = require('./legacyListingTypeMapping');
  return previewLegacyBackfill(rows);
}

async function applyLegacyClassificationBackfill(rows, { actorUserId = null } = {}) {
  const preview = previewLegacyClassificationBackfill(rows);
  const applied = [];
  for (const row of preview.decisions) {
    if (!row.mapped.persistable || row.id == null) continue;
    const incoming = createClassificationSnapshot({
      assetClass: row.mapped.assetClass,
      state: CLASSIFICATION_STATE.DECLARED,
      confidence: CLASSIFICATION_CONFIDENCE.STATED,
      provenance: legacyMappingProvenance(row.mapped),
    });
    const existingLoad = await loadPersistedClassification({ listingId: row.id });
    const result = await applyAndPersist({
      existing: existingLoad.snapshot,
      incoming,
      listingId: row.id,
      explicit: false,
      actorUserId,
    });
    applied.push({ listingId: row.id, ...result });
  }
  return { preview, applied };
}

module.exports = {
  unknownSnapshot,
  declareAssetClass,
  inferredAssetClass,
  authoritativeAssetClass,
  resolveFromListingFields,
  mapProviderPropertyType,
  publicClassification,
  loadPersistedClassification,
  applyAndPersist,
  persistListingClassificationFromSubmission,
  previewLegacyClassificationBackfill,
  applyLegacyClassificationBackfill,
  snapshotFromPersisted,
};
