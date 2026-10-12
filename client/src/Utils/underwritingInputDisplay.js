export const UNDERWRITING_SECTIONS = {
  property_rent: 'Property & Rent',
  operating: 'Operating Costs',
  financing: 'Financing',
};

export const INPUT_TO_FORM_FIELD = Object.freeze({
  purchasePrice: 'purchasePrice',
  expectedRent: 'expectedRent',
  maintenance: 'maintenance',
  insurance: 'insurance',
  managementFee: 'managementFee',
  serviceCharge: 'serviceCharge',
  groundRent: 'groundRent',
  taxes: 'taxes',
  vacancyAssumption: 'vacancyAssumption',
  deposit: 'deposit',
  mortgageAmount: 'mortgageAmount',
  interestRate: 'interestRate',
  mortgageTermYears: 'mortgageTermYears',
});

export function sectionForInputKey(inputKey) {
  if (inputKey === 'purchasePrice' || inputKey === 'expectedRent') return 'property_rent';
  if (['deposit', 'mortgageAmount', 'interestRate', 'mortgageTermYears'].includes(inputKey)) return 'financing';
  return 'operating';
}

export function causeLabel(cause) {
  if (cause === 'MISSING_USER_INPUT') return 'Your input';
  if (cause === 'MISSING_PLATFORM_EVIDENCE') return 'Platform evidence';
  if (cause === 'MISSING_LISTING_ATTRIBUTE') return 'Listing attribute';
  if (cause === 'MISSING_USER_REPORTED_ATTRIBUTE') return 'Property fact';
  if (cause === 'MISSING_PROVIDER_REQUEST_INPUT') return 'Valuation input';
  return 'Unresolved';
}
