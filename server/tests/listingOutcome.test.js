/**
 * First-party sold / let / under_offer / withdrawn outcome capture.
 * Run: node server/tests/listingOutcome.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  ONCE_ONLY_EVENT_TYPES,
} = require('../services/ai/listingLifecycleService');
const {
  WEEKLY_TO_MONTHLY,
  classifyListingCategory,
  normaliseAchievedRent,
  blocksListingMutation,
  recordListingOutcome,
  publicOutcomeView,
} = require('../services/ai/listingOutcomeService');
const {
  extractListingOutcomes,
  extractPredictionSnapshot,
  pairSnapshotWithOutcome,
} = require('../services/ai/backtesting/backtestFoundation');
const { scorePersonalDecision } = require('../services/ai/personalDecisionEngine');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { CONFIDENCE_MODEL, FACTOR_WEIGHTS } = require('../services/ai/confidenceEngine');

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

const NOW = new Date('2026-08-25T12:00:00.000Z');
const OWNER = { id: 7, role: 'user' };
const ADMIN = { id: 99, role: 'admin' };
const STRANGER = { id: 8, role: 'user' };

function saleListing(overrides = {}) {
  return {
    id: 10,
    user_id: 7,
    status: 'approved',
    category: 'sale',
    property_category: 'residential',
    price: 400000,
    monthly_rent: null,
    weekly_rent: null,
    achieved_price: null,
    achieved_rent: null,
    sold_at: null,
    let_at: null,
    under_offer_at: null,
    withdrawn_at: null,
    final_asking_price: null,
    updated_at: '2026-08-01T09:00:00.000Z',
    created_at: '2026-01-01T09:00:00.000Z',
    first_published_at: '2026-02-01T09:00:00.000Z',
    ...overrides,
  };
}

function rentListing(overrides = {}) {
  return saleListing({
    id: 11,
    category: 'rent',
    price: null,
    monthly_rent: 1500,
    weekly_rent: 346,
    ...overrides,
  });
}

function createOutcomeClient(listings) {
  const events = [];
  const properties = new Map(listings.map((row) => [Number(row.id), { ...row }]));
  return {
    events,
    properties,
    query: async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('property_identities') || text.includes('intelligence_subjects')) {
        return { rows: [] };
      }
      if (/SELECT \* FROM properties WHERE id = \$1 FOR UPDATE/.test(text)) {
        const row = properties.get(Number(params[0]));
        return { rows: row ? [{ ...row }] : [] };
      }
      if (text.includes('UPDATE properties SET')) {
        const id = Number(params[params.length - 1]);
        const current = properties.get(id);
        if (!current) return { rows: [] };
        const next = {
          ...current,
          status: params[0],
          updated_at: '2026-08-25T18:00:00.000Z',
        };
        if (/= \$2/.test(text) && /sold_at =/.test(text)) next.sold_at = params[1];
        if (/= \$2/.test(text) && /let_at =/.test(text)) next.let_at = params[1];
        if (/under_offer_at =/.test(text)) next.under_offer_at = params[1];
        if (/withdrawn_at =/.test(text)) next.withdrawn_at = params[1];
        if (/achieved_price =/.test(text)) next.achieved_price = params[2];
        if (/achieved_rent =/.test(text)) next.achieved_rent = params[2];
        if (/final_asking_price =/.test(text)) {
          next.final_asking_price = current.final_asking_price ?? current.price ?? null;
        }
        properties.set(id, next);
        return { rows: [{ ...next }] };
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
          created_at: '2026-08-25T12:00:01.000Z',
        };
        if (
          ONCE_ONLY_EVENT_TYPES.includes(row.event_type) &&
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

async function record(client, input, now = NOW) {
  return recordListingOutcome(client, input, now);
}

const SYNTHETIC = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'backtest-synthetic-snapshot.json'), 'utf8')
);

function snapshotRow() {
  return {
    id: 1,
    property_id: 10,
    created_at: '2025-01-15T12:00:00.000Z',
    output_data: SYNTHETIC,
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
  test('sale vs rent classification uses listing.category only', () => {
    assert.strictEqual(classifyListingCategory({ category: 'sale' }), 'sale');
    assert.strictEqual(classifyListingCategory({ category: 'rent' }), 'rent');
    assert.strictEqual(classifyListingCategory({ category: 'lease' }), 'unsupported');
    assert.strictEqual(classifyListingCategory({ category: '' }), null);
    assert.strictEqual(classifyListingCategory({ property_type: 'flat', price: 900000 }), null);
  });

  test('weekly achieved rent normalises through 52/12 only', () => {
    assert.strictEqual(normaliseAchievedRent(1500, 'monthly').value, 1500);
    assert.strictEqual(normaliseAchievedRent(1000, 'weekly').value, Math.round(1000 * WEEKLY_TO_MONTHLY));
    assert.strictEqual(WEEKLY_TO_MONTHLY, 52 / 12);
    assert.strictEqual(normaliseAchievedRent(null).value, null);
    assert.strictEqual(normaliseAchievedRent(0).ok, false);
  });

  test('outcome statuses block later listing mutation', () => {
    assert.strictEqual(blocksListingMutation('sold'), true);
    assert.strictEqual(blocksListingMutation('let'), true);
    assert.strictEqual(blocksListingMutation('withdrawn'), true);
    assert.strictEqual(blocksListingMutation('under_offer'), true);
    assert.strictEqual(blocksListingMutation('approved'), false);
    assert.strictEqual(blocksListingMutation('pending'), false);
  });

  await asyncTest('valid sale completion persists sold_at and optional achieved_price', async () => {
    const client = createOutcomeClient([saleListing()]);
    const occurredAt = '2026-07-01T10:00:00.000Z';
    const result = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt,
      achievedPrice: 385000,
      actor: OWNER,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.property.status, 'sold');
    assert.strictEqual(result.property.sold_at, occurredAt);
    assert.strictEqual(result.property.achieved_price, 385000);
    assert.strictEqual(result.property.final_asking_price, 400000);
    assert.strictEqual(result.event.event_type, 'sold');
    assert.strictEqual(result.event.event_at, occurredAt);
    assert.strictEqual(client.events.length, 1);
  });

  await asyncTest('missing achieved_price remains null and is not copied from asking or valuation', async () => {
    const client = createOutcomeClient([
      saleListing({ price: 400000, valuation: 410000, updated_at: '2026-08-01T09:00:00.000Z' }),
    ]);
    const result = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2026-07-02T10:00:00.000Z',
      actor: OWNER,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.property.achieved_price, null);
    assert.notStrictEqual(result.property.achieved_price, 400000);
    assert.notStrictEqual(result.property.achieved_price, 410000);
    assert.strictEqual(result.event.payload.copiedFromAsking, false);
    assert.strictEqual(result.event.payload.achieved_price, null);
  });

  await asyncTest('updated_at created_at and first_published_at are never sold_at', async () => {
    const listing = saleListing();
    const client = createOutcomeClient([listing]);
    const result = await record(client, {
      listingId: 10,
      outcome: 'sold',
      actor: OWNER,
    });
    assert.strictEqual(result.property.sold_at, NOW.toISOString());
    assert.notStrictEqual(result.property.sold_at, listing.updated_at);
    assert.notStrictEqual(result.property.sold_at, listing.created_at);
    assert.notStrictEqual(result.property.sold_at, listing.first_published_at);
    assert.notStrictEqual(result.property.sold_at, result.property.updated_at);
  });

  await asyncTest('repeated identical sold request is idempotent', async () => {
    const client = createOutcomeClient([saleListing()]);
    const input = {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2026-07-01T10:00:00.000Z',
      achievedPrice: 385000,
      actor: OWNER,
    };
    const first = await record(client, input);
    const second = await record(client, input);
    assert.strictEqual(first.ok, true);
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(second.code, 'idempotent');
    assert.strictEqual(client.events.filter((e) => e.event_type === 'sold').length, 1);
    assert.strictEqual(second.property.achieved_price, 385000);
  });

  await asyncTest('conflicting repeated sold outcome is rejected', async () => {
    const client = createOutcomeClient([saleListing()]);
    const first = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2026-07-01T10:00:00.000Z',
      achievedPrice: 385000,
      actor: OWNER,
    });
    const conflict = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2026-07-01T10:00:00.000Z',
      achievedPrice: 390000,
      actor: OWNER,
    });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(conflict.ok, false);
    assert.strictEqual(conflict.httpStatus, 409);
    assert.strictEqual(conflict.code, 'outcome_conflict');
    assert.strictEqual(client.properties.get(10).achieved_price, 385000);
    assert.strictEqual(client.events.length, 1);
  });

  await asyncTest('valid let completion persists let_at and optional achieved_rent', async () => {
    const client = createOutcomeClient([rentListing()]);
    const result = await record(client, {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      achievedRent: 1450,
      actor: OWNER,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.property.status, 'let');
    assert.strictEqual(result.property.let_at, '2026-07-10T09:00:00.000Z');
    assert.strictEqual(result.property.achieved_rent, 1450);
    assert.strictEqual(result.event.event_type, 'let');
  });

  await asyncTest('missing achieved_rent remains null and is not copied from asking recommended or /rents', async () => {
    const client = createOutcomeClient([
      rentListing({ monthly_rent: 1500, recommendedRent: 1600, rents: 1550 }),
    ]);
    const result = await record(client, {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      actor: OWNER,
    });
    assert.strictEqual(result.property.achieved_rent, null);
    assert.notStrictEqual(result.property.achieved_rent, 1500);
    assert.notStrictEqual(result.property.achieved_rent, 1600);
    assert.notStrictEqual(result.property.achieved_rent, 1550);
    assert.strictEqual(result.event.payload.copiedFromAsking, false);
  });

  await asyncTest('updated_at is never let_at', async () => {
    const listing = rentListing();
    const client = createOutcomeClient([listing]);
    const result = await record(client, { listingId: 11, outcome: 'let', actor: OWNER });
    assert.strictEqual(result.property.let_at, NOW.toISOString());
    assert.notStrictEqual(result.property.let_at, listing.updated_at);
    assert.notStrictEqual(result.property.let_at, listing.first_published_at);
    assert.notStrictEqual(result.property.let_at, result.property.updated_at);
  });

  await asyncTest('explicit weekly achieved rent uses the conversion helper', async () => {
    const client = createOutcomeClient([rentListing()]);
    const result = await record(client, {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      achievedRent: 346,
      achievedRentUnit: 'weekly',
      actor: OWNER,
    });
    assert.strictEqual(result.property.achieved_rent, Math.round(346 * WEEKLY_TO_MONTHLY));
  });

  await asyncTest('repeated identical let request is idempotent', async () => {
    const client = createOutcomeClient([rentListing()]);
    const input = {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      actor: OWNER,
    };
    await record(client, input);
    const second = await record(client, input);
    assert.strictEqual(second.idempotent, true);
    assert.strictEqual(client.events.filter((e) => e.event_type === 'let').length, 1);
    assert.strictEqual(second.property.achieved_rent, null);
  });

  await asyncTest('conflicting repeated let outcome is rejected', async () => {
    const client = createOutcomeClient([rentListing()]);
    await record(client, {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      achievedRent: 1450,
      actor: OWNER,
    });
    const conflict = await record(client, {
      listingId: 11,
      outcome: 'let',
      occurredAt: '2026-07-10T09:00:00.000Z',
      achievedRent: 1600,
      actor: OWNER,
    });
    assert.strictEqual(conflict.code, 'outcome_conflict');
    assert.strictEqual(client.properties.get(11).achieved_rent, 1450);
  });

  await asyncTest('under_offer does not create a sold outcome or achieved price', async () => {
    const client = createOutcomeClient([saleListing()]);
    const result = await record(client, {
      listingId: 10,
      outcome: 'under_offer',
      occurredAt: '2026-06-01T10:00:00.000Z',
      actor: OWNER,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.property.status, 'under_offer');
    assert.strictEqual(result.property.under_offer_at, '2026-06-01T10:00:00.000Z');
    assert.strictEqual(result.property.sold_at, null);
    assert.strictEqual(result.property.achieved_price, null);
    assert.strictEqual(result.event.event_type, 'under_offer');
    assert.deepStrictEqual(extractListingOutcomes(result.property), []);
  });

  await asyncTest('under_offer with achievedPrice is rejected', async () => {
    const client = createOutcomeClient([saleListing()]);
    const result = await record(client, {
      listingId: 10,
      outcome: 'under_offer',
      achievedPrice: 390000,
      actor: OWNER,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'invalid_amount_source');
  });

  await asyncTest('withdrawn does not populate sold/let fields', async () => {
    const client = createOutcomeClient([saleListing()]);
    const result = await record(client, {
      listingId: 10,
      outcome: 'withdrawn',
      occurredAt: '2026-06-15T10:00:00.000Z',
      actor: OWNER,
    });
    assert.strictEqual(result.property.status, 'withdrawn');
    assert.strictEqual(result.property.withdrawn_at, '2026-06-15T10:00:00.000Z');
    assert.strictEqual(result.property.sold_at, null);
    assert.strictEqual(result.property.let_at, null);
    assert.strictEqual(result.property.achieved_price, null);
    assert.strictEqual(result.property.achieved_rent, null);
    assert.deepStrictEqual(extractListingOutcomes(result.property), []);
  });

  test('hard delete is not silently withdrawal', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'controllers', 'propertyController.js'),
      'utf8'
    );
    const deleteFn = src.split('const deleteProperty')[1].split('const loadAllProperties')[0];
    assert.ok(/DELETE FROM properties/.test(deleteFn));
    assert.ok(!/withdrawn_at/.test(deleteFn));
    assert.ok(!/recordListingOutcome/.test(deleteFn));
    assert.ok(/Hard DELETE removes the listing/.test(deleteFn));
  });

  await asyncTest('invalid transitions are rejected', async () => {
    const pending = createOutcomeClient([saleListing({ status: 'pending' })]);
    const soldFromPending = await record(pending, { listingId: 10, outcome: 'sold', actor: OWNER });
    assert.strictEqual(soldFromPending.code, 'invalid_transition');

    const letFromSale = createOutcomeClient([saleListing()]);
    const badLet = await record(letFromSale, { listingId: 10, outcome: 'let', actor: OWNER });
    assert.strictEqual(badLet.code, 'unsupported_listing_category');

    const soldFromRent = createOutcomeClient([rentListing()]);
    const badSold = await record(soldFromRent, { listingId: 11, outcome: 'sold', actor: OWNER });
    assert.strictEqual(badSold.code, 'unsupported_listing_category');
  });

  await asyncTest('lease and missing category are not guessed', async () => {
    const lease = createOutcomeClient([saleListing({ category: 'lease' })]);
    const leaseResult = await record(lease, { listingId: 10, outcome: 'sold', actor: OWNER });
    assert.strictEqual(leaseResult.code, 'unsupported_listing_category');

    const missing = createOutcomeClient([saleListing({ category: null })]);
    const missingResult = await record(missing, { listingId: 10, outcome: 'sold', actor: OWNER });
    assert.strictEqual(missingResult.code, 'ambiguous_listing_category');
  });

  await asyncTest('actor authorization is enforced', async () => {
    const client = createOutcomeClient([saleListing()]);
    const denied = await record(client, { listingId: 10, outcome: 'sold', actor: STRANGER });
    assert.strictEqual(denied.httpStatus, 403);
    assert.strictEqual(denied.code, 'unauthorized');
    assert.strictEqual(client.events.length, 0);

    const adminClient = createOutcomeClient([saleListing()]);
    const admin = await record(adminClient, { listingId: 10, outcome: 'sold', actor: ADMIN });
    assert.strictEqual(admin.ok, true);
    assert.strictEqual(admin.event.payload.actorType, 'admin');
  });

  await asyncTest('event provenance is first-party and event_at is distinct from created_at', async () => {
    const client = createOutcomeClient([saleListing()]);
    const occurredAt = '2026-07-01T10:00:00.000Z';
    const result = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt,
      achievedPrice: 385000,
      actor: OWNER,
    });
    assert.strictEqual(result.event.event_at, occurredAt);
    assert.strictEqual(result.event.created_at, '2026-08-25T12:00:01.000Z');
    assert.notStrictEqual(result.event.event_at, result.event.created_at);
    assert.strictEqual(result.event.provenance.source, 'ApplicationDatabase');
    assert.notStrictEqual(result.event.provenance.source, 'PropertyData');
    assert.strictEqual(result.event.provenance.observedAt, occurredAt);
    assert.strictEqual(result.event.provenance.retrievedAt, NOW.toISOString());
    assert.notStrictEqual(result.event.provenance.retrievedAt, result.event.event_at);
    assert.ok(!Object.prototype.hasOwnProperty.call(result.event.payload, 'buyerName'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result.event.payload, 'tenantName'));
    const published = publicOutcomeView(result.property);
    assert.ok(!Object.prototype.hasOwnProperty.call(published, 'actor_user_id'));
    assert.ok(!Object.prototype.hasOwnProperty.call(published, 'user_id'));
  });

  await asyncTest('zero achieved amount is rejected rather than stored', async () => {
    const sale = createOutcomeClient([saleListing()]);
    const zeroSale = await record(sale, {
      listingId: 10,
      outcome: 'sold',
      achievedPrice: 0,
      actor: OWNER,
    });
    assert.strictEqual(zeroSale.code, 'invalid_achieved_price');
    const rent = createOutcomeClient([rentListing()]);
    const zeroRent = await record(rent, {
      listingId: 11,
      outcome: 'let',
      achievedRent: 0,
      actor: OWNER,
    });
    assert.strictEqual(zeroRent.code, 'invalid_achieved_rent');
  });

  await asyncTest('forbidden amount sources are rejected', async () => {
    const client = createOutcomeClient([saleListing()]);
    const copied = await record(client, {
      listingId: 10,
      outcome: 'sold',
      copyFromAsking: true,
      actor: OWNER,
    });
    assert.strictEqual(copied.code, 'invalid_amount_source');
  });

  await asyncTest('sale after under_offer is allowed and remains one sold event', async () => {
    const client = createOutcomeClient([saleListing()]);
    await record(client, { listingId: 10, outcome: 'under_offer', actor: OWNER });
    const sold = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2026-07-20T10:00:00.000Z',
      achievedPrice: 382000,
      actor: OWNER,
    });
    assert.strictEqual(sold.ok, true);
    assert.strictEqual(sold.property.status, 'sold');
    assert.strictEqual(client.events.filter((e) => e.event_type === 'sold').length, 1);
    assert.strictEqual(client.events.filter((e) => e.event_type === 'under_offer').length, 1);
  });

  test('no historical backfill migration exists', () => {
    const m018 = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '018_listing_outcome_idempotency.sql'),
      'utf8'
    );
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_sold/i.test(m018));
    assert.ok(!/UPDATE\s+properties/i.test(m018));
    assert.ok(!/INSERT INTO listing_events/i.test(m018));
    assert.ok(!/sold_at\s*=/i.test(m018));
  });

  test('018 is registered for existing installs', () => {
    const ensure = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'ensureIntelligenceSchema.js'),
      'utf8'
    );
    const migrate = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'migrate-intelligence-schema.js'),
      'utf8'
    );
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'propertyRoutes.js'), 'utf8');
    assert.ok(ensure.includes('018_listing_outcome_idempotency.sql'));
    assert.ok(ensure.includes('listing_events_one_sold'));
    assert.ok(migrate.includes('018_listing_outcome_idempotency.sql'));
    assert.ok(/post\('\/:id\/outcome'/.test(routes));
    assert.ok(/authenticateJWT, recordPropertyOutcome/.test(routes));
  });

  test('outcome service does not score demand or change engines', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'ai', 'listingOutcomeService.js'),
      'utf8'
    );
    assert.ok(!/scorePersonalDecision/.test(src));
    assert.ok(!/calculateInvestmentMetrics/.test(src));
    assert.ok(!/runBacktest/.test(src));
    assert.ok(!/assessConfidence/.test(src));
    assert.ok(!/recommendedRent/.test(src));
    assert.ok(!/propertyData/.test(src));
    assert.ok(!/demandScore/.test(src));
    assert.ok(!/High\/Medium\/Low/.test(src));
  });

  test('no demand score is created and landlord demand stays notAssessed', () => {
    const asOf = '2026-06-01T00:00:00.000Z';
    const landlord = scorePersonalDecision({
      profile: 'landlord',
      property: LANDLORD_PROPERTY,
      preferences: {},
      intelligence: LANDLORD_INTEL,
      finance: LANDLORD_FINANCE,
      asOf,
    });
    const buyer = scorePersonalDecision({
      profile: 'buyer_general',
      property: BUYER_PROPERTY,
      preferences: BUYER_PREFS,
      intelligence: BUYER_INTEL,
      asOf,
    });
    assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
    assert.ok(Number.isFinite(buyer.score));
    assert.ok(Number.isFinite(landlord.score));
    assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
    assert.strictEqual(BUYER_GENERAL_WEIGHTS.priceFairness, 0.15);
    assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
    assert.strictEqual(LANDLORD_WEIGHTS.rentPosition, 0.2);
    assert.ok(!Object.prototype.hasOwnProperty.call(BUYER_GENERAL_WEIGHTS, 'demand'));
  });

  test('valuation rent finance and confidence-1.1.0 remain unchanged', () => {
    assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
    assert.strictEqual(FACTOR_WEIGHTS.dataCompleteness, 0.06);
    const metrics = calculateInvestmentMetrics({
      purchasePrice: 200000,
      expectedRent: 1000,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
      vacancyAssumption: 0,
      maintenance: 0,
      insurance: 0,
    });
    assert.ok(Number.isFinite(metrics.grossYield));
    assert.strictEqual(metrics.grossYield, 6);
  });

  await asyncTest('genuine sale outcome after snapshot is backtest-eligible', async () => {
    const client = createOutcomeClient([saleListing({ id: 10 })]);
    const recorded = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2025-06-01T00:00:00.000Z',
      achievedPrice: 380000,
      actor: OWNER,
    });
    const outcomes = extractListingOutcomes({
      ...recorded.property,
      uprn: '1000123',
    });
    assert.strictEqual(outcomes.length, 1);
    const paired = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow()), outcomes[0]);
    assert.strictEqual(paired.eligible, true);
  });

  await asyncTest('genuine rent outcome after snapshot is backtest-eligible', async () => {
    const client = createOutcomeClient([rentListing({ id: 10 })]);
    const recorded = await record(client, {
      listingId: 10,
      outcome: 'let',
      occurredAt: '2025-06-01T00:00:00.000Z',
      achievedRent: 1450,
      actor: OWNER,
    });
    const outcomes = extractListingOutcomes({
      ...recorded.property,
      uprn: '1000123',
    });
    assert.strictEqual(outcomes.length, 1);
    const paired = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow()), outcomes[0]);
    assert.strictEqual(paired.eligible, true);
  });

  await asyncTest('outcome before snapshot is rejected by existing eligibility rules', async () => {
    const client = createOutcomeClient([saleListing({ id: 10 })]);
    const recorded = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2024-12-01T00:00:00.000Z',
      achievedPrice: 380000,
      actor: OWNER,
    });
    const outcomes = extractListingOutcomes(recorded.property);
    const paired = pairSnapshotWithOutcome(extractPredictionSnapshot(snapshotRow()), outcomes[0]);
    assert.strictEqual(paired.eligible, false);
    assert.strictEqual(paired.reason, 'prediction_not_before_outcome');
  });

  await asyncTest('missing achieved amount does not fabricate metric eligibility', async () => {
    const client = createOutcomeClient([saleListing({ id: 10 })]);
    const recorded = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2025-06-01T00:00:00.000Z',
      actor: OWNER,
    });
    assert.strictEqual(recorded.property.sold_at, '2025-06-01T00:00:00.000Z');
    assert.strictEqual(recorded.property.achieved_price, null);
    assert.deepStrictEqual(extractListingOutcomes(recorded.property), []);
  });

  await asyncTest('asking amount cannot make a case eligible', async () => {
    const client = createOutcomeClient([saleListing({ id: 10, price: 400000 })]);
    const recorded = await record(client, {
      listingId: 10,
      outcome: 'sold',
      occurredAt: '2025-06-01T00:00:00.000Z',
      actor: OWNER,
    });
    const fromAsking = extractListingOutcomes({
      ...recorded.property,
      achieved_price: recorded.property.price,
      sold_at: null,
    });
    assert.deepStrictEqual(extractListingOutcomes(recorded.property), []);
    assert.deepStrictEqual(fromAsking, []);
  });

  console.log('\nlistingOutcome.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
