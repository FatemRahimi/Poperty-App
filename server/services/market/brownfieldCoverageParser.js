/**
 * Deterministic parsers for supplied Planning Data coverage payloads.
 * No network. No brownfield site observations. No geometry retention.
 */

const {
  LPA_DATASET,
  PROVIDER_INDEX_URL,
} = require('../../architecture/officialBrownfieldCoverage');

const REJECTED_ORGANISATION_DATASETS = new Set([
  'brownfield-land',
  'local-planning-authority',
  'planning-application',
]);

function blank(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseSourceDate(value) {
  const text = blank(value);
  if (!text) return { ok: true, value: null };
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (!match) return { ok: false, reason: 'invalid_source_date' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'invalid_source_date' };
  }
  return { ok: true, value: `${match[1]}-${match[2]}-${match[3]}` };
}

function parseEntityId(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, reason: 'missing_source_entity_id' };
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      return { ok: false, reason: 'invalid_source_entity_id' };
    }
    return { ok: true, value: raw };
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'invalid_source_entity_id' };
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return { ok: false, reason: 'invalid_source_entity_id' };
  }
  return { ok: true, value: number };
}

function parseExactCode(value) {
  const text = blank(value);
  if (!text) return { ok: true, value: null };
  if (/\s/.test(text)) return { ok: false, reason: 'invalid_identifier' };
  return { ok: true, value: text };
}

function asArray(payload, key) {
  if (Array.isArray(payload)) return { ok: true, rows: payload };
  if (payload && typeof payload === 'object' && Array.isArray(payload[key])) {
    return { ok: true, rows: payload[key] };
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.entities)) {
    return { ok: true, rows: payload.entities };
  }
  return { ok: false, reason: 'invalid_payload' };
}

function fail(reason) {
  return { ok: false, reason, rows: [] };
}

function parseLpaIdentity(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_lpa_object' };
  }
  const dataset = blank(raw.dataset);
  if (dataset && dataset !== LPA_DATASET) {
    return { ok: false, reason: 'unexpected_dataset' };
  }
  const entityId = parseEntityId(raw.entity ?? raw.sourceEntityId);
  if (!entityId.ok) return entityId;
  const reference = parseExactCode(raw.reference);
  if (!reference.ok) return reference;
  if (!reference.value) return { ok: false, reason: 'missing_lpa_reference' };
  const name = blank(raw.name);
  if (!name) return { ok: false, reason: 'missing_lpa_name' };
  const entryDate = parseSourceDate(raw['entry-date'] ?? raw.entryDate);
  if (!entryDate.ok) return entryDate;
  const startDate = parseSourceDate(raw['start-date'] ?? raw.startDate);
  if (!startDate.ok) return startDate;
  const endDate = parseSourceDate(raw['end-date'] ?? raw.endDate);
  if (!endDate.ok) return endDate;
  return {
    ok: true,
    row: {
      sourceEntityId: entityId.value,
      name,
      reference: reference.value,
      entryDate: entryDate.value,
      startDate: startDate.value,
      endDate: endDate.value,
    },
  };
}

function parseLpaIdentityPayload(payload) {
  const list = asArray(payload, 'identities');
  if (!list.ok) return fail(list.reason);
  const rows = [];
  const seenEntity = new Map();
  const seenReference = new Map();
  for (let index = 0; index < list.rows.length; index += 1) {
    const parsed = parseLpaIdentity(list.rows[index]);
    if (!parsed.ok) return fail(parsed.reason || 'invalid_lpa_identity');
    const previousEntity = seenEntity.get(parsed.row.sourceEntityId);
    if (previousEntity && previousEntity !== parsed.row.reference) {
      return fail('duplicate_lpa_entity');
    }
    const previousReference = seenReference.get(parsed.row.reference);
    if (previousReference && previousReference !== parsed.row.sourceEntityId) {
      return fail('duplicate_lpa_reference');
    }
    seenEntity.set(parsed.row.sourceEntityId, parsed.row.reference);
    seenReference.set(parsed.row.reference, parsed.row.sourceEntityId);
    rows.push(parsed.row);
  }
  rows.sort((a, b) => a.sourceEntityId - b.sourceEntityId);
  return { ok: true, rows };
}

function decodeHtmlText(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNonContentHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * Official provider index is HTML. An unrecognised document is a source error,
 * never a successful empty provider list.
 */
function parseBrownfieldProviderIndexHtml(html) {
  if (typeof html !== 'string' || !html.trim()) {
    return fail('provider_index_html_missing');
  }
  if (!/data-provider\/brownfield-land|\/data-provider\/brownfield-land/i.test(html)
    && !/brownfield-land/i.test(html)) {
    return fail('provider_index_structure_unrecognised');
  }
  if (!/data-provider/i.test(html)) {
    return fail('provider_index_structure_unrecognised');
  }
  const document = stripNonContentHtml(html);
  const pattern = /<a\b[^>]*href=(["'])(?:https?:\/\/www\.planning\.data\.gov\.uk)?\/entity\/(\d+)\1[^>]*>([^<]+)<\/a>/gi;
  const byId = new Map();
  let match = pattern.exec(document);
  while (match) {
    const organisationEntity = Number(match[2]);
    const name = decodeHtmlText(match[3]);
    if (!Number.isSafeInteger(organisationEntity) || organisationEntity <= 0 || !name) {
      return fail('provider_index_anchor_unusable');
    }
    if (!/[A-Za-z]/.test(name)) return fail('provider_index_anchor_unusable');
    const previous = byId.get(organisationEntity);
    if (previous && previous !== name) return fail('provider_index_conflicting_name');
    byId.set(organisationEntity, name);
    match = pattern.exec(document);
  }
  if (!byId.size) return fail('provider_index_structure_unrecognised');
  const rows = [...byId.entries()]
    .map(([organisationEntity, name]) => ({ organisationEntity, name }))
    .sort((a, b) => a.organisationEntity - b.organisationEntity);
  return { ok: true, rows, sourceUrl: PROVIDER_INDEX_URL };
}

function parseProviderIndexRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_provider_object' };
  }
  const organisationEntity = parseEntityId(
    raw.organisationEntity ?? raw['organisation-entity'] ?? raw.entity
  );
  if (!organisationEntity.ok) return organisationEntity;
  const name = blank(raw.name ?? raw.organisationName);
  if (!name) return { ok: false, reason: 'missing_provider_name' };
  return {
    ok: true,
    row: { organisationEntity: organisationEntity.value, name },
  };
}

function parseProviderIndexPayload(payload) {
  if (typeof payload === 'string') return parseBrownfieldProviderIndexHtml(payload);
  const list = asArray(payload, 'providers');
  if (!list.ok) return fail(list.reason);
  const rows = [];
  const seen = new Map();
  for (let index = 0; index < list.rows.length; index += 1) {
    const parsed = parseProviderIndexRecord(list.rows[index]);
    if (!parsed.ok) return fail(parsed.reason || 'invalid_provider');
    const previous = seen.get(parsed.row.organisationEntity);
    if (previous && previous !== parsed.row.name) return fail('provider_index_conflicting_name');
    seen.set(parsed.row.organisationEntity, parsed.row.name);
    rows.push(parsed.row);
  }
  const unique = [...seen.entries()]
    .map(([organisationEntity, name]) => ({ organisationEntity, name }))
    .sort((a, b) => a.organisationEntity - b.organisationEntity);
  return { ok: true, rows: unique };
}

function parseOrganisationRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_organisation_object' };
  }
  const dataset = blank(raw.dataset);
  if (dataset && REJECTED_ORGANISATION_DATASETS.has(dataset)) {
    return { ok: false, reason: 'unexpected_dataset' };
  }
  const organisationEntity = parseEntityId(raw.entity ?? raw.organisationEntity ?? raw.sourceEntityId);
  if (!organisationEntity.ok) return organisationEntity;
  const name = blank(raw.name);
  if (!name) return { ok: false, reason: 'missing_organisation_name' };
  const lpaCode = parseExactCode(raw['local-planning-authority'] ?? raw.localPlanningAuthority);
  if (!lpaCode.ok) return { ok: false, reason: 'invalid_lpa_code' };
  const statisticalGeography = parseExactCode(
    raw['statistical-geography'] ?? raw.statisticalGeography
  );
  if (!statisticalGeography.ok) return { ok: false, reason: 'invalid_statistical_geography' };
  const startDate = parseSourceDate(raw['start-date'] ?? raw.startDate);
  if (!startDate.ok) return startDate;
  const endDate = parseSourceDate(raw['end-date'] ?? raw.endDate);
  if (!endDate.ok) return endDate;
  return {
    ok: true,
    row: {
      organisationEntity: organisationEntity.value,
      name,
      localPlanningAuthorityCode: lpaCode.value,
      statisticalGeography: statisticalGeography.value,
      startDate: startDate.value,
      endDate: endDate.value,
    },
  };
}

function parseOrganisationPayload(payload) {
  const list = asArray(payload, 'organisations');
  if (!list.ok) return fail(list.reason);
  const byId = new Map();
  for (let index = 0; index < list.rows.length; index += 1) {
    const parsed = parseOrganisationRecord(list.rows[index]);
    if (!parsed.ok) return fail(parsed.reason || 'invalid_organisation');
    const previous = byId.get(parsed.row.organisationEntity);
    if (previous) {
      const same = previous.localPlanningAuthorityCode === parsed.row.localPlanningAuthorityCode
        && previous.name === parsed.row.name
        && previous.statisticalGeography === parsed.row.statisticalGeography
        && previous.startDate === parsed.row.startDate
        && previous.endDate === parsed.row.endDate;
      if (!same) return fail('duplicate_organisation_entity');
    }
    byId.set(parsed.row.organisationEntity, parsed.row);
  }
  const rows = [...byId.values()].sort((a, b) => a.organisationEntity - b.organisationEntity);
  return { ok: true, rows };
}

module.exports = {
  blank,
  parseSourceDate,
  parseEntityId,
  parseLpaIdentityPayload,
  parseBrownfieldProviderIndexHtml,
  parseProviderIndexPayload,
  parseOrganisationPayload,
};
