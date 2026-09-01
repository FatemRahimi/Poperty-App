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

const SALE_OUTCOME_STATE = Object.freeze({
  NO_OUTCOME: 'NO_OUTCOME',
  INCOMPLETE_SALE_OUTCOME: 'INCOMPLETE_SALE_OUTCOME',
  COMPLETE_SALE_OUTCOME: 'COMPLETE_SALE_OUTCOME',
});

const COMPLETION_EVENT_TYPE = Object.freeze({
  sold: 'sale_outcome_completed',
  let: 'let_outcome_completed',
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

function hasPositiveAmount(listing, definition) {
  if (!definition?.amountColumn) return false;
  const n = numericOrNull(listing[definition.amountColumn]);
  return n != null && n > 0;
}

function storedTimestamp(listing, definition) {
  return parseOutcomeTime(listing?.[definition.timestampColumn]);
}

function alreadyRecorded(listing, definition) {
  const statusMatches = String(listing.status) === definition.toStatus;
  return Boolean(statusMatches || listing[definition.timestampColumn] || hasPositiveAmount(listing, definition));
}

function deriveAmountOutcomeCompleteness(listing, definition) {
  if (!definition.amountColumn) {
    return alreadyRecorded(listing, definition) ? 'COMPLETE' : 'NO_OUTCOME';
  }
  const hasTs = Boolean(storedTimestamp(listing, definition));
  const hasAmt = hasPositiveAmount(listing, definition);
  const statusMatch = String(listing.status) === definition.toStatus;
  if (hasTs && hasAmt) return 'COMPLETE';
  if (statusMatch || hasTs || hasAmt) return 'INCOMPLETE';
  return 'NO_OUTCOME';
}

function deriveSaleOutcomeState(listing = {}) {
  const completeness = deriveAmountOutcomeCompleteness(listing, OUTCOME_DEFINITIONS.sold);
  if (completeness === 'COMPLETE') return SALE_OUTCOME_STATE.COMPLETE_SALE_OUTCOME;
  if (completeness === 'INCOMPLETE') return SALE_OUTCOME_STATE.INCOMPLETE_SALE_OUTCOME;
  return SALE_OUTCOME_STATE.NO_OUTCOME;
}

function dateCompatible(listing, definition, occurredAt, occurredAtProvided) {
  const existing = storedTimestamp(listing, definition);
  if (!existing) return true;
  if (!occurredAtProvided) return true;
  return timesEqual(existing, occurredAt);
}

function sameRecordedOutcome(listing, definition, occurredAt, amount, occurredAtProvided) {
  if (
    String(listing.status) !== definition.toStatus &&
    !listing[definition.timestampColumn] &&
    !hasPositiveAmount(listing, definition)
  ) {
    return false;
  }
  if (occurredAtProvided && !dateCompatible(listing, definition, occurredAt, occurredAtProvided)) {
    return false;
  }
  if (!definition.amountColumn) return true;
  return numbersEqual(listing[definition.amountColumn], amount);
}

function completionPlan(listing, definition, occurredAt, occurredAtProvided, achievedAmount) {
  if (!definition.amountColumn) return null;
  if (deriveAmountOutcomeCompleteness(listing, definition) !== 'INCOMPLETE') return null;

  const existingTs = storedTimestamp(listing, definition);
  const existingAmount = numericOrNull(listing[definition.amountColumn]);
  const existingPositive = existingAmount != null && existingAmount > 0;

  if (!dateCompatible(listing, definition, occurredAt, occurredAtProvided)) {
    return { conflict: true };
  }
  if (existingPositive && achievedAmount != null && !numbersEqual(existingAmount, achievedAmount)) {
    return { conflict: true };
  }

  const completingAmount = !existingPositive && achievedAmount != null;
  const completingDate = !existingTs && occurredAtProvided;
  if (!completingAmount && !completingDate) return null;

  return {
    conflict: false,
    nextAmount: existingPositive ? existingAmount : achievedAmount,
    nextTimestamp: existingTs || (occurredAtProvided ? occurredAt : null),
    setStatus: String(listing.status) !== definition.toStatus && Boolean(existingTs || occurredAtProvided),
    completingAmount,
    completingDate,
    occurredAtSource: existingTs
      ? `existing_${definition.timestampColumn}`
      : occurredAtProvided
        ? 'declared_completion_time'
        : null,
  };
}

async function applyOutcomeCompletion(client, {
  listing,
  definition,
  outcome,
  plan,
  input,
  now,
  listingId,
}) {
  const identity = await lookupListingIdentity(client, listingId);
  const assignments = [];
  const params = [];
  if (plan.setStatus) {
    assignments.push(`status = $${params.length + 1}`);
    params.push(definition.toStatus);
  }
  if (plan.completingDate && plan.nextTimestamp) {
    assignments.push(`${definition.timestampColumn} = $${params.length + 1}`);
    params.push(plan.nextTimestamp);
  }
  if (plan.completingAmount) {
    assignments.push(`${definition.amountColumn} = $${params.length + 1}`);
    params.push(plan.nextAmount);
  }
  if (outcome === 'sold' && plan.setStatus) {
    assignments.push('final_asking_price = COALESCE(final_asking_price, price)');
  }
  assignments.push('updated_at = NOW()');
  params.push(listingId);

  const updated = await client.query(
    `UPDATE properties SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  const next = updated.rows[0];
  const eventType = COMPLETION_EVENT_TYPE[outcome];
  const payload = {
    previous: listing.status,
    next: next.status,
    category: listing.category,
    source: 'first_party',
    occurredAtSource: plan.occurredAtSource,
    actorType: isAdminActor(input.actor) ? 'admin' : 'owner',
    copiedFromAsking: false,
    asking_price: numericOrNull(listing.price),
    asking_rent: numericOrNull(listing.monthly_rent),
    completionOfIncompleteOutcome: true,
    completedFields: [
      plan.completingAmount ? definition.amountColumn : null,
      plan.completingDate ? definition.timestampColumn : null,
    ].filter(Boolean),
    trust: 'USER_REPORTED',
    verificationState: 'user_reported',
  };
  if (definition.amountColumn) {
    payload[definition.amountColumn] = plan.nextAmount;
  }
  payload[definition.timestampColumn] = plan.nextTimestamp;

  const recorded = await recordListingEvent(
    client,
    buildEvent({
      eventType,
      propertyId: listingId,
      eventAt: plan.nextTimestamp || now.toISOString(),
      recordedAt: now.toISOString(),
      actorUserId: input.actor?.id ?? null,
      identity,
      method: `listing_${eventType}`,
      payload,
    })
  );

  return {
    ok: true,
    idempotent: Boolean(recorded.duplicate),
    property: next,
    event: recorded.row,
    code: recorded.duplicate ? 'idempotent' : 'completed',
    completed: true,
  };
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
    const plan = completionPlan(
      listing,
      definition,
      occurred.value,
      occurredAtProvided,
      achievedAmount
    );
    if (plan?.conflict) {
      return fail(
        409,
        'outcome_conflict',
        'A different outcome is already recorded. Silent overwrite is not allowed; an explicit correction flow is required.'
      );
    }
    if (plan && !plan.conflict) {
      return applyOutcomeCompletion(client, {
        listing,
        definition,
        outcome,
        plan,
        input,
        now,
        listingId,
      });
    }
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
  SALE_OUTCOME_STATE,
  COMPLETION_EVENT_TYPE,
  canRecordOutcome,
  isAdminActor,
  isImmutableOutcomeStatus,
  blocksListingMutation,
  classifyListingCategory,
  normaliseAchievedRent,
  parseOutcomeTime,
  deriveSaleOutcomeState,
  recordListingOutcome,
  publicOutcomeView,
  CANONICAL_OUTCOME_CONTRACT,
};
