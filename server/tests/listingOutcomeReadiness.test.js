/**
 * Production-readiness: real HTTP outcome path, terminal integrity, concurrency,
 * temporal quality, and backtest label classification.
 * Does not write to the development database.
 *
 * Run: node server/tests/listingOutcomeReadiness.test.js
 */

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'outcome-readiness-test-secret';
}

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createOutcomeStore, loadPropertyRoutesWithStore } = require('./helpers/outcomeTestStore');
const {
  CANONICAL_OUTCOME_CONTRACT,
} = require('../services/ai/listingOutcomeService');
const {
  ISSUE,
  detectListingOutcomeIssues,
  classifyFirstPartyBacktestEligibility,
} = require('../services/ai/listingOutcomeQuality');
const { presentListingLifecycleEvidence } = require('../services/ai/listingLifecycleService');
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

const store = createOutcomeStore();
const propertyRoutes = loadPropertyRoutesWithStore(store);
const config = require('../config/config');

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, email: user.email || 'user@example.com', role: user.role || 'user' },
    config.auth.jwt.secret,
    { expiresIn: '1h' }
  );
}

const OWNER = { id: 7, role: 'user' };
const STRANGER = { id: 8, role: 'user' };
const ADMIN = { id: 99, role: 'admin' };
const SUPER_ADMIN = { id: 100, role: 'super_admin' };

function saleListing(overrides = {}) {
  return {
    id: 10,
    user_id: 7,
    status: 'approved',
    category: 'sale',
    price: 400000,
    monthly_rent: null,
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
    ...overrides,
  });
}

function listen() {
  const app = express();
  app.use(express.json());
  app.use('/api/properties', propertyRoutes);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function request({ port, method, urlPath, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function postOutcome(port, id, body, user) {
  return request({
    port,
    method: 'POST',
    urlPath: `/api/properties/${id}/outcome`,
    token: user ? tokenFor(user) : null,
    body,
  });
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

async function run() {
  const { server, port } = await listen();

  test('canonical production contract is explicit', () => {
    assert.deepStrictEqual(CANONICAL_OUTCOME_CONTRACT.sold.fromStatuses, ['approved', 'under_offer']);
    assert.strictEqual(CANONICAL_OUTCOME_CONTRACT.sold.amountRequired, false);
    assert.deepStrictEqual(CANONICAL_OUTCOME_CONTRACT.let.fromStatuses, ['approved']);
    assert.strictEqual(CANONICAL_OUTCOME_CONTRACT.let.amountUnit, 'monthly');
    assert.strictEqual(CANONICAL_OUTCOME_CONTRACT.under_offer.isSaleCompletion, false);
    assert.strictEqual(CANONICAL_OUTCOME_CONTRACT.withdrawn.isSaleCompletion, false);
    assert.strictEqual(CANONICAL_OUTCOME_CONTRACT.withdrawn.isLetCompletion, false);
  });

  await asyncTest('HTTP sold flow succeeds for owner', async () => {
    store.seed([saleListing({ id: 10 })]);
    const res = await postOutcome(
      port,
      10,
      { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z', achievedPrice: 385000 },
      OWNER
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.code, 'recorded');
    assert.strictEqual(res.body.property.status, 'sold');
    assert.strictEqual(res.body.property.sold_at, '2026-07-01T10:00:00.000Z');
    assert.strictEqual(res.body.property.achieved_price, 385000);
    assert.ok(!Object.prototype.hasOwnProperty.call(res.body.property, 'actor_user_id'));
    assert.ok(!Object.prototype.hasOwnProperty.call(res.body.event || {}, 'actor_user_id'));
    assert.strictEqual(res.body.event.event_type, 'sold');
    assert.strictEqual(store.events.filter((e) => e.event_type === 'sold' && e.property_id === 10).length, 1);
  });

  await asyncTest('HTTP let flow succeeds for owner', async () => {
    store.seed([rentListing({ id: 11 })]);
    const res = await postOutcome(
      port,
      11,
      { outcome: 'let', occurredAt: '2026-07-10T09:00:00.000Z', achievedRent: 1450 },
      OWNER
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.property.status, 'let');
    assert.strictEqual(res.body.property.achieved_rent, 1450);
    assert.strictEqual(res.body.event.event_type, 'let');
  });

  await asyncTest('HTTP under_offer flow succeeds and is not a sale completion', async () => {
    store.seed([saleListing({ id: 12 })]);
    const res = await postOutcome(
      port,
      12,
      { outcome: 'under_offer', occurredAt: '2026-06-01T10:00:00.000Z' },
      OWNER
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.property.status, 'under_offer');
    assert.strictEqual(res.body.property.sold_at, null);
    assert.strictEqual(res.body.property.achieved_price, null);
  });

  await asyncTest('HTTP withdrawn flow succeeds without achieved values', async () => {
    store.seed([saleListing({ id: 13 })]);
    const res = await postOutcome(port, 13, { outcome: 'withdrawn' }, OWNER);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.property.status, 'withdrawn');
    assert.strictEqual(res.body.property.sold_at, null);
    assert.strictEqual(res.body.property.let_at, null);
    assert.strictEqual(res.body.property.achieved_price, null);
    assert.strictEqual(res.body.property.achieved_rent, null);
  });

  await asyncTest('unauthenticated outcome request is 401', async () => {
    store.seed([saleListing({ id: 14 })]);
    const res = await postOutcome(port, 14, { outcome: 'sold' }, null);
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
  });

  await asyncTest('unrelated authenticated user is 403', async () => {
    store.seed([saleListing({ id: 15 })]);
    const res = await postOutcome(port, 15, { outcome: 'sold' }, STRANGER);
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.code, 'unauthorized');
    assert.strictEqual(store.listingById(15).status, 'approved');
  });

  await asyncTest('admin and super_admin may record outcomes', async () => {
    store.seed([saleListing({ id: 16 }), saleListing({ id: 17 })]);
    const adminRes = await postOutcome(port, 16, { outcome: 'sold' }, ADMIN);
    const superRes = await postOutcome(port, 17, { outcome: 'sold' }, SUPER_ADMIN);
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(superRes.status, 200);
  });

  await asyncTest('invalid transition returns 400 invalid_transition', async () => {
    store.seed([saleListing({ id: 18, status: 'pending' })]);
    const res = await postOutcome(port, 18, { outcome: 'sold' }, OWNER);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'invalid_transition');
  });

  await asyncTest('unsupported listing category returns 400', async () => {
    store.seed([saleListing({ id: 19, category: 'lease' })]);
    const res = await postOutcome(port, 19, { outcome: 'sold' }, OWNER);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'unsupported_listing_category');
  });

  await asyncTest('ambiguous listing category returns 400', async () => {
    store.seed([saleListing({ id: 20, category: null })]);
    const res = await postOutcome(port, 20, { outcome: 'sold' }, OWNER);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'ambiguous_listing_category');
  });

  await asyncTest('sale and rent amounts are optional over HTTP', async () => {
    store.seed([saleListing({ id: 21, price: 400000 }), rentListing({ id: 22, monthly_rent: 1500 })]);
    const sold = await postOutcome(port, 21, { outcome: 'sold' }, OWNER);
    const letRes = await postOutcome(port, 22, { outcome: 'let' }, OWNER);
    assert.strictEqual(sold.status, 200);
    assert.strictEqual(sold.body.property.achieved_price, null);
    assert.notStrictEqual(sold.body.property.achieved_price, 400000);
    assert.strictEqual(letRes.status, 200);
    assert.strictEqual(letRes.body.property.achieved_rent, null);
    assert.notStrictEqual(letRes.body.property.achieved_rent, 1500);
  });

  await asyncTest('zero amount is rejected over HTTP', async () => {
    store.seed([saleListing({ id: 23 }), rentListing({ id: 24 })]);
    const sold = await postOutcome(port, 23, { outcome: 'sold', achievedPrice: 0 }, OWNER);
    const letRes = await postOutcome(port, 24, { outcome: 'let', achievedRent: 0 }, OWNER);
    assert.strictEqual(sold.status, 400);
    assert.strictEqual(sold.body.code, 'invalid_achieved_price');
    assert.strictEqual(letRes.status, 400);
    assert.strictEqual(letRes.body.code, 'invalid_achieved_rent');
  });

  await asyncTest('identical HTTP retry is idempotent', async () => {
    store.seed([saleListing({ id: 25 })]);
    const body = { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z', achievedPrice: 370000 };
    const first = await postOutcome(port, 25, body, OWNER);
    const second = await postOutcome(port, 25, body, OWNER);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(second.body.code, 'idempotent');
    assert.strictEqual(second.body.idempotent, true);
    assert.strictEqual(store.events.filter((e) => e.property_id === 25 && e.event_type === 'sold').length, 1);
  });

  await asyncTest('conflicting achieved value and date are 409 outcome_conflict', async () => {
    store.seed([saleListing({ id: 26 }), rentListing({ id: 27 })]);
    await postOutcome(port, 26, { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z', achievedPrice: 370000 }, OWNER);
    const amount = await postOutcome(
      port,
      26,
      { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z', achievedPrice: 380000 },
      OWNER
    );
    const date = await postOutcome(
      port,
      26,
      { outcome: 'sold', occurredAt: '2026-08-01T10:00:00.000Z', achievedPrice: 370000 },
      OWNER
    );
    assert.strictEqual(amount.status, 409);
    assert.strictEqual(amount.body.code, 'outcome_conflict');
    assert.strictEqual(date.status, 409);
    assert.strictEqual(store.listingById(26).achieved_price, 370000);
    await postOutcome(port, 27, { outcome: 'let', occurredAt: '2026-07-10T09:00:00.000Z', achievedRent: 1400 }, OWNER);
    const letConflict = await postOutcome(
      port,
      27,
      { outcome: 'let', occurredAt: '2026-07-10T09:00:00.000Z', achievedRent: 1600 },
      OWNER
    );
    assert.strictEqual(letConflict.status, 409);
  });

  await asyncTest('concurrent identical sold requests create one outcome/event', async () => {
    store.seed([saleListing({ id: 28 })]);
    const body = { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z', achievedPrice: 360000 };
    const [a, b] = await Promise.all([
      postOutcome(port, 28, body, OWNER),
      postOutcome(port, 28, body, OWNER),
    ]);
    assert.ok([a.status, b.status].every((s) => s === 200));
    const codes = [a.body.code, b.body.code].sort();
    assert.deepStrictEqual(codes, ['idempotent', 'recorded']);
    assert.strictEqual(store.events.filter((e) => e.property_id === 28 && e.event_type === 'sold').length, 1);
    assert.strictEqual(store.listingById(28).status, 'sold');
  });

  await asyncTest('concurrent identical let requests create one outcome/event', async () => {
    store.seed([rentListing({ id: 29 })]);
    const body = { outcome: 'let', occurredAt: '2026-07-10T09:00:00.000Z', achievedRent: 1400 };
    const [a, b] = await Promise.all([
      postOutcome(port, 29, body, OWNER),
      postOutcome(port, 29, body, OWNER),
    ]);
    assert.ok([a.status, b.status].every((s) => s === 200));
    assert.strictEqual(store.events.filter((e) => e.property_id === 29 && e.event_type === 'let').length, 1);
  });

  await asyncTest('sold vs withdrawn race cannot leave contradictory terminal state', async () => {
    store.seed([saleListing({ id: 30 })]);
    const [sold, withdrawn] = await Promise.all([
      postOutcome(port, 30, { outcome: 'sold', occurredAt: '2026-07-01T10:00:00.000Z' }, OWNER),
      postOutcome(port, 30, { outcome: 'withdrawn', occurredAt: '2026-07-01T10:00:00.000Z' }, OWNER),
    ]);
    const listing = store.listingById(30);
    const statuses = [sold.status, withdrawn.status].sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    if (listing.status === 'sold') {
      assert.ok(listing.sold_at);
      assert.strictEqual(listing.withdrawn_at, null);
    } else {
      assert.strictEqual(listing.status, 'withdrawn');
      assert.ok(listing.withdrawn_at);
      assert.strictEqual(listing.sold_at, null);
    }
  });

  await asyncTest('let vs withdrawn race cannot leave contradictory terminal state', async () => {
    store.seed([rentListing({ id: 31 })]);
    const [letRes, withdrawn] = await Promise.all([
      postOutcome(port, 31, { outcome: 'let' }, OWNER),
      postOutcome(port, 31, { outcome: 'withdrawn' }, OWNER),
    ]);
    const listing = store.listingById(31);
    assert.deepStrictEqual([letRes.status, withdrawn.status].sort(), [200, 409]);
    assert.ok(listing.status === 'let' || listing.status === 'withdrawn');
    if (listing.status === 'let') assert.strictEqual(listing.withdrawn_at, null);
    if (listing.status === 'withdrawn') assert.strictEqual(listing.let_at, null);
  });

  await asyncTest('HTTP incomplete sold can later be completed with a genuine price', async () => {
    store.seed([saleListing({ id: 41, price: 400000 })]);
    const soldAt = '2026-07-01T10:00:00.000Z';
    const first = await postOutcome(port, 41, { outcome: 'sold', occurredAt: soldAt }, OWNER);
    const completed = await postOutcome(
      port,
      41,
      { outcome: 'sold', occurredAt: soldAt, achievedPrice: 385000 },
      OWNER
    );
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.property.achieved_price, null);
    assert.strictEqual(completed.status, 200);
    assert.strictEqual(completed.body.code, 'completed');
    assert.strictEqual(completed.body.property.sold_at, soldAt);
    assert.strictEqual(completed.body.property.achieved_price, 385000);
    assert.strictEqual(store.events.filter((e) => e.property_id === 41 && e.event_type === 'sold').length, 1);
    assert.strictEqual(
      store.events.filter((e) => e.property_id === 41 && e.event_type === 'sale_outcome_completed').length,
      1
    );
  });

  await asyncTest('HTTP copyFromAsking and useValuation are rejected', async () => {
    store.seed([saleListing({ id: 42 })]);
    const asking = await postOutcome(port, 42, { outcome: 'sold', copyFromAsking: true }, OWNER);
    const valuation = await postOutcome(port, 42, { outcome: 'sold', useValuation: true }, OWNER);
    assert.strictEqual(asking.status, 400);
    assert.strictEqual(asking.body.code, 'invalid_amount_source');
    assert.strictEqual(valuation.status, 400);
    assert.strictEqual(valuation.body.code, 'invalid_amount_source');
    assert.strictEqual(store.listingById(42).status, 'approved');
  });

  await asyncTest('concurrent identical completions are idempotent', async () => {
    store.seed([saleListing({ id: 43 })]);
    const soldAt = '2026-07-01T10:00:00.000Z';
    await postOutcome(port, 43, { outcome: 'sold', occurredAt: soldAt }, OWNER);
    const body = { outcome: 'sold', occurredAt: soldAt, achievedPrice: 360000 };
    const [a, b] = await Promise.all([postOutcome(port, 43, body, OWNER), postOutcome(port, 43, body, OWNER)]);
    assert.ok([a.status, b.status].every((s) => s === 200));
    const codes = [a.body.code, b.body.code].sort();
    assert.deepStrictEqual(codes, ['completed', 'idempotent']);
    assert.strictEqual(store.listingById(43).achieved_price, 360000);
    assert.strictEqual(store.listingById(43).sold_at, soldAt);
    assert.strictEqual(
      store.events.filter((e) => e.property_id === 43 && e.event_type === 'sale_outcome_completed').length,
      1
    );
    assert.strictEqual(store.events.filter((e) => e.property_id === 43 && e.event_type === 'sold').length, 1);
  });

  await asyncTest('concurrent different completion prices conflict deterministically', async () => {
    store.seed([saleListing({ id: 44 })]);
    const soldAt = '2026-07-01T10:00:00.000Z';
    await postOutcome(port, 44, { outcome: 'sold', occurredAt: soldAt }, OWNER);
    const [a, b] = await Promise.all([
      postOutcome(port, 44, { outcome: 'sold', occurredAt: soldAt, achievedPrice: 300000 }, OWNER),
      postOutcome(port, 44, { outcome: 'sold', occurredAt: soldAt, achievedPrice: 310000 }, OWNER),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepStrictEqual(statuses, [200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 409 ? a : b;
    assert.strictEqual(loser.body.code, 'outcome_conflict');
    assert.strictEqual(store.listingById(44).achieved_price, winner.body.property.achieved_price);
    assert.ok([300000, 310000].includes(store.listingById(44).achieved_price));
    assert.strictEqual(
      store.events.filter((e) => e.property_id === 44 && e.event_type === 'sale_outcome_completed').length,
      1
    );
  });

  await asyncTest('sold listing cannot return to pending by ordinary edit', async () => {
    store.seed([
      saleListing({
        id: 32,
        status: 'sold',
        sold_at: '2026-07-01T10:00:00.000Z',
        achieved_price: 385000,
      }),
    ]);
    const res = await request({
      port,
      method: 'PUT',
      urlPath: '/api/properties/update/32',
      token: tokenFor(OWNER),
      body: { title: 'Changed', status: 'pending' },
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'outcome_recorded');
    const listing = store.listingById(32);
    assert.strictEqual(listing.status, 'sold');
    assert.strictEqual(listing.sold_at, '2026-07-01T10:00:00.000Z');
    assert.strictEqual(listing.achieved_price, 385000);
  });

  await asyncTest('let listing cannot return to pending by ordinary edit', async () => {
    store.seed([
      rentListing({
        id: 33,
        status: 'let',
        let_at: '2026-07-10T09:00:00.000Z',
        achieved_rent: 1450,
      }),
    ]);
    const res = await request({
      port,
      method: 'PUT',
      urlPath: '/api/properties/update/33',
      token: tokenFor(OWNER),
      body: { title: 'Changed' },
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(store.listingById(33).status, 'let');
    assert.strictEqual(store.listingById(33).let_at, '2026-07-10T09:00:00.000Z');
    assert.strictEqual(store.listingById(33).achieved_rent, 1450);
  });

  await asyncTest('withdrawn listing cannot be silently approved', async () => {
    store.seed([
      saleListing({
        id: 34,
        status: 'withdrawn',
        withdrawn_at: '2026-06-15T10:00:00.000Z',
      }),
    ]);
    const res = await request({
      port,
      method: 'PUT',
      urlPath: '/api/properties/admin/34/status',
      token: tokenFor(ADMIN),
      body: { status: 'approved' },
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.code, 'outcome_recorded');
    assert.strictEqual(store.listingById(34).status, 'withdrawn');
    assert.strictEqual(store.listingById(34).withdrawn_at, '2026-06-15T10:00:00.000Z');
  });

  await asyncTest('admin approve/reject cannot reopen a sold listing', async () => {
    store.seed([
      saleListing({
        id: 35,
        status: 'sold',
        sold_at: '2026-07-01T10:00:00.000Z',
        achieved_price: 300000,
      }),
    ]);
    const res = await request({
      port,
      method: 'PUT',
      urlPath: '/api/properties/admin/35/status',
      token: tokenFor(ADMIN),
      body: { status: 'rejected' },
    });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(store.listingById(35).status, 'sold');
    assert.strictEqual(store.listingById(35).achieved_price, 300000);
  });

  test('sold_at before first_published is reported, not repaired', () => {
    const listing = saleListing({
      first_published_at: '2026-02-01T00:00:00.000Z',
      sold_at: '2026-01-01T00:00:00.000Z',
      status: 'sold',
    });
    const issues = detectListingOutcomeIssues(listing);
    assert.ok(issues.includes(ISSUE.sold_at_before_first_published));
    assert.strictEqual(listing.sold_at, '2026-01-01T00:00:00.000Z');
  });

  test('let_at before first_published is reported', () => {
    const issues = detectListingOutcomeIssues(
      rentListing({
        first_published_at: '2026-02-01T00:00:00.000Z',
        let_at: '2025-12-01T00:00:00.000Z',
        status: 'let',
      })
    );
    assert.ok(issues.includes(ISSUE.let_at_before_first_published));
  });

  test('category and terminal conflicts are detected without repair', () => {
    assert.ok(
      detectListingOutcomeIssues(
        saleListing({ let_at: '2026-07-01T00:00:00.000Z' })
      ).includes(ISSUE.sale_category_has_let_at)
    );
    assert.ok(
      detectListingOutcomeIssues(
        rentListing({ sold_at: '2026-07-01T00:00:00.000Z' })
      ).includes(ISSUE.rent_category_has_sold_at)
    );
    assert.ok(
      detectListingOutcomeIssues(
        saleListing({
          sold_at: '2026-07-01T00:00:00.000Z',
          let_at: '2026-07-02T00:00:00.000Z',
        })
      ).includes(ISSUE.sold_and_let_both_present)
    );
    assert.ok(
      detectListingOutcomeIssues(
        saleListing({
          status: 'withdrawn',
          withdrawn_at: '2026-07-01T00:00:00.000Z',
          sold_at: '2026-07-02T00:00:00.000Z',
        })
      ).includes(ISSUE.withdrawn_with_sold_or_let)
    );
    assert.ok(
      detectListingOutcomeIssues(
        saleListing({
          sold_at: '2026-07-01T00:00:00.000Z',
          under_offer_at: '2026-08-01T00:00:00.000Z',
        })
      ).includes(ISSUE.under_offer_at_after_sold_at)
    );
    assert.ok(
      detectListingOutcomeIssues(saleListing({ achieved_price: 100000 })).includes(
        ISSUE.achieved_price_without_sold_at
      )
    );
  });

  test('genuine sale with amount after snapshot is metric eligible; without amount it is not', () => {
    const withAmount = classifyFirstPartyBacktestEligibility(
      saleListing({
        id: 10,
        sold_at: '2025-06-01T00:00:00.000Z',
        achieved_price: 380000,
      }),
      snapshotRow()
    );
    assert.strictEqual(withAmount.outcomeRecorded, true);
    assert.strictEqual(withAmount.saleMetricEligible, true);
    const withoutAmount = classifyFirstPartyBacktestEligibility(
      saleListing({
        id: 10,
        sold_at: '2025-06-01T00:00:00.000Z',
        achieved_price: null,
      }),
      snapshotRow()
    );
    assert.strictEqual(withoutAmount.outcomeRecorded, true);
    assert.strictEqual(withoutAmount.saleMetricEligible, false);
    assert.strictEqual(withoutAmount.saleReason, 'missing_achieved_amount');
  });

  test('genuine let with rent after snapshot is eligible; without rent it is not', () => {
    const withRent = classifyFirstPartyBacktestEligibility(
      rentListing({
        id: 10,
        let_at: '2025-06-01T00:00:00.000Z',
        achieved_rent: 1450,
      }),
      snapshotRow()
    );
    assert.strictEqual(withRent.rentOutcomeRecorded, true);
    assert.strictEqual(withRent.rentMetricEligible, true);
    const withoutRent = classifyFirstPartyBacktestEligibility(
      rentListing({
        id: 10,
        let_at: '2025-06-01T00:00:00.000Z',
        achieved_rent: null,
      }),
      snapshotRow()
    );
    assert.strictEqual(withoutRent.outcomeRecorded, true);
    assert.strictEqual(withoutRent.rentMetricEligible, false);
  });

  test('outcome before snapshot is not metric eligible', () => {
    const classified = classifyFirstPartyBacktestEligibility(
      saleListing({
        id: 10,
        sold_at: '2024-12-01T00:00:00.000Z',
        achieved_price: 380000,
      }),
      snapshotRow()
    );
    assert.strictEqual(classified.outcomeRecorded, true);
    assert.strictEqual(classified.saleMetricEligible, false);
    assert.strictEqual(classified.saleReason, 'prediction_not_before_outcome');
  });

  test('PI-facing lifecycle evidence omits actor_user_id', () => {
    const presented = presentListingLifecycleEvidence([
      { event_type: 'sold', actor_user_id: 7, event_at: '2026-07-01T00:00:00.000Z' },
    ]);
    assert.strictEqual(presented.events[0].actor_user_id, undefined);
    assert.strictEqual(presented.demandScore, null);
  });

  test('migrations 016-018 are ordered, additive, and do not backfill', () => {
    const dir = path.join(__dirname, '..', 'db', 'migrations');
    const ensure = fs.readFileSync(path.join(__dirname, '..', 'db', 'ensureIntelligenceSchema.js'), 'utf8');
    const migrate = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'migrate-intelligence-schema.js'),
      'utf8'
    );
    const files = ['016_listing_intelligence_events.sql', '017_listing_lifecycle_idempotency.sql', '018_listing_outcome_idempotency.sql'];
    const order = files.map((f) => ensure.indexOf(f));
    assert.ok(order[0] < order[1] && order[1] < order[2]);
    files.forEach((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(!/UPDATE\s+properties/i.test(sql));
      assert.ok(!/INSERT INTO properties/i.test(sql));
      assert.ok(migrate.includes(file));
    });
    const m018 = fs.readFileSync(path.join(dir, '018_listing_outcome_idempotency.sql'), 'utf8');
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS listing_events_one_sold/i.test(m018));
    assert.ok(/DROP INDEX IF EXISTS listing_events_one_sold/.test(m018));
  });

  test('audit script is aggregate-only and does not backfill', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'scripts', 'audit-listing-outcomes.js'),
      'utf8'
    );
    assert.ok(/audit:outcomes/.test(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')));
    assert.ok(!/INSERT INTO properties/i.test(src));
    assert.ok(!/UPDATE\s+properties/i.test(src));
    assert.ok(!/contact_email/.test(src));
    assert.ok(!/actor_user_id/.test(src));
    assert.ok(!/address_line1/.test(src));
  });

  test('no demand or production scoring changes', () => {
    const qualitySrc = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'ai', 'listingOutcomeQuality.js'),
      'utf8'
    );
    assert.ok(!/scorePersonalDecision/.test(qualitySrc));
    assert.ok(!/demandScore/.test(qualitySrc));
    const landlord = scorePersonalDecision({
      profile: 'landlord',
      property: {
        id: 12,
        price: 200000,
        zip_code: 'W14 9JH',
        bedrooms: 2,
        property_type: 'Flat',
        monthly_rent: 1800,
      },
      preferences: {},
      intelligence: {
        confidence: { level: 'High', assessed: true },
        rentIntel: {
          success: true,
          currentRent: 1800,
          recommendedRent: 1900,
          marketRange: { low: 1700, high: 2100 },
          comparables: [],
        },
        risks: [],
      },
      finance: {
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
      },
      asOf: '2026-06-01T00:00:00.000Z',
    });
    const buyer = scorePersonalDecision({
      profile: 'buyer_general',
      property: {
        id: 1,
        price: 380000,
        zip_code: 'M1 1AA',
        bedrooms: 3,
        property_type: 'Terraced',
        title: '3 bed terrace',
        description: 'Family home with garden.',
        has_garden: true,
        commuteMinutes: 22,
      },
      preferences: {
        budgetMax: 400000,
        location: 'M1 1AA',
        bedrooms: 3,
        propertyType: 'Terraced',
        lifestyle: 'family garden',
        maxCommuteMinutes: 30,
      },
      intelligence: {
        confidence: { level: 'High', assessed: true },
        sale: {
          success: true,
          centralEstimate: 375000,
          lowerEstimate: 360000,
          upperEstimate: 390000,
          evidenceCount: 8,
          confidence: 'high',
        },
      },
      asOf: '2026-06-01T00:00:00.000Z',
    });
    assert.strictEqual(landlord.dimensions.demand.state, 'no_demand_data_source');
    assert.ok(Number.isFinite(buyer.score));
    assert.ok(Number.isFinite(landlord.score));
    assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
    assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
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
    assert.strictEqual(metrics.grossYield, 6);
  });

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  console.log('\nlistingOutcomeReadiness.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
