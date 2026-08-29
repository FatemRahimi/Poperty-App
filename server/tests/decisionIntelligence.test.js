/**
 * Decision Intelligence Phase 1–3 — unresolved dependencies,
 * investigation priorities, material findings, and sensitivity drivers.
 * Run: node server/tests/decisionIntelligence.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assembleDecisionIntelligence,
  publicDecisionIntelligenceForExplanation,
  VERSION,
  IMPORTANCE,
  EFFECT,
  MATERIAL_FINDING_ORDER,
  DRIVER_STATE,
  SENSITIVITY_DRIVER_ORDER,
} = require('../services/ai/decisionIntelligence');
const { assemblePropertyFacts } = require('../services/ai/propertyFacts');
const { assemblePropertyIntelligenceReport } = require('../services/ai/propertyIntelligenceEngine');
const { extractCanonicalCoreFacts, projectPropertyOverview } = require('../services/ai/propertyIntelligenceService');
const { parseAnalyseFinanceRequest } = require('../services/ai/financeInputContract');
const { parseWhatIfHttpBody, executeIntelligenceWhatIf } = require('../services/ai/intelligenceWhatIfService');
const { resolveSavedWhatIfBaseline } = require('../services/ai/historicalWhatIfBaseline');
const {
  BUYER_GENERAL_WEIGHTS,
  LANDLORD_WEIGHTS,
} = require('../config/personalDecision.config');
const { CONFIDENCE_MODEL } = require('../services/ai/confidenceEngine');
const { weightedBlend } = require('../services/ai/valuationEngine');
const { calculateInvestmentMetrics } = require('../services/ai/financialEngine');
const { parseDemandResponse, parseDemandRentResponse } = require('../services/providers/propertyData/propertyDataParsers');
const { OUTCOME_TYPES } = require('../services/ai/listingOutcomeService');
const { BACKTEST_ENGINE_VERSION } = require('../services/ai/backtesting/backtestFoundation');
const { unattachedArticle4Fact } = require('../services/ai/article4Evidence');

const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    throw new Error(`Use asyncTest for ${name}`);
  }
  console.log(`✓ ${name}`);
}

function asyncTest(name, fn) {
  pending.push({ name, fn });
}

const ASOF = '2026-08-26T21:00:00.000Z';

function listing(extra = {}) {
  return {
    id: 42,
    title: 'Decision intelligence listing',
    city: 'London',
    zip_code: 'SW1A 2WH',
    category: 'sale',
    price: 200000,
    monthly_rent: 1100,
    ...extra,
  };
}

function notAssessedField(reason) {
  return { available: false, value: null, state: 'notAssessed', reason };
}

function calculatedField(value) {
  return { available: true, value, state: 'calculated' };
}

function presentedStub({
  missingCosts = ['vacancyAssumption', 'maintenance', 'insurance', 'managementFee', 'taxes'],
  missingFinance = ['deposit', 'interestRate', 'mortgageTermYears'],
  priceAndRent = true,
} = {}) {
  const costsComplete = missingCosts.length === 0;
  const financeComplete = missingFinance.length === 0;
  return {
    presented: {
      grossYield: priceAndRent
        ? calculatedField(6.6)
        : notAssessedField('Gross yield requires an evidenced purchase price and expected rent.'),
      noi: costsComplete ? calculatedField(8000) : notAssessedField('Operating costs were not supplied — NOI is notAssessed.'),
      netYield: costsComplete && priceAndRent
        ? calculatedField(4)
        : notAssessedField('Operating costs were not supplied — net yield is notAssessed.'),
      annualCashFlow: costsComplete && financeComplete
        ? calculatedField(1200)
        : notAssessedField('Cash flow requires evidenced operating costs and complete finance inputs.'),
      monthlyCashFlow: costsComplete && financeComplete
        ? calculatedField(100)
        : notAssessedField('Mortgage cash flow requires evidenced operating costs and complete finance inputs.'),
      dscr: costsComplete && financeComplete
        ? calculatedField(1.2)
        : notAssessedField('DSCR requires evidenced operating costs and complete finance inputs.'),
      costEvidence: {
        completeness: costsComplete ? 'COMPLETE_EVIDENCE' : missingCosts.length < 7 ? 'PARTIAL_EVIDENCE' : 'NOT_ASSESSED',
        missing: missingCosts,
        included: ['maintenance', 'insurance', 'managementFee', 'serviceCharge', 'groundRent', 'taxes', 'vacancyAssumption']
          .filter((key) => !missingCosts.includes(key)),
        vacancyMissingIsNotZeroEvidence: missingCosts.includes('vacancyAssumption'),
      },
      financeEvidence: {
        completeness: financeComplete ? 'COMPLETE_EVIDENCE' : 'NOT_ASSESSED',
        missing: missingFinance,
        included: ['deposit', 'interestRate', 'mortgageTermYears'].filter((key) => !missingFinance.includes(key)),
      },
    },
  };
}

function pdStub({ notAssessedKeys = ['demand', 'netOperating', 'vacancy', 'cashFlow', 'dscr'] } = {}) {
  const dimensions = {
    rentPosition: { key: 'rentPosition', weight: 0.2, available: true, score: 70, state: 'assessed' },
    grossYield: { key: 'grossYield', weight: 0.18, available: true, score: 72, state: 'assessed' },
    netOperating: { key: 'netOperating', weight: 0.14, available: !notAssessedKeys.includes('netOperating'), score: null, state: 'costs_not_supplied', unavailableReason: 'Operating costs were not supplied, so net operating position is notAssessed rather than assumed at zero.' },
    cashFlow: { key: 'cashFlow', weight: 0.12, available: !notAssessedKeys.includes('cashFlow'), score: null, state: 'no_finance_inputs', unavailableReason: 'Cash flow cannot be assessed without complete finance inputs.' },
    vacancy: { key: 'vacancy', weight: 0.08, available: !notAssessedKeys.includes('vacancy'), score: null, state: 'no_vacancy_assumption', unavailableReason: 'Vacancy was not supplied. 100% occupancy is not scored as a strength.' },
    dscr: { key: 'dscr', weight: 0.1, available: !notAssessedKeys.includes('dscr'), score: null, state: 'no_finance_inputs', unavailableReason: 'DSCR cannot be assessed without complete finance inputs.' },
    risk: { key: 'risk', weight: 0.1, available: true, score: 90, state: 'none_identified' },
    demand: { key: 'demand', weight: 0.08, available: !notAssessedKeys.includes('demand'), score: null, state: 'no_demand_data_source', unavailableReason: 'No property-specific demand data source is connected, so demand cannot be assessed. Area market demand is context only.' },
  };
  if (notAssessedKeys.includes('rentPosition')) {
    dimensions.rentPosition = { key: 'rentPosition', weight: 0.2, available: false, score: null, state: 'no_rent_evidence', unavailableReason: 'Rent position cannot be assessed without evidenced current rent and a market range.' };
  }
  if (notAssessedKeys.includes('grossYield')) {
    dimensions.grossYield = { key: 'grossYield', weight: 0.18, available: false, score: null, state: 'no_rent_evidence', unavailableReason: 'Gross yield cannot be assessed without an evidenced rent and purchase price.' };
  }
  return {
    profile: 'landlord',
    dimensions,
    notAssessed: notAssessedKeys.map((dimension) => ({
      dimension,
      weight: dimensions[dimension].weight,
      state: dimensions[dimension].state,
      reason: dimensions[dimension].unavailableReason,
    })),
  };
}

function factsWith(extraFacts = {}, conflicts = []) {
  const base = assemblePropertyFacts({ property: listing() });
  return {
    ...base,
    facts: { ...base.facts, ...extraFacts },
    conflicts,
  };
}

function findDep(result, id) {
  return result.unresolvedDependencies.find((row) => row.id === id);
}

function findFinding(result, id) {
  return (result.materialFindings || []).find((row) => row.id === id);
}

function findDriver(result, inputKey) {
  return (result.sensitivityDrivers || []).find((row) => row.inputKey === inputKey || row.id === `driver_${inputKey}`);
}

function pdAssessedStub({
  notAssessedKeys = ['demand'],
  rentState = 'at_market',
  scores = {},
  available = true,
  score = 72,
} = {}) {
  const base = pdStub({ notAssessedKeys });
  const assessed = {
    rentPosition: { score: scores.rentPosition ?? 85, state: rentState },
    grossYield: { score: scores.grossYield ?? 75, state: 'assessed' },
    netOperating: { score: scores.netOperating ?? 75, state: 'assessed' },
    cashFlow: { score: scores.cashFlow ?? 85, state: 'assessed' },
    vacancy: { score: scores.vacancy ?? 75, state: 'assessed' },
    dscr: { score: scores.dscr ?? 75, state: 'assessed' },
    risk: { score: scores.risk ?? 90, state: 'none_identified' },
  };
  Object.keys(assessed).forEach((key) => {
    if (notAssessedKeys.includes(key)) return;
    base.dimensions[key] = {
      ...base.dimensions[key],
      available: true,
      score: assessed[key].score,
      state: assessed[key].state,
      unavailableReason: null,
      evidence: key === 'grossYield' ? ['Gross yield 6.6%'] : [],
    };
  });
  return {
    ...base,
    available,
    score: available ? score : null,
  };
}

function assertNoNumericImportance(item) {
  ['importanceScore', 'materialityScore', 'riskScore', 'opportunityScore', 'findingScore'].forEach((key) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(item, key));
  });
}

test('missing vacancy is decision_relevant and is not treated as 0%', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['vacancyAssumption'], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'netOperating', 'vacancy'] }),
    evidenceAsOf: ASOF,
  });
  const vacancy = findDep(result, 'vacancy_assumption_missing');
  assert.ok(vacancy);
  assert.strictEqual(vacancy.importance, IMPORTANCE.decisionRelevant);
  assert.ok(vacancy.affects.includes('investment.presented.noi'));
  assert.ok(vacancy.affects.includes('investment.presented.netYield'));
  assert.ok(vacancy.affects.includes('personalDecision.dimensions.netOperating'));
  assert.ok(/not treated as a zero/.test(vacancy.explanation) || /not 0%/.test(vacancy.explanation));
  assert.ok(!Object.prototype.hasOwnProperty.call(vacancy, 'importanceScore'));
  assert.ok(!JSON.stringify(vacancy).includes('"value":0'));
});

test('incomplete operating costs are not treated as zero and affect NOI/netOperating', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({
      missingCosts: ['maintenance', 'insurance', 'vacancyAssumption'],
      missingFinance: [],
    }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'netOperating', 'vacancy'] }),
    evidenceAsOf: ASOF,
  });
  const costs = findDep(result, 'operating_costs_incomplete');
  assert.ok(costs);
  assert.strictEqual(costs.importance, IMPORTANCE.decisionRelevant);
  assert.ok(costs.affects.includes('investment.presented.noi'));
  assert.ok(costs.affects.includes('personalDecision.dimensions.netOperating'));
  assert.ok(/not treated as £0/.test(costs.explanation));
  assert.ok(costs.evidenceRefs.some((ref) => Array.isArray(ref.keys) && ref.keys.includes('maintenance')));
});

test('missing mortgage inputs affect cash flow and DSCR', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({
      missingCosts: [],
      missingFinance: ['deposit', 'interestRate'],
    }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'cashFlow', 'dscr'] }),
    evidenceAsOf: ASOF,
  });
  const mortgage = findDep(result, 'mortgage_inputs_incomplete');
  assert.ok(mortgage);
  assert.ok(mortgage.affects.includes('investment.presented.annualCashFlow'));
  assert.ok(mortgage.affects.includes('investment.presented.dscr'));
  assert.ok(mortgage.affects.includes('personalDecision.dimensions.cashFlow'));
  assert.ok(/Application defaults are not user-supplied evidence/.test(mortgage.explanation));
});

test('landlord demand stays notAssessed and never becomes low demand', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand'] }),
    evidenceAsOf: ASOF,
  });
  const demand = findDep(result, 'landlord_demand_not_assessed');
  assert.ok(demand);
  assert.strictEqual(demand.importance, IMPORTANCE.decisionRelevant);
  assert.ok(/not a demand rating/i.test(demand.explanation));
  assert.ok(/property-specific/i.test(demand.explanation));
  assert.ok(!/\blow demand\b/.test(demand.explanation));
  assert.ok(demand.limitations.some((row) => /\/demand/.test(row)));
});

test('area demand cannot satisfy landlord demand', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: {
      ...pdStub({ notAssessedKeys: ['demand'] }),
      marketContext: {
        rentalMarketDemand: { available: true, band: 'high', role: 'context_only' },
      },
    },
    evidenceAsOf: ASOF,
  });
  const demand = findDep(result, 'landlord_demand_not_assessed');
  assert.ok(demand);
  assert.ok(/do not satisfy landlord demand/.test(demand.explanation));
  assert.ok(!result.unresolvedDependencies.some((row) => /high demand/i.test(row.explanation)));
});

test('EPC listing/provider conflict is worth_reviewing and keeps listing precedence', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith({}, [{
      field: 'epc_rating',
      listing: 'B',
      external: 'C',
      selected: 'B',
      sourceSelected: 'InternalListing',
      averaged: false,
      resolvedByLlm: false,
    }]),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand'] }),
    evidenceAsOf: ASOF,
  });
  const conflict = findDep(result, 'conflict_epc_rating');
  assert.ok(conflict);
  assert.strictEqual(conflict.importance, IMPORTANCE.worthReviewing);
  assert.ok(/listing value \(B\)/.test(conflict.explanation));
  assert.ok(/provider value \(C\)/.test(conflict.explanation));
  assert.ok(/not averaged/.test(conflict.explanation));
  assert.ok(/not resolved by an LLM/.test(conflict.explanation));
  const ref = conflict.evidenceRefs[0];
  assert.strictEqual(ref.listing, 'B');
  assert.strictEqual(ref.external, 'C');
  assert.strictEqual(ref.selected, 'B');
  assert.ok(result.investigationPriorities.some((row) => row.id === 'conflict_epc_rating'));
});

test('unknown garden and parking are informational and omitted from priorities', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand'] }),
    evidenceAsOf: ASOF,
  });
  const garden = findDep(result, 'amenity_outdoor_space_unknown');
  const parking = findDep(result, 'amenity_parking_unknown');
  assert.ok(garden);
  assert.ok(parking);
  assert.strictEqual(garden.importance, IMPORTANCE.informational);
  assert.strictEqual(parking.importance, IMPORTANCE.informational);
  assert.ok(!result.investigationPriorities.some((row) => row.id === 'amenity_outdoor_space_unknown'));
  assert.ok(!result.investigationPriorities.some((row) => row.id === 'amenity_parking_unknown'));
});

test('empty flood listed CA Article 4 evidence is never clear, safe, or no risk', () => {
  const facts = factsWith({
    flood: { field: 'flood', available: false, value: null, state: 'notAssessed', unavailableReason: 'no_applicable_evidence_returned' },
    listedBuilding: { field: 'listedBuilding', available: false, value: null, state: 'notAssessed', unavailableReason: 'no_applicable_evidence_returned' },
    conservationArea: { field: 'conservationArea', available: false, value: null, state: 'notAssessed', unavailableReason: 'no_applicable_evidence_returned' },
    article4: {
      field: 'article4',
      available: false,
      value: null,
      state: 'notAssessed',
      unavailableReason: 'no_applicable_evidence_returned',
      restrictionsAssessed: false,
      restrictions: { available: false, state: 'notAssessed', reason: 'authoritative_restriction_schedule_not_integrated' },
    },
  });
  const result = assembleDecisionIntelligence({
    propertyFacts: facts,
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand'] }),
    evidenceAsOf: ASOF,
  });
  ['context_flood', 'context_listed_building', 'context_conservation_area', 'context_article4'].forEach((id) => {
    const item = findDep(result, id);
    assert.ok(item);
    assert.strictEqual(item.importance, IMPORTANCE.contextOnly);
    assert.ok(!result.investigationPriorities.some((row) => row.id === id));
    assert.ok(/not evidence|not a heritage|remain not assessed|not assessed/i.test(item.explanation));
    assert.ok(!/^the property is (clear|safe|not listed)$/i.test(item.explanation));
  });
});

test('Article 4 restrictions remain notAssessed on context item', () => {
  const article4 = unattachedArticle4Fact();
  article4.available = true;
  article4.value = 'Westminster basement';
  article4.state = 'observed';
  article4.areas = [{ name: 'Westminster basement', reference: 'A4/BASEMENT' }];
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith({ article4 }),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand'] }),
    evidenceAsOf: ASOF,
  });
  const item = findDep(result, 'context_article4');
  assert.ok(item);
  assert.ok(/restrictions remain not assessed/i.test(item.explanation));
  assert.strictEqual(article4.restrictions.reason, 'authoritative_restriction_schedule_not_integrated');
});

test('no importanceScore and investigation order is decision_relevant then conflicts', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith({}, [{
      field: 'epc_rating',
      listing: 'B',
      external: 'D',
      selected: 'B',
      sourceSelected: 'InternalListing',
    }]),
    investment: presentedStub({
      missingCosts: ['vacancyAssumption', 'maintenance'],
      missingFinance: ['deposit'],
    }),
    personalDecision: pdStub(),
    evidenceAsOf: ASOF,
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'importanceScore'));
  result.unresolvedDependencies.forEach((row) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'importanceScore'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'score'));
  });
  const ids = result.investigationPriorities.map((row) => row.id);
  const vacancyAt = ids.indexOf('vacancy_assumption_missing');
  const costsAt = ids.indexOf('operating_costs_incomplete');
  const mortgageAt = ids.indexOf('mortgage_inputs_incomplete');
  const conflictAt = ids.indexOf('conflict_epc_rating');
  assert.ok(vacancyAt >= 0 && costsAt > vacancyAt);
  assert.ok(mortgageAt > costsAt);
  assert.ok(conflictAt > mortgageAt);
  assert.strictEqual(result.version, VERSION);
  assert.strictEqual(result.scoringActivated, false);
});

test('empty legitimate priorities stay empty rather than inventing filler', () => {
  const facts = assemblePropertyFacts({
    property: listing({ has_garden: true, has_garage: true, parking_spaces: 1 }),
  });
  const completePd = pdStub({ notAssessedKeys: [] });
  completePd.dimensions.demand.available = true;
  completePd.dimensions.demand.score = 70;
  completePd.notAssessed = [];
  const result = assembleDecisionIntelligence({
    propertyFacts: facts,
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: completePd,
    evidenceAsOf: ASOF,
  });
  assert.deepStrictEqual(
    result.investigationPriorities.filter((row) => row.importance === IMPORTANCE.decisionRelevant),
    []
  );
});

test('assessed rentPosition creates one deterministic material finding', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({ rentState: 'below_market', scores: { rentPosition: 65 } }),
    rentIntel: { success: true, marketRange: { low: 1050, high: 1150 }, currentRent: 900 },
    evidenceAsOf: ASOF,
  });
  const finding = findFinding(result, 'finding_rent_position');
  assert.ok(finding);
  assert.strictEqual(finding.state, 'below_market');
  assert.ok(/below the evidenced market range/.test(finding.explanation));
  assert.ok(!/easy to let|high tenant demand|guaranteed rent|under-rented by £/i.test(finding.explanation));
  assert.ok(finding.evidenceRefs.some((ref) => ref.path === 'dimensions.rentPosition'));
  assert.ok(finding.evidenceRefs.some((ref) => ref.kind === 'marketIntelligence' && ref.path === 'rent'));
  assert.ok(finding.affects.includes('personalDecision.dimensions.rentPosition'));
  assert.ok(finding.affects.includes('personalDecision.score'));
  assert.strictEqual(finding.effect, EFFECT.neutral);
  assertNoNumericImportance(finding);
});

test('unassessed rentPosition creates no material finding and stays a Phase 1 dependency', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'rentPosition'] }),
    evidenceAsOf: ASOF,
  });
  assert.strictEqual(findFinding(result, 'finding_rent_position'), undefined);
  const dep = findDep(result, 'rent_position_not_assessed');
  assert.ok(dep);
  assert.ok(result.investigationPriorities.some((row) => row.id === 'rent_position_not_assessed'));
});

test('assessed grossYield creates one canonical finding without new thresholds', () => {
  const diSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'decisionIntelligence.js'), 'utf8');
  assert.ok(!diSrc.includes('[3, 5, 7]'));
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({ scores: { grossYield: 75 } }),
    evidenceAsOf: ASOF,
  });
  const matches = result.materialFindings.filter((row) => row.id === 'finding_gross_yield');
  assert.strictEqual(matches.length, 1);
  const finding = matches[0];
  assert.ok(/assessed drivers of the landlord fit/.test(finding.explanation));
  assert.ok(/Gross yield 6.6%/.test(finding.explanation));
  assert.ok(!/excellent yield|bad yield/.test(finding.explanation));
  assert.strictEqual(finding.effect, EFFECT.supporting);
  assert.ok(finding.evidenceRefs.some((ref) => ref.path === 'grossYield'));
  assert.ok(finding.affects.includes('personalDecision.dimensions.grossYield'));
  assert.ok(finding.affects.includes('personalDecision.score'));
});

test('netOperating finding requires presented canonical finance, not hidden engine NOI', () => {
  const hidden = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['maintenance'], missingFinance: [] }),
    personalDecision: pdAssessedStub({
      notAssessedKeys: ['demand', 'vacancy', 'cashFlow', 'dscr'],
      scores: { netOperating: 75 },
    }),
    evidenceAsOf: ASOF,
  });
  assert.ok(!presentedStub({ missingCosts: ['maintenance'], missingFinance: [] }).presented.noi.available);
  assert.strictEqual(findFinding(hidden, 'finding_net_operating'), undefined);
  assert.ok(findDep(hidden, 'operating_costs_incomplete'));

  const complete = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({ scores: { netOperating: 75 } }),
    evidenceAsOf: ASOF,
  });
  const finding = findFinding(complete, 'finding_net_operating');
  assert.ok(finding);
  assert.ok(finding.evidenceRefs.some((ref) => ref.path === 'noi'));
  assert.ok(finding.evidenceRefs.some((ref) => ref.path === 'netYield'));
  assert.ok(/complete cost scenario/.test(finding.explanation));
});

test('assessed cashFlow and DSCR create deterministic findings from presented evidence', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({
      scores: { cashFlow: 85, dscr: 35 },
      available: true,
      score: 60,
    }),
    evidenceAsOf: ASOF,
  });
  const cash = findFinding(result, 'finding_cash_flow');
  const dscr = findFinding(result, 'finding_dscr');
  assert.ok(cash);
  assert.ok(dscr);
  assert.strictEqual(cash.effect, EFFECT.supporting);
  assert.strictEqual(dscr.effect, EFFECT.limiting);
  assert.ok(/not a second cash-flow threshold/.test(cash.explanation));
  assert.ok(/not a lender rule/.test(dscr.explanation));
  assert.ok(/not mortgage advice/.test(dscr.explanation));
  assert.ok(cash.evidenceRefs.some((ref) => ref.path === 'annualCashFlow'));
  assert.ok(dscr.evidenceRefs.some((ref) => ref.path === 'dscr'));
  const diSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'decisionIntelligence.js'), 'utf8');
  assert.ok(!diSrc.includes('annualCashFlow > 0'));
  assert.ok(!diSrc.includes('[0.9, 1.1, 1.35]'));
});

test('explicit vacancy scenario is marked scope scenario and missing vacancy has no finding', () => {
  const assessed = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({ scores: { vacancy: 95 } }),
    evidenceAsOf: ASOF,
  });
  const vacancy = findFinding(assessed, 'finding_vacancy');
  assert.ok(vacancy);
  assert.strictEqual(vacancy.scope, 'scenario');
  assert.ok(/scenario input/.test(vacancy.explanation));
  assert.ok(/not as an observed property occupancy fact/.test(vacancy.explanation));
  assert.ok(/0% vacancy remains a user scenario assumption/.test(vacancy.explanation));

  const missing = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['vacancyAssumption'], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'netOperating', 'vacancy'] }),
    evidenceAsOf: ASOF,
  });
  assert.strictEqual(findFinding(missing, 'finding_vacancy'), undefined);
  assert.ok(findDep(missing, 'vacancy_assumption_missing'));
});

test('dormant demand and area /demand-rent cannot create a landlord demand material finding', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: {
      ...pdAssessedStub({ notAssessedKeys: ['demand'] }),
      marketContext: {
        rentalMarketDemand: {
          available: true,
          band: "Landlord's market",
          role: 'context_only',
          providerEndpoint: '/demand-rent',
        },
      },
    },
    evidenceAsOf: ASOF,
  });
  assert.ok(!result.materialFindings.some((row) => /demand/i.test(row.id) || /demand/i.test(row.title)));
  assert.ok(findDep(result, 'landlord_demand_not_assessed'));
});

test('buildRisks invented probabilities are not consumed and flood context is not auto-material', () => {
  const diSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'decisionIntelligence.js'), 'utf8');
  assert.ok(!diSrc.includes('buildRisks'));
  assert.ok(!diSrc.includes('buildStrengths'));
  assert.ok(!diSrc.includes('buildWeaknesses'));
  assert.ok(!diSrc.includes('riskExposure'));
  const article4 = unattachedArticle4Fact();
  article4.available = true;
  article4.value = 'Westminster basement';
  article4.state = 'observed';
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith({
      flood: { field: 'flood', available: true, value: 'Flood Zone 3', state: 'observed' },
      planning: { field: 'planning', available: true, value: [], state: 'observed' },
      schools: { field: 'schools', available: true, value: [], state: 'observed' },
      listedBuilding: { field: 'listedBuilding', available: true, value: 'Grade II', state: 'observed' },
      conservationArea: { field: 'conservationArea', available: true, value: 'Westminster', state: 'observed' },
      article4,
    }),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub(),
    evidenceAsOf: ASOF,
    risks: [{ probability: 0.82, riskExposure: 91, title: 'invented' }],
  });
  assert.ok(!result.materialFindings.some((row) => /risk/i.test(row.id)));
  assert.ok(!JSON.stringify(result.materialFindings).includes('0.82'));
  assert.ok(!JSON.stringify(result.materialFindings).includes('riskExposure'));
  ['context_flood', 'context_planning', 'context_schools', 'context_listed_building', 'context_conservation_area', 'context_article4']
    .forEach((id) => {
      assert.ok(findDep(result, id));
      assert.ok(!result.materialFindings.some((row) => row.id === id));
    });
});

test('material findings have stable order, no duplicates, and no numeric importance', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({
      rentState: 'at_market',
      scores: { rentPosition: 85, grossYield: 75, netOperating: 75, cashFlow: 85, vacancy: 75, dscr: 75 },
    }),
    rentIntel: { success: true, marketRange: { low: 1050, high: 1150 } },
    pricePosition: {
      success: true,
      askingPrice: 185000,
      position: 'potentially_underpriced',
      valuationRange: { lower: 180000, central: 190000, upper: 200000 },
    },
    evidenceAsOf: ASOF,
  });
  const ids = result.materialFindings.map((row) => row.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => MATERIAL_FINDING_ORDER.indexOf(a) - MATERIAL_FINDING_ORDER.indexOf(b)));
  assert.deepStrictEqual(ids, [...new Set(ids)]);
  assert.deepStrictEqual(
    ids,
    [
      'finding_rent_position',
      'finding_gross_yield',
      'finding_net_operating',
      'finding_cash_flow',
      'finding_vacancy',
      'finding_dscr',
      'finding_price_position',
    ]
  );
  result.materialFindings.forEach(assertNoNumericImportance);
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'importanceScore'));
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'materialityScore'));
  const price = findFinding(result, 'finding_price_position');
  assert.strictEqual(price.importance, IMPORTANCE.contextOnly);
  assert.ok(/sits below the current central valuation estimate/.test(price.explanation));
  assert.ok(!/bargain|undervalued opportunity|strong buy|top opportunity/i.test(price.explanation));
  assert.deepStrictEqual(price.affects, []);
});

test('material findings do not mutate PD, presented finance, or invent demand', () => {
  const investment = presentedStub({ missingCosts: [], missingFinance: [] });
  const personalDecision = pdAssessedStub();
  const pdBefore = JSON.stringify(personalDecision);
  const invBefore = JSON.stringify(investment);
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment,
    personalDecision,
    evidenceAsOf: ASOF,
  });
  assert.strictEqual(JSON.stringify(personalDecision), pdBefore);
  assert.strictEqual(JSON.stringify(investment), invBefore);
  assert.strictEqual(personalDecision.score, 72);
  assert.strictEqual(investment.presented.grossYield.value, 6.6);
  assert.ok(!result.materialFindings.some((row) => /demand/i.test(row.id)));
});

test('Phase 1 unresolvedDependencies and priorities remain unchanged for identical input', () => {
  const input = {
    propertyFacts: factsWith({}, [{
      field: 'epc_rating',
      listing: 'B',
      external: 'D',
      selected: 'B',
      sourceSelected: 'InternalListing',
    }]),
    investment: presentedStub({
      missingCosts: ['vacancyAssumption', 'maintenance'],
      missingFinance: ['deposit'],
    }),
    personalDecision: pdStub(),
    evidenceAsOf: ASOF,
  };
  const result = assembleDecisionIntelligence(input);
  const ids = result.investigationPriorities.map((row) => row.id);
  assert.ok(ids.indexOf('vacancy_assumption_missing') >= 0);
  assert.ok(ids.indexOf('operating_costs_incomplete') > ids.indexOf('vacancy_assumption_missing'));
  assert.ok(ids.indexOf('mortgage_inputs_incomplete') > ids.indexOf('operating_costs_incomplete'));
  assert.ok(ids.indexOf('conflict_epc_rating') > ids.indexOf('mortgage_inputs_incomplete'));
  assert.ok(result.unresolvedDependencies.every((row) => !String(row.id).startsWith('finding_')));
  assert.ok(result.investigationPriorities.every((row) => !String(row.id).startsWith('finding_')));
  assert.ok(Array.isArray(result.materialFindings));
  assert.ok(!result.investigationPriorities.some((row) => row.type === 'material_finding'));
});

test('purchasePrice and expectedRent are scenario sensitivity drivers', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub(),
    evidenceAsOf: ASOF,
  });
  const price = findDriver(result, 'purchasePrice');
  const rent = findDriver(result, 'expectedRent');
  assert.ok(price);
  assert.ok(rent);
  assert.strictEqual(price.scope, 'scenario');
  assert.strictEqual(rent.scope, 'scenario');
  assert.ok(price.affects.includes('investment.presented.grossYield'));
  assert.ok(price.affects.includes('personalDecision.dimensions.grossYield'));
  assert.ok(!price.affects.some((path) => /valuation|sale\.central/i.test(path)));
  assert.ok(/does not change the valuation estimate/.test(price.explanation));
  assert.ok(price.directionality.whenInputIncreases.some((row) => (
    row.output === 'investment.presented.grossYield' && row.whenInputIncreases === 'decreases'
  )));
  assert.ok(rent.affects.includes('investment.presented.grossYield'));
  assert.ok(rent.affects.includes('personalDecision.dimensions.rentPosition'));
  assert.ok(/not market rent/.test(rent.explanation));
  assert.ok(!Object.prototype.hasOwnProperty.call(price, 'sensitivityScore'));
  assert.ok(!Object.prototype.hasOwnProperty.call(price, 'rankScore'));
  assert.ok(!Object.prototype.hasOwnProperty.call(price, 'delta'));
});

test('vacancy driver is conditional when missing and cost drivers do not treat hidden NOI as assessed', () => {
  const missing = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['vacancyAssumption'], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'netOperating', 'vacancy'] }),
    evidenceAsOf: ASOF,
  });
  const vacancy = findDriver(missing, 'vacancyAssumption');
  assert.ok(vacancy);
  assert.strictEqual(vacancy.state, DRIVER_STATE.conditional);
  assert.ok(vacancy.affects.includes('investment.presented.noi'));
  assert.ok(!vacancy.currentlyAssessedAffects.includes('investment.presented.noi'));

  const hidden = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['maintenance'], missingFinance: [] }),
    personalDecision: pdAssessedStub({ notAssessedKeys: ['demand', 'vacancy', 'cashFlow', 'dscr'] }),
    evidenceAsOf: ASOF,
  });
  const maintenance = findDriver(hidden, 'maintenance');
  assert.ok(maintenance);
  assert.ok(maintenance.affects.includes('investment.presented.noi'));
  assert.ok(!maintenance.currentlyAssessedAffects.includes('investment.presented.noi'));
  assert.ok(!presentedStub({ missingCosts: ['maintenance'], missingFinance: [] }).presented.noi.available);
});

test('cost and finance drivers trace canonical completeness paths without score deltas', () => {
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub(),
    evidenceAsOf: ASOF,
  });
  const maintenance = findDriver(result, 'maintenance');
  const rate = findDriver(result, 'interestRate');
  const deposit = findDriver(result, 'deposit');
  const term = findDriver(result, 'mortgageTermYears');
  assert.ok(maintenance.affects.includes('investment.presented.noi'));
  assert.ok(maintenance.affects.includes('investment.presented.netYield'));
  assert.ok(rate.affects.includes('investment.presented.annualCashFlow'));
  assert.ok(rate.affects.includes('investment.presented.dscr'));
  assert.ok(deposit.affects.includes('investment.presented.annualCashFlow'));
  assert.ok(term.affects.includes('investment.presented.dscr'));
  assert.ok(rate.directionality.whenInputIncreases.some((row) => (
    row.output === 'investment.presented.annualCashFlow' && row.whenInputIncreases === 'decreases'
  )));
  assert.ok(rate.directionality.whenInputIncreases.some((row) => (
    row.output === 'investment.presented.dscr' && row.whenInputIncreases === 'decreases'
  )));
  result.sensitivityDrivers.forEach((row) => {
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'sensitivityScore'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'rankScore'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'importanceScore'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'scoreDelta'));
    assert.ok(!/increases score by|reduces landlord score/i.test(row.explanation));
  });
});

test('sensitivity drivers exclude context evidence, demand and risk and keep stable order', () => {
  const article4 = unattachedArticle4Fact();
  article4.available = true;
  article4.value = 'Westminster basement';
  const result = assembleDecisionIntelligence({
    propertyFacts: factsWith({
      flood: { field: 'flood', available: true, value: 'Flood Zone 3', state: 'observed' },
      planning: { field: 'planning', available: true, value: [], state: 'observed' },
      schools: { field: 'schools', available: true, value: [], state: 'observed' },
      listedBuilding: { field: 'listedBuilding', available: true, value: 'Grade II', state: 'observed' },
      conservationArea: { field: 'conservationArea', available: true, value: 'Westminster', state: 'observed' },
      article4,
    }),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub(),
    evidenceAsOf: ASOF,
  });
  const keys = result.sensitivityDrivers.map((row) => row.inputKey);
  assert.deepStrictEqual(keys, [...SENSITIVITY_DRIVER_ORDER]);
  assert.deepStrictEqual(keys, [...keys].sort((a, b) => SENSITIVITY_DRIVER_ORDER.indexOf(a) - SENSITIVITY_DRIVER_ORDER.indexOf(b)));
  ['flood', 'planning', 'schools', 'listedBuilding', 'conservationArea', 'article4', 'demand', 'risk'].forEach((key) => {
    assert.ok(!keys.includes(key));
    assert.ok(!result.sensitivityDrivers.some((row) => row.id.includes(key)));
  });
  result.sensitivityDrivers.forEach((row) => {
    assert.ok(row.evidenceRefs.some((ref) => ref.kind === 'financeInputContract' && ref.path === row.inputKey));
  });
});

test('Phase 1 and Phase 2 arrays stay unchanged when sensitivity drivers are added', () => {
  const input = {
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: ['vacancyAssumption'], missingFinance: [] }),
    personalDecision: pdStub({ notAssessedKeys: ['demand', 'netOperating', 'vacancy'] }),
    evidenceAsOf: ASOF,
  };
  const result = assembleDecisionIntelligence(input);
  assert.ok(findDep(result, 'vacancy_assumption_missing'));
  assert.ok(result.investigationPriorities.some((row) => row.id === 'vacancy_assumption_missing'));
  assert.ok(!result.unresolvedDependencies.some((row) => row.type === 'sensitivity_driver'));
  assert.ok(!result.investigationPriorities.some((row) => row.type === 'sensitivity_driver'));
  assert.ok(!result.materialFindings.some((row) => row.type === 'sensitivity_driver'));
  assert.ok(result.sensitivityDrivers.every((row) => row.type === 'sensitivity_driver'));
  assert.ok(!result.sensitivityDrivers.some((row) => row.id.startsWith('finding_')));
});

test('sensitivity layer does not run What-if or change PD valuation finance or confidence', () => {
  const diSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'ai', 'decisionIntelligence.js'), 'utf8');
  assert.ok(!diSrc.includes('executeIntelligenceWhatIf'));
  assert.ok(!diSrc.includes('comparePersonalDecisionWhatIf'));
  assert.ok(!diSrc.includes('buildCashFlowSensitivityMatrix'));
  assert.ok(!diSrc.includes('applyScenario('));
  const investment = presentedStub({ missingCosts: [], missingFinance: [] });
  const personalDecision = pdAssessedStub();
  const pdBefore = JSON.stringify(personalDecision);
  const invBefore = JSON.stringify(investment);
  assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment,
    personalDecision,
    evidenceAsOf: ASOF,
  });
  assert.strictEqual(JSON.stringify(personalDecision), pdBefore);
  assert.strictEqual(JSON.stringify(investment), invBefore);
});

async function assembleReport({ extraOptions = {}, property = listing({ latitude: 51.5, longitude: -0.12 }) } = {}) {
  return assemblePropertyIntelligenceReport({
    property,
    access: {
      allowed: true,
      userId: 1,
      role: 'owner',
      relationship: 'owner',
      accessLevel: 'professional_intelligence',
      propertyId: property.id || 1,
    },
    userId: 1,
    target: { propertyId: property.id || 1 },
    options: {
      skipExplanation: true,
      skipPostcodeMarket: true,
      skipPlanning: true,
      skipSchools: true,
      skipListedBuilding: true,
      skipConservationArea: true,
      skipArticle4: true,
      skipFlood: true,
      asOf: ASOF,
      deps: {
        analyseRent: async () => ({
          success: true,
          recommendedRent: 1100,
          currentRent: 1100,
          comparables: [{ similarity: 0.8 }],
          marketRange: { low: 1050, high: 1150 },
        }),
        calculatePropertyValuation: async () => ({
          success: true,
          centralEstimate: 190000,
          lowerEstimate: 180000,
          upperEstimate: 200000,
          evidenceCount: 4,
        }),
        generatePropertyExplanation: async () => {
          throw new Error('LLM must not invent investigation items');
        },
      },
      ...extraOptions,
    },
  });
}

asyncTest('canonical report exposes decisionIntelligence without changing valuation finance PD or confidence', async () => {
  const withLayer = await assembleReport();
  const di = withLayer.decisionIntelligence;
  assert.strictEqual(di.engine, 'decisionIntelligence');
  assert.strictEqual(di.version, VERSION);
  assert.strictEqual(di.scoringActivated, false);
  assert.ok(Array.isArray(di.unresolvedDependencies));
  assert.ok(Array.isArray(di.investigationPriorities));
  assert.ok(Array.isArray(di.materialFindings));
  assert.ok(Array.isArray(di.sensitivityDrivers));
  assert.ok(di.sensitivityDrivers.some((row) => row.inputKey === 'purchasePrice'));
  assert.ok(findDep(di, 'vacancy_assumption_missing') || findDep(di, 'operating_costs_incomplete'));
  assert.ok(findDep(di, 'landlord_demand_not_assessed'));
  assert.strictEqual(withLayer.marketIntelligence.sale.centralEstimate, 190000);
  assert.strictEqual(withLayer.personalDecision.dimensions.demand.available, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(withLayer.personalDecision.dimensions, 'decisionIntelligence'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'decisionIntelligence'));
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  assert.strictEqual(withLayer.propertyFacts.facts.article4.restrictions.available, false);
});

asyncTest('context evidence does not alter Personal Decision', async () => {
  const without = await assembleReport({ extraOptions: { skipFlood: true, skipArticle4: true } });
  const withFlood = await assembleReport({
    extraOptions: {
      skipFlood: false,
      deps: {
        getFloodEvidence: async () => ({
          available: true,
          value: 'Flood Zone 3',
          state: 'observed',
          trust: 'observed',
          field: 'flood',
          notAScore: true,
          notPersonalDecisionInput: true,
          notAValuationAdjustment: true,
        }),
        analyseRent: async () => ({
          success: true,
          recommendedRent: 1100,
          currentRent: 1100,
          comparables: [{ similarity: 0.8 }],
          marketRange: { low: 1050, high: 1150 },
        }),
        calculatePropertyValuation: async () => ({
          success: true,
          centralEstimate: 190000,
          lowerEstimate: 180000,
          upperEstimate: 200000,
          evidenceCount: 4,
        }),
        generatePropertyExplanation: async () => ({ summary: 'template', source: 'template', tokensUsed: 0 }),
      },
    },
  });
  assert.strictEqual(without.personalDecision.score, withFlood.personalDecision.score);
  assert.strictEqual(without.personalDecision.dimensions.risk.score, withFlood.personalDecision.dimensions.risk.score);
});

asyncTest('saved analysis pins decisionIntelligence', async () => {
  const historical = await assembleReport();
  const row = { id: 77, output_data: historical, created_at: ASOF };
  assert.strictEqual(extractCanonicalCoreFacts(row).decisionIntelligence.version, VERSION);
  const overview = projectPropertyOverview(listing(), { canonicalReport: row });
  assert.strictEqual(overview.decisionIntelligence.version, VERSION);
  const snapshotBefore = JSON.stringify(row.output_data.decisionIntelligence);
  const later = await assembleReport({
    extraOptions: {
      vacancyAssumption: 8,
      maintenance: 1200,
      insurance: 600,
      managementFee: 0,
      taxes: 0,
    },
  });
  assert.notStrictEqual(JSON.stringify(later.decisionIntelligence), snapshotBefore);
  assert.strictEqual(JSON.stringify(row.output_data.decisionIntelligence), snapshotBefore);
});

test('What-if does not call decision intelligence providers and rejects client injection', () => {
  const adapter = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'intelligenceWhatIfService.js'),
    'utf8'
  );
  const historical = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'historicalWhatIfBaseline.js'),
    'utf8'
  );
  const engine = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyIntelligenceEngine.js'),
    'utf8'
  );
  assert.ok(!adapter.includes('assembleDecisionIntelligence'));
  assert.ok(!historical.includes('assembleDecisionIntelligence'));
  assert.ok(engine.includes('assembleDecisionIntelligence'));
  const injected = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    decisionIntelligence: { investigationPriorities: [{ title: 'injected' }] },
    materialFindings: [{ title: 'injected finding' }],
    importanceScore: 82,
    materialityScore: 70,
    effect: 'supporting',
    findingImportance: 'decision_relevant',
  });
  assert.strictEqual(injected.ok, false);
  assert.ok(injected.errors.some((e) => e.field === 'decisionIntelligence' && e.reason === 'internal_option_not_allowed'));
  const injectedFindings = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    materialFindings: [{ title: 'injected finding' }],
  });
  assert.ok(injectedFindings.errors.some((e) => e.field === 'materialFindings'));
  const injectedEffect = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    effect: 'supporting',
  });
  const injectedDrivers = parseWhatIfHttpBody({
    propertyId: 1,
    profile: 'landlord',
    sensitivityDrivers: [{ title: 'injected driver' }],
    sensitivityScore: 9,
    rankScore: 1,
  });
  assert.ok(injectedDrivers.errors.some((e) => e.field === 'sensitivityDrivers'));
  assert.ok(injectedDrivers.errors.some((e) => e.field === 'sensitivityScore'));
  assert.ok(injectedDrivers.errors.some((e) => e.field === 'rankScore'));
});

test('HTTP analyse rejects client decisionIntelligence injection', () => {
  assert.ok(parseAnalyseFinanceRequest({ decisionIntelligence: { investigationPriorities: [] } }).errors.some((e) => e.field === 'decisionIntelligence'));
  assert.ok(parseAnalyseFinanceRequest({ unresolvedDependencies: [] }).errors.some((e) => e.field === 'unresolvedDependencies'));
  assert.ok(parseAnalyseFinanceRequest({ investigationPriorities: [] }).errors.some((e) => e.field === 'investigationPriorities'));
  assert.ok(parseAnalyseFinanceRequest({ importanceScore: 82 }).errors.some((e) => e.field === 'importanceScore'));
  assert.ok(parseAnalyseFinanceRequest({ evidenceRefs: [] }).errors.some((e) => e.field === 'evidenceRefs'));
  assert.ok(parseAnalyseFinanceRequest({ affects: [] }).errors.some((e) => e.field === 'affects'));
  assert.ok(parseAnalyseFinanceRequest({ materialFindings: [] }).errors.some((e) => e.field === 'materialFindings'));
  assert.ok(parseAnalyseFinanceRequest({ materialFinding: {} }).errors.some((e) => e.field === 'materialFinding'));
  assert.ok(parseAnalyseFinanceRequest({ findingScore: 90 }).errors.some((e) => e.field === 'findingScore'));
  assert.ok(parseAnalyseFinanceRequest({ materialityScore: 80 }).errors.some((e) => e.field === 'materialityScore'));
  assert.ok(parseAnalyseFinanceRequest({ effect: 'supporting' }).errors.some((e) => e.field === 'effect'));
  assert.ok(parseAnalyseFinanceRequest({ findingImportance: 'decision_relevant' }).errors.some((e) => e.field === 'findingImportance'));
  assert.ok(parseAnalyseFinanceRequest({ sensitivityDrivers: [] }).errors.some((e) => e.field === 'sensitivityDrivers'));
  assert.ok(parseAnalyseFinanceRequest({ sensitivityDriver: {} }).errors.some((e) => e.field === 'sensitivityDriver'));
  assert.ok(parseAnalyseFinanceRequest({ sensitivityScore: 9 }).errors.some((e) => e.field === 'sensitivityScore'));
  assert.ok(parseAnalyseFinanceRequest({ rankScore: 3 }).errors.some((e) => e.field === 'rankScore'));
  assert.ok(parseAnalyseFinanceRequest({ driverImportance: 'high' }).errors.some((e) => e.field === 'driverImportance'));
  assert.ok(parseAnalyseFinanceRequest({ directionality: {} }).errors.some((e) => e.field === 'directionality'));
  assert.ok(parseAnalyseFinanceRequest({ dependencyGraph: {} }).errors.some((e) => e.field === 'dependencyGraph'));
  assert.ok(parseAnalyseFinanceRequest({ explanation: { overview: 'x' } }).errors.some((e) => e.field === 'explanation'));
  assert.ok(parseAnalyseFinanceRequest({ overview: 'x' }).errors.some((e) => e.field === 'overview'));
  assert.ok(parseAnalyseFinanceRequest({ systemPrompt: 'x' }).errors.some((e) => e.field === 'systemPrompt'));
});

test('LLM boundary cannot add investigation items', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'ai', 'propertyExplanationService.js'),
    'utf8'
  );
  assert.ok(/Do not add investigation items/.test(src));
  assert.ok(/must NOT create findings/.test(src));
  assert.ok(/invent sensitivity drivers/.test(src));
  assert.ok(/rank drivers/.test(src));
  assert.ok(/estimate score changes/.test(src));
  assert.ok(/Structured decisionIntelligence remains authoritative/.test(src));
  const assembled = assembleDecisionIntelligence({
    propertyFacts: factsWith(),
    investment: presentedStub({ missingCosts: [], missingFinance: [] }),
    personalDecision: pdAssessedStub({ rentState: 'at_market' }),
    rentIntel: { success: true, marketRange: { low: 1050, high: 1150 } },
    evidenceAsOf: ASOF,
  });
  const explained = publicDecisionIntelligenceForExplanation(assembled);
  assert.strictEqual(explained.scoringActivated, false);
  assert.deepStrictEqual(
    explained.investigationPriorities.map((row) => row.id),
    assembled.investigationPriorities.map((row) => row.id)
  );
  assert.deepStrictEqual(
    explained.materialFindings.map((row) => row.id),
    assembled.materialFindings.map((row) => row.id)
  );
  assert.deepStrictEqual(
    explained.materialFindings.map((row) => row.effect),
    assembled.materialFindings.map((row) => row.effect)
  );
  assert.deepStrictEqual(
    explained.sensitivityDrivers.map((row) => row.id),
    assembled.sensitivityDrivers.map((row) => row.id)
  );
});

test('Personal Decision weights, valuation, finance, confidence and demand stay frozen', () => {
  assert.strictEqual(LANDLORD_WEIGHTS.demand, 0.08);
  assert.strictEqual(LANDLORD_WEIGHTS.risk, 0.1);
  assert.strictEqual(LANDLORD_WEIGHTS.grossYield, 0.18);
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'flood'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'article4'));
  assert.ok(!Object.prototype.hasOwnProperty.call(LANDLORD_WEIGHTS, 'decisionIntelligence'));
  assert.strictEqual(BUYER_GENERAL_WEIGHTS.affordability, 0.3);
  assert.strictEqual(CONFIDENCE_MODEL.baseVersion, 'confidence-1.1.0');
  const blend = weightedBlend([
    {
      centralEstimate: 500000,
      lowerEstimate: 480000,
      upperEstimate: 520000,
      method: 'valuation_sale_avm',
    },
  ]);
  assert.strictEqual(blend.central, 500000);
  const metrics = calculateInvestmentMetrics({
    purchasePrice: 200000,
    expectedRent: 1000,
    vacancyAssumption: 5,
    operatingCosts: 0,
  });
  assert.ok(Number.isFinite(metrics.grossYield));
  assert.ok(parseDemandResponse({ demand_rating: 3 }));
  assert.ok(parseDemandRentResponse({ rental_demand_rating: 4 }));
  assert.deepStrictEqual([...OUTCOME_TYPES].sort(), ['let', 'sold', 'under_offer', 'withdrawn']);
  assert.strictEqual(BACKTEST_ENGINE_VERSION, 'backtest-foundation-1.0.0');
});

asyncTest('historical What-if does not rebuild decisionIntelligence from live evidence', async () => {
  const historical = await assembleReport();
  const snapshotBefore = JSON.stringify(historical.decisionIntelligence);
  const prepared = resolveSavedWhatIfBaseline({
    id: 88,
    request_type: 'property_intelligence',
    property_id: 42,
    created_at: ASOF,
    output_data: historical,
  });
  assert.strictEqual(prepared.ok, true);
  executeIntelligenceWhatIf({
    property: listing({ monthly_rent: 1100 }),
    profile: 'landlord',
    baselineOptions: {
      purchasePrice: 200000,
      expectedRent: 1100,
      deposit: 50000,
      interestRate: 5,
      mortgageTermYears: 25,
    },
    scenarioOptions: { purchasePrice: 185000 },
    asOf: prepared.evidenceAsOf,
    baselineContext: prepared.context,
    intelligence: prepared.intelligence,
  });
  assert.strictEqual(JSON.stringify(historical.decisionIntelligence), snapshotBefore);
});

async function run() {
  for (const t of pending) {
    await t.fn();
    console.log(`✓ ${t.name}`);
  }
  console.log('\ndecisionIntelligence.test.js — all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
