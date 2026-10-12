/**
 * Presentation-only LET analysis readiness.
 * Mirrors existing financeInputContract metric dependencies — not a new engine.
 *
 * Gross yield: positive purchase-price basis AND positive rent basis.
 * NOI / net yield: rent basis + COMPLETE OPERATING_COST_KEYS (+ price for net yield).
 * Cash flow / DSCR: complete NOI inputs + deposit + interestRate + mortgageTermYears.
 * mortgageAmount remains optional when it can be derived from price − deposit.
 */

import { listingChargeEvidence } from './financeScenario';

/** Mirrors server financeInputContract.OPERATING_COST_KEYS. */
export const LET_OPERATING_COST_KEYS = Object.freeze([
  'maintenance',
  'insurance',
  'managementFee',
  'serviceCharge',
  'groundRent',
  'taxes',
  'vacancyAssumption',
]);

const OPEX_LABELS = Object.freeze({
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  managementFee: 'Management fee',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
  taxes: 'Other landlord taxes/costs',
  vacancyAssumption: 'Vacancy',
});

const ZERO_NOT_VALID_KEYS = new Set(['purchasePrice', 'expectedRent', 'mortgageTermYears']);

export function hasNumericInput(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

export function isPositiveInput(value) {
  return hasNumericInput(value) && Number(value) > 0;
}

function listingPrice(preview, report) {
  if (preview?.price != null && preview.price !== '') return preview.price;
  if (report?.property?.price != null && report.property.price !== '') return report.property.price;
  return null;
}

function listingRent(preview, report) {
  if (preview?.monthly_rent != null && preview.monthly_rent !== '') return preview.monthly_rent;
  if (preview?.weekly_rent != null && preview.weekly_rent !== '') return preview.weekly_rent;
  if (report?.property?.monthly_rent != null && report.property.monthly_rent !== '') {
    return report.property.monthly_rent;
  }
  return null;
}

function marketRentFromExistingState(report) {
  const rent = report?.marketIntelligence?.rent;
  if (!rent) return null;
  if (rent.recommendedRent != null && rent.recommendedRent !== '') return rent.recommendedRent;
  if (rent.estimatedRent != null && rent.estimatedRent !== '') return rent.estimatedRent;
  return null;
}

function listingOpexSatisfied(preview, report) {
  const charges = listingChargeEvidence(preview || {});
  const facts = report?.propertyFacts?.facts || {};
  const financeRequest = report?.financeRequest || {};
  const scFact =
    financeRequest.serviceCharge?.propertyFact?.value != null
      ? financeRequest.serviceCharge.propertyFact.value
      : facts.serviceCharge?.available
        ? facts.serviceCharge.value
        : charges.serviceCharge?.value;
  const grFact =
    financeRequest.groundRent?.propertyFact?.value != null
      ? financeRequest.groundRent.propertyFact.value
      : facts.groundRent?.available
        ? facts.groundRent.value
        : charges.groundRent?.value;
  return {
    serviceCharge: hasNumericInput(scFact),
    groundRent: hasNumericInput(grFact),
  };
}

function opexPresent(form, key, listingOpex) {
  if (hasNumericInput(form[key])) return true;
  if (key === 'serviceCharge' && listingOpex.serviceCharge) return true;
  if (key === 'groundRent' && listingOpex.groundRent) return true;
  return false;
}

function purchaseBasisPositive(form, preview, report) {
  return isPositiveInput(form.purchasePrice) || isPositiveInput(listingPrice(preview, report));
}

function rentBasisPositive(form, preview, report) {
  return (
    isPositiveInput(form.expectedRent)
    || isPositiveInput(listingRent(preview, report))
    || isPositiveInput(marketRentFromExistingState(report))
  );
}

function mortgageKnown(form, preview, report) {
  if (hasNumericInput(form.mortgageAmount)) return true;
  return purchaseBasisPositive(form, preview, report) && hasNumericInput(form.deposit);
}

function termOk(form) {
  return isPositiveInput(form.mortgageTermYears);
}

/**
 * @returns {{ id: string, label: string, status: 'ready'|'needs', detail: string, statusLabel: string }[]}
 */
export function buildLetAnalysisReadiness({ form = {}, preview = null, report = null } = {}) {
  const purchaseOk = purchaseBasisPositive(form, preview, report);
  const rentOk = rentBasisPositive(form, preview, report);
  const listingOpex = listingOpexSatisfied(preview, report);

  const opexMissing = LET_OPERATING_COST_KEYS.filter((key) => !opexPresent(form, key, listingOpex));
  const opexComplete = opexMissing.length === 0;
  const noiReady = rentOk && opexComplete;

  const financeMissing = [];
  if (!hasNumericInput(form.deposit)) financeMissing.push('Deposit');
  if (!hasNumericInput(form.interestRate)) financeMissing.push('Interest rate');
  if (!termOk(form)) financeMissing.push('Mortgage term');

  const cashFlowReady = noiReady && financeMissing.length === 0 && mortgageKnown(form, preview, report);

  const grossNeeds = [];
  if (!purchaseOk) grossNeeds.push('purchase price');
  if (!rentOk) grossNeeds.push('expected rent');

  const noiNeeds = [];
  if (!rentOk) noiNeeds.push('expected rent');
  opexMissing.forEach((key) => noiNeeds.push(OPEX_LABELS[key] || key));

  const netDetail = noiReady
    ? (purchaseOk
      ? 'Complete operating-cost set available'
      : 'Operating costs complete. Net yield also needs a purchase-price basis.')
    : `Needs ${noiNeeds.join(', ')}`;

  const cashPurchase = hasNumericInput(form.mortgageAmount) && Number(form.mortgageAmount) === 0;
  let cashDetail;
  if (cashFlowReady) {
    cashDetail = cashPurchase
      ? 'Financing inputs available. DSCR stays not assessed for an explicit cash purchase.'
      : 'Deposit, rate and term available';
  } else if (!noiReady) {
    cashDetail = 'Needs complete NOI inputs first';
  } else if (!mortgageKnown(form, preview, report) && financeMissing.length === 0) {
    cashDetail = 'Needs mortgage amount, or purchase price + deposit so it can be derived';
  } else {
    cashDetail = `Needs ${financeMissing.join(', ')}`;
  }

  return [
    {
      id: 'grossYield',
      label: 'Gross yield',
      status: purchaseOk && rentOk ? 'ready' : 'needs',
      statusLabel: purchaseOk && rentOk ? 'Inputs ready' : 'Needs input',
      detail: purchaseOk && rentOk
        ? 'Price + rent basis available'
        : `Needs ${grossNeeds.join(' + ')}`,
    },
    {
      id: 'noi',
      label: 'NOI / net yield',
      status: noiReady ? 'ready' : 'needs',
      statusLabel: noiReady ? 'Inputs ready' : 'Needs input',
      detail: netDetail,
    },
    {
      id: 'cashFlowDscr',
      label: 'Cash flow / DSCR',
      status: cashFlowReady ? 'ready' : 'needs',
      statusLabel: cashFlowReady ? 'Inputs ready' : 'Needs input',
      detail: cashDetail,
    },
  ];
}

export function letAnalyseConsequenceCopy(items = []) {
  const gy = items.find((row) => row.id === 'grossYield');
  const noi = items.find((row) => row.id === 'noi');
  const cf = items.find((row) => row.id === 'cashFlowDscr');
  if (cf?.status === 'ready') {
    return 'Deeper cash-flow / DSCR underwriting is supported. Other evidence can still leave outputs not assessed.';
  }
  if (noi?.status === 'ready') {
    return 'NOI / net-yield assessment is supported. Cash flow stays not assessed until financing inputs are complete.';
  }
  if (gy?.status === 'ready') {
    return 'Initial investment analysis is supported (gross yield orientation). Deeper metrics stay not assessed until operating costs and financing are complete.';
  }
  return 'You can still analyse. Investment metrics may return limited or not-assessed results until a purchase-price basis and rent basis are available.';
}

export { ZERO_NOT_VALID_KEYS };
