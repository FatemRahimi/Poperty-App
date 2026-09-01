/**
 * Platform unit strategy. Incompatible units must never be silently combined
 * or converted. No universal conversion engine.
 */

const UNIT = Object.freeze({
  GBP: 'GBP',
  GBP_PER_SQFT: 'GBP_PER_SQFT',
  GBP_PER_SQM: 'GBP_PER_SQM',
  GBP_PER_ACRE: 'GBP_PER_ACRE',
  GBP_PER_UNIT: 'GBP_PER_UNIT',
  GBP_PER_ITEM: 'GBP_PER_ITEM',
  GBP_PER_DAY: 'GBP_PER_DAY',
  GBP_PER_WEEK: 'GBP_PER_WEEK',
  SQFT: 'SQFT',
  SQM: 'SQM',
  ACRES: 'ACRES',
  HECTARES: 'HECTARES',
  PERCENT: 'PERCENT',
  RATIO: 'RATIO',
  MONTHS: 'MONTHS',
  YEARS: 'YEARS',
  DAYS: 'DAYS',
  KW: 'KW',
  KWH: 'KWH',
});

function isKnownUnit(unit) {
  return Object.values(UNIT).includes(unit);
}

function createMeasuredValue(value, unit) {
  if (value !== null && value !== undefined && !isKnownUnit(unit)) {
    throw new Error('Measured values require a known unit');
  }
  if (value === undefined) {
    return { value: null, unit: unit || null, present: false };
  }
  if (value === null) {
    return { value: null, unit: unit || null, present: false };
  }
  return { value, unit, present: true };
}

function unitsAreEquivalent(a, b) {
  return a != null && b != null && a === b;
}

function assertCompatibleUnits(a, b) {
  if (!unitsAreEquivalent(a, b)) {
    const err = new Error('INCOMPATIBLE_UNITS');
    err.code = 'INCOMPATIBLE_UNITS';
    err.left = a;
    err.right = b;
    throw err;
  }
  return true;
}

module.exports = {
  UNIT,
  isKnownUnit,
  createMeasuredValue,
  unitsAreEquivalent,
  assertCompatibleUnits,
};
