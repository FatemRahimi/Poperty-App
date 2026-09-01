/**
 * First-party listing lifecycle collection — persistence, idempotency, missing-data.
 * Run: node server/tests/listingLifecycle.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  SUPPORTED_EVENT_TYPES,
  ONCE_ONLY_EVENT_TYPES,
  shouldRecordPriceChange,
  shouldRecordStatusChange,
  shouldRecordFirstPublished,
  askingFieldsChanged,
  buildEvent,
  recordListingEvent,
  collectAfterCreate,
  collectAfterUpdate,
  collectAfterStatusReview,
  presentEngagementEvidence,
  presentListingLifecycleEvidence,
  outcomeFieldsFromAsking,
} = require('../services/ai/listingLifecycleService');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

async function asyncTest(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

function createMemoryClient() {
  const events = [];
  return {
    events,
    query: async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('property_identities') || text.includes('intelligence_subjects')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO listing_events')) {
        const row = {
          id: events.length + 1,
          property_id: params[0],
          event_type: params[1],
          event_at: params[2],
          actor_user_id: params[3],
          payload: JSON.parse(params[4]),
          provenance: JSON.parse(params[5]),
        };
        const onceOnly = ONCE_ONLY_EVENT_TYPES.includes(row.event_type);
        if (
          onceOnly &&
          events.some((e) => e.property_id === row.property_id && e.event_type === row.event_type)
        ) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }
        events.push(row);
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
}

const BUYER_PROPERTY = {
  id: 1,
  price: 380000,
  city: 'Manchester',
  zip_code: 'M1 1AA',
  bedrooms: 3,
  property_type: 'Terraced',
  title: '3 bed terrace',
  description: 'Family home with garden.',
  has_garden: true,
  commuteMinutes: 22,
};
const BUYER_PREFS = {
  budgetMax: 400000,
  location: 'M1 1AA',
  bedrooms: 3,
  propertyType: 'Terraced',
  lifestyle: 'family garden',
  maxCommuteMinutes: 30,
};
const BUYER_INTEL = {
  confidence: { level: 'High', assessed: true },
  sale: {
    success: true,
    centralEstimate: 375000,
    lowerEstimate: 360000,
    upperEstimate: 390000,
    evidenceCount: 8,
    confidence: 'high',
  },
};
const LANDLORD_PROPERTY = {
  id: 12,
  price: 200000,
  city: 'London',
  zip_code: 'W14 9JH',
  bedrooms: 2,
  property_type: 'Flat',
  monthly_rent: 1800,
};
const LANDLORD_FINANCE = {
  expectedRent: 1800,
  deposit: 50000,
  interestRate: 4.5,
  mortgageTermYears: 25,
  vacancyAssumption: 5,
  maintenance: 1200,
  insurance: 600,
  managementFee: 0,
  serviceCharge: 0,
  groundRent: 0,
  taxes: 0,
};
const LANDLORD_INTEL = {
  confidence: { level: 'High', assessed: true },
  rentIntel: {
    success: true,
    currentRent: 1800,
    recommendedRent: 1900,
    marketRange: { low: 1700, high: 2100 },
    comparables: [],
  },
  risks: [],
};

async function run() {
  test('supported event types are the real product transitions only', () => {
    assert.deepStrictEqual([...SUPPORTED_EVENT_TYPES].sort(), [
      'first_published',
      'let',
      'let_outcome_completed',
      'listing_created',
      'price_changed',
      'sale_outcome_completed',
      'sold',
      'status_changed',
      'under_offer',
      'withdrawn',
    ]);
    assert.ok(!SUPPORTED_EVENT_TYPES.includes('view'));
    assert.ok(!SUPPORTED_EVENT_TYPES.includes('enquiry'));
  });

  test('unsupported event types are rejected', () => {
    assert.throws(() =>
      buildEvent({
        eventType: 'view',
        propertyId: 1,
        eventAt: '2026-08-25T00:00:00.000Z',
      })
    );
  });

  await asyncTest('listing creation creates exactly one event', async () => {
    const client = createMemoryClient();
    const property = {
      id: 41,
      status: 'pending',
      category: 'sale',
      price: 250000,
      created_at: '2026-08-01T10:00:00.000Z',
    };
    const first = await collectAfterCreate(client, { property, actorUserId: 9 });
    const retry = await collectAfterCreate(client, { property, actorUserId: 9 });
    assert.strictEqual(first.events.length, 1);
    assert.strictEqual(first.events[0].event_type, 'listing_created');
    assert.strictEqual(first.events[0].event_at, '2026-08-01T10:00:00.000Z');
    assert.strictEqual(retry.events.length, 0);
    assert.strictEqual(client.events.filter((e) => e.event_type === 'listing_created').length, 1);
    assert.strictEqual(client.events[0].payload.asking.price, 250000);
    assert.ok(!Object.prototype.hasOwnProperty.call(client.events[0].payload, 'demandScore'));
  });

  await asyncTest('retry of listing_created is idempotent via unique violation', async () => {
    const client = createMemoryClient();
    const event = buildEvent({
      eventType: 'listing_created',
      propertyId: 7,
      eventAt: '2026-08-01T10:00:00.000Z',
      method: 'listing_created',
    });
    const a = await recordListingEvent(client, event);
    const b = await recordListingEvent(client, event);
    assert.strictEqual(a.recorded, true);
    assert.strictEqual(b.recorded, false);
    assert.strictEqual(b.duplicate, true);
    assert.strictEqual(client.events.length, 1);
  });

  test('first publish is recorded only when first_published_at is newly set', () => {
    const previous = { id: 3, status: 'pending', first_published_at: null };
    const firstApprove = {
      id: 3,
      status: 'approved',
      first_published_at: '2026-08-02T12:00:00.000Z',
    };
    const repeatApprove = {
      id: 3,
      status: 'approved',
      first_published_at: '2026-08-02T12:00:00.000Z',
    };
    assert.strictEqual(shouldRecordFirstPublished(previous, firstApprove), true);
    assert.strictEqual(shouldRecordFirstPublished(firstApprove, repeatApprove), false);
  });

  await asyncTest('first publish creates exactly one event and preserves original timestamp', async () => {
    const client = createMemoryClient();
    const previous = { id: 8, status: 'pending', first_published_at: null };
    const first = {
      id: 8,
      status: 'approved',
      first_published_at: '2026-08-02T12:00:00.000Z',
      approved_at: '2026-08-02T12:00:00.000Z',
    };
    const published = await collectAfterStatusReview(client, {
      previous,
      next: first,
      actorUserId: 2,
    });
    const repeat = await collectAfterStatusReview(client, {
      previous: first,
      next: {
        ...first,
        updated_at: '2026-08-03T12:00:00.000Z',
        approved_at: '2026-08-03T12:00:00.000Z',
      },
      actorUserId: 2,
    });
    const firstPublished = client.events.filter((e) => e.event_type === 'first_published');
    assert.strictEqual(published.events.some((e) => e.event_type === 'first_published'), true);
    assert.strictEqual(firstPublished.length, 1);
    assert.strictEqual(firstPublished[0].event_at, '2026-08-02T12:00:00.000Z');
    assert.strictEqual(repeat.events.length, 0);
  });

  test('price A -> B records a change; B -> B does not', () => {
    const a = { price: 200000, monthly_rent: null, weekly_rent: null };
    const b = { price: 210000, monthly_rent: null, weekly_rent: null };
    assert.strictEqual(shouldRecordPriceChange(a, b), true);
    assert.strictEqual(shouldRecordPriceChange(b, b), false);
    const changed = askingFieldsChanged(a, b);
    assert.deepStrictEqual(changed.fields, ['price']);
    assert.strictEqual(changed.from.price, 200000);
    assert.strictEqual(changed.to.price, 210000);
  });

  test('numeric string prices equal numeric prices', () => {
    assert.strictEqual(
      shouldRecordPriceChange({ price: '1800', monthly_rent: 900 }, { price: 1800, monthly_rent: 900 }),
      false
    );
  });

  await asyncTest('price change stores old and new asking values and never copies achieved', async () => {
    const client = createMemoryClient();
    const previous = {
      id: 11,
      status: 'pending',
      price: 200000,
      monthly_rent: null,
      weekly_rent: null,
    };
    const next = {
      id: 11,
      status: 'pending',
      price: 215000,
      monthly_rent: null,
      weekly_rent: null,
      updated_at: '2026-08-04T09:00:00.000Z',
    };
    const result = await collectAfterUpdate(client, { previous, next, actorUserId: 4 });
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].event_type, 'price_changed');
    assert.strictEqual(result.events[0].payload.previous.price, 200000);
    assert.strictEqual(result.events[0].payload.next.price, 215000);
    assert.strictEqual(result.events[0].payload.achieved_price, null);
    assert.strictEqual(result.events[0].payload.achieved_rent, null);
    assert.strictEqual(result.events[0].payload.currency, null);
  });

  await asyncTest('initial listing asking is listing_created, not price_changed', async () => {
    const client = createMemoryClient();
    await collectAfterCreate(client, {
      property: {
        id: 99,
        status: 'pending',
        price: 100000,
        created_at: '2026-08-01T00:00:00.000Z',
      },
    });
    assert.strictEqual(client.events.length, 1);
    assert.strictEqual(client.events[0].event_type, 'listing_created');
    assert.ok(!client.events.some((e) => e.event_type === 'price_changed'));
  });

  test('unchanged status creates no event; genuine transition does', () => {
    assert.strictEqual(shouldRecordStatusChange({ status: 'pending' }, { status: 'pending' }), false);
    assert.strictEqual(shouldRecordStatusChange({ status: 'pending' }, { status: 'approved' }), true);
    assert.strictEqual(shouldRecordStatusChange({ status: 'approved' }, { status: 'pending' }), true);
    assert.strictEqual(shouldRecordStatusChange({ status: 'pending' }, { status: 'rejected' }), true);
  });

  await asyncTest('status transition is recorded and a no-op retry is not', async () => {
    const client = createMemoryClient();
    const pending = { id: 15, status: 'pending', first_published_at: null };
    const rejected = {
      id: 15,
      status: 'rejected',
      first_published_at: null,
      updated_at: '2026-08-05T08:00:00.000Z',
      approved_at: '2026-08-05T08:00:00.000Z',
    };
    const first = await collectAfterStatusReview(client, { previous: pending, next: rejected });
    const retry = await collectAfterStatusReview(client, { previous: rejected, next: rejected });
    assert.strictEqual(first.events.length, 1);
    assert.strictEqual(first.events[0].event_type, 'status_changed');
    assert.strictEqual(first.events[0].payload.previous, 'pending');
    assert.strictEqual(first.events[0].payload.next, 'rejected');
    assert.strictEqual(retry.events.length, 0);
    assert.ok(!client.events.some((e) => e.event_type === 'first_published'));
  });

  test('asking price/rent are never copied into achieved outcome fields', () => {
    const outcomes = outcomeFieldsFromAsking({ price: 400000, monthly_rent: 1800 });
    assert.strictEqual(outcomes.achieved_price, null);
    assert.strictEqual(outcomes.achieved_rent, null);
    assert.strictEqual(outcomes.sold_at, null);
    assert.strictEqual(outcomes.let_at, null);
    assert.strictEqual(outcomes.asking_price, 400000);
    assert.strictEqual(outcomes.asking_rent, 1800);
    assert.notStrictEqual(outcomes.achieved_price, outcomes.asking_price);
    assert.notStrictEqual(outcomes.achieved_rent, outcomes.asking_rent);
  });

  test('updated_at is not treated as sold_at or let_at', () => {
    const stamp = '2026-08-05T00:00:00.000Z';
    const outcomes = outcomeFieldsFromAsking({ price: 1, monthly_rent: 1, updated_at: stamp });
    assert.strictEqual(outcomes.sold_at, null);
    assert.strictEqual(outcomes.let_at, null);
    assert.notStrictEqual(outcomes.sold_at, stamp);
    assert.notStrictEqual(outcomes.let_at, stamp);
  });

  test('missing engagement is unknown/notAssessed, never zero', () => {
    const engagement = presentEngagementEvidence();
    assert.strictEqual(engagement.available, false);
    assert.strictEqual(engagement.state, 'notAssessed');
    assert.strictEqual(engagement.value, null);
    assert.strictEqual(engagement.views, null);
    assert.strictEqual(engagement.uniqueViewers, null);
    assert.strictEqual(engagement.enquiries, null);
    assert.notStrictEqual(engagement.views, 0);
    assert.notStrictEqual(engagement.enquiries, 0);
    assert.ok(/unknown/i.test(engagement.note));
    assert.ok(!/zero demand/i.test(engagement.note) || /not zero/i.test(engagement.note));
  });

  test('empty lifecycle history is notAssessed evidence, not a demand score', () => {
    const empty = presentListingLifecycleEvidence([]);
    assert.strictEqual(empty.available, false);
    assert.strictEqual(empty.state, 'notAssessed');
    assert.strictEqual(empty.demandScore, null);
    assert.strictEqual(empty.engagement.state, 'notAssessed');
    const observed = presentListingLifecycleEvidence([{ event_type: 'listing_created' }]);
    assert.strictEqual(observed.available, true);
    assert.strictEqual(observed.demandScore, null);
    assert.strictEqual(observed.role, 'evidence_only');
  });

  await asyncTest('lifecycle events do not populate numeric demand', async () => {
    const client = createMemoryClient();
    await collectAfterCreate(client, {
      property: { id: 21, status: 'pending', price: 100000, created_at: '2026-08-01T00:00:00.000Z' },
    });
    client.events.forEach((event) => {
      assert.ok(!Object.prototype.hasOwnProperty.call(event.payload, 'demandScore'));
      assert.ok(!Object.prototype.hasOwnProperty.call(event.payload, 'timeToLet'));
      assert.ok(event.provenance.notes.includes('Not a demand score'));
    });
  });

  test('landlord demand remains notAssessed and scores are unchanged by lifecycle evidence', () => {
    const asOf = '2026-06-01T00:00:00.000Z';
    const without = scorePersonalDecision({
      profile: 'landlord',
      property: LANDLORD_PROPERTY,
      preferences: {},
      intelligence: LANDLORD_INTEL,
      finance: LANDLORD_FINANCE,
      asOf,
    });
    const withLifecycle = scorePersonalDecision({
      profile: 'landlord',
      property: LANDLORD_PROPERTY,
      preferences: {},
      intelligence: {
        ...LANDLORD_INTEL,
        listingLifecycle: presentListingLifecycleEvidence([
          { event_type: 'listing_created' },
          { event_type: 'price_changed' },
        ]),
      },
      finance: LANDLORD_FINANCE,
      asOf,
    });
    assert.strictEqual(without.dimensions.demand.available, false);
    assert.strictEqual(without.dimensions.demand.state, 'no_demand_data_source');
    assert.strictEqual(withLifecycle.dimensions.demand.available, false);
    assert.strictEqual(withLifecycle.dimensions.demand.score, null);
    assert.strictEqual(withLifecycle.score, without.score);
    assert.deepStrictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  });

  test('buyer_general score is unchanged by lifecycle evidence', () => {
    const asOf = '2026-06-01T00:00:00.000Z';
    const base = scorePersonalDecision({
      profile: 'buyer_general',
      property: BUYER_PROPERTY,
      preferences: BUYER_PREFS,
      intelligence: BUYER_INTEL,
      asOf,
    });
    const withLifecycle = scorePersonalDecision({
      profile: 'buyer_general',
      property: BUYER_PROPERTY,
      preferences: BUYER_PREFS,
      intelligence: {
        ...BUYER_INTEL,
        listingLifecycle: presentListingLifecycleEvidence([{ event_type: 'first_published' }]),
      },
      asOf,
    });
    assert.strictEqual(withLifecycle.score, base.score);
    assert.deepStrictEqual(
      Object.fromEntries(Object.entries(withLifecycle.dimensions).map(([k, d]) => [k, d.score])),
      Object.fromEntries(Object.entries(base.dimensions).map(([k, d]) => [k, d.score]))
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
  });

  test('provenance distinguishes event time from processing-created_at column', () => {
    const event = buildEvent({
      eventType: 'status_changed',
      propertyId: 5,
      eventAt: '2026-08-02T12:00:00.000Z',
      method: 'listing_status_changed',
      payload: { previous: 'pending', next: 'approved' },
    });
    assert.strictEqual(event.event_at, '2026-08-02T12:00:00.000Z');
    assert.strictEqual(event.provenance.observedAt, '2026-08-02T12:00:00.000Z');
    assert.strictEqual(event.provenance.retrievedAt, '2026-08-02T12:00:00.000Z');
    assert.strictEqual(event.provenance.source, 'ApplicationDatabase');
  });

  test('migrations 016, 017 and 018 exist and later files are additive idempotency only', () => {
    const dir = path.join(__dirname, '..', 'db', 'migrations');
    const m016 = fs.readFileSync(path.join(dir, '016_listing_intelligence_events.sql'), 'utf8');
    const m017 = fs.readFileSync(path.join(dir, '017_listing_lifecycle_idempotency.sql'), 'utf8');
    const m018 = fs.readFileSync(path.join(dir, '018_listing_outcome_idempotency.sql'), 'utf8');
    assert.ok(/CREATE TABLE IF NOT EXISTS listing_events/i.test(m016));
    assert.ok(/CREATE TABLE IF NOT EXISTS listing_engagement_daily/i.test(m016));
    assert.ok(/achieved_price/i.test(m016));
    assert.ok(/first_published_at/i.test(m016));
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_listing_created/i.test(m017));
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_first_published/i.test(m017));
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_sold/i.test(m018));
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_let/i.test(m018));
    assert.ok(!/DROP TABLE/i.test(m017));
    assert.ok(!/DROP TABLE/i.test(m018));
    assert.ok(!/UPDATE\s+properties/i.test(m018));
  });

  console.log('\nlistingLifecycle.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
