/**
 * Evidence-aware comparison of two stored BUY decisions.
 * Run: node server/tests/buyComparison.test.js
 */

const assert = require('assert');
const { assembleBuyDecision } = require('../services/ai/buyDecision');
const { assemblePropertyFacts } = require('../services/ai/propertyFacts');
const { compareBuyDecisions, CONCLUSION } = require('../services/ai/buyComparison');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function listing(extra = {}) {
  return {
    id: 7,
    price: 250000,
    category: 'sale',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    ...extra,
  };
}

function buy(property, options = {}) {
  return assembleBuyDecision({
    propertyFacts: property ? assemblePropertyFacts({ property }) : null,
    personalDecision: options.personalDecision || null,
    purchasePrice: options.purchasePrice || null,
    deposit: options.deposit || null,
    comparableSoldEvidence: options.comparableSoldEvidence || null,
  });
}

function text(comparison) {
  return JSON.stringify(comparison.observations);
}

test('asking-price difference stays factual', () => {
  const comparison = compareBuyDecisions(
    buy(listing({ price: 280000, tenure: 'freehold' })),
    buy(listing({ id: 8, price: 300000, tenure: 'freehold' }))
  );
  const price = comparison.observations.find((row) => row.id === 'asking_price_difference');
  assert.ok(price);
  assert.strictEqual(price.kind, 'factual');
  assert.ok(/£20,000 lower/.test(price.statement));
  assert.ok(/does not establish better value/i.test(price.limitation));
  assert.ok(!/better value|undervalued|overvalued/i.test(price.statement));
  assert.strictEqual(comparison.purchaseWinner, null);
  assert.strictEqual(comparison.conclusion, CONCLUSION);
  assert.strictEqual(comparison.columns.find((row) => row.id === 'askingPrice').a, '£280,000');
  assert.strictEqual(comparison.columns.find((row) => row.id === 'askingPrice').b, '£300,000');
});

test('known zero service charge is not unknown', () => {
  const comparison = compareBuyDecisions(
    buy(listing({ tenure: 'leasehold', service_charges: 0 })),
    buy(listing({ id: 8, tenure: 'leasehold' }))
  );
  const row = comparison.observations.find((item) => item.id === 'service_charge_evidence');
  assert.ok(row);
  assert.ok(/£0/.test(row.statement));
  assert.ok(/unknown/i.test(row.statement));
  assert.ok(/unknown is not zero/i.test(row.limitation));
  assert.strictEqual(comparison.columns.find((item) => item.id === 'serviceCharge').a, '£0');
  assert.strictEqual(comparison.columns.find((item) => item.id === 'serviceCharge').b, 'Unknown');
  assert.notStrictEqual(comparison.columns.find((item) => item.id === 'serviceCharge').b, '£0');
});

test('freehold lease evidence does not apply and is not a better lease', () => {
  const comparison = compareBuyDecisions(
    buy(listing({ tenure: 'freehold' })),
    buy(listing({ id: 8, tenure: 'leasehold' }))
  );
  const row = comparison.observations.find((item) => item.id === 'lease_evidence');
  assert.ok(row);
  assert.ok(/does not apply/i.test(row.statement));
  assert.ok(/unresolved lease-length evidence/i.test(row.statement));
  assert.ok(!/better lease/i.test(text(comparison)));
  assert.ok(!/unmortgageable/i.test(text(comparison)));
  assert.strictEqual(comparison.columns.find((item) => item.id === 'leaseYearsRemaining').a, 'Not applicable');
  assert.strictEqual(comparison.columns.find((item) => item.id === 'leaseYearsRemaining').b, 'Unknown');
});

test('sold-price context is stronger evidence and not a valuation', () => {
  const assessed = buy(listing({ tenure: 'freehold' }), {
    comparableSoldEvidence: { assessment: 'ASSESSED', observedComparableMedian: 240000 },
  });
  const market = buy(listing({ id: 8, tenure: 'freehold' }), {
    comparableSoldEvidence: { assessment: 'MARKET_CONTEXT', observedLocalMedian: 190000, relevantMarketTransactionCount: 80 },
  });
  const unknown = buy(listing({ id: 9, tenure: 'freehold' }), {
    comparableSoldEvidence: { assessment: 'INSUFFICIENT_EVIDENCE', observedComparableMedian: 240000 },
  });
  const context = compareBuyDecisions(assessed, market);
  const sold = context.observations.find((item) => item.id === 'sold_evidence_class');
  assert.ok(/stronger property-relevant sold-price evidence/i.test(sold.statement));
  assert.ok(/not this home's value/i.test(sold.limitation));
  assert.ok(!/240000|190000|£240,000|£190,000/.test(JSON.stringify(context)));
  const unresolved = compareBuyDecisions(assessed, unknown);
  assert.ok(/unresolved|unknown/i.test(unresolved.observations.find((item) => item.id === 'sold_evidence_class').statement));
  assert.ok(!/240000/.test(JSON.stringify(unresolved)));
  assert.strictEqual(context.purchaseWinner, null);
});

test('investigation burden and preference conflict do not choose a winner', () => {
  const clearer = buy(listing({ tenure: 'freehold' }), {
    personalDecision: { profile: 'buyer_general', available: true, score: 88, outcome: 'strong_fit' },
  });
  const uncertain = buy({ price: 250000, category: 'sale', tenure: 'leasehold', city: 'Leeds' }, {
    personalDecision: { profile: 'buyer_general', available: true, score: 40, outcome: 'weak_fit' },
  });
  const beforeA = JSON.stringify(clearer);
  const comparison = compareBuyDecisions(clearer, uncertain);
  assert.strictEqual(JSON.stringify(clearer), beforeA);
  const burden = comparison.observations.find((item) => item.id === 'critical_investigation_burden');
  const preference = comparison.observations.find((item) => item.id === 'preference_fit');
  assert.ok(burden);
  assert.ok(/more decision-critical uncertainty/i.test(burden.statement));
  assert.ok(/does not make either property the better purchase/i.test(burden.limitation));
  assert.ok(preference);
  assert.strictEqual(preference.kind, 'preference');
  assert.ok(/better matches the stored preference/i.test(preference.statement));
  assert.ok(/not a purchase recommendation/i.test(preference.limitation));
  assert.strictEqual(comparison.purchaseWinner, null);
  assert.ok(!comparison.score);
  const critical = comparison.columns.find((item) => item.id === 'criticalInvestigations');
  assert.notStrictEqual(critical.a, critical.b);
  assert.ok(Number(critical.b) > Number(critical.a));
});

test('unresolved identity does not discard area context', () => {
  const comparison = compareBuyDecisions(
    buy({ price: 250000, category: 'sale', city: 'Leeds' }),
    buy(listing({ tenure: 'freehold' }))
  );
  const row = comparison.observations.find((item) => item.id === 'identity_certainty');
  assert.ok(row);
  assert.ok(/exact dwelling remain limited/i.test(row.statement));
  assert.ok(/not discarded/i.test(row.limitation));
  assert.ok(!/area context is invalid|area evidence is invalid/i.test(text(comparison)));
});

test('missing relationships and investigation lists are not invented as zero', () => {
  const stored = buy(listing({ tenure: 'freehold' }));
  const old = { buyRecommendation: null, evidence: { askingPrice: { state: 'KNOWN', value: 280000 } } };
  const comparison = compareBuyDecisions(stored, old);
  assert.ok(comparison.observations.some((item) => item.id === 'relationships_not_stored'));
  assert.ok(comparison.observations.some((item) => item.id === 'investigation_not_stored'));
  const critical = comparison.columns.find((item) => item.id === 'criticalInvestigations');
  assert.strictEqual(critical.b, 'Not stored');
  assert.notStrictEqual(critical.b, '0');
  const relationship = comparison.observations.find((item) => item.id === 'relationship_limitation');
  assert.strictEqual(relationship, undefined);
  assert.strictEqual(comparison.purchaseWinner, null);
});

test('two sparse decisions stay limited and do not invent facts', () => {
  const comparison = compareBuyDecisions({}, {});
  assert.strictEqual(comparison.limited, true);
  assert.strictEqual(comparison.conclusion, CONCLUSION);
  assert.strictEqual(comparison.purchaseWinner, null);
  assert.ok(!comparison.observations.some((item) => item.id === 'asking_price_difference'));
  assert.ok(!/£0/.test(JSON.stringify(comparison.columns)));
  assert.strictEqual(comparison.columns.find((item) => item.id === 'serviceCharge').a, 'Not stored');
});

test('a stored relationship limitation is not turned into a recommendation', () => {
  const leasehold = buy(listing({ tenure: 'leasehold' }));
  const freehold = buy(listing({ id: 8, tenure: 'freehold' }));
  const comparison = compareBuyDecisions(leasehold, freehold);
  const row = comparison.observations.find((item) => item.id === 'relationship_limitation');
  assert.ok(row);
  assert.ok(row.limitation);
  assert.ok(!/you should buy|better purchase|unmortgageable/i.test(`${row.statement} ${row.limitation}`));
  assert.strictEqual(leasehold.buyRecommendation, null);
  assert.strictEqual(comparison.notARecommendation, true);
});

test('explicit ground-rent zero is not rewritten as unknown', () => {
  const comparison = compareBuyDecisions(
    buy(listing({ tenure: 'leasehold', ground_rent: 0 })),
    buy(listing({ id: 8, tenure: 'leasehold' }))
  );
  const row = comparison.observations.find((item) => item.id === 'ground_rent_evidence');
  assert.ok(/£0/.test(row.statement));
  assert.strictEqual(comparison.columns.find((item) => item.id === 'groundRent').b, 'Unknown');
  assert.ok(!/£0/.test(comparison.columns.find((item) => item.id === 'groundRent').b));
});
