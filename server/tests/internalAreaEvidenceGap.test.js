/**
 * Internal area evidence gap — decision workspace surfacing.
 * Run: node server/tests/internalAreaEvidenceGap.test.js
 */

const assert = require('assert');
const {
  buildInternalAreaEvidenceGap,
  internalAreaUnresolvedItem,
  mergeInternalAreaGap,
} = require('../services/ai/internalAreaEvidenceGap');
const { buildResidentialDecisionWorkspace } = require('../services/ai/residentialDecisionWorkspace');
const { DECISION_JOB } = require('../architecture/decisionContextContract');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log(`✓ ${name}`));
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

const saleReportMissingArea = {
  property: {
    id: 155,
    category: 'sale',
    internalArea: {
      available: false,
      readiness: { reasonCode: 'MISSING_INTERNAL_AREA', state: 'MISSING_INTERNAL_AREA' },
    },
  },
  marketIntelligence: {
    sale: { success: false, notAssessed: true, message: 'Valuation was not assessed.' },
    pricePosition: { success: false, notAssessed: true },
  },
  personalDecision: { profile: 'buyer_general', available: false },
};

(async () => {
  await test('buildInternalAreaEvidenceGap requires listing id', () => {
    assert.strictEqual(buildInternalAreaEvidenceGap({ property: {} }), null);
  });

  await test('missing internal area produces listing edit gap', () => {
    const gap = buildInternalAreaEvidenceGap(saleReportMissingArea);
    assert.strictEqual(gap.resolutionAction, 'edit_listing');
    assert.strictEqual(gap.listingAttributeKey, 'internal_area');
    assert.ok(gap.detail.includes('not recorded'));
  });

  await test('provider-eligible internal area produces no gap', () => {
    assert.strictEqual(
      buildInternalAreaEvidenceGap({
        property: {
          id: 1,
          internalArea: { available: true, readiness: { state: 'PROVIDER_ELIGIBLE' } },
        },
      }),
      null
    );
  });

  await test('invalid internal area suggests listing correction', () => {
    const gap = buildInternalAreaEvidenceGap({
      property: {
        id: 133,
        internalArea: { readiness: { reasonCode: 'INVALID_INTERNAL_AREA' } },
      },
    });
    assert.ok(gap.detail.includes('invalid'));
  });

  await test('mergeInternalAreaGap prepends unresolved item once', () => {
    const merged = mergeInternalAreaGap([], saleReportMissingArea);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].id, 'internal_floor_area');
    assert.strictEqual(mergeInternalAreaGap(merged, saleReportMissingArea).length, 1);
  });

  await test('BUY workspace surfaces internal area unresolved with edit action', () => {
    const ws = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.BUY },
      report: saleReportMissingArea,
      methodologyGate: { allowed: true, mode: 'RESIDENTIAL' },
    });
    const val = ws.keyIntelligence.find((row) => row.id === 'valuation_range');
    assert.strictEqual(val.isListingAttribute, true);
    assert.strictEqual(val.resolutionAction, 'edit_listing');
    assert.ok(ws.unresolved.some((row) => row.id === 'internal_floor_area'));
  });

  await test('LET_INVEST keeps finance gaps and adds internal area gap', () => {
    const ws = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.LET_INVEST },
      report: {
        ...saleReportMissingArea,
        investment: { presented: { noi: { available: false, reason: 'Missing costs' } } },
        personalDecision: { profile: 'landlord', available: false },
        decisionIntelligence: { unresolvedDependencies: [{ id: 'noi', label: 'NOI' }] },
      },
      methodologyGate: { allowed: true, mode: 'RESIDENTIAL' },
    });
    assert.ok(ws.unresolved.some((row) => row.id === 'internal_floor_area'));
  });

  console.log('\nAll internal area evidence gap tests passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
