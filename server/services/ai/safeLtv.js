/**
 * LTV only when purchase price and deposit are both explicitly supplied.
 * Unknown deposit is not zero. Budget is not a deposit.
 */

function sourceOf(field) {
  if (!field || typeof field !== 'object') return null;
  return field.source || null;
}

function numericValue(field) {
  if (field == null || field === '') return null;
  if (typeof field === 'number') return Number.isFinite(field) ? field : null;
  if (typeof field === 'object') {
    if (field.supplied === false || field.available === false) return null;
    if (field.value == null || field.value === '') return null;
    const n = Number(field.value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(field);
  return Number.isFinite(n) ? n : null;
}

function explicitlySupplied(field) {
  if (field == null || field === '') return false;
  if (typeof field === 'number') return Number.isFinite(field);
  if (typeof field === 'object') {
    if (field.supplied === false || field.available === false) return false;
    if (field.source === 'application_default' || field.source === 'unavailable') return false;
    return field.value != null && field.value !== '' && Number.isFinite(Number(field.value));
  }
  return Number.isFinite(Number(field));
}

function calculateSafeLtv({ purchasePrice, deposit, purchasePriceSource = null, depositSource = null } = {}) {
  const priceSupplied = explicitlySupplied(purchasePrice);
  const depositSupplied = explicitlySupplied(deposit);
  if (!priceSupplied || !depositSupplied) {
    return {
      available: false,
      state: 'UNKNOWN',
      value: null,
      mortgageAmount: null,
      purchasePrice: priceSupplied ? numericValue(purchasePrice) : null,
      deposit: depositSupplied ? numericValue(deposit) : null,
      reason: !priceSupplied && !depositSupplied
        ? 'LTV is not assessed because purchase price and deposit were not both supplied.'
        : !priceSupplied
          ? 'LTV is not assessed because purchase price was not supplied.'
          : 'LTV is not assessed because deposit was not supplied. Deposit is not inferred from budget.',
      provenance: {
        purchasePrice: purchasePriceSource || sourceOf(purchasePrice),
        deposit: depositSource || sourceOf(deposit),
      },
    };
  }

  const price = numericValue(purchasePrice);
  const cash = numericValue(deposit);
  if (!(price > 0) || cash < 0 || cash > price) {
    return {
      available: false,
      state: 'UNKNOWN',
      value: null,
      mortgageAmount: null,
      purchasePrice: price,
      deposit: cash,
      reason: 'LTV is not assessed because price and deposit do not form a non-negative loan at or below the price.',
      provenance: {
        purchasePrice: purchasePriceSource || sourceOf(purchasePrice),
        deposit: depositSource || sourceOf(deposit),
      },
    };
  }

  const mortgageAmount = price - cash;
  const value = Math.round((mortgageAmount / price) * 10000) / 100;
  return {
    available: true,
    state: 'KNOWN',
    value,
    mortgageAmount,
    purchasePrice: price,
    deposit: cash,
    formula: 'mortgageAmount = purchasePrice - deposit; LTV = mortgageAmount / purchasePrice * 100',
    reason: null,
    provenance: {
      purchasePrice: purchasePriceSource || sourceOf(purchasePrice) || 'supplied',
      deposit: depositSource || sourceOf(deposit) || 'supplied',
      notInferredFromBudget: true,
    },
  };
}

module.exports = { calculateSafeLtv };
