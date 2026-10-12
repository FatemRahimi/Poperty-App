/**
 * User-declared canonical subject identity.
 * First-party evidence. Never VERIFIED_EXACT. Never paid lookup. Never fuzzy.
 * Source listing address remains on properties.*.
 */

const {
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
} = require('../../architecture/identityModel');
const { compactPostcode, sourceTrim, canonicalHouseToken, extractCanonicalAddress } = require('./canonicalAddress');
const { normalisePostcode } = require('../../utils/ukAddress');

const FORBIDDEN_TRUST_KEYS = Object.freeze([
  'verificationState',
  'verification_state',
  'identityState',
  'identity_state',
  'evidenceSourceType',
  'evidence_source_type',
  'identitySource',
  'identity_source',
  'provider',
  'matchMethod',
  'match_method',
  'matchConfidence',
  'match_confidence',
  'providerPayload',
  'provider_payload',
  'uprnVerificationState',
  'componentStates',
  'component_states',
]);

const FORBIDDEN_TRUST_VALUES = Object.freeze([
  'VERIFIED_EXACT',
  'OFFICIAL',
  'OFFICIAL_OPEN',
  'LICENSED_PROVIDER',
  'MHCLG_EPBD',
]);

const PROTECTED_UPRN_SOURCES = Object.freeze([
  IDENTITY_EVIDENCE_SOURCE_TYPE.OFFICIAL_OPEN,
  IDENTITY_EVIDENCE_SOURCE_TYPE.LICENSED_PROVIDER,
]);

function nonempty(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function collapseWhitespace(value) {
  const trimmed = sourceTrim(value).canonical;
  return trimmed || null;
}

function normalizePaon(value) {
  const text = collapseWhitespace(value);
  if (!text) return null;
  return canonicalHouseToken(text) || text;
}

function normalizeSaon(value) {
  return collapseWhitespace(value);
}

function normalizeBuildingName(value) {
  return collapseWhitespace(value);
}

function normalizeUprn(value) {
  const text = nonempty(value);
  if (!text) return { ok: true, uprn: null };
  const compact = text.replace(/\s+/g, '');
  if (!/^\d{1,12}$/.test(compact) || /^0+$/.test(compact)) {
    return { ok: false, error: 'INVALID_UPRN', uprn: null };
  }
  return { ok: true, uprn: compact.replace(/^0+/, '') || null };
}

function parseNestedIdentity(body = {}) {
  const raw = body.canonicalIdentity || body.canonical_identity || body.identity;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

function pick(body, nested, keys) {
  for (const key of keys) {
    if (body[key] != null && String(body[key]).trim() !== '') return body[key];
    if (nested[key] != null && String(nested[key]).trim() !== '') return nested[key];
  }
  return null;
}

function stripForbiddenTrust(input = {}) {
  const out = { ...input };
  FORBIDDEN_TRUST_KEYS.forEach((key) => {
    delete out[key];
  });
  Object.keys(out).forEach((key) => {
    const value = out[key];
    if (typeof value === 'string' && FORBIDDEN_TRUST_VALUES.includes(value.trim().toUpperCase())) {
      delete out[key];
    }
  });
  return out;
}

function parseDeclaredIdentityInput(body = {}) {
  const nested = stripForbiddenTrust(parseNestedIdentity(body));
  const safeBody = stripForbiddenTrust(body);
  const unit = pick(safeBody, nested, [
    'identity_saon',
    'identitySaon',
    'saon',
    'unitIdentifier',
    'unit_identifier',
    'identity_unit',
  ]);
  const uprnRaw = pick(safeBody, nested, ['identity_uprn', 'identityUprn', 'uprn']);
  const uprnResult = normalizeUprn(uprnRaw);
  return {
    postcode: collapseWhitespace(pick(safeBody, nested, [
      'identity_postcode',
      'identityPostcode',
      'canonicalPostcode',
    ])),
    paon: normalizePaon(pick(safeBody, nested, ['identity_paon', 'identityPaon', 'paon'])),
    saon: normalizeSaon(unit),
    buildingName: normalizeBuildingName(pick(safeBody, nested, [
      'identity_building_name',
      'identityBuildingName',
      'buildingName',
      'building_name',
    ])),
    uprn: uprnResult.uprn,
    uprnError: uprnResult.ok ? null : uprnResult.error,
    declaredFields: {
      postcode: Boolean(pick(safeBody, nested, ['identity_postcode', 'identityPostcode', 'canonicalPostcode'])),
      paon: Boolean(pick(safeBody, nested, ['identity_paon', 'identityPaon', 'paon'])),
      saon: Boolean(unit),
      buildingName: Boolean(pick(safeBody, nested, [
        'identity_building_name',
        'identityBuildingName',
        'buildingName',
        'building_name',
      ])),
      uprn: uprnRaw != null && String(uprnRaw).trim() !== '',
    },
  };
}

function hasDeclaredIdentityInput(body = {}) {
  const parsed = parseDeclaredIdentityInput(body);
  return Boolean(
    parsed.declaredFields.paon
    || parsed.declaredFields.saon
    || parsed.declaredFields.buildingName
    || parsed.declaredFields.uprn
    || parsed.declaredFields.postcode
  );
}

function parseComponentStates(value) {
  if (!value) return {};
  if (typeof value === 'object') return { ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function isUserDeclaredComponent(states, field) {
  return parseComponentStates(states)[field] === IDENTITY_VERIFICATION_STATE.USER_DECLARED;
}

function listingFieldsRespectingDeclaration(listing = {}, existing = {}) {
  const states = parseComponentStates(existing.component_states || existing.componentStates);
  const keep = (field, listingValue, existingValue) => (
    isUserDeclaredComponent(states, field) ? (existingValue || listingValue || null) : (listingValue || existingValue || null)
  );
  return {
    paon: keep('paon', listing.paon, existing.paon),
    saon: keep('saon', listing.saon, existing.saon),
    buildingName: keep(
      'buildingName',
      listing.buildingName,
      existing.building_name || existing.buildingName
    ),
    postcode: keep('postcode', listing.postcode, existing.postcode),
    postcodeCompact: keep(
      'postcode',
      listing.postcodeCompact,
      existing.postcode_compact || existing.postcodeCompact
    ),
    componentStates: states,
  };
}

function existingUprnIsProtected(existing) {
  const row = existing || {};
  const sourceType = row.evidence_source_type || row.evidenceSourceType;
  const source = String(row.identity_source || row.identitySource || row.provider || '');
  const method = String(row.match_method || row.matchMethod || '');
  if (PROTECTED_UPRN_SOURCES.includes(sourceType)) return true;
  if (source === 'MHCLG_EPBD' || method === 'mhclg_epb_unique_certificate') return true;
  const states = parseComponentStates(row.component_states || row.componentStates);
  if (states.uprn === IDENTITY_VERIFICATION_STATE.SOURCE_ASSERTED && row.uprn) return true;
  return false;
}

function existingUprnIsUserDeclared(existing) {
  const row = existing || {};
  const states = parseComponentStates(row.component_states || row.componentStates);
  if (states.uprn === IDENTITY_VERIFICATION_STATE.USER_DECLARED) return true;
  const sourceType = row.evidence_source_type || row.evidenceSourceType;
  return sourceType === IDENTITY_EVIDENCE_SOURCE_TYPE.USER_DECLARED
    && Boolean(row.uprn);
}

function toClientIdentitySnapshot(row, listing = {}) {
  if (!row && !listing) return null;
  const states = parseComponentStates(row?.component_states || row?.componentStates || listing.componentStates);
  const conflict = states.conflict === true || row?.conflictStatus === 'UPRN_CONFLICT';
  return {
    listingId: row?.property_id || listing.listingId || null,
    sourceAddress: row?.source_address || listing.sourceAddress || null,
    postcode: row?.postcode || listing.postcode || null,
    paon: row?.paon || listing.paon || null,
    saon: row?.saon || listing.saon || null,
    buildingName: row?.building_name || row?.buildingName || listing.buildingName || null,
    uprn: row?.uprn || listing.uprn || null,
    verificationState: row?.verification_state || row?.verificationState || listing.verificationState || IDENTITY_VERIFICATION_STATE.UNRESOLVED,
    componentStates: states,
    conflict,
    conflictStatus: conflict ? 'UPRN_CONFLICT' : 'NONE',
    userDeclaredIsNotVerified: true,
    uprnIsNotTitleNumber: true,
    buildingIsNotUnit: true,
    identitySource: row?.identity_source || listing.identitySource || null,
    evidenceSourceType: row?.evidence_source_type || listing.evidenceSourceType || null,
  };
}

function identityForOfficialAcquisition(property = {}, persisted = null) {
  const extracted = extractCanonicalAddress(property);
  const merged = listingFieldsRespectingDeclaration(extracted, persisted || {});
  const postcode = persisted?.postcode || extracted.postcode || property.zip_code || property.postcode || null;
  return {
    ...extracted,
    postcode,
    postcodeCompact: persisted?.postcode_compact || persisted?.postcodeCompact || extracted.postcodeCompact || compactPostcode(postcode),
    paon: merged.paon || persisted?.paon || extracted.paon || null,
    saon: merged.saon || persisted?.saon || extracted.saon || null,
    buildingName: merged.buildingName || persisted?.building_name || persisted?.buildingName || extracted.buildingName || null,
    uprn: persisted?.uprn || property.uprn || extracted.uprn || null,
    verificationState: persisted?.verification_state || persisted?.verificationState || extracted.verificationState,
    identitySource: persisted?.identity_source || persisted?.identitySource || extracted.identitySource,
    evidenceSourceType: persisted?.evidence_source_type || persisted?.evidenceSourceType || extracted.evidenceSourceType,
    componentStates: merged.componentStates,
  };
}

function declaredOverallState(declared, hadProtectedConflict) {
  if (hadProtectedConflict) return IDENTITY_VERIFICATION_STATE.UNRESOLVED;
  if (declared.paon || declared.saon || declared.uprn || declared.buildingName || declared.postcode) {
    return IDENTITY_VERIFICATION_STATE.USER_DECLARED;
  }
  return IDENTITY_VERIFICATION_STATE.UNRESOLVED;
}

module.exports = {
  FORBIDDEN_TRUST_KEYS,
  parseDeclaredIdentityInput,
  hasDeclaredIdentityInput,
  parseComponentStates,
  isUserDeclaredComponent,
  listingFieldsRespectingDeclaration,
  existingUprnIsProtected,
  existingUprnIsUserDeclared,
  toClientIdentitySnapshot,
  identityForOfficialAcquisition,
  declaredOverallState,
  normalizeUprn,
  normalizePaon,
  normalizeSaon,
  normalizeBuildingName,
  IDENTITY_VERIFICATION_STATE,
  IDENTITY_EVIDENCE_SOURCE_TYPE,
  normalisePostcode,
};
