/**
 * Presentation-only helper for canonical finance/rent results.
 * Does not calculate yield, NOI, cash flow, DSCR, or any other metric.
 * Does not infer evidence or change assessment state. Server remains authoritative.
 */

export const NOT_ASSESSED_LABEL = 'Not assessed';

const RENT_BASIS_LABELS = {
  LISTING: 'Listing-rent-based gross yield',
  LISTING_RENT: 'Listing-rent-based gross yield',
  MARKET: 'Market-rent-based gross yield',
  MARKET_RENT: 'Market-rent-based gross yield',
  SCENARIO: 'Scenario-rent-based gross yield',
  SCENARIO_RENT: 'Scenario-rent-based gross yield',
};

const FINANCING_LABELS = {
  EXPLICIT_CASH: 'Cash purchase',
  DERIVED_CASH: 'Cash purchase (derived)',
  EXPLICIT_MORTGAGE: 'Mortgage financing',
  DERIVED_MORTGAGE: 'Mortgage financing (derived)',
};

const METRIC_ASSESSMENT_KEY = {
  annualCashFlow: 'cashFlow',
  monthlyCashFlow: 'cashFlow',
  annualDebtService: 'mortgagePayment',
  monthlyDebtService: 'mortgagePayment',
  operatingExpenses: 'operatingCosts',
  effectiveGrossRent: 'vacancyAdjustedIncome',
};

export function isFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'boolean') return false;
  return Number.isFinite(Number(value));
}

function visibleText(text) {
  if (text == null) return NOT_ASSESSED_LABEL;
  const s = String(text);
  if (s === '' || s === 'null' || s === 'undefined' || s === 'NaN') return NOT_ASSESSED_LABEL;
  return s;
}

export function formatCurrency(value) {
  if (!isFiniteNumber(value)) return NOT_ASSESSED_LABEL;
  return `£${Number(value).toLocaleString()}`;
}

export function formatPercent(value) {
  if (!isFiniteNumber(value)) return NOT_ASSESSED_LABEL;
  return `${Number(value)}%`;
}

export function formatPlainNumber(value) {
  if (!isFiniteNumber(value)) return NOT_ASSESSED_LABEL;
  return String(Number(value));
}

function applyFormat(value, format) {
  if (typeof format === 'function') {
    return visibleText(format(value));
  }
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return formatPercent(value);
  return formatPlainNumber(value);
}

export function humanReason(reason) {
  if (reason == null || reason === '') return null;
  const s = String(reason).trim();
  if (!s || s === 'null' || s === 'undefined' || s === 'NaN') return null;
  if (/^[a-z0-9_]+$/i.test(s)) return null;
  return s;
}

function assessedResult(value, format) {
  return {
    kind: 'assessed',
    text: applyFormat(value, format),
    reason: null,
    numeric: true,
  };
}

function notAssessedResult(reason, extra = {}) {
  return {
    kind: 'notAssessed',
    text: NOT_ASSESSED_LABEL,
    reason: humanReason(reason),
    numeric: false,
    ...extra,
  };
}

function unavailableResult(extra = {}) {
  return {
    kind: 'unavailable',
    text: NOT_ASSESSED_LABEL,
    reason: null,
    numeric: false,
    legacy: true,
    ...extra,
  };
}

/**
 * Resolve one metric for display from server assessment / presented / raw value.
 * Zero is displayable only when the value is a finite number (including 0).
 */
export function resolveAssessedDisplay({
  assessment,
  presented,
  value,
  format = 'number',
} = {}) {
  const presentedValue = presented && presented.available === true ? presented.value : undefined;
  const raw = presentedValue !== undefined ? presentedValue : value;

  if (assessment?.state === 'assessed') {
    if (isFiniteNumber(raw)) return assessedResult(raw, format);
    return notAssessedResult(assessment.reason);
  }

  if (assessment?.state === 'notAssessed') {
    return notAssessedResult(assessment.reason);
  }

  if (presented) {
    if (presented.available === true) {
      if (isFiniteNumber(presented.value)) return assessedResult(presented.value, format);
      return notAssessedResult(presented.reason);
    }
    if (presented.available === false || presented.state === 'notAssessed') {
      return notAssessedResult(presented.reason);
    }
  }

  if (isFiniteNumber(raw)) {
    return {
      kind: 'legacyNumeric',
      text: applyFormat(raw, format),
      reason: null,
      numeric: true,
      legacy: true,
    };
  }

  return unavailableResult();
}

export function assessmentForMetric(metrics, key) {
  if (!metrics) return null;
  const assessmentKey = METRIC_ASSESSMENT_KEY[key] || key;
  const block = metrics.metricAssessment;
  if (block && block[assessmentKey] && typeof block[assessmentKey] === 'object') {
    return block[assessmentKey];
  }
  return null;
}

function rawMetricValue(metrics, key) {
  if (!metrics) return null;
  if (metrics[key] !== undefined && metrics[key] !== null) return metrics[key];
  if (key === 'annualRent') return metrics.assumptions?.annualRent;
  return metrics[key];
}

export function displayForMetric(metrics, key, format) {
  const presented = metrics?.presented?.[key];
  const assessment = assessmentForMetric(metrics, key);
  return resolveAssessedDisplay({
    assessment,
    presented,
    value: rawMetricValue(metrics, key),
    format,
  });
}

export function resolveRentBasisKind(metrics, { userEnteredRent = false } = {}) {
  const raw =
    metrics?.rentBasis?.kind ||
    metrics?.presented?.grossYield?.rentBasisKind ||
    metrics?.presented?.grossYield?.basis ||
    null;
  if (raw === 'LISTING' || raw === 'LISTING_RENT') return 'LISTING';
  if (raw === 'MARKET' || raw === 'MARKET_RENT') return 'MARKET';
  if (raw === 'SCENARIO' || raw === 'SCENARIO_RENT') return 'SCENARIO';
  if (userEnteredRent) return 'SCENARIO';
  return null;
}

export function grossYieldLabel(basisKind) {
  if (!basisKind) return 'Gross yield';
  return RENT_BASIS_LABELS[basisKind] || 'Gross yield';
}

export function financingDisplay(financingState) {
  const kind = financingState?.kind;
  if (!kind) return unavailableResult();
  if (kind === 'UNKNOWN') {
    return notAssessedResult('Missing mortgage amount is not a cash purchase.');
  }
  if (kind === 'EXPLICIT_CASH' || kind === 'DERIVED_CASH') {
    return {
      kind: 'assessed',
      text: FINANCING_LABELS[kind],
      reason: null,
      numeric: false,
      isCash: true,
    };
  }
  if (kind === 'EXPLICIT_MORTGAGE' || kind === 'DERIVED_MORTGAGE') {
    return {
      kind: 'assessed',
      text: FINANCING_LABELS[kind],
      reason: null,
      numeric: false,
      isCash: false,
    };
  }
  return unavailableResult();
}

export function fieldSemanticsDisplay(field, format) {
  if (!field) return unavailableResult();
  if (field.state === 'POSITIVE_VALUE' || field.state === 'EXPLICIT_ZERO') {
    return resolveAssessedDisplay({
      assessment: { state: 'assessed' },
      value: field.value,
      format,
    });
  }
  if (field.state === 'INVALID') {
    return notAssessedResult(field.reason || 'This input is not a valid number.');
  }
  return notAssessedResult(null);
}

export function hasMetricAssessment(metrics) {
  return Boolean(metrics?.metricAssessment && typeof metrics.metricAssessment === 'object');
}
