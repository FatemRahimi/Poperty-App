/**
 * Property Intelligence finance-scenario helpers.
 * Builds the canonical analyse payload. Does not calculate yield, NOI, cash flow or DSCR.
 */

export const FINANCE_FREQUENCIES = ['weekly', 'monthly', 'annual'];

export const EMPTY_FINANCE_SCENARIO = Object.freeze({
  purchasePrice: '',
  expectedRent: '',
  serviceCharge: '',
  serviceChargeFrequency: 'annual',
  groundRent: '',
  groundRentFrequency: 'annual',
  maintenance: '',
  maintenanceFrequency: 'annual',
  insurance: '',
  insuranceFrequency: 'annual',
  managementFee: '',
  managementFeeFrequency: 'annual',
  taxes: '',
  taxesFrequency: 'annual',
  vacancyAssumption: '',
  deposit: '',
  mortgageAmount: '',
  interestRate: '',
  mortgageTermYears: '',
});

export const FIELD_LABELS = Object.freeze({
  purchasePrice: 'Purchase price',
  expectedRent: 'Expected monthly rent',
  serviceCharge: 'Service charge',
  groundRent: 'Ground rent',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  managementFee: 'Management fee',
  taxes: 'Other landlord taxes/costs',
  vacancyAssumption: 'Vacancy assumption',
  deposit: 'Deposit',
  mortgageAmount: 'Mortgage amount',
  interestRate: 'Interest rate',
  mortgageTermYears: 'Mortgage term',
});

const MONEY_COST_FIELDS = [
  'maintenance',
  'insurance',
  'managementFee',
  'taxes',
  'serviceCharge',
  'groundRent',
];

const SCALAR_FIELDS = [
  'purchasePrice',
  'expectedRent',
  'vacancyAssumption',
  'deposit',
  'mortgageAmount',
  'interestRate',
  'mortgageTermYears',
];

const ZERO_NOT_VALID = new Set(['purchasePrice', 'expectedRent', 'mortgageTermYears']);

export function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

export function parseOptionalNumber(raw) {
  if (isBlank(raw)) return { omit: true };
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return { error: 'not_finite' };
  return { value: n };
}

export function humanFinanceError(reason) {
  switch (reason) {
    case 'not_finite':
      return 'Enter a valid number.';
    case 'negative_not_accepted':
      return 'This amount cannot be negative.';
    case 'zero_not_valid':
      return 'Enter a value greater than zero, or leave blank if unknown.';
    case 'percent_out_of_range':
      return 'Enter a percentage between 0 and 100.';
    case 'term_not_positive':
      return 'Enter a mortgage term greater than 0 years.';
    case 'unknown_frequency':
      return 'Choose weekly, monthly or annual.';
    case 'malformed_value':
    case 'malformed_object':
      return 'This value is not valid.';
    default:
      return 'This value is not valid.';
  }
}

function validateSemantic(key, n) {
  if (n < 0) return 'negative_not_accepted';
  if (n === 0 && ZERO_NOT_VALID.has(key)) return 'zero_not_valid';
  if ((key === 'vacancyAssumption' || key === 'interestRate') && n > 100) return 'percent_out_of_range';
  if (key === 'mortgageTermYears' && !(n > 0)) return 'term_not_positive';
  return null;
}

function addMoneyField(target, form, key, errors) {
  const parsed = parseOptionalNumber(form[key]);
  if (parsed.omit) return;
  if (parsed.error) {
    errors.push({ field: key, reason: parsed.error });
    return;
  }
  const semantic = validateSemantic(key, parsed.value);
  if (semantic) {
    errors.push({ field: key, reason: semantic });
    return;
  }
  const frequency = form[`${key}Frequency`];
  if (!FINANCE_FREQUENCIES.includes(frequency)) {
    errors.push({ field: key, reason: 'unknown_frequency' });
    return;
  }
  target[key] = { value: parsed.value, frequency };
}

function addScalarField(target, form, key, errors) {
  const parsed = parseOptionalNumber(form[key]);
  if (parsed.omit) return;
  if (parsed.error) {
    errors.push({ field: key, reason: parsed.error });
    return;
  }
  const semantic = validateSemantic(key, parsed.value);
  if (semantic) {
    errors.push({ field: key, reason: semantic });
    return;
  }
  target[key] = parsed.value;
}

export function buildFinanceAnalyseRequest(form = EMPTY_FINANCE_SCENARIO) {
  const errors = [];
  const finance = {};
  const operatingCosts = {};

  addScalarField(finance, form, 'purchasePrice', errors);
  addScalarField(finance, form, 'expectedRent', errors);
  addScalarField(finance, form, 'deposit', errors);
  addScalarField(finance, form, 'mortgageAmount', errors);
  addScalarField(finance, form, 'interestRate', errors);
  addScalarField(finance, form, 'mortgageTermYears', errors);

  MONEY_COST_FIELDS.forEach((key) => addMoneyField(operatingCosts, form, key, errors));
  addScalarField(operatingCosts, form, 'vacancyAssumption', errors);

  if (Object.keys(operatingCosts).length) {
    finance.operatingCosts = operatingCosts;
  }

  if (errors.length) {
    return { ok: false, errors, payload: {} };
  }

  if (!Object.keys(finance).length) {
    return { ok: true, errors: [], payload: {} };
  }

  return { ok: true, errors: [], payload: { finance } };
}

export function serializeFinanceScenario(form) {
  const built = buildFinanceAnalyseRequest(form);
  if (!built.ok) return `invalid:${JSON.stringify(built.errors)}`;
  return JSON.stringify(built.payload);
}

export function isScenarioStale(form, lastSubmittedKey) {
  if (lastSubmittedKey == null) return false;
  return serializeFinanceScenario(form) !== lastSubmittedKey;
}

export function mapServerFinanceErrors(errors = []) {
  return (errors || []).map((item) => {
    const raw = String(item.field || '');
    const parts = raw.split('.');
    const field = parts[parts.length - 1] || raw;
    return {
      field,
      reason: item.reason,
      message: humanFinanceError(item.reason),
    };
  });
}

export function completenessLabel(value) {
  if (value === 'COMPLETE_EVIDENCE') return 'Complete';
  if (value === 'PARTIAL_EVIDENCE') return 'Partial';
  if (value === 'NOT_ASSESSED') return 'Not assessed';
  return 'Not assessed';
}

export function missingFieldLabel(key) {
  return FIELD_LABELS[key] || key;
}

export function formatListingMoney(value, period) {
  if (isBlank(value) || !Number.isFinite(Number(value))) return null;
  const amount = `£${Number(value).toLocaleString()}`;
  if (period === 'monthly') return `${amount}/month`;
  if (period === 'weekly') return `${amount}/week`;
  if (period === 'annual') return `${amount}/year`;
  return amount;
}

export function listingChargeEvidence(property = {}) {
  const serviceMonthly = property.service_charges ?? property.serviceCharges ?? null;
  const serviceAlt = property.service_charge ?? property.serviceCharge ?? null;
  const ground = property.ground_rent ?? property.groundRent ?? null;
  return {
    serviceCharge: !isBlank(serviceMonthly)
      ? { value: Number(serviceMonthly), period: 'monthly', label: formatListingMoney(serviceMonthly, 'monthly') }
      : !isBlank(serviceAlt)
        ? { value: Number(serviceAlt), period: 'monthly', label: formatListingMoney(serviceAlt, 'monthly') }
        : null,
    groundRent: !isBlank(ground)
      ? { value: Number(ground), period: 'annual', label: formatListingMoney(ground, 'annual') }
      : null,
  };
}

export { MONEY_COST_FIELDS, SCALAR_FIELDS };
