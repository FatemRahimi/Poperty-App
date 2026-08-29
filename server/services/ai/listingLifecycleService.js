/**
 * First-party listing lifecycle evidence — capture, persistence, provenance.
 *
 * Events are evidence, not a demand score. Missing events stay notAssessed.
 * Absence of listing_engagement_daily rows is unknown, never zero engagement.
 */

const { createProvenance } = require('../../utils/provenance');

const SUPPORTED_EVENT_TYPES = Object.freeze([
  'listing_created',
  'first_published',
  'price_changed',
  'status_changed',
  'under_offer',
  'sold',
  'let',
  'withdrawn',
]);

const ONCE_ONLY_EVENT_TYPES = Object.freeze([
  'listing_created',
  'first_published',
  'under_offer',
  'sold',
  'let',
  'withdrawn',
]);

const LIFECYCLE_NOTES =
  'First-party listing lifecycle event. Not a demand score, time-to-let, or probability of sale/let.';

function numericOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numbersEqual(a, b) {
  const x = numericOrNull(a);
  const y = numericOrNull(b);
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  return x === y;
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function askingSnapshot(row = {}) {
  return {
    price: numericOrNull(row.price),
    monthly_rent: numericOrNull(row.monthly_rent),
    weekly_rent: numericOrNull(row.weekly_rent),
  };
}

function askingFieldsChanged(previous, next) {
  const from = askingSnapshot(previous);
  const to = askingSnapshot(next);
  const fields = [];
  if (!numbersEqual(from.price, to.price)) fields.push('price');
  if (!numbersEqual(from.monthly_rent, to.monthly_rent)) fields.push('monthly_rent');
  if (!numbersEqual(from.weekly_rent, to.weekly_rent)) fields.push('weekly_rent');
  return { from, to, fields };
}

function shouldRecordPriceChange(previous, next) {
  return askingFieldsChanged(previous, next).fields.length > 0;
}

function shouldRecordStatusChange(previous, next) {
  const from = textOrNull(previous?.status);
  const to = textOrNull(next?.status);
  return Boolean(from && to && from !== to);
}

function shouldRecordFirstPublished(previous, next) {
  const alreadyPublished = Boolean(previous?.first_published_at);
  const nowPublished = textOrNull(next?.status) === 'approved' && Boolean(next?.first_published_at);
  return !alreadyPublished && nowPublished;
}

function isoTimestamp(value, fallback = new Date()) {
  const d = value ? new Date(value) : fallback;
  if (Number.isNaN(d.getTime())) return fallback.toISOString();
  return d.toISOString();
}

function buildProvenance({ eventAt, recordedAt = null, method, actorUserId = null, notes = LIFECYCLE_NOTES }) {
  return createProvenance({
    source: 'ApplicationDatabase',
    method,
    observedAt: eventAt,
    retrievedAt: recordedAt || eventAt,
    notes,
  });
}

function buildEvent({
  eventType,
  propertyId,
  eventAt,
  recordedAt = null,
  actorUserId = null,
  identity = {},
  payload = {},
  method,
}) {
  if (!SUPPORTED_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unsupported listing lifecycle event type: ${eventType}`);
  }
  const property_id = Number(propertyId);
  if (!Number.isInteger(property_id) || property_id <= 0) {
    throw new Error('listing lifecycle events require a genuine listing id');
  }
  const at = isoTimestamp(eventAt);
  const recorded = recordedAt ? isoTimestamp(recordedAt) : at;
  return {
    property_id,
    event_type: eventType,
    event_at: at,
    actor_user_id: actorUserId != null ? Number(actorUserId) || null : null,
    payload: {
      ...payload,
      uprn: identity.uprn || null,
      subjectId: identity.subjectId || null,
    },
    provenance: buildProvenance({ eventAt: at, recordedAt: recorded, method, actorUserId }),
  };
}

function isUniqueViolation(error) {
  return error && (error.code === '23505' || /duplicate key/i.test(String(error.message || '')));
}

function isMissingRelation(error) {
  return error && (error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || '')));
}

async function lookupListingIdentity(client, propertyId) {
  if (!client?.query || !propertyId) return { uprn: null, subjectId: null };
  try {
    const identity = await client.query(
      `SELECT uprn FROM property_identities
       WHERE property_id = $1 AND uprn IS NOT NULL
       LIMIT 1`,
      [propertyId]
    );
    let subjectId = null;
    try {
      const subject = await client.query(
        `SELECT id FROM intelligence_subjects
         WHERE property_id = $1
         LIMIT 1`,
        [propertyId]
      );
      subjectId = subject.rows[0]?.id || null;
    } catch {
      subjectId = null;
    }
    return {
      uprn: identity.rows[0]?.uprn || null,
      subjectId,
    };
  } catch {
    return { uprn: null, subjectId: null };
  }
}

async function recordListingEvent(client, eventInput) {
  const event = eventInput.event_type ? eventInput : buildEvent(eventInput);
  const payload = { ...event.payload };
  delete payload.demandScore;

  try {
    const result = await client.query(
      `INSERT INTO listing_events
        (property_id, event_type, event_at, actor_user_id, payload, provenance)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        event.property_id,
        event.event_type,
        event.event_at,
        event.actor_user_id,
        JSON.stringify(payload),
        JSON.stringify(event.provenance),
      ]
    );
    return { recorded: true, duplicate: false, row: result.rows[0] || event };
  } catch (error) {
    if (ONCE_ONLY_EVENT_TYPES.includes(event.event_type) && isUniqueViolation(error)) {
      return { recorded: false, duplicate: true, row: null };
    }
    if (isMissingRelation(error)) {
      return { recorded: false, duplicate: false, row: null, skipped: 'schema_unavailable' };
    }
    throw error;
  }
}

async function collectAfterCreate(client, { property, actorUserId = null, identity = null } = {}) {
  if (!property?.id) return { events: [] };
  const resolvedIdentity = identity || (await lookupListingIdentity(client, property.id));
  const result = await recordListingEvent(client, buildEvent({
    eventType: 'listing_created',
    propertyId: property.id,
    eventAt: property.created_at || new Date(),
    actorUserId,
    identity: resolvedIdentity,
    method: 'listing_created',
    payload: {
      status: property.status || 'pending',
      category: property.category || null,
      asking: askingSnapshot(property),
    },
  }));
  return { events: result.recorded ? [result.row] : [] };
}

async function collectAfterUpdate(client, { previous, next, actorUserId = null, identity = null } = {}) {
  if (!next?.id || !previous) return { events: [] };
  const resolvedIdentity = identity || (await lookupListingIdentity(client, next.id));
  const recorded = [];

  if (shouldRecordPriceChange(previous, next)) {
    const { from, to, fields } = askingFieldsChanged(previous, next);
    const result = await recordListingEvent(client, buildEvent({
      eventType: 'price_changed',
      propertyId: next.id,
      eventAt: next.updated_at || new Date(),
      actorUserId,
      identity: resolvedIdentity,
      method: 'listing_price_changed',
      payload: {
        previous: from,
        next: to,
        fieldsChanged: fields,
        currency: null,
        achieved_price: null,
        achieved_rent: null,
      },
    }));
    if (result.recorded) recorded.push(result.row);
  }

  if (shouldRecordStatusChange(previous, next)) {
    const result = await recordListingEvent(client, buildEvent({
      eventType: 'status_changed',
      propertyId: next.id,
      eventAt: next.updated_at || new Date(),
      actorUserId,
      identity: resolvedIdentity,
      method: 'listing_status_changed',
      payload: {
        previous: textOrNull(previous.status),
        next: textOrNull(next.status),
      },
    }));
    if (result.recorded) recorded.push(result.row);
  }

  return { events: recorded };
}

async function collectAfterStatusReview(client, { previous, next, actorUserId = null, identity = null } = {}) {
  if (!next?.id || !previous) return { events: [] };
  const resolvedIdentity = identity || (await lookupListingIdentity(client, next.id));
  const recorded = [];

  if (shouldRecordStatusChange(previous, next)) {
    const result = await recordListingEvent(client, buildEvent({
      eventType: 'status_changed',
      propertyId: next.id,
      eventAt: next.approved_at || next.updated_at || new Date(),
      actorUserId,
      identity: resolvedIdentity,
      method: 'listing_status_changed',
      payload: {
        previous: textOrNull(previous.status),
        next: textOrNull(next.status),
      },
    }));
    if (result.recorded) recorded.push(result.row);
  }

  if (shouldRecordFirstPublished(previous, next)) {
    const result = await recordListingEvent(client, buildEvent({
      eventType: 'first_published',
      propertyId: next.id,
      eventAt: next.first_published_at,
      actorUserId,
      identity: resolvedIdentity,
      method: 'listing_first_published',
      payload: {
        first_published_at: isoTimestamp(next.first_published_at),
        status: next.status,
      },
    }));
    if (result.recorded) recorded.push(result.row);
  }

  return { events: recorded };
}

function presentEngagementEvidence() {
  return {
    available: false,
    value: null,
    state: 'notAssessed',
    views: null,
    uniqueViewers: null,
    enquiries: null,
    viewingRequests: null,
    offers: null,
    note:
      'No first-party engagement collector is wired. Missing listing_engagement_daily rows are unknown, not zero engagement and not zero demand.',
  };
}

function publicLifecycleEvent(event = {}) {
  const copy = { ...event };
  delete copy.actor_user_id;
  return copy;
}

function presentListingLifecycleEvidence(events = []) {
  const list = Array.isArray(events) ? events : [];
  return {
    available: list.length > 0,
    state: list.length ? 'observed' : 'notAssessed',
    source: 'ApplicationDatabase',
    role: 'evidence_only',
    demandScore: null,
    events: list.map(publicLifecycleEvent),
    engagement: presentEngagementEvidence(),
    note:
      'Listing lifecycle evidence only. Not property-specific demand, not time-to-let, and not a landlord or buyer score.',
  };
}

function outcomeFieldsFromAsking(asking = {}) {
  return {
    achieved_price: null,
    achieved_rent: null,
    sold_at: null,
    let_at: null,
    asking_price: numericOrNull(asking.price),
    asking_rent: numericOrNull(asking.monthly_rent),
  };
}

module.exports = {
  SUPPORTED_EVENT_TYPES,
  ONCE_ONLY_EVENT_TYPES,
  numericOrNull,
  numbersEqual,
  askingSnapshot,
  askingFieldsChanged,
  shouldRecordPriceChange,
  shouldRecordStatusChange,
  shouldRecordFirstPublished,
  buildEvent,
  recordListingEvent,
  collectAfterCreate,
  collectAfterUpdate,
  collectAfterStatusReview,
  presentEngagementEvidence,
  presentListingLifecycleEvidence,
  publicLifecycleEvent,
  outcomeFieldsFromAsking,
  lookupListingIdentity,
};
