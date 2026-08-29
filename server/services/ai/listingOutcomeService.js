/**
 * First-party listing sale/let/under-offer/withdrawn outcome capture.
 *
 * Observational labels only — not demand, valuation, rent intelligence,
 * finance, or Personal Decision scores. Asking amounts are never copied
 * into achieved amounts. Listing timestamps are never copied into sold_at/let_at.
 */

const {
  numericOrNull,
  numbersEqual,
  buildEvent,
  recordListingEvent,
  lookupListingIdentity,
} = require('./listingLifecycleService');

const WEEKLY_TO_MONTHLY = 52 / 12;

const OUTCOME_TYPES = Object.freeze(['sold', 'let', 'under_offer', 'withdrawn']);

const TERMINAL_STATUSES = Object.freeze(['sold', 'let', 'withdrawn']);

const MUTATION_BLOCKING_STATUSES = Object.freeze(['sold', 'let', 'withdrawn', 'under_offer']);

const OUTCOME_DEFINITIONS = Object.freeze({
  sold: {
    listingCategories: ['sale'],
    fromStatuses: ['approved', 'under_offer'],
    toStatus: 'sold',
    terminal: true,
    eventType: 'sold',
    timestampColumn: 'sold_at',
    amountColumn: 'achieved_price',
  },
  let: {
    listingCategories: ['rent'],
    fromStatuses: ['approved'],
    toStatus: 'let',
    terminal: true,
    eventType: 'let',
    timestampColumn: 'let_at',
    amountColumn: 'achieved_rent',
  },
  under_offer: {
    listingCategories: ['sale'],
    fromStatuses: ['approved'],
    toStatus: 'under_offer',
    terminal: false,
    eventType: 'under_offer',
    timestampColumn: 'under_offer_at',
    amountColumn: null,
  },
  withdrawn: {
    listingCategories: ['sale', 'rent'],
    fromStatuses: ['pending', 'approved', 'rejected', 'under_offer'],
    toStatus: 'withdrawn',
    terminal: true,
    eventType: 'withdrawn',
    timestampColumn: 'withdrawn_at',
    amountColumn: null,
  },
});

function isAdminActor(actor = {}) {
  return ['admin', 'super_admin'].includes(String(actor.role || ''));
}

function canRecordOutcome(actor, listing) {
  if (!actor || actor.id == null || !listing) return false;
  if (isAdminActor(actor)) return true;
  return Number(actor.id) === Number(listing.user_id);
}

function isImmutableOutcomeStatus(status) {
  return TERMINAL_STATUSES.includes(String(status || ''));
}

function blocksListingMutation(status) {
  return MUTATION_BLOCKING_STATUSES.includes(String(status || ''));
}

function parseOutcomeTime(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function timesEqual(a, b) {
  const x = parseOutcomeTime(a);
  const y = parseOutcomeTime(b);
  if (!x && !y) return true;
  return x === y;
}

function classifyListingCategory(listing = {}) {
  const category = String(listing.category || '').trim().toLowerCase();
  if (category === 'sale' || category === 'rent') return category;
  if (!category) return null;
  return 'unsupported';
}

function fail(httpStatus, code, message) {
  return { ok: false, httpStatus, code, message };
}

function normaliseAchievedRent(amount, unit) {
  const n = numericOrNull(amount);
  if (n == null) return { ok: true, value: null };
  if (n <= 0) return { ok: false, message: 'achieved rent must be greater than 0 when supplied' };
  const rentUnit = String(unit || 'monthly').trim().toLowerCase();
  if (rentUnit === 'monthly' || rentUnit === 'month' || rentUnit === 'pcm') {
    return { ok: true, value: n };
  }
  if (rentUnit === 'weekly' || rentUnit === 'week' || rentUnit === 'pw') {
    return { ok: true, value: Math.round(n * WEEKLY_TO_MONTHLY) };
  }
  return { ok: false, message: 'achieved rent unit must be monthly or weekly' };
}

function resolveOccurredAt(input = {}, now = new Date()) {
  if (input.occurredAt === undefined || input.occurredAt === null || input.occurredAt === '') {
    return { ok: true, value: now.toISOString(), source: 'server_event_time' };
  }
  const parsed = parseOutcomeTime(input.occurredAt);
  if (!parsed) return { ok: false, message: 'occurredAt must be a valid date' };
  return { ok: true, value: parsed, source: 'declared_completion_time' };
}

function alreadyRecorded(listing, definition) {
  const statusMatches = String(listing.status) === definition.toStatus;
  const timestamp = listing[definition.timestampColumn];
  return Boolean(statusMatches || timestamp);
}

function sameRecordedOutcome(listing, definition, occurredAt, amount, occurredAtProvided) {
  if (String(listing.status) !== definition.toStatus && !listing[definition.timestampColumn]) {
    return false;
  }
  if (occurredAtProvided && !timesEqual(listing[definition.timestampColumn], occurredAt)) {
    return false;
  }
  if (!definition.amountColumn) return true;
  return numbersEqual(listing[definition.amountColumn], amount);
}

function forbiddenAmountFields(input = {}) {
  return (
    input.copyFromAsking === true ||
    input.useValuation === true ||
    input.useRecommendedRent === true ||
    input.useRents === true
  );
}

function suppliedAmount(value) {
  return value !== undefined && value !== null && value !== '';
}

async function recordListingOutcome(client, input = {}, now = new Date()) {
  const outcome = String(input.outcome || '').trim().toLowerCase();
  const definition = OUTCOME_DEFINITIONS[outcome];
  if (!definition) {
    return fail(400, 'invalid_outcome', 'outcome must be sold, let, under_offer, or withdrawn');
  }

  const listingId = Number(input.listingId);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return fail(400, 'invalid_listing', 'A genuine listing id is required');
  }

  if (forbiddenAmountFields(input)) {
    return fail(
      400,
      'invalid_amount_source',
      'Asking price/rent, valuation, recommended rent and /rents must not be used as achieved amounts'
    );
  }

  if (
    (outcome === 'under_offer' || outcome === 'withdrawn') &&
    (suppliedAmount(input.achievedPrice) || suppliedAmount(input.achievedRent))
  ) {
    return fail(
      400,
      'invalid_amount_source',
      'under_offer and withdrawn must not set achieved price or rent'
    );
  }

  const occurredAtProvided = suppliedAmount(input.occurredAt);
  const occurred = resolveOccurredAt(input, now);
  if (!occurred.ok) return fail(400, 'invalid_occurred_at', occurred.message);

  let achievedAmount = null;
  if (outcome === 'sold' && suppliedAmount(input.achievedPrice)) {
    const n = numericOrNull(input.achievedPrice);
    if (n == null || n <= 0) {
      return fail(400, 'invalid_achieved_price', 'achievedPrice must be greater than 0 when supplied');
    }
    achievedAmount = n;
  }
  if (outcome === 'let' && suppliedAmount(input.achievedRent)) {
    const rent = normaliseAchievedRent(input.achievedRent, input.achievedRentUnit);
    if (!rent.ok) return fail(400, 'invalid_achieved_rent', rent.message);
    achievedAmount = rent.value;
  }

  const locked = await client.query('SELECT * FROM properties WHERE id = $1 FOR UPDATE', [listingId]);
  const listing = locked.rows[0];
  if (!listing) return fail(404, 'not_found', 'Property not found');

  if (!canRecordOutcome(input.actor, listing)) {
    return fail(403, 'unauthorized', 'You are not authorised to record an outcome for this listing');
  }

  const category = classifyListingCategory(listing);
  if (!category) {
    return fail(
      400,
      'ambiguous_listing_category',
      'Listing category is missing; sale/rent type is not inferred'
    );
  }
  if (category === 'unsupported' || !definition.listingCategories.includes(category)) {
    return fail(
      400,
      'unsupported_listing_category',
      `outcome ${outcome} is not valid for listing category ${listing.category || 'unknown'}`
    );
  }

  if (alreadyRecorded(listing, definition)) {
    if (sameRecordedOutcome(listing, definition, occurred.value, achievedAmount, occurredAtProvided)) {
      return {
        ok: true,
        idempotent: true,
        property: listing,
        event: null,
        code: 'idempotent',
      };
    }
    return fail(
      409,
      'outcome_conflict',
      'A different outcome is already recorded. Silent overwrite is not allowed; an explicit correction flow is required.'
    );
  }

  if (isImmutableOutcomeStatus(listing.status) && listing.status !== definition.toStatus) {
    return fail(
      409,
      'invalid_transition',
      `Cannot record ${outcome} because listing status is ${listing.status}`
    );
  }

  if (!definition.fromStatuses.includes(String(listing.status))) {
    return fail(
      400,
      'invalid_transition',
      `Cannot record ${outcome} from status ${listing.status}`
    );
  }

  const identity = await lookupListingIdentity(client, listingId);
  const assignments = ['status = $1', `${definition.timestampColumn} = $2`, 'updated_at = NOW()'];
  const params = [definition.toStatus, occurred.value];
  if (definition.amountColumn) {
    assignments.push(`${definition.amountColumn} = $${params.length + 1}`);
    params.push(achievedAmount);
  }
  if (outcome === 'sold') {
    assignments.push('final_asking_price = COALESCE(final_asking_price, price)');
  }
  params.push(listingId);

  const updated = await client.query(
    `UPDATE properties SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  const next = updated.rows[0];

  const payload = {
    previous: listing.status,
    next: definition.toStatus,
    category: listing.category,
    source: 'first_party',
    occurredAtSource: occurred.source,
    actorType: isAdminActor(input.actor) ? 'admin' : 'owner',
    copiedFromAsking: false,
    asking_price: numericOrNull(listing.price),
    asking_rent: numericOrNull(listing.monthly_rent),
  };
  if (definition.amountColumn) {
    payload[definition.amountColumn] = achievedAmount;
  }

  const recorded = await recordListingEvent(
    client,
    buildEvent({
      eventType: definition.eventType,
      propertyId: listingId,
      eventAt: occurred.value,
      recordedAt: now.toISOString(),
      actorUserId: input.actor?.id ?? null,
      identity,
      method: `listing_${definition.eventType}`,
      payload,
    })
  );

  return {
    ok: true,
    idempotent: Boolean(recorded.duplicate),
    property: next,
    event: recorded.row,
    code: recorded.duplicate ? 'idempotent' : 'recorded',
  };
}

function publicOutcomeView(property = {}) {
  return {
    id: property.id,
    status: property.status,
    category: property.category,
    sold_at: property.sold_at || null,
    let_at: property.let_at || null,
    under_offer_at: property.under_offer_at || null,
    withdrawn_at: property.withdrawn_at || null,
    achieved_price: property.achieved_price == null ? null : Number(property.achieved_price),
    achieved_rent: property.achieved_rent == null ? null : Number(property.achieved_rent),
    final_asking_price: property.final_asking_price == null ? null : Number(property.final_asking_price),
  };
}

const CANONICAL_OUTCOME_CONTRACT = Object.freeze({
  sold: Object.freeze({
    category: 'sale',
    fromStatuses: Object.freeze(['approved', 'under_offer']),
    status: 'sold',
    timestamp: 'sold_at',
    amount: 'achieved_price',
    amountRequired: false,
    terminal: true,
  }),
  let: Object.freeze({
    category: 'rent',
    fromStatuses: Object.freeze(['approved']),
    status: 'let',
    timestamp: 'let_at',
    amount: 'achieved_rent',
    amountRequired: false,
    amountUnit: 'monthly',
    terminal: true,
  }),
  under_offer: Object.freeze({
    category: 'sale',
    fromStatuses: Object.freeze(['approved']),
    status: 'under_offer',
    timestamp: 'under_offer_at',
    amount: null,
    terminal: false,
    isSaleCompletion: false,
  }),
  withdrawn: Object.freeze({
    categories: Object.freeze(['sale', 'rent']),
    fromStatuses: Object.freeze(['pending', 'approved', 'rejected', 'under_offer']),
    status: 'withdrawn',
    timestamp: 'withdrawn_at',
    amount: null,
    terminal: true,
    isSaleCompletion: false,
    isLetCompletion: false,
  }),
});

module.exports = {
  OUTCOME_TYPES,
  OUTCOME_DEFINITIONS,
  TERMINAL_STATUSES,
  MUTATION_BLOCKING_STATUSES,
  WEEKLY_TO_MONTHLY,
  canRecordOutcome,
  isAdminActor,
  isImmutableOutcomeStatus,
  blocksListingMutation,
  classifyListingCategory,
  normaliseAchievedRent,
  parseOutcomeTime,
  recordListingOutcome,
  publicOutcomeView,
  CANONICAL_OUTCOME_CONTRACT,
};
