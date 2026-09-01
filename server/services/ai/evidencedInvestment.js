/**
 * Evidence-only finance input for Property Intelligence and portfolio views.
 * Does not invent deposit, interest, vacancy, maintenance, insurance or term.
 * calculateInvestmentMetrics formulas are unchanged; this layer decides what
 * may be presented as assessed versus notAssessed.
 *
 * Listing service charge / ground rent are consumed via canonical propertyFacts,
 * not by re-resolving columns inside financialEngine.
 */

const { listingObservedCharges } = require('./listingObservedFields');
const { assemblePropertyFacts } = require('./propertyFacts');
const { financialCostsFromPropertyFacts } = require('./operatingCostEvidence');
const {
  parseFinancePayload,
  OPERATING_COST_KEYS,
} = require('./financeInputContract');

const COST_KEYS = [
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
];

const FINANCE_KEYS = ['deposit', 'interestRate', 'mortgageTermYears'];

function supplied(value) {
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
}

function sourceIsEvidenced(assumption) {
  return Boolean(
    assumption && ['user_supplied', 'property_data', 'provider'].includes(assumption.source)
  );
}

function notAssessed(reason) {
  return { available: false, value: null, state: 'notAssessed', reason };
}

function calculated(value) {
  return { available: true, value, state: 'calculated' };
}

function costSourceLabel(assumption) {
  if (!assumption) return 'unavailable';
  if (assumption.source === 'user_supplied') return 'user_supplied';
  if (assumption.source === 'property_data') return 'observed';
  if (assumption.source === 'provider') return 'observed';
  if (assumption.source === 'application_default') return 'assumed_defaulted';
  return 'unavailable';
}

function describeCostCompleteness(assumptions, adapterEvidence = null) {
  const keys = OPERATING_COST_KEYS;
  const costRows = keys.map((key) => {
    const assumption = assumptions[key];
    const included = sourceIsEvidenced(assumption);
    return {
      key,
      included,
      missing: !included,
      source: assumption?.source || 'unavailable',
      kind: costSourceLabel(assumption),
      value: included ? assumption.value : null,
      defaulted: assumption?.source === 'application_default',
    };
  });
  const includedKeys = costRows.filter((row) => row.included).map((row) => row.key);
  const missingKeys = costRows.filter((row) => row.missing).map((row) => row.key);
  const adapterExcluded = Array.isArray(adapterEvidence?.excluded)
    ? adapterEvidence.excluded
    : [adapterEvidence?.serviceCharge, adapterEvidence?.groundRent].filter((item) => item && item.excluded);
  const evidencedCount = includedKeys.length;
  const completeness =
    evidencedCount === keys.length
      ? 'COMPLETE_EVIDENCE'
      : evidencedCount > 0 || adapterExcluded.length
        ? 'PARTIAL_EVIDENCE'
        : 'NOT_ASSESSED';

  return {
    completeness,
    period: 'annual',
    included: includedKeys,
    missing: missingKeys,
    excluded: adapterExcluded.map((item) => ({
      key: item.key,
      reason: item.reason,
      originalValue: item.originalValue,
      originalFrequency: item.originalFrequency,
    })),
    costs: costRows,
    source: adapterEvidence?.source || null,
    councilTax: adapterEvidence?.councilTax || {
      treatedAsLandlordOperatingCost: false,
      mappedToTaxesInput: false,
    },
    vacancyMissingIsNotZeroEvidence: !includedKeys.includes('vacancyAssumption'),
    note:
      completeness === 'COMPLETE_EVIDENCE'
        ? 'All tracked operating-cost inputs, including vacancy, are evidenced.'
        : completeness === 'PARTIAL_EVIDENCE'
          ? 'Some operating costs are known. Known costs are not treated as the complete operating-cost total. Missing vacancy is not evidenced 0% occupancy.'
          : 'No evidenced operating costs were supplied.',
  };
}

function describeFinanceCompleteness(assumptions) {
  const rows = FINANCE_KEYS.map((key) => {
    const assumption = assumptions[key];
    const included = sourceIsEvidenced(assumption);
    return {
      key,
      included,
      missing: !included,
      source: assumption?.source || 'unavailable',
      kind: costSourceLabel(assumption),
      value: included ? assumption.value : null,
      defaulted: assumption?.source === 'application_default',
    };
  });
  const included = rows.filter((row) => row.included).map((row) => row.key);
  const missing = rows.filter((row) => row.missing).map((row) => row.key);
  const completeness =
    included.length === FINANCE_KEYS.length
      ? 'COMPLETE_EVIDENCE'
      : included.length
        ? 'PARTIAL_EVIDENCE'
        : 'NOT_ASSESSED';
  return {
    completeness,
    included,
    missing,
    inputs: rows,
    note:
      completeness === 'COMPLETE_EVIDENCE'
        ? 'Deposit, interest rate and mortgage term were user supplied.'
        : 'Application defaults (including a 25-year term or 0% rate) are not treated as user-supplied finance evidence.',
  };
}

function resolvePropertyFacts({ propertyFacts = null, property = null } = {}) {
  if (propertyFacts) return propertyFacts;
  if (!property) return null;
  return assemblePropertyFacts({
    property,
    listingCharges: listingObservedCharges(property),
  });
}

/**
 * Same listing-charge merge used by canonical presentation. Scenario overrides
 * (including explicit 0) stay authoritative; missing scenario fields may use
 * propertyFacts service charge / ground rent. Does not invent other costs.
 */
function applyListingObservedCharges(input, contract, adapter, provenanceHints = null) {
  if (!input || !contract?.fields || !adapter?.inputs) return input;
  if (!contract.fields.serviceCharge?.available && adapter.inputs.serviceCharge != null) {
    input.serviceCharge = adapter.inputs.serviceCharge;
    if (provenanceHints) provenanceHints.serviceCharge = adapter.hints.serviceCharge;
  }
  if (!contract.fields.groundRent?.available && adapter.inputs.groundRent != null) {
    input.groundRent = adapter.inputs.groundRent;
    if (provenanceHints) provenanceHints.groundRent = adapter.hints.groundRent;
  }
  return input;
}

function mergeListingChargesFromProperty(input, options, property, propertyFacts = null) {
  const facts = resolvePropertyFacts({ propertyFacts, property });
  const adapter = financialCostsFromPropertyFacts(facts);
  const contract = parseFinancePayload(options || {});
  applyListingObservedCharges(input, contract, adapter);
  return input;
}

function prepareEvidencedInvestment({
  purchasePrice,
  expectedRent,
  options = {},
  property = null,
  propertyFacts = null,
} = {}) {
  const facts = resolvePropertyFacts({ propertyFacts, property });
  const adapter = financialCostsFromPropertyFacts(facts);
  const contract = parseFinancePayload(options);
  const input = {};

  if (supplied(purchasePrice) && Number(purchasePrice) > 0) {
    input.purchasePrice = Number(purchasePrice);
  }
  if (supplied(expectedRent) && Number(expectedRent) > 0) {
    input.expectedRent = Number(expectedRent);
  }

  const provenanceHints = {};
  Object.entries(contract.engineInputs).forEach(([key, value]) => {
    input[key] = value;
    provenanceHints[key] = contract.provenanceHints[key];
  });

  ['otherExpenses', 'renovationCost', 'expectedAppreciation', 'holdingPeriod'].forEach((key) => {
    if (supplied(options[key]) && input[key] == null) input[key] = Number(options[key]);
  });

  applyListingObservedCharges(input, contract, adapter, provenanceHints);

  const userSuppliedAny = Object.values(contract.fields).some((field) => field.available);

  return {
    input,
    provenanceHints,
    propertyFacts: facts,
    operatingCostEvidence: adapter.evidence,
    financeInputs: contract,
    adapter,
    analysisKind: userSuppliedAny ? 'user_scenario' : 'listing_evidence',
    scenarioOverrides: contract.scenarioOverrides,
  };
}

function buildEvidencedInvestmentInput(args = {}) {
  return prepareEvidencedInvestment(args).input;
}

function incompleteOperatingCostReason(costEvidence, metric) {
  if (costEvidence?.completeness === 'PARTIAL_EVIDENCE') {
    return `${metric} is notAssessed because operating-cost evidence is partial. Known service charge/ground rent are not treated as the full cost total.`;
  }
  return `Operating costs were not supplied — ${metric} is notAssessed.`;
}

function presentFromAssessment(assessment, value, fallbackReason) {
  if (!assessment) return null;
  if (assessment.state === 'assessed' && value != null) {
    return calculated(value);
  }
  return notAssessed(fallbackReason || assessment.reason);
}

function presentEvidencedInvestment(metrics, adapterEvidence = null, options = {}) {
  const assumptions = metrics?.assumptionCoverage?.assumptions || {};
  const costEvidence = describeCostCompleteness(assumptions, adapterEvidence);
  const financeEvidence = describeFinanceCompleteness(assumptions);
  const costsAssessed = costEvidence.completeness === 'COMPLETE_EVIDENCE';
  const financeAssessed = financeEvidence.completeness === 'COMPLETE_EVIDENCE';
  const priceAndRent =
    sourceIsEvidenced(assumptions.purchasePrice) && sourceIsEvidenced(assumptions.expectedRent);
  const assessment = metrics?.metricAssessment || null;
  const rentBasis = options.rentBasis || metrics?.rentBasis || null;
  const expectedRentIsNotMarketRent = rentBasis
    ? rentBasis.kind !== 'MARKET'
    : true;
  const grossYieldBasis =
    rentBasis?.kind === 'MARKET'
      ? 'MARKET_RENT'
      : rentBasis?.kind === 'SCENARIO'
        ? 'SCENARIO_RENT'
        : rentBasis?.kind === 'LISTING'
          ? 'LISTING_RENT'
          : null;

  const cashFlowReason = financeAssessed
    ? incompleteOperatingCostReason(costEvidence, 'cash flow')
    : 'Cash flow requires evidenced operating costs and complete finance inputs (deposit, interest rate, term). Application defaults are not user-supplied evidence.';
  const fromEngine = assessment
    ? {
        grossYield: presentFromAssessment(
          assessment.grossYield,
          metrics.grossYield,
          'Gross yield requires an evidenced purchase price and expected rent.'
        ),
        netYield: presentFromAssessment(
          assessment.netYield,
          metrics.netYield,
          incompleteOperatingCostReason(costEvidence, 'net yield')
        ),
        noi: presentFromAssessment(
          assessment.noi,
          metrics.noi,
          incompleteOperatingCostReason(costEvidence, 'NOI')
        ),
        annualCashFlow: presentFromAssessment(
          assessment.cashFlow,
          metrics.annualCashFlow,
          cashFlowReason
        ),
        monthlyCashFlow: presentFromAssessment(
          assessment.cashFlow,
          metrics.monthlyCashFlow,
          'Mortgage cash flow requires evidenced operating costs and complete finance inputs.'
        ),
        dscr: presentFromAssessment(
          assessment.dscr,
          metrics.dscr,
          'DSCR requires evidenced operating costs and complete finance inputs. Missing inputs are notAssessed, not a default mortgage.'
        ),
      }
    : {
        grossYield: priceAndRent
          ? calculated(metrics.grossYield)
          : notAssessed('Gross yield requires an evidenced purchase price and expected rent.'),
        netYield: costsAssessed && priceAndRent
          ? calculated(metrics.netYield)
          : notAssessed(incompleteOperatingCostReason(costEvidence, 'net yield')),
        noi: costsAssessed
          ? calculated(metrics.noi)
          : notAssessed(incompleteOperatingCostReason(costEvidence, 'NOI')),
        annualCashFlow:
          costsAssessed && financeAssessed
            ? calculated(metrics.annualCashFlow)
            : notAssessed(
                financeAssessed
                  ? incompleteOperatingCostReason(costEvidence, 'cash flow')
                  : 'Cash flow requires evidenced operating costs and complete finance inputs (deposit, interest rate, term). Application defaults are not user-supplied evidence.'
              ),
        monthlyCashFlow:
          costsAssessed && financeAssessed
            ? calculated(metrics.monthlyCashFlow)
            : notAssessed(
                'Mortgage cash flow requires evidenced operating costs and complete finance inputs.'
              ),
        dscr:
          costsAssessed && financeAssessed && metrics.dscr != null
            ? calculated(metrics.dscr)
            : notAssessed(
                'DSCR requires evidenced operating costs and complete finance inputs. Missing inputs are notAssessed, not a default mortgage.'
              ),
      };

  if (fromEngine.grossYield?.available && grossYieldBasis) {
    fromEngine.grossYield.basis = grossYieldBasis;
    fromEngine.grossYield.rentBasisKind = rentBasis.kind;
  }

  return {
    ...fromEngine,
    costsAssessed,
    financeAssessed,
    costEvidence,
    financeEvidence,
    rentBasis: rentBasis
      ? {
          kind: rentBasis.kind,
          label: rentBasis.label,
          marketSubstitutedForMissingListing: Boolean(rentBasis.marketSubstitutedForMissingListing),
        }
      : null,
    grossYieldBasis,
    expectedRentIsNotMarketRent,
    scenarioIsNotObservedResult: true,
  };
}

function evidencedValue(field) {
  return field?.available ? field.value : null;
}

module.exports = {
  COST_KEYS,
  FINANCE_KEYS,
  supplied,
  applyListingObservedCharges,
  mergeListingChargesFromProperty,
  prepareEvidencedInvestment,
  buildEvidencedInvestmentInput,
  presentEvidencedInvestment,
  evidencedValue,
};
