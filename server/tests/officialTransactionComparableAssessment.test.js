/**
 * Focused tests — official HMLR bounded residential comparable assessment.
 * Includes v1.1 sufficiency closure: MARKET CONTEXT ≠ DEFENSIBLE COMPARABLES.
 */
const assert = require('assert');
const {
  createMemoryOfficialSaleStore,
} = require('../services/market/officialSaleTransactionRepository');
const {
  assessOfficialTransactionComparables,
  buildOfficialTransactionComparableAssessment,
  isSelfMatch,
  mapSubjectToPpdType,
  similarityCategory,
  ASSESSMENT,
  SIMILARITY,
  SUFFICIENCY_MIN_COMPARABLES,
  SUFFICIENCY_MIN_HIGH_COMPARABLES,
  METHODOLOGY_ID,
  METHODOLOGY_VERSION,
} = require('../services/market/officialTransactionComparableAssessment');
const { buildResidentialDecisionWorkspace } = require('../services/ai/residentialDecisionWorkspace');
const { DECISION_JOB } = require('../architecture/decisionContextContract');
const fs = require('fs');
const path = require('path');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function tx(overrides = {}) {
  return {
    source: 'HMLR_PRICE_PAID_DATA',
    source_transaction_id: overrides.id || `{TX-${Math.random().toString(16).slice(2)}}`,
    live: true,
    price_gbp: 250000,
    price_present: true,
    transfer_date: '2024-06-01',
    postcode: 'M1 1AA',
    postcode_compact: 'M11AA',
    property_type_code: 'T',
    tenure_code: 'F',
    paon: '10',
    saon: null,
    street: 'Test Street',
    uprn: null,
    ...overrides,
    source_transaction_id: overrides.source_transaction_id || overrides.id || `{TX-${Math.random().toString(16).slice(2)}}`,
  };
}

/** Same-postcode sales within 3y → HIGH (defensible). */
function highCandidates(n = 3) {
  return Array.from({ length: n }, (_, i) => tx({
    source_transaction_id: `H${i}`,
    paon: String(i + 1),
    transfer_date: '2024-01-01',
    price_gbp: 200000 + i * 10000,
  }));
}

async function main() {
  console.log('officialTransactionComparableAssessment');

  test('0. methodology version is 1.1.0 sufficiency closure', () => {
    assert.strictEqual(METHODOLOGY_VERSION, '1.1.0');
    assert.strictEqual(SUFFICIENCY_MIN_HIGH_COMPARABLES, 3);
    assert.strictEqual(SUFFICIENCY_MIN_COMPARABLES, SUFFICIENCY_MIN_HIGH_COMPARABLES);
  });

  test('1. official transaction provenance on assessed comps', () => {
    const result = assessOfficialTransactionComparables({
      candidates: highCandidates(3),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.strictEqual(result.assessment, ASSESSMENT.ASSESSED);
    assert.strictEqual(result.methodologyId, METHODOLOGY_ID);
    assert.ok(result.comparables.every((c) => c.provenance.source === 'HMLR_PRICE_PAID_DATA'));
    assert.ok(result.provenance.notValuation);
    assert.strictEqual(result.defensibleComparableCount, 3);
  });

  test('2. invalid transaction excluded', () => {
    const result = assessOfficialTransactionComparables({
      candidates: [
        tx({ source_transaction_id: 'A', price_present: false, price_gbp: null, paon: '1' }),
        ...highCandidates(3),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.ok(result.exclusionTallies.invalid_price >= 1);
    assert.ok(!result.comparables.some((c) => c.sourceTransactionId === 'A'));
  });

  test('3-4. future transaction and as-of leakage prevented', () => {
    const result = assessOfficialTransactionComparables({
      candidates: [
        tx({ source_transaction_id: 'FUT', transfer_date: '2026-06-01', paon: '9' }),
        ...highCandidates(3),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.ok(result.exclusionTallies.after_as_of >= 1);
    assert.ok(!result.comparables.some((c) => c.sourceTransactionId === 'FUT'));
  });

  test('5-6. subject self-transaction excluded by id and address', () => {
    assert.strictEqual(
      isSelfMatch(
        tx({ source_transaction_id: 'SELF', paon: '10', postcode_compact: 'M11AA' }),
        { postcode: 'M11AA', paon: '10', saon: null }
      ),
      true
    );
    const result = assessOfficialTransactionComparables({
      candidates: [
        tx({ source_transaction_id: 'SELF', paon: '10', transfer_date: '2024-01-01' }),
        ...highCandidates(3),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced', paon: '10' },
      identity: { paon: '10' },
      asOf: '2025-01-01',
    });
    assert.ok(!result.comparables.some((c) => c.sourceTransactionId === 'SELF'));
  });

  test('7-8. unknown/incompatible type excluded', () => {
    assert.strictEqual(mapSubjectToPpdType({ property_type: 'warehouse' }), null);
    const na = assessOfficialTransactionComparables({
      candidates: [tx()],
      property: { postcode: 'M1 1AA', property_type: 'warehouse' },
      asOf: '2025-01-01',
    });
    assert.strictEqual(na.assessment, ASSESSMENT.NOT_APPLICABLE);

    const mismatch = assessOfficialTransactionComparables({
      candidates: [
        tx({ property_type_code: 'D', paon: '1' }),
        tx({ property_type_code: 'D', paon: '2', source_transaction_id: 'X2' }),
        tx({ property_type_code: 'D', paon: '3', source_transaction_id: 'X3' }),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.ok(mismatch.exclusionTallies.type_mismatch >= 3);
    assert.strictEqual(mismatch.assessment, ASSESSMENT.INSUFFICIENT_EVIDENCE);
  });

  test('9. missing attribute != zero (knownAttributes false)', () => {
    const result = assessOfficialTransactionComparables({
      candidates: highCandidates(3),
      property: { postcode: 'M1 1AA', property_type: 'terraced', bedrooms: 3 },
      asOf: '2025-01-01',
    });
    assert.ok(result.comparables.every((c) => c.knownAttributes.bedrooms === false));
    assert.ok(result.comparables.every((c) => c.knownAttributes.internalArea === false));
  });

  await testAsync('10. candidate generation bounded', async () => {
    const store = createMemoryOfficialSaleStore();
    const rows = [];
    for (let i = 0; i < 200; i += 1) {
      rows.push(tx({
        source_transaction_id: `T${i}`,
        paon: String(i),
        transfer_date: '2023-01-01',
        price_gbp: 200000 + i,
      }));
    }
    await store.upsertBatch(rows);
    const fetched = await store.findComparableCandidates({
      postcodeCompact: 'M11AA',
      propertyTypeCode: 'T',
      asOf: '2025-01-01',
      limit: 80,
      mode: 'postcode',
    });
    assert.ok(fetched.length <= 80);
  });

  test('11-12. similarity reasons and category deterministic', () => {
    const result = assessOfficialTransactionComparables({
      candidates: highCandidates(3),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.ok(result.comparables[0].reasonsForSimilarity.length >= 2);
    assert.strictEqual(result.comparables[0].similarityCategory, SIMILARITY.HIGH);
  });

  test('13-16. missing area/beds/tenure/age handled safely', () => {
    const result = assessOfficialTransactionComparables({
      candidates: [
        tx({ source_transaction_id: 'A', tenure_code: null, paon: '1', transfer_date: '2024-01-01' }),
        tx({ source_transaction_id: 'B', tenure_code: 'L', paon: '2', transfer_date: '2024-02-01' }),
        tx({ source_transaction_id: 'C', paon: '3', transfer_date: '2024-03-01' }),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.strictEqual(result.assessment, ASSESSMENT.ASSESSED);
    assert.ok(result.limitations.some((l) => /does not include bedrooms/i.test(l)));
  });

  test('17-18. insufficient vs assessed — HIGH floor only', () => {
    const one = assessOfficialTransactionComparables({
      candidates: [tx({ source_transaction_id: 'A', paon: '1', transfer_date: '2024-01-01' })],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.notStrictEqual(one.assessment, ASSESSMENT.ASSESSED);
    assert.ok(one.defensibleComparableCount < SUFFICIENCY_MIN_HIGH_COMPARABLES);

    const threeHigh = assessOfficialTransactionComparables({
      candidates: highCandidates(3),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.strictEqual(threeHigh.assessment, ASSESSMENT.ASSESSED);
    assert.strictEqual(threeHigh.evidenceStrength, 'MODERATE');
  });

  test('19-20. comparable stats only from defensible HIGH set', () => {
    const result = assessOfficialTransactionComparables({
      candidates: [
        ...highCandidates(3).map((r, i) => ({ ...r, price_gbp: 100000 + i * 100000 })),
        // Broad district market noise — must not enter comparable range
        tx({
          source_transaction_id: 'DIST1',
          postcode: 'M1 2BB',
          postcode_compact: 'M12BB',
          paon: '99',
          transfer_date: '2024-01-01',
          price_gbp: 900000,
        }),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
      geographyMode: 'district',
    });
    assert.strictEqual(result.assessment, ASSESSMENT.ASSESSED);
    assert.strictEqual(result.observedComparableRange.lowGbp, 100000);
    assert.strictEqual(result.observedComparableRange.highGbp, 300000);
    assert.ok(/defensible comparable/i.test(result.observedComparableRange.label));
    assert.ok(/not a valuation/i.test(result.observedComparableRange.label));
    assert.ok(result.observedLocalTransactionRange.highGbp >= 900000);
    assert.ok(/market context/i.test(result.observedLocalTransactionRange.label));
  });

  test('21-22. no valuation / no over-underpriced conclusion', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/market/officialTransactionComparableAssessment.js'),
      'utf8'
    );
    assert.ok(!/UNDERPRICED|OVERPRICED|FAIR_VALUE|GOOD_DEAL/.test(src));
    assert.ok(!/centralEstimate|calculatePropertyValuation/.test(src));
  });

  test('23-26. no valuation/finance/PD/What-if mutation in module', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/market/officialTransactionComparableAssessment.js'),
      'utf8'
    );
    assert.ok(!/valuationEngine|financialEngine|personalDecision|whatIf|decisionIntelligence/i.test(src));
  });

  test('27-28. BUY/SELL wording matches ASSESSED vs MARKET_CONTEXT', () => {
    const assessed = assessOfficialTransactionComparables({
      candidates: highCandidates(3),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    const market = assessOfficialTransactionComparables({
      candidates: Array.from({ length: 8 }, (_, i) => tx({
        source_transaction_id: `D${i}`,
        postcode: 'M1 2BB',
        postcode_compact: 'M12BB',
        paon: String(i),
        transfer_date: '2024-01-01',
        price_gbp: 200000 + i * 5000,
      })),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
      geographyMode: 'district',
    });
    assert.strictEqual(market.assessment, ASSESSMENT.MARKET_CONTEXT);
    assert.strictEqual(market.evidenceStrength, 'LIMITED');
    assert.strictEqual(market.defensibleComparableCount, 0);

    const buyA = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.BUY },
      report: { marketIntelligence: { comparableSoldEvidence: assessed } },
    });
    const buyM = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.BUY },
      report: { marketIntelligence: { comparableSoldEvidence: market } },
    });
    const sellM = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.SELL },
      report: { marketIntelligence: { comparableSoldEvidence: market } },
    });
    const aTile = buyA.keyIntelligence.find((k) => k.id === 'comparable_sold_evidence');
    const mKey = buyM.keyIntelligence.find((k) => k.id === 'comparable_sold_evidence');
    const mSupport = buyM.contextEvidence.find((k) => k.id === 'local_sold_transaction_context');
    assert.strictEqual(aTile.label, 'Comparable sold evidence');
    assert.strictEqual(aTile.kind, 'comparableSoldEvidence');
    assert.strictEqual(aTile.state, 'ASSESSED');
    assert.ok(aTile.available);
    assert.ok(aTile.value);
    assert.ok(!buyA.contextEvidence.some((k) => k.kind === 'marketTransactionContext'));

    assert.strictEqual(mKey.label, 'Comparable sold evidence');
    assert.strictEqual(mKey.kind, 'comparableSoldEvidence');
    assert.strictEqual(mKey.state, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual(mKey.available, false);
    assert.strictEqual(mKey.value, null);
    assert.ok(mKey.notDefensibleComparable);
    assert.ok(mKey.notAskingPriceJudgement);
    assert.ok(/not comparable assessment|supporting evidence|not subject value|asking-price/i.test(mKey.whyItMatters));

    assert.ok(mSupport);
    assert.strictEqual(mSupport.label, 'Local sold transaction context');
    assert.strictEqual(mSupport.kind, 'marketTransactionContext');
    assert.strictEqual(mSupport.presentationRole, 'supporting_context');
    assert.notStrictEqual(mSupport.state, 'ASSESSED');
    assert.strictEqual(mSupport.state, 'INSUFFICIENT_EVIDENCE');
    assert.ok(mSupport.available);
    assert.ok(mSupport.value);
    assert.ok(mSupport.notValuation);
    assert.ok(mSupport.notDefensibleComparable);
    assert.ok(mSupport.notAskingPriceJudgement);
    assert.ok(!/fair value|underpriced|overpriced|recommended offer|estimated value/i.test(
      `${mSupport.label} ${mSupport.whyItMatters} ${mSupport.value}`
    ));

    const sellKey = sellM.keyIntelligence.find((k) => k.id === 'comparable_sold_evidence');
    const sellSupport = sellM.contextEvidence.find((k) => k.id === 'local_sold_transaction_context');
    assert.strictEqual(sellKey.available, false);
    assert.strictEqual(sellKey.value, null);
    assert.strictEqual(sellSupport.label, 'Local sold transaction context');
  });

  test('29. LET flow unchanged (no comparable key tile)', () => {
    const evidence = { assessment: ASSESSMENT.ASSESSED, comparableCount: 3 };
    const market = assessOfficialTransactionComparables({
      candidates: Array.from({ length: 8 }, (_, i) => tx({
        source_transaction_id: `L${i}`,
        postcode: 'M1 2BB',
        postcode_compact: 'M12BB',
        paon: String(i),
        transfer_date: '2024-01-01',
        price_gbp: 200000 + i * 5000,
      })),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
      geographyMode: 'district',
    });
    const letWs = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.LET_INVEST },
      report: {
        marketIntelligence: { comparableSoldEvidence: evidence },
        investment: {},
      },
    });
    const letMarket = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.LET_INVEST },
      report: {
        marketIntelligence: { comparableSoldEvidence: market },
        investment: {},
      },
    });
    assert.ok(!letWs.keyIntelligence.some((k) => k.id === 'comparable_sold_evidence'));
    assert.ok(!letMarket.keyIntelligence.some((k) => k.id === 'comparable_sold_evidence'));
    assert.ok(!letMarket.contextEvidence.some((k) => k.id === 'local_sold_transaction_context'));
  });

  test('30. history immutability — module does not touch AiRequest', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../services/market/officialTransactionComparableAssessment.js'),
      'utf8'
    );
    assert.ok(!/AiRequest|ai_requests/.test(src));
  });

  test('31. comparableEngine remains free of HMLR coupling', () => {
    const comparable = fs.readFileSync(
      path.join(__dirname, '../services/ai/comparableEngine.js'),
      'utf8'
    );
    assert.ok(!/officialSale|hmlrPricePaid|official_sale_transactions/.test(comparable));
  });

  await testAsync('32. HMLR query bounded via findComparableCandidates', async () => {
    const store = createMemoryOfficialSaleStore();
    await store.upsertBatch(highCandidates(3));
    const result = await buildOfficialTransactionComparableAssessment({
      property: { postcode: 'M1 1AA', property_type: 'terraced', paon: '99' },
      asOf: '2025-01-01',
      store,
    });
    assert.strictEqual(result.assessment, ASSESSMENT.ASSESSED);
    assert.ok(result.searchHierarchy.length >= 1);
    assert.ok(result.searchHierarchy[0].limit <= 120);
  });

  test('33. many MEDIUM / district LOW alone do NOT produce ASSESSED', () => {
    const mediumOnly = Array.from({ length: 12 }, (_, i) => tx({
      source_transaction_id: `M${i}`,
      paon: String(i),
      // 4 years old → MEDIUM (same postcode), not HIGH
      transfer_date: '2021-01-01',
      price_gbp: 180000 + i * 1000,
    }));
    const med = assessOfficialTransactionComparables({
      candidates: mediumOnly,
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.strictEqual(med.similarityQuality.high, 0);
    assert.ok(med.similarityQuality.medium >= 3);
    assert.strictEqual(med.assessment, ASSESSMENT.MARKET_CONTEXT);
    assert.strictEqual(med.evidenceStrength, 'LIMITED');
    assert.strictEqual(med.observedComparableRange, null);
    assert.ok(med.observedLocalTransactionRange);

    const districtHeavy = Array.from({ length: 40 }, (_, i) => tx({
      source_transaction_id: `L${i}`,
      postcode: 'M1 3CC',
      postcode_compact: 'M13CC',
      paon: String(i),
      transfer_date: '2024-01-01',
      price_gbp: 150000 + i * 2000,
    }));
    const dist = assessOfficialTransactionComparables({
      candidates: districtHeavy,
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
      geographyMode: 'district',
    });
    assert.strictEqual(dist.similarityQuality.high, 0);
    assert.ok(dist.similarityQuality.low >= 3);
    assert.strictEqual(dist.assessment, ASSESSMENT.MARKET_CONTEXT);
    assert.notStrictEqual(dist.assessment, ASSESSMENT.ASSESSED);
  });

  test('34. LIMITED evidence cannot masquerade as strong comparable evidence', () => {
    const result = assessOfficialTransactionComparables({
      candidates: Array.from({ length: 20 }, (_, i) => tx({
        source_transaction_id: `W${i}`,
        postcode: 'M1 4DD',
        postcode_compact: 'M14DD',
        paon: String(i),
        transfer_date: '2023-06-01',
        price_gbp: 200000 + i * 10000,
      })),
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
      geographyMode: 'district',
    });
    assert.strictEqual(result.evidenceStrength, 'LIMITED');
    assert.strictEqual(result.assessment, ASSESSMENT.MARKET_CONTEXT);
    assert.strictEqual(result.comparables.length, 0);
    assert.ok(result.marketContextTransactions.length > 0);
  });

  test('35. district≤3y is LOW not MEDIUM (v1.1)', () => {
    const sim = similarityCategory(
      tx({ postcode_compact: 'M12BB', postcode: 'M1 2BB', transfer_date: '2024-01-01' }),
      { asOf: new Date('2025-01-01'), postcodeCompact: 'M11AA' }
    );
    assert.strictEqual(sim.category, SIMILARITY.LOW);
  });

  test('36. insufficient returns WHY / WHAT MISSING / WHAT NEXT', () => {
    const result = assessOfficialTransactionComparables({
      candidates: [
        tx({ source_transaction_id: 'A', paon: '1', transfer_date: '2024-01-01' }),
      ],
      property: { postcode: 'M1 1AA', property_type: 'terraced' },
      asOf: '2025-01-01',
    });
    assert.ok(
      result.assessment === ASSESSMENT.INSUFFICIENT_EVIDENCE
      || result.assessment === ASSESSMENT.MARKET_CONTEXT
    );
    // one HIGH only → below market context floor of 3 → insufficient
    assert.strictEqual(result.assessment, ASSESSMENT.INSUFFICIENT_EVIDENCE);
    assert.ok(result.unresolvedDependencies.length >= 1);
    assert.ok(result.unresolvedDependencies[0].why || result.unresolvedDependencies[0].label);
    assert.ok(result.investigationPriorities[0].whatNext || result.investigationPriorities[0].howToResolve);

    const buy = buildResidentialDecisionWorkspace({
      decisionContext: { decisionJob: DECISION_JOB.BUY },
      report: { marketIntelligence: { comparableSoldEvidence: result } },
    });
    const tile = buy.keyIntelligence.find((k) => k.id === 'comparable_sold_evidence');
    assert.strictEqual(tile.available, false);
    assert.strictEqual(tile.label, 'Comparable sold evidence');
    assert.ok(tile.howToResolve);
  });

  console.log('officialTransactionComparableAssessment: all passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
