/**
 * Layer 1 — Deterministic financial calculations.
 * All formulas documented inline. No LLM involvement.
 */

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

const ASSUMPTION_SOURCES = {
  USER: 'user_supplied',
  PROPERTY: 'property_data',
  PROVIDER: 'provider',
  DEFAULT: 'application_default',
  UNAVAILABLE: 'unavailable',
};

/**
 * Values the calculation falls back on when nothing is supplied. These are declared
 * here so a result can say which numbers were assumed rather than known. The
 * arithmetic in calculateInvestmentMetrics is unchanged — this only labels it.
 */
const APPLICATION_DEFAULTS = {
  mortgageTermYears: 25,
  holdingPeriod: 5,
  vacancyAssumption: 0,
  expectedAppreciation: 0,
  interestRate: 0,
};

/** Assumptions whose absence materially changes NOI, cash flow or DSCR. */
const MATERIAL_ASSUMPTIONS = [
  'expectedRent',
  'interestRate',
  'vacancyAssumption',
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
];

const TRACKED_ASSUMPTIONS = [
  'purchasePrice',
  'deposit',
  'mortgageAmount',
  'interestRate',
  'mortgageTermYears',
  'expectedRent',
  'vacancyAssumption',
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'otherExpenses',
  'renovationCost',
  'expectedAppreciation',
  'holdingPeriod',
];

function isSupplied(value) {
  return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value));
}

/**
 * Declares where every assumption came from. Cost inputs that are absent are
 * reported as `unavailable` rather than treated as a known zero, because
 * `Number(x) || 0` in the metrics cannot distinguish "no service charge" from
 * "service charge unknown" — and the difference materially changes NOI and yield.
 *
 * @param {object} input - the same input object passed to calculateInvestmentMetrics
 * @param {object} provenanceHints - optional map of assumption key -> ASSUMPTION_SOURCES
 *   value, for callers that know a figure came from property data or a provider.
 */
function buildAssumptionCoverage(input = {}, provenanceHints = {}) {
  const assumptions = {};
  const defaulted = [];
  const unavailableList = [];
  const materialDefaults = [];

  // mortgageAmount is derived from price minus deposit when not supplied, so it is
  // an application rule rather than missing data.
  const derivedMortgage =
    !isSupplied(input.mortgageAmount) && isSupplied(input.purchasePrice) && isSupplied(input.deposit)
      ? Math.max(0, Number(input.purchasePrice) - Number(input.deposit))
      : null;

  TRACKED_ASSUMPTIONS.forEach((key) => {
    const material = MATERIAL_ASSUMPTIONS.includes(key);
    let source;

    if (provenanceHints[key]) {
      source = provenanceHints[key];
    } else if (isSupplied(input[key])) {
      source = ASSUMPTION_SOURCES.USER;
    } else if (key === 'mortgageAmount' && derivedMortgage !== null) {
      source = ASSUMPTION_SOURCES.DEFAULT;
    } else if (Object.prototype.hasOwnProperty.call(APPLICATION_DEFAULTS, key)) {
      source = ASSUMPTION_SOURCES.DEFAULT;
    } else {
      source = ASSUMPTION_SOURCES.UNAVAILABLE;
    }

    const value = isSupplied(input[key])
      ? Number(input[key])
      : key === 'mortgageAmount' && derivedMortgage !== null
        ? derivedMortgage
        : source === ASSUMPTION_SOURCES.DEFAULT
          ? APPLICATION_DEFAULTS[key]
          : null;

    assumptions[key] = { source, value, material };

    if (source === ASSUMPTION_SOURCES.DEFAULT) defaulted.push(key);
    if (source === ASSUMPTION_SOURCES.UNAVAILABLE) unavailableList.push(key);
    if (material && source !== ASSUMPTION_SOURCES.USER && source !== ASSUMPTION_SOURCES.PROPERTY && source !== ASSUMPTION_SOURCES.PROVIDER) {
      materialDefaults.push(key);
    }
  });

  const materialTotal = MATERIAL_ASSUMPTIONS.length;
  const materialEvidenced = materialTotal - materialDefaults.length;

  const limitations = [];
  if (materialDefaults.includes('expectedRent')) {
    limitations.push('No expected rent supplied — yield and cash flow cannot be relied on.');
  }
  if (materialDefaults.includes('vacancyAssumption')) {
    limitations.push(
      'No vacancy assumption supplied — the calculation assumes 100% occupancy, which is optimistic.'
    );
  }
  const missingCosts = ['maintenance', 'insurance', 'managementFee', 'serviceCharge', 'groundRent', 'taxes'].filter(
    (k) => materialDefaults.includes(k)
  );
  if (missingCosts.length) {
    limitations.push(
      `No figure supplied for ${missingCosts.join(', ')} — these remain notAssessed and are not treated as zero. Net income, yield, cash flow and DSCR that depend on them are incomplete.`
    );
  }
  if (materialDefaults.includes('interestRate')) {
    limitations.push(
      'No interest rate supplied — debt service is derived without interest, understating true cost.'
    );
  }

  return {
    assumptions,
    defaulted,
    unavailable: unavailableList,
    materialDefaults,
    coverage: {
      materialEvidenced,
      materialTotal,
      ratio: round(materialEvidenced / materialTotal, 2),
    },
    limitations,
    reliable: materialDefaults.length === 0,
    note:
      'Assumption provenance only — the financial formulas are unchanged. Sources: user_supplied, property_data, provider, application_default, unavailable.',
  };
}

function annualMortgagePayment(principal, annualRate, termYears) {
  if (!principal || principal <= 0) return 0;
  if (!annualRate || annualRate <= 0) return principal / termYears;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  const payment = (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  return payment * 12;
}

function monthlyMortgagePayment(principal, annualRate, termYears) {
  return annualMortgagePayment(principal, annualRate, termYears) / 12;
}

function calculateInvestmentMetrics(input, provenanceHints = {}) {
  const purchasePrice = Number(input.purchasePrice) || 0;
  const deposit = Number(input.deposit) || 0;
  const mortgageAmount = Number(input.mortgageAmount) || Math.max(0, purchasePrice - deposit);
  const interestRate = Number(input.interestRate) || 0;
  const mortgageTermYears = Number(input.mortgageTermYears) || 25;
  const annualRent = Number(input.expectedRent) * 12 || Number(input.annualRent) || 0;
  const vacancyRate = (Number(input.vacancyAssumption) || 0) / 100;
  const maintenance = Number(input.maintenance) || 0;
  const insurance = Number(input.insurance) || 0;
  const managementFee = Number(input.managementFee) || 0;
  const serviceCharge = Number(input.serviceCharge) || 0;
  const groundRentSupplied = isSupplied(input.groundRent);
  const groundRentValue = groundRentSupplied ? Number(input.groundRent) : null;
  const taxes = Number(input.taxes) || 0;
  const otherExpenses = Number(input.otherExpenses) || 0;
  const renovationCost = Number(input.renovationCost) || 0;
  const appreciationRate = (Number(input.expectedAppreciation) || 0) / 100;
  const holdingPeriodYears = Number(input.holdingPeriod) || 5;

  const effectiveGrossRent = annualRent * (1 - vacancyRate);
  const knownOperatingExpenses =
    maintenance + insurance + managementFee + serviceCharge + taxes + otherExpenses;
  const operatingExpenses =
    knownOperatingExpenses + (groundRentValue == null ? 0 : groundRentValue);
  const noi = effectiveGrossRent - operatingExpenses;
  const annualDebtService = annualMortgagePayment(mortgageAmount, interestRate, mortgageTermYears);
  const annualCashFlow = noi - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;
  const initialCashInvested = deposit + renovationCost;
  const grossYield = purchasePrice > 0 ? (annualRent / purchasePrice) * 100 : 0;
  const netYield = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
  const cashOnCash =
    initialCashInvested > 0 ? (annualCashFlow / initialCashInvested) * 100 : 0;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : null;
  const breakEvenOccupancy =
    annualRent > 0 ? (operatingExpenses + annualDebtService) / annualRent : null;
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

  const futureValue = purchasePrice * (1 + appreciationRate) ** holdingPeriodYears;
  const equityGain = futureValue - purchasePrice;
  const totalCashFlow = annualCashFlow * holdingPeriodYears;
  const equityMultiple =
    initialCashInvested > 0
      ? (initialCashInvested + totalCashFlow + equityGain) / initialCashInvested
      : null;

  const assumptions = {
    purchasePrice,
    deposit,
    mortgageAmount,
    interestRate,
    mortgageTermYears,
    annualRent,
    vacancyRate: vacancyRate * 100,
    operatingExpenses,
    effectiveGrossRent,
    annualDebtService,
    renovationCost,
    appreciationRate: appreciationRate * 100,
    holdingPeriodYears,
  };

  return {
    grossYield: round(grossYield),
    netYield: round(netYield),
    capRate: round(capRate),
    noi: round(noi),
    effectiveGrossRent: round(effectiveGrossRent),
    operatingExpenses: round(operatingExpenses),
    monthlyCashFlow: round(monthlyCashFlow),
    annualCashFlow: round(annualCashFlow),
    cashOnCashReturn: round(cashOnCash),
    dscr: dscr !== null ? round(dscr, 3) : null,
    breakEvenOccupancy: breakEvenOccupancy !== null ? round(breakEvenOccupancy * 100) : null,
    annualDebtService: round(annualDebtService),
    monthlyDebtService: round(annualDebtService / 12),
    futureValue: round(futureValue),
    equityGain: round(equityGain),
    equityMultiple: equityMultiple !== null ? round(equityMultiple, 3) : null,
    paybackPeriodYears:
      annualCashFlow > 0 ? round(initialCashInvested / annualCashFlow, 1) : null,
    assumptions,
    assumptionCoverage: buildAssumptionCoverage(input, provenanceHints),
    groundRent: groundRentSupplied ? round(groundRentValue) : null,
    groundRentState: groundRentSupplied ? 'observed' : 'notAssessed',
    groundRentIncludedInNoi: groundRentSupplied,
    disclaimer:
      'This analysis is an estimate based on the supplied assumptions and available data. It is not financial advice.',
  };
}

function applyScenario(baseInput, modifiers) {
  const input = { ...baseInput };
  if (modifiers.vacancyDelta) {
    input.vacancyAssumption = (Number(baseInput.vacancyAssumption) || 0) + modifiers.vacancyDelta;
  }
  if (modifiers.rentDeltaPct) {
    const rent = Number(baseInput.expectedRent) || 0;
    input.expectedRent = rent * (1 + modifiers.rentDeltaPct / 100);
  }
  if (modifiers.expenseDeltaPct) {
    ['maintenance', 'insurance', 'managementFee', 'serviceCharge'].forEach((k) => {
      if (input[k]) input[k] = Number(input[k]) * (1 + modifiers.expenseDeltaPct / 100);
    });
  }
  if (modifiers.appreciationDelta) {
    input.expectedAppreciation =
      (Number(baseInput.expectedAppreciation) || 0) + modifiers.appreciationDelta;
  }
  if (modifiers.interestRateDelta) {
    input.interestRate = (Number(baseInput.interestRate) || 0) + modifiers.interestRateDelta;
  }
  if (modifiers.priceDeltaPct) {
    const price = Number(baseInput.purchasePrice) || 0;
    input.purchasePrice = price * (1 + modifiers.priceDeltaPct / 100);
    const deposit = Number(baseInput.deposit) || 0;
    input.mortgageAmount = input.purchasePrice - deposit;
  }
  return calculateInvestmentMetrics(input);
}

function buildScenarios(baseInput) {
  const base = calculateInvestmentMetrics(baseInput);
  const conservative = applyScenario(baseInput, {
    vacancyDelta: 5,
    rentDeltaPct: -5,
    expenseDeltaPct: 10,
    appreciationDelta: -1,
  });
  const optimistic = applyScenario(baseInput, {
    vacancyDelta: -3,
    rentDeltaPct: 5,
    expenseDeltaPct: -5,
    appreciationDelta: 2,
  });

  return {
    conservative: {
      annualCashFlow: conservative.annualCashFlow,
      netYield: conservative.netYield,
      cashOnCashReturn: conservative.cashOnCashReturn,
      futureValue: conservative.futureValue,
      equityGain: conservative.equityGain,
      dscr: conservative.dscr,
    },
    base: {
      annualCashFlow: base.annualCashFlow,
      netYield: base.netYield,
      cashOnCashReturn: base.cashOnCashReturn,
      futureValue: base.futureValue,
      equityGain: base.equityGain,
      dscr: base.dscr,
    },
    optimistic: {
      annualCashFlow: optimistic.annualCashFlow,
      netYield: optimistic.netYield,
      cashOnCashReturn: optimistic.cashOnCashReturn,
      futureValue: optimistic.futureValue,
      equityGain: optimistic.equityGain,
      dscr: optimistic.dscr,
    },
  };
}

function buildDetailedScenarios(baseInput) {
  const conservativeInput = applyScenario(baseInput, {
    vacancyDelta: 5,
    rentDeltaPct: -5,
    expenseDeltaPct: 10,
    appreciationDelta: -1,
  });
  const optimisticInput = applyScenario(baseInput, {
    vacancyDelta: -3,
    rentDeltaPct: 5,
    expenseDeltaPct: -5,
    appreciationDelta: 2,
  });

  const conservative = calculateInvestmentMetrics(conservativeInput);
  const base = calculateInvestmentMetrics(baseInput);
  const optimistic = calculateInvestmentMetrics(optimisticInput);

  const row = (m) => ({
    annualRent: m.assumptions.annualRent,
    vacancyRate: m.assumptions.vacancyRate,
    operatingExpenses: m.operatingExpenses,
    noi: m.noi,
    mortgageCost: m.annualDebtService,
    cashFlow: m.annualCashFlow,
    yield: m.grossYield,
    netYield: m.netYield,
    roi: m.cashOnCashReturn,
    dscr: m.dscr,
  });

  return {
    conservative: row(conservative),
    base: row(base),
    optimistic: row(optimistic),
  };
}

function buildCashFlowSensitivityMatrix(baseInput) {
  const rentDeltas = [-5, -2.5, 0, 2.5, 5];
  const interestDeltas = [-1, 0, 1];
  const vacancyDeltas = [-5, 0, 5];
  const priceDeltas = [-5, 0, 5];

  const matrix = {
    rentVsInterest: interestDeltas.map((interestDelta) => ({
      interestDelta,
      label: interestDelta === 0 ? 'Base rate' : `Interest ${interestDelta > 0 ? '+' : ''}${interestDelta}%`,
      cells: rentDeltas.map((rentDelta) => {
        const result = applyScenario(baseInput, { rentDeltaPct: rentDelta, interestRateDelta: interestDelta });
        const base = calculateInvestmentMetrics(baseInput);
        return {
          rentDelta,
          annualCashFlow: result.annualCashFlow,
          deltaCashFlow: round(result.annualCashFlow - base.annualCashFlow),
          netYield: result.netYield,
        };
      }),
    })),
    vacancy: vacancyDeltas.map((vacancyDelta) => {
      const result = applyScenario(baseInput, { vacancyDelta });
      const base = calculateInvestmentMetrics(baseInput);
      return {
        vacancyDelta,
        label: vacancyDelta === 0 ? 'Base vacancy' : `Vacancy ${vacancyDelta > 0 ? '+' : ''}${vacancyDelta}%`,
        annualCashFlow: result.annualCashFlow,
        deltaCashFlow: round(result.annualCashFlow - base.annualCashFlow),
      };
    }),
    purchasePrice: priceDeltas.map((priceDeltaPct) => {
      const result = applyScenario(baseInput, { priceDeltaPct });
      const base = calculateInvestmentMetrics(baseInput);
      return {
        priceDeltaPct,
        label: priceDeltaPct === 0 ? 'Base price' : `Price ${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct}%`,
        annualCashFlow: result.annualCashFlow,
        netYield: result.netYield,
        deltaCashFlow: round(result.annualCashFlow - base.annualCashFlow),
      };
    }),
  };

  return matrix;
}

function sensitivityAnalysis(baseInput) {
  const tests = [
    { label: 'Interest rate +1%', modifiers: { interestRateDelta: 1 } },
    { label: 'Interest rate -1%', modifiers: { interestRateDelta: -1 } },
    { label: 'Rent +5%', modifiers: { rentDeltaPct: 5 } },
    { label: 'Rent -5%', modifiers: { rentDeltaPct: -5 } },
    { label: 'Vacancy +5%', modifiers: { vacancyDelta: 5 } },
    { label: 'Purchase price +5%', modifiers: { priceDeltaPct: 5 } },
    { label: 'Maintenance +10%', modifiers: { expenseDeltaPct: 10 } },
  ];

  const base = calculateInvestmentMetrics(baseInput);
  return tests.map((t) => {
    const result = applyScenario(baseInput, t.modifiers);
    return {
      label: t.label,
      annualCashFlow: result.annualCashFlow,
      deltaCashFlow: round(result.annualCashFlow - base.annualCashFlow),
      netYield: result.netYield,
      dscr: result.dscr,
    };
  });
}

const SCORE_WEIGHTS = {
  yield: 0.25,
  cashFlow: 0.2,
  dscr: 0.15,
  market: 0.15,
  vacancy: 0.1,
  risk: 0.1,
  liquidity: 0.05,
};

function scoreMetric(value, thresholds) {
  const [low, mid, high] = thresholds;
  if (value >= high) return 95;
  if (value >= mid) return 75;
  if (value >= low) return 55;
  return 35;
}

/**
 * Investment sub-score.
 *
 * Components are only scored where the inputs exist. Previously a missing DSCR
 * became 50, absent market and liquidity data became 70 and 65, a missing vacancy
 * assumption implied 100% occupancy and scored 95, and a missing rent produced a
 * zero yield that scored 35 — turning unknowns into both flattery and penalties.
 *
 * Components that rest on materially defaulted assumptions are marked `provisional`
 * and excluded from the headline score rather than capped, so no number is invented.
 */
function calculateInvestmentScore(metrics, context = {}) {
  const coverage = metrics.assumptionCoverage || null;
  const materialDefaults = coverage?.materialDefaults || [];
  const dependsOnDefault = (keys) => keys.some((k) => materialDefaults.includes(k));

  const rentKnown = !materialDefaults.includes('expectedRent') && Number(metrics.grossYield) > 0;
  const costsDefaulted = dependsOnDefault([
    'maintenance',
    'insurance',
    'managementFee',
    'serviceCharge',
    'groundRent',
    'taxes',
  ]);
  const vacancySupplied = coverage
    ? !materialDefaults.includes('vacancyAssumption')
    : Number(metrics.assumptions?.vacancyRate) > 0;

  const parts = {
    yield: rentKnown
      ? { available: true, score: scoreMetric(metrics.grossYield, [3, 5, 7]), detail: `Gross yield ${metrics.grossYield}%` }
      : {
          available: false,
          state: 'no_rent_evidence',
          detail: 'No expected rent supplied — yield cannot be scored (it is unknown, not poor).',
        },
    cashFlow: !rentKnown
      ? {
          available: false,
          state: 'no_rent_evidence',
          detail: 'No expected rent supplied — cash flow cannot be scored.',
        }
      : costsDefaulted
        ? {
            available: false,
            provisional: true,
            state: 'costs_defaulted',
            detail:
              'Operating costs were not supplied and default to zero, so cash flow is overstated and is excluded from the score.',
          }
        : {
            available: true,
            score: metrics.annualCashFlow > 0 ? 85 : metrics.annualCashFlow > -2000 ? 50 : 25,
            detail: `Annual cash flow £${metrics.annualCashFlow}`,
          },
    dscr:
      metrics.dscr === null
        ? {
            available: false,
            state: 'no_debt_service',
            detail: 'No mortgage or interest rate supplied — DSCR is undefined, not average.',
          }
        : costsDefaulted
          ? {
              available: false,
              provisional: true,
              state: 'costs_defaulted',
              detail: 'DSCR rests on default-zero operating costs and is excluded from the score.',
            }
          : { available: true, score: scoreMetric(metrics.dscr, [0.9, 1.1, 1.35]), detail: `DSCR ${metrics.dscr}` },
    market: Number.isFinite(Number(context.marketScore))
      ? { available: true, score: Number(context.marketScore), detail: 'Supplied market score' }
      : {
          available: false,
          state: 'no_market_data',
          detail: 'No market score supplied — market strength cannot be scored.',
        },
    vacancy: vacancySupplied
      ? {
          available: true,
          score: scoreMetric(100 - (metrics.assumptions?.vacancyRate || 0), [90, 93, 97]),
          detail: `Vacancy assumption ${metrics.assumptions?.vacancyRate}%`,
        }
      : {
          available: false,
          state: 'no_vacancy_assumption',
          detail:
            'No vacancy assumption supplied — 100% occupancy must not be scored as a strength.',
        },
    risk:
      metrics.dscr === null
        ? {
            available: false,
            state: 'no_debt_service',
            detail: 'Financing risk cannot be assessed without debt service.',
          }
        : { available: true, score: metrics.dscr < 1 ? 40 : 75, detail: `Based on DSCR ${metrics.dscr}` },
    liquidity: Number.isFinite(Number(context.liquidityScore))
      ? { available: true, score: Number(context.liquidityScore), detail: 'Supplied liquidity score' }
      : {
          available: false,
          state: 'no_liquidity_data',
          detail: 'No liquidity data supplied — exit liquidity cannot be scored.',
        },
  };

  let weightedSum = 0;
  let retainedWeight = 0;
  const totalWeight = Object.values(SCORE_WEIGHTS).reduce((s, w) => s + w, 0);

  Object.entries(parts).forEach(([key, part]) => {
    if (!part.available) return;
    const w = SCORE_WEIGHTS[key] || 0;
    weightedSum += part.score * w;
    retainedWeight += w;
  });

  const excluded = Object.entries(parts)
    .filter(([, p]) => !p.available)
    .map(([key, p]) => ({
      component: key,
      weight: SCORE_WEIGHTS[key] || 0,
      state: p.state,
      provisional: Boolean(p.provisional),
      detail: p.detail,
    }));

  const limitations = [...(coverage?.limitations || [])];
  excluded
    .filter((e) => e.provisional)
    .forEach((e) => limitations.push(`${e.component}: ${e.detail}`));

  const coverageRatio = round(retainedWeight / totalWeight, 2);
  const scoreable = retainedWeight > 0 && coverageRatio >= 0.5;
  const total = scoreable ? Math.round(weightedSum / retainedWeight) : null;

  return {
    score: total === null ? null : Math.min(100, Math.max(0, total)),
    available: scoreable,
    unavailableReason: scoreable
      ? null
      : `Only ${Math.round(coverageRatio * 100)}% of the scoring weight could be evidenced — insufficient inputs for an investment score.`,
    label: 'Deterministic investment assessment',
    weights: SCORE_WEIGHTS,
    // Compatibility: legacy consumers read a flat map. Unscored components are null.
    components: Object.fromEntries(
      Object.entries(parts).map(([k, p]) => [k, p.available ? p.score : null])
    ),
    componentDetail: parts,
    excluded,
    coverage: {
      weightRetained: coverageRatio,
      componentsScored: Object.values(parts).filter((p) => p.available).length,
      componentsTotal: Object.keys(parts).length,
    },
    assumptionCoverage: coverage,
    limitations,
    disclaimer:
      'This score reflects model inputs and assumptions. It is not an objective financial truth.',
  };
}

module.exports = {
  calculateInvestmentMetrics,
  buildAssumptionCoverage,
  ASSUMPTION_SOURCES,
  APPLICATION_DEFAULTS,
  MATERIAL_ASSUMPTIONS,
  buildScenarios,
  buildDetailedScenarios,
  buildCashFlowSensitivityMatrix,
  sensitivityAnalysis,
  calculateInvestmentScore,
  annualMortgagePayment,
  monthlyMortgagePayment,
  applyScenario,
  scoreMetric,
};
