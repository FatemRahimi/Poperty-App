/**
 * Phase 2 decision truth and safety.
 * Run: node server/tests/decisionTruthHardening.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { calculateSafeLtv } = require('../services/ai/safeLtv');
const { leaseholdEvidence } = require('../services/ai/leaseholdTruth');
const { assembleBuyDecision } = require('../services/ai/buyDecision');
const { resolveRentBasis, CANONICAL_RENT_BASIS } = require('../services/ai/financeInputContract');
const { assemblePropertyFacts } = require('../services/ai/propertyFacts');
const { assembleDecisionIntelligence, IMPORTANCE } = require('../services/ai/decisionIntelligence');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { presentEvidencedInvestment, prepareEvidencedInvestment } = require('../services/ai/evidencedInvestment');
const { withholdDefaultedGrowth } = require('../services/ai/presentationSafety');
const { validateLlmText, safeListingCopy } = require('../services/ai/llmOutputGuard');
const { generatePropertyExplanation } = require('../services/ai/propertyExplanationService');
const { generateListingContent, polishBuyerMatchMessage, generateValuationReport } = require('../services/openaiService');
const { scorePropertyMatch, rankBuyerMatches } = require('../services/ai/buyerMatchEngine');
const { buildAreaMarketContext } = require('../services/ai/areaMarketContext');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

const pending = [];
function asyncTest(name, fn) {
  pending.push({ name, fn });
}

function listing(extra = {}) {
  return {
    id: 7,
    price: 250000,
    monthly_rent: 1200,
    category: 'sale',
    city: 'Leeds',
    zip_code: 'LS1 1AA',
    ...extra,
  };
}

test('preference fit is not a buy recommendation', () => {
  const decision = assembleBuyDecision({
    propertyFacts: assemblePropertyFacts({ property: listing() }),
    personalDecision: { profile: 'buyer_general', available: true, score: 88, outcome: 'strong_fit' },
  });
  assert.strictEqual(decision.notARecommendation, true);
  assert.strictEqual(decision.buyRecommendation, null);
  assert.strictEqual(decision.preferenceFit.role, 'preference_fit');
  assert.strictEqual(decision.preferenceFit.notABuyRecommendation, true);
  assert.strictEqual(decision.preferenceFit.score, 88);
  assert.ok(!/you should buy/i.test(JSON.stringify(decision)));

  const ranked = rankBuyerMatches({ budgetMax: 300000, location: 'Leeds', bedrooms: 2 }, [{
    id: 1,
    price: 250000,
    city: 'Leeds',
    bedrooms: 2,
    title: 'Flat',
  }]);
  assert.strictEqual(ranked.notABuyRecommendation, true);
  assert.strictEqual(ranked.buyRecommendation, null);
  assert.strictEqual(ranked.resultRole, 'preference_fit');
  assert.ok(/not a recommendation to buy/i.test(ranked.assistantMessage));
});

test('missing income and finance stay UNKNOWN and are not positive affordability', () => {
  const decision = assembleBuyDecision({
    propertyFacts: assemblePropertyFacts({ property: listing() }),
    personalDecision: { available: true, score: 90, outcome: 'strong_fit' },
  });
  assert.strictEqual(decision.evidence.affordability.state, 'UNKNOWN');
  assert.strictEqual(decision.evidence.affordability.assessed, false);
  assert.strictEqual(decision.evidence.affordability.value, null);
  assert.strictEqual(decision.evidence.cashToComplete.state, 'UNKNOWN');
  assert.strictEqual(decision.evidence.ongoingHousingCost.state, 'UNKNOWN');
  assert.ok(decision.investigationPriorities.some((row) => row.id === 'affordability_evidence_incomplete'));
  assert.notStrictEqual(decision.evidence.affordability.value, decision.preferenceFit.score);
});

test('LTV requires both price and an explicit deposit', () => {
  const missingDeposit = calculateSafeLtv({ purchasePrice: 200000, deposit: null });
  assert.strictEqual(missingDeposit.available, false);
  assert.strictEqual(missingDeposit.state, 'UNKNOWN');
  assert.strictEqual(missingDeposit.value, null);
  assert.notStrictEqual(missingDeposit.deposit, 0);

  const missingPrice = calculateSafeLtv({
    purchasePrice: { supplied: false, value: null },
    deposit: { supplied: true, value: 40000, source: 'user_supplied' },
  });
  assert.strictEqual(missingPrice.available, false);

  const budgetIsNotDeposit = calculateSafeLtv({ purchasePrice: 200000 });
  assert.strictEqual(budgetIsNotDeposit.available, false);

  const known = calculateSafeLtv({
    purchasePrice: { value: 200000, supplied: true, source: 'listing_asking' },
    deposit: { value: 50000, supplied: true, source: 'user_supplied' },
  });
  assert.strictEqual(known.available, true);
  assert.strictEqual(known.mortgageAmount, 150000);
  assert.strictEqual(known.value, 75);
  assert.strictEqual(known.provenance.notInferredFromBudget, true);

  const explicitZeroDeposit = calculateSafeLtv({
    purchasePrice: { value: 200000, supplied: true, source: 'listing_asking' },
    deposit: { value: 0, supplied: true, source: 'user_supplied' },
  });
  assert.strictEqual(explicitZeroDeposit.available, true);
  assert.strictEqual(explicitZeroDeposit.value, 100);
});

test('asking rent, area asking rent, scenario rent and achieved rent stay distinct', () => {
  const asking = resolveRentBasis({ listingMonthlyRent: 1000, marketRent: 800, achievedRentKnown: false });
  assert.strictEqual(asking.canonicalBasis, CANONICAL_RENT_BASIS.LISTING_ASKING_RENT);
  assert.strictEqual(asking.evidenceClass, 'asking');
  assert.strictEqual(asking.label, 'LISTING_RENT');
  assert.ok(/not achieved rent/.test(asking.limitation));
  assert.notStrictEqual(asking.canonicalBasis, CANONICAL_RENT_BASIS.ACHIEVED_RENT);

  const area = resolveRentBasis({ marketRent: 800 });
  assert.strictEqual(area.canonicalBasis, CANONICAL_RENT_BASIS.AREA_ASKING_RENT_ESTIMATE);
  assert.strictEqual(area.evidenceClass, 'estimate');
  assert.strictEqual(area.marketSubstitutedForMissingListing, true);
  assert.ok(/not this property's asking rent/.test(area.limitation));

  const scenario = resolveRentBasis({ scenarioExpectedRent: 900, listingMonthlyRent: 1000 });
  assert.strictEqual(scenario.canonicalBasis, CANONICAL_RENT_BASIS.USER_SCENARIO_RENT);
  assert.strictEqual(scenario.evidenceClass, 'scenario');

  const unknown = resolveRentBasis({});
  assert.strictEqual(unknown.canonicalBasis, CANONICAL_RENT_BASIS.UNKNOWN);

  const facts = assemblePropertyFacts({ property: listing() });
  const prepared = prepareEvidencedInvestment({
    purchasePrice: 250000,
    expectedRent: 1200,
    options: {},
    propertyFacts: facts,
    property: listing(),
  });
  const metrics = calculateInvestmentMetrics(prepared.input, prepared.provenanceHints);
  const presented = presentEvidencedInvestment(metrics, prepared.operatingCostEvidence, { rentBasis: asking });
  assert.strictEqual(presented.grossYield.basis, 'LISTING_RENT');
  assert.strictEqual(presented.grossYield.rentBasis, CANONICAL_RENT_BASIS.LISTING_ASKING_RENT);
  assert.strictEqual(presented.grossYield.evidenceClass, 'asking');
  assert.ok(/asking rent, not achieved rent/.test(presented.grossYield.limitation));
  assert.strictEqual(metrics.grossYield, 5.76);
});

test('unknown service charge and ground rent are not zero', () => {
  const leasehold = leaseholdEvidence(assemblePropertyFacts({
    property: listing({ tenure: 'leasehold' }),
  }));
  assert.strictEqual(leasehold.serviceCharge.state, 'UNKNOWN');
  assert.strictEqual(leasehold.serviceCharge.value, null);
  assert.notStrictEqual(leasehold.serviceCharge.value, 0);
  assert.strictEqual(leasehold.groundRent.state, 'UNKNOWN');
  assert.strictEqual(leasehold.groundRent.value, null);
  assert.strictEqual(leasehold.mortgageabilityAssessed, false);

  const zeroCharge = leaseholdEvidence(assemblePropertyFacts({
    property: listing({ tenure: 'leasehold', service_charges: 0, ground_rent: 0 }),
  }));
  assert.strictEqual(zeroCharge.serviceCharge.state, 'KNOWN');
  assert.strictEqual(zeroCharge.serviceCharge.value, 0);
  assert.strictEqual(zeroCharge.groundRent.state, 'KNOWN');
  assert.strictEqual(zeroCharge.groundRent.value, 0);

  const freehold = leaseholdEvidence(assemblePropertyFacts({
    property: listing({ tenure: 'freehold' }),
  }));
  assert.strictEqual(freehold.serviceCharge.state, 'NOT_APPLICABLE');
  assert.strictEqual(freehold.leaseYearsRemaining.state, 'NOT_APPLICABLE');
  assert.strictEqual(freehold.groundRent.state, 'NOT_APPLICABLE');
});

test('missing lease years on a leasehold create an investigation item and known years are exposed', () => {
  const missing = assemblePropertyFacts({ property: listing({ tenure: 'leasehold' }) });
  const di = assembleDecisionIntelligence({
    propertyFacts: missing,
    investment: {
      presented: {
        grossYield: { available: false, value: null, state: 'notAssessed' },
        costEvidence: { missing: [], included: [] },
        financeEvidence: { missing: [], included: [] },
      },
    },
    personalDecision: { dimensions: {}, notAssessed: [] },
  });
  assert.ok(di.investigationPriorities.some((row) => row.id === 'lease_years_unknown'));
  assert.ok(di.investigationPriorities.some((row) => row.id === 'service_charge_unknown'));
  assert.ok(di.investigationPriorities.some((row) => row.id === 'ground_rent_unknown'));
  assert.ok(!/unmortgageable/i.test(JSON.stringify(di.investigationPriorities)));

  const knownFacts = assemblePropertyFacts({ property: listing({ tenure: 'leasehold' }) });
  knownFacts.implications.leaseRemaining = { available: true, value: 92, state: 'calculated' };
  const buy = assembleBuyDecision({ propertyFacts: knownFacts });
  assert.strictEqual(buy.evidence.leaseYearsRemaining.state, 'KNOWN');
  assert.strictEqual(buy.evidence.leaseYearsRemaining.value, 92);
  assert.ok(!buy.investigationPriorities.some((row) => row.id === 'lease_years_unknown'));

  const knownDi = assembleDecisionIntelligence({
    propertyFacts: knownFacts,
    investment: {
      presented: {
        grossYield: { available: false },
        costEvidence: { included: ['serviceCharge', 'groundRent'], missing: [] },
        financeEvidence: { missing: [], included: [] },
      },
    },
    personalDecision: { dimensions: {}, notAssessed: [] },
  });
  assert.ok(!knownDi.investigationPriorities.some((row) => row.id === 'lease_years_unknown'));
});

test('achieved rent unknown is an investigation item when yield is assessed from asking rent', () => {
  const facts = assemblePropertyFacts({ property: listing() });
  const di = assembleDecisionIntelligence({
    propertyFacts: facts,
    investment: {
      presented: {
        grossYield: {
          available: true,
          value: 5.76,
          rentBasis: 'LISTING_ASKING_RENT',
          evidenceClass: 'asking',
        },
        rentBasis: { canonicalBasis: 'LISTING_ASKING_RENT' },
        costEvidence: { missing: [], included: [] },
        financeEvidence: { missing: [], included: [] },
      },
    },
    personalDecision: { dimensions: { demand: { available: true } }, notAssessed: [] },
  });
  const item = di.investigationPriorities.find((row) => row.id === 'achieved_rent_unknown');
  assert.ok(item);
  assert.strictEqual(item.importance, IMPORTANCE.decisionRelevant);
  assert.ok(/not achieved rent/i.test(item.explanation));
});

test('area demand stays contextual and is not property demand', () => {
  const context = buildAreaMarketContext({
    areaMarketDemand: {
      available: true,
      band: 'High',
      providerEndpoint: '/demand',
      scope: 'postcode',
      retrievedAt: '2026-10-14T00:00:00.000Z',
    },
    areaRentalDemand: {
      available: true,
      band: 'Seller\'s',
      providerEndpoint: '/demand-rent',
      scope: '1 mile',
    },
  });
  assert.strictEqual(context.notPropertySpecificDemand, true);
  assert.strictEqual(context.notConnectedToLandlordDemandScore, true);
  assert.strictEqual(context.salesDemand.notSaleProbability, true);
  assert.strictEqual(context.rentalDemand.notTenantDemand, true);
  assert.strictEqual(context.salesDemand.geographicGranularity, 'postcode');

  const di = assembleDecisionIntelligence({
    propertyFacts: assemblePropertyFacts({ property: listing() }),
    investment: {
      presented: {
        grossYield: { available: false },
        costEvidence: { missing: [], included: [] },
        financeEvidence: { missing: [], included: [] },
      },
    },
    personalDecision: {
      dimensions: { demand: { available: false, state: 'no_demand_data_source' } },
      notAssessed: [{ dimension: 'demand', reason: 'No property-specific demand data source is connected.' }],
    },
    areaMarketDemand: { available: true, band: 'High', providerEndpoint: '/demand', scope: 'postcode' },
    areaRentalDemand: { available: true, band: 'Balanced', providerEndpoint: '/demand-rent' },
  });
  assert.strictEqual(di.areaMarketContext.salesDemand.role, 'context_only');
  assert.ok(di.investigationPriorities.some((row) => row.id === 'landlord_demand_not_assessed'));
  assert.ok(!di.materialFindings?.some((row) => row.id === 'finding_demand'));
});

test('schools evidence is context and does not become a fit score', () => {
  const without = scorePropertyMatch(
    { price: 200000, city: 'Leeds' },
    { budgetMax: 250000, schools: 'primary' }
  );
  assert.strictEqual(without.dimensions.schools.available, false);
  assert.strictEqual(without.dimensions.schools.score, null);
  assert.strictEqual(without.dimensions.schools.state, 'no_school_data_source');

  const withEvidence = scorePropertyMatch(
    {
      price: 200000,
      city: 'Leeds',
      schoolEvidence: { available: true, value: '2 nearby', nearbySchools: [{ name: 'Example Primary' }] },
    },
    { budgetMax: 250000, schools: 'primary' }
  );
  assert.strictEqual(withEvidence.dimensions.schools.available, false);
  assert.strictEqual(withEvidence.dimensions.schools.score, null);
  assert.strictEqual(withEvidence.dimensions.schools.state, 'schools_context_only');
  assert.ok(/not scored/i.test(withEvidence.dimensions.schools.unavailableReason));
  assert.ok(!/catchment school/i.test(withEvidence.dimensions.schools.unavailableReason));

  const buy = assembleBuyDecision({
    propertyFacts: assemblePropertyFacts({
      property: listing(),
      schoolEvidence: { available: true, value: 'nearby', nearbySchools: [{ name: 'Example Primary' }], state: 'observed' },
    }),
  });
  assert.strictEqual(buy.evidence.schools.notAScore, true);
  assert.strictEqual(buy.evidence.schools.catchment, 'NOT_ASSESSED');
  assert.strictEqual(buy.evidence.schools.admission, 'NOT_ASSESSED');
});

test('defaulted future value is not presented and supplied growth stays an assumption', () => {
  const raw = calculateInvestmentMetrics({ purchasePrice: 200000, expectedRent: 1000 });
  assert.ok(raw.futureValue != null);
  const withheld = withholdDefaultedGrowth(raw);
  assert.strictEqual(withheld.futureValue, null);
  assert.strictEqual(withheld.equityGain, null);
  assert.strictEqual(withheld.growthEvidence.presented, false);
  assert.strictEqual(withheld.growthEvidence.evidenceClass, 'ASSUMPTION');

  const supplied = withholdDefaultedGrowth(calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    expectedAppreciation: 2,
    holdingPeriod: 5,
  }));
  assert.ok(supplied.futureValue != null);
  assert.strictEqual(supplied.growthEvidence.notFact, true);
  assert.strictEqual(supplied.growthEvidence.evidenceClass, 'ASSUMPTION');
});

test('gross yield, NOI, net yield, cash flow and DSCR formulas are unchanged', () => {
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    maintenance: 500,
    insurance: 200,
    managementFee: 100,
    serviceCharge: 50,
    groundRent: 25,
    taxes: 75,
    deposit: 50000,
    interestRate: 4,
    mortgageTermYears: 25,
  });
  const annualRent = 1000 * 12;
  const effective = annualRent * (1 - 0.05);
  const operating = 500 + 200 + 100 + 50 + 25 + 75;
  const noi = effective - operating;
  assert.strictEqual(metrics.grossYield, Math.round((annualRent / 200000) * 100 * 100) / 100);
  assert.strictEqual(metrics.noi, Math.round(noi * 100) / 100);
  assert.strictEqual(metrics.netYield, Math.round((noi / 200000) * 100 * 100) / 100);

  const principal = 150000;
  const r = 0.04 / 12;
  const n = 25 * 12;
  const annualDebt = ((principal * r * (1 + r) ** n) / ((1 + r) ** n - 1)) * 12;
  assert.strictEqual(metrics.annualDebtService, Math.round(annualDebt * 100) / 100);
  assert.strictEqual(metrics.annualCashFlow, Math.round((noi - annualDebt) * 100) / 100);
  assert.strictEqual(metrics.dscr, Math.round((noi / annualDebt) * 1000) / 1000);
});

test('unsupported LLM numbers and claims cannot escape', () => {
  const facts = { property: { bedrooms: 2, price: 200000 }, investment: { grossYield: 5.76 } };
  const invented = validateLlmText(
    'You should buy this 4 bedroom home in a desirable location. Gross yield is 12% and future value is £400,000.',
    facts
  );
  assert.strictEqual(invented.ok, false);
  assert.ok(invented.reasons.some((row) => /buy|bedroom|desirable|percent|amount|future value/i.test(row)));

  const grounded = validateLlmText('The listing has 2 bedrooms and a supplied price of £200,000. Gross yield is 5.76%.', facts);
  assert.strictEqual(grounded.ok, true);

  const copy = safeListingCopy({ address: '1 High Street', propertyType: 'flat' });
  const blob = JSON.stringify(copy);
  assert.ok(!/modern finishes|natural light|ready to move in|buyer appeal|prime location|3 bed/i.test(blob));
  assert.ok(/No features were supplied/.test(blob));
  assert.ok(/No price was supplied/.test(blob));

  const valuation = generateValuationReport();
  assert.strictEqual(valuation.source, 'blocked');
  assert.strictEqual(valuation.estimatedValue, null);

  const explanationSrc = fs.readFileSync(path.join(__dirname, '../services/ai/decisionIntelligenceExplanation.js'), 'utf8');
  const whySrc = fs.readFileSync(path.join(__dirname, '../services/ai/personalDecisionWhyEngine.js'), 'utf8');
  assert.ok(explanationSrc.includes('number not present in the facts'));
  assert.ok(whySrc.includes('purchase recommendation'));
});

asyncTest('property explanation, listing copy and buyer polish reject unsupported claims', async () => {
  const explained = await generatePropertyExplanation(
    { property: { bedrooms: 2, price: 180000 } },
    {
      callModel: async () => ({
        parsed: { summary: 'You should buy this 5 bedroom house with modern finishes. Yield is 9%.' },
        model: 'test',
        tokensUsed: 3,
      }),
    }
  );
  assert.notStrictEqual(explained.source, 'openai');
  assert.strictEqual(explained.rejected, true);
  assert.ok(!/you should buy/i.test(explained.summary));
  assert.ok(!/modern finishes/i.test(explained.summary));

  const listing = await generateListingContent(
    { address: '1 High Street', propertyType: 'flat', bedrooms: 2 },
    {
      callModel: async () => ({
        parsed: {
          seoTitle: '4 bed mansion',
          description: 'Ready to move in with stunning interiors and a desirable location.',
          keySellingPoints: ['High-spec interior finishes'],
          socialMediaAdvert: 'Prime location',
          emailMarketing: 'Strong buyer appeal',
        },
        model: 'test',
        tokensUsed: 4,
      }),
    }
  );
  assert.strictEqual(listing.source, 'deterministic');
  assert.strictEqual(listing.rejected, true);
  assert.ok(!/mansion|ready to move in|high-spec|prime location|buyer appeal/i.test(JSON.stringify(listing.data)));
  assert.ok(/2 bedrooms supplied/.test(listing.data.description));

  const polished = await polishBuyerMatchMessage(
    { location: 'Leeds' },
    {
      assistantMessage: 'Preference fit only.',
      recommendations: [{ title: 'Flat', matchScore: 70, matchReasons: ['Budget'], bedrooms: 2, price: 180000 }],
    },
    {
      callModel: async () => ({
        parsed: { assistantMessage: 'You should buy this. Excellent condition and tenant demand is high.' },
        model: 'test',
        tokensUsed: 2,
      }),
    }
  );
  assert.strictEqual(polished.llmPolishRejected, true);
  assert.strictEqual(polished.assistantMessage, 'Preference fit only.');
  assert.notStrictEqual(polished.recommendations[0].matchScore, null);
});

test('official comparable assessment binds into the buy decision without becoming a valuation', () => {
  const facts = assemblePropertyFacts({
    property: listing({ tenure: 'leasehold', service_charges: 0 }),
  });
  const assessed = assembleBuyDecision({
    propertyFacts: facts,
    comparableSoldEvidence: {
      assessment: 'ASSESSED',
      relevantMarketTransactionCount: 12,
      observedComparableMedian: 240000,
      defensibleComparableCount: 4,
    },
  });
  const sold = assessed.evidence.soldComparableSupport;
  assert.strictEqual(sold.state, 'KNOWN');
  assert.strictEqual(sold.evidenceClass, 'SOLD_PRICE_CONTEXT');
  assert.strictEqual(sold.notAValuation, true);
  assert.strictEqual(sold.notSubjectValue, true);
  assert.strictEqual(sold.notExactUnitTransactions, true);
  assert.strictEqual(sold.notABuyRecommendation, true);
  assert.strictEqual(sold.observedComparableMedian, undefined);
  assert.strictEqual(assessed.buyRecommendation, null);
  assert.strictEqual(assessed.evidence.affordability.state, 'UNKNOWN');
  assert.strictEqual(assessed.evidence.deposit.state, 'UNKNOWN');
  assert.strictEqual(assessed.evidence.serviceCharge.state, 'KNOWN');
  assert.strictEqual(assessed.evidence.serviceCharge.value, 0);
  assert.strictEqual(assessed.evidence.groundRent.state, 'UNKNOWN');
  assert.strictEqual(assessed.evidence.groundRent.value, null);
  assert.ok(!/worth|fair value|undervalued|overvalued|don't buy/i.test(JSON.stringify(sold)));

  const market = assembleBuyDecision({
    propertyFacts: facts,
    comparableSoldEvidence: {
      assessment: 'MARKET_CONTEXT',
      relevantMarketTransactionCount: 80,
      observedLocalMedian: 190000,
    },
  });
  assert.strictEqual(market.evidence.soldComparableSupport.state, 'CONTEXT');
  assert.strictEqual(market.evidence.soldComparableSupport.evidenceClass, 'MARKET_CONTEXT');
  assert.notStrictEqual(market.evidence.soldComparableSupport.state, 'KNOWN');
  assert.strictEqual(market.evidence.soldComparableSupport.value, null);

  const thin = assembleBuyDecision({
    propertyFacts: facts,
    comparableSoldEvidence: { assessment: 'INSUFFICIENT_EVIDENCE' },
  });
  assert.strictEqual(thin.evidence.soldComparableSupport.state, 'UNKNOWN');
  assert.strictEqual(thin.evidence.soldComparableSupport.value, null);

  const failed = assembleBuyDecision({
    propertyFacts: facts,
    comparableSoldEvidence: { assessment: 'UNAVAILABLE' },
  });
  assert.strictEqual(failed.evidence.soldComparableSupport.state, 'UNKNOWN');
  assert.strictEqual(failed.evidence.soldComparableSupport.value, null);

  const absent = assembleBuyDecision({ propertyFacts: facts });
  assert.strictEqual(absent.evidence.soldComparableSupport.state, 'UNKNOWN');
  assert.strictEqual(absent.evidence.identity.state === 'KNOWN' || absent.evidence.identity.state === 'UNKNOWN', true);
  assert.notStrictEqual(absent.evidence.soldComparableSupport.value, 0);
});

(async () => {
  for (const item of pending) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (err) {
      console.error(`✗ ${item.name}`);
      console.error(err);
      process.exit(1);
    }
  }
})();
