/**
 * Landlord dimension collection for personal-decision-1.0.0.
 *
 * Canonical ownership for this path:
 *   financeInputContract → normalized scenario inputs
 *   operatingCostEvidence / evidencedInvestment → completeness
 *   financialEngine → arithmetic (formulas unchanged)
 *   investment.presented → public metric assessment state
 *   Personal Decision → consumes those sanctioned assessed facts
 *   Why-this-score → explains the Personal Decision result
 *
 * Not a second scoring engine: these functions only gather evidenced components
 * from rent intelligence, financialEngine and propertyScoring. Aggregation,
 * coverage, outcomes and confidence stay in scorePersonalDecision.
 * Completeness is not decided in the Why layer.
 */

const {
  calculateInvestmentMetrics,
  calculateInvestmentScore,
  scoreMetric,
  applyScenario,
} = require('./financialEngine');
const { calculateIntelligenceScores } = require('./propertyScoring');
const { parseFinancePayload } = require('./financeInputContract');
const { mergeListingChargesFromProperty } = require('./evidencedInvestment');

const COST_KEYS = [
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'otherExpenses',
];

function supplied(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function pickRent(property, prefs, finance, rentIntel) {
  const candidates = [
    finance?.expectedRent,
    finance?.monthlyRent,
    finance?.rent,
    prefs?.expectedRent,
    prefs?.monthlyRent,
    property?.monthly_rent,
    property?.rent_pcm,
    rentIntel?.currentRent,
    rentIntel?.recommendedRent,
  ];
  const hit = candidates.find((v) => supplied(v) && Number(v) > 0);
  return hit != null ? Number(hit) : null;
}

function pickVacancy(prefs, finance) {
  const v = finance?.vacancyAssumption ?? finance?.vacancy ?? prefs?.vacancyAssumption ?? prefs?.vacancy;
  return supplied(v) ? Number(v) : null;
}

function financeComplete(property, finance = {}) {
  return (
    supplied(property?.price) &&
    supplied(finance.deposit) &&
    supplied(finance.interestRate) &&
    supplied(finance.mortgageTermYears)
  );
}

function pickRentIntel(intelligence) {
  return (
    intelligence?.rentIntel ||
    intelligence?.rent ||
    intelligence?.marketIntelligence?.rent ||
    intelligence?.rental ||
    null
  );
}

function flattenFinance(finance = {}) {
  const parsed = parseFinancePayload(finance);
  const flat = { ...finance, ...parsed.engineInputs };
  [
    'expectedRent',
    'monthlyRent',
    'rent',
    'vacancyAssumption',
    'vacancy',
    'deposit',
    'interestRate',
    'mortgageTermYears',
    'mortgageAmount',
    ...COST_KEYS,
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(parsed.engineInputs, key)) {
      flat[key] = parsed.engineInputs[key];
      return;
    }
    if (flat[key] != null && typeof flat[key] === 'object') delete flat[key];
  });
  return flat;
}

function buildLandlordFinanceInput(property, prefs, finance = {}, rentIntel = null) {
  const originalFinance = finance || {};
  finance = flattenFinance(originalFinance);
  const input = {};
  if (supplied(property?.price) && Number(property.price) > 0) {
    input.purchasePrice = Number(property.price);
  }
  const rent = pickRent(property, prefs, finance, rentIntel);
  if (rent != null) input.expectedRent = rent;

  const vacancy = pickVacancy(prefs, finance);
  if (vacancy != null) input.vacancyAssumption = vacancy;

  if (financeComplete(property, finance)) {
    input.deposit = Number(finance.deposit);
    input.interestRate = Number(finance.interestRate);
    input.mortgageTermYears = Number(finance.mortgageTermYears);
    if (supplied(finance.mortgageAmount)) input.mortgageAmount = Number(finance.mortgageAmount);
  }

  COST_KEYS.forEach((key) => {
    if (supplied(finance[key])) input[key] = Number(finance[key]);
  });
  if (finance.operatingCosts && typeof finance.operatingCosts === 'object') {
    COST_KEYS.forEach((key) => {
      if (supplied(finance.operatingCosts[key])) input[key] = Number(finance.operatingCosts[key]);
    });
  }

  mergeListingChargesFromProperty(input, originalFinance, property);
  return input;
}

function fromIntel(component) {
  if (!component?.available) {
    return {
      available: false,
      score: null,
      state: component?.state || 'not_assessed',
      reasons: [],
      unavailableReason: component?.reason || 'Not assessed.',
    };
  }
  return {
    available: true,
    score: component.score,
    state: component.state,
    reasons: [component.detail].filter(Boolean),
    unavailableReason: null,
  };
}

function fromInvestmentPart(part, extraReasons = []) {
  if (!part?.available) {
    return {
      available: false,
      score: null,
      state: part?.state || 'not_assessed',
      reasons: [],
      unavailableReason: part?.detail || 'Not assessed.',
    };
  }
  return {
    available: true,
    score: part.score,
    state: part.state || 'assessed',
    reasons: [part.detail, ...extraReasons].filter(Boolean),
    unavailableReason: null,
  };
}

function presentedAvailable(presented, key) {
  if (!presented || typeof presented !== 'object') return null;
  const field = presented[key];
  if (!field || typeof field !== 'object' || !Object.prototype.hasOwnProperty.call(field, 'available')) {
    return null;
  }
  return field.available === true;
}

function withholdUnlessPresented(dimension, presented, keys) {
  if (!dimension?.available) return dimension;
  const list = Array.isArray(keys) ? keys : [keys];
  const blocking = list.find((key) => presentedAvailable(presented, key) === false);
  if (!blocking) return dimension;
  const field = presented[blocking] || {};
  return {
    available: false,
    score: null,
    state: dimension.state && dimension.state !== 'assessed' ? dimension.state : 'not_assessed',
    reasons: [],
    unavailableReason: field.reason || dimension.unavailableReason || 'Not assessed.',
  };
}

function scoreDemand(intelligence, intelligenceScores) {
  const live = intelligence?.demand;
  if (live?.available && Number.isFinite(Number(live.score))) {
    return {
      available: true,
      score: Number(live.score),
      state: live.state || 'assessed',
      reasons: [live.detail || 'Demand evidence supplied by a connected data source.'],
      unavailableReason: null,
    };
  }
  const base = fromIntel(intelligenceScores.componentDetail.demand);
  const area =
    (intelligence?.areaRentalDemand?.available && intelligence.areaRentalDemand) ||
    (intelligence?.decisionContext?.rentalMarketDemand?.available &&
      intelligence.decisionContext.rentalMarketDemand) ||
    null;
  if (area && !base.available) {
    return {
      ...base,
      unavailableReason:
        'Area rental-market demand is available as context only. Property-specific tenant demand is notAssessed. The landlord demand score remains notAssessed until a deterministic mapping is approved.',
    };
  }
  return base;
}

function scoreNetOperating(metrics, invScore) {
  const yieldPart = invScore.componentDetail.yield;
  const costsDefaulted = Boolean(
    metrics.assumptionCoverage?.materialDefaults?.some((k) => COST_KEYS.includes(k))
  );
  if (!yieldPart?.available) {
    return {
      available: false,
      score: null,
      state: 'no_rent_evidence',
      reasons: [],
      unavailableReason:
        'Net operating position cannot be assessed without an evidenced rent and purchase price.',
    };
  }
  if (costsDefaulted) {
    return {
      available: false,
      score: null,
      state: 'costs_not_supplied',
      reasons: [],
      unavailableReason:
        'Operating costs were not supplied, so net operating position is notAssessed rather than assumed at zero.',
    };
  }
  return {
    available: true,
    score: scoreMetric(metrics.netYield, [2, 4, 6]),
    state: 'assessed',
    reasons: [`Net yield ${metrics.netYield}% · NOI £${Number(metrics.noi).toLocaleString()}`],
    unavailableReason: null,
  };
}

function scoreVacancy(metrics, financeInput, invScore) {
  const vacancyPart = fromInvestmentPart(invScore.componentDetail.vacancy);
  if (!vacancyPart.available) return vacancyPart;
  const costsDefaulted = Boolean(
    metrics.assumptionCoverage?.materialDefaults?.some((k) => COST_KEYS.includes(k))
  );
  if (!costsDefaulted && invScore.componentDetail.yield?.available) {
    const stressed = applyScenario(financeInput, { vacancyDelta: 5 });
    vacancyPart.reasons.push(
      `NOI at +5% vacancy £${Number(stressed.noi).toLocaleString()} (base £${Number(metrics.noi).toLocaleString()})`
    );
  }
  return vacancyPart;
}

function scoreLandlordDimensions({ property, preferences, intelligence, finance }) {
  const prefs = preferences || {};
  const intel = intelligence || {};
  const fin = finance || {};
  const rentIntel = pickRentIntel(intel);
  const rent = pickRent(property, prefs, fin, rentIntel);
  const decisionContext = intel.decisionContext || null;

  let rentIntelForScore = rentIntel;
  if (!rentIntelForScore?.success && rent != null && decisionContext?.available) {
    const baseline = (decisionContext.rentBaselines || []).find((b) => b.usableAsBaseline && Number(b.value) > 0);
    if (baseline) {
      const mid = Number(baseline.value);
      rentIntelForScore = {
        success: true,
        currentRent: rent,
        recommendedRent: mid,
        marketRange: { low: mid, high: mid },
        source: baseline.source || 'decision_context',
      };
    }
  }
  if (rentIntelForScore && rent != null && rentIntelForScore.currentRent == null) {
    rentIntelForScore = { ...rentIntelForScore, currentRent: rent };
  }

  const intelligenceScores = calculateIntelligenceScores({
    property,
    rentIntel: rentIntelForScore,
    monthlyRent: rent,
    investment: null,
    // TECHNICAL DEBT: still the pre-v1 heuristic risk register. Removing it
    // would change dimensions.risk. Keep numerical behaviour; do not map
    // probabilities into Decision Intelligence.
    risks: Array.isArray(intel.risks) ? intel.risks : undefined,
    comparableCount: rentIntelForScore?.comparables?.length || intel.comparableCount || 0,
    dataQuality: intel.dataQuality || null,
    opportunities: intel.opportunities,
  });

  const financeInput = buildLandlordFinanceInput(property, prefs, fin, rentIntelForScore);
  const presented = intel.presentedInvestment || null;
  const hasYieldInputs = supplied(financeInput.purchasePrice) && supplied(financeInput.expectedRent);
  const metrics = hasYieldInputs ? calculateInvestmentMetrics(financeInput) : null;
  const invScore = metrics
    ? calculateInvestmentScore(metrics)
    : {
        componentDetail: {
          yield: {
            available: false,
            state: 'no_rent_evidence',
            detail: 'No expected rent and purchase price — yield cannot be scored.',
          },
          cashFlow: {
            available: false,
            state: 'no_rent_evidence',
            detail: 'Cash flow cannot be scored without rent and price.',
          },
          dscr: {
            available: false,
            state: 'no_debt_service',
            detail: 'DSCR is unavailable without evidenced finance inputs.',
          },
          vacancy: {
            available: false,
            state: 'no_vacancy_assumption',
            detail: 'No vacancy assumption supplied — 100% occupancy is not scored as a strength.',
          },
        },
      };

  const completeFinance = financeComplete(property, financeInput);
  let cashFlow = completeFinance
    ? fromInvestmentPart(invScore.componentDetail.cashFlow)
    : {
        available: false,
        score: null,
        state: 'no_finance_inputs',
        reasons: [],
        unavailableReason:
          'Cash flow is not assessed unless purchase price, deposit, interest rate and term are all supplied. Missing mortgage inputs are not defaulted.',
      };

  let dscr = completeFinance
    ? fromInvestmentPart(invScore.componentDetail.dscr)
    : {
        available: false,
        score: null,
        state: 'no_finance_inputs',
        reasons: [],
        unavailableReason:
          'DSCR is unavailable when deposit, interest rate or term is missing. Incomplete finance is not filled with defaults.',
      };

  const grossYield = fromInvestmentPart(invScore.componentDetail.yield);
  let netOperating = metrics
    ? scoreNetOperating(metrics, invScore)
    : {
        available: false,
        score: null,
        state: 'no_rent_evidence',
        reasons: [],
        unavailableReason:
          'Net operating position cannot be assessed without an evidenced rent and purchase price.',
      };
  netOperating = withholdUnlessPresented(netOperating, presented, ['noi', 'netYield']);
  cashFlow = withholdUnlessPresented(cashFlow, presented, 'annualCashFlow');
  dscr = withholdUnlessPresented(dscr, presented, 'dscr');
  const vacancy = metrics
    ? scoreVacancy(metrics, financeInput, invScore)
    : fromInvestmentPart(invScore.componentDetail.vacancy);

  const areaRental =
    (intel.areaRentalDemand?.available && intel.areaRentalDemand) ||
    (decisionContext?.rentalMarketDemand?.available && decisionContext.rentalMarketDemand) ||
    null;

  return {
    dimensions: {
      rentPosition: fromIntel(intelligenceScores.componentDetail.rent),
      grossYield,
      netOperating,
      cashFlow,
      vacancy,
      dscr,
      risk: fromIntel(intelligenceScores.componentDetail.risk),
      demand: scoreDemand(intel, intelligenceScores),
    },
    evidenced: {
      grossYield: grossYield.available ? metrics.grossYield : null,
      dscr: dscr.available ? metrics.dscr : null,
      noi: netOperating.available ? metrics.noi : null,
      annualCashFlow: cashFlow.available ? metrics.annualCashFlow : null,
    },
    marketContext: {
      rentalDemand: areaRental
        ? {
            available: true,
            scope: 'area',
            demandType: 'rental_market',
            propertyLevel: false,
            band: areaRental.band,
            value: null,
            source: areaRental.source || 'PropertyData',
            providerEndpoint: areaRental.providerEndpoint || '/demand-rent',
            retrievedAt: areaRental.retrievedAt || null,
            role: 'context_only',
            note:
              'Area rental-market demand is context only. Property-specific tenant demand is notAssessed. The landlord demand score remains notAssessed until a deterministic mapping is approved.',
          }
        : {
            available: false,
            scope: 'area',
            demandType: 'rental_market',
            propertyLevel: false,
            band: null,
            value: null,
            state: 'notAssessed',
            role: 'context_only',
            note:
              'Area rental-market demand is notAssessed. Property-specific tenant demand is notAssessed. The landlord demand score remains notAssessed until a deterministic mapping is approved.',
          },
    },
  };
}

module.exports = {
  scoreLandlordDimensions,
  buildLandlordFinanceInput,
  financeComplete,
  pickRent,
  COST_KEYS,
};
