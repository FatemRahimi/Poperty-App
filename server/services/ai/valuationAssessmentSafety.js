/**
 * Sale-valuation assessment safety.
 *
 * VALIDITY → ELIGIBILITY → PLAUSIBILITY → ASSESSMENT → CONFIDENCE
 *
 * This layer does not rewrite eligibility rules, blend weights, or PD/DI.
 * Asking price is context / price-position baseline / secondary diagnostic only.
 * It is never ground truth, a clamp, a calibration target, or a correction.
 *
 * Absolute UK house-price floor: NOT introduced. Scale is derived from
 * source-contract units, provenanced area × price-per-area, and independent
 * eligible evidence. A hard floor would reject legitimate unusual transactions.
 */

const {
  isFinitePositiveMoney,
  parseFiniteNumber,
  parsePositiveMoney,
  parsePositiveArea,
  optionalPositiveBound,
} = require('./valuationIntegrity');

const ASSESSMENT_SAFETY_VERSION = 'assessment-safety-1.0.0';

/** Structural order-of-magnitude split — not a quality-tuned band. */
const ORDER_OF_MAGNITUDE_RATIO = 10;

const VALUE_UNITS = {
  GBP_TOTAL: 'gbp_total',
  GBP_PER_SQFT: 'gbp_per_sqft',
  GBP_PER_SQM: 'gbp_per_sqm',
  GBP_THOUSANDS: 'gbp_thousands',
  GBP_PER_MONTH: 'gbp_per_month',
  GBP_PER_WEEK: 'gbp_per_week',
  PERCENT: 'percent',
  RATIO: 'ratio',
  UNKNOWN: 'unknown',
};

const UNIT_ALIASES = {
  gbp: VALUE_UNITS.GBP_TOTAL,
  gbp_total: VALUE_UNITS.GBP_TOTAL,
  gbp_property: VALUE_UNITS.GBP_TOTAL,
  '£': VALUE_UNITS.GBP_TOTAL,
  pounds: VALUE_UNITS.GBP_TOTAL,
  gbp_per_sqft: VALUE_UNITS.GBP_PER_SQFT,
  gbp_per_sq_ft: VALUE_UNITS.GBP_PER_SQFT,
  '£/sqft': VALUE_UNITS.GBP_PER_SQFT,
  'gbp/sqft': VALUE_UNITS.GBP_PER_SQFT,
  psf: VALUE_UNITS.GBP_PER_SQFT,
  gbp_per_sqm: VALUE_UNITS.GBP_PER_SQM,
  gbp_per_sq_m: VALUE_UNITS.GBP_PER_SQM,
  '£/sqm': VALUE_UNITS.GBP_PER_SQM,
  'gbp/sqm': VALUE_UNITS.GBP_PER_SQM,
  gbp_thousands: VALUE_UNITS.GBP_THOUSANDS,
  '£k': VALUE_UNITS.GBP_THOUSANDS,
  thousands_gbp: VALUE_UNITS.GBP_THOUSANDS,
  gbp_per_month: VALUE_UNITS.GBP_PER_MONTH,
  monthly_rent: VALUE_UNITS.GBP_PER_MONTH,
  gbp_per_week: VALUE_UNITS.GBP_PER_WEEK,
  weekly_rent: VALUE_UNITS.GBP_PER_WEEK,
  percent: VALUE_UNITS.PERCENT,
  '%': VALUE_UNITS.PERCENT,
  ratio: VALUE_UNITS.RATIO,
};

const RENT_UNITS = new Set([VALUE_UNITS.GBP_PER_MONTH, VALUE_UNITS.GBP_PER_WEEK]);
const AREA_RATE_UNITS = new Set([VALUE_UNITS.GBP_PER_SQFT, VALUE_UNITS.GBP_PER_SQM]);
const NON_PROPERTY_VALUE_UNITS = new Set([
  VALUE_UNITS.GBP_THOUSANDS,
  VALUE_UNITS.PERCENT,
  VALUE_UNITS.RATIO,
]);

/**
 * Inventory of every component that can influence sale valuation.
 * Units are never silently interchanged.
 */
const COMPONENT_INVENTORY = {
  valuation_sale_avm: {
    source: 'PropertyData',
    methodFamily: 'PROVIDER_MODEL',
    rawField: 'estimate|value|price',
    rawUnit: 'endpoint contract gbp_total unless payload declares otherwise',
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: true,
    blendParticipation: true,
    minimumEvidence: 'finite gbp_total estimate + subject postcode',
  },
  uprn_profile: {
    source: 'PropertyData /uprn',
    methodFamily: 'PROVIDER_MODEL',
    rawField: 'currentSaleEstimate',
    rawUnit: 'endpoint contract gbp_total unless payload declares otherwise',
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: true,
    blendParticipation: true,
    minimumEvidence: 'finite gbp_total estimate + subject UPRN',
  },
  sold_prices_statistics: {
    source: 'PropertyData /sold-prices (HMLR)',
    methodFamily: 'TRANSACTION_STATISTICS',
    rawField: 'average|mean|interquartile_mean|avg_price',
    rawUnit: 'endpoint contract gbp_total unless payload declares otherwise',
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: false,
    blendParticipation: true,
    minimumEvidence: 'finite gbp_total average; cannot assess alone',
  },
  sqft_implied: {
    source: 'PropertyData /sold-prices-per-sqf × provenanced listing area',
    methodFamily: 'TRANSACTION_STATISTICS',
    rawField: 'averagePerSqft * square_feet',
    rawUnit: 'gbp_per_sqft rate; normalized total only after area conversion',
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: false,
    blendParticipation: true,
    minimumEvidence: 'provenanced sqft + gbp_per_sqft rate + explicit conversion basis',
  },
  sold_prices_per_sqf: {
    source: 'PropertyData /sold-prices-per-sqf',
    methodFamily: 'AREA_RATE',
    rawField: 'average',
    rawUnit: 'endpoint contract gbp_per_sqft',
    normalizedUnit: VALUE_UNITS.GBP_PER_SQFT,
    canIndependentlyAssess: false,
    blendParticipation: false,
    minimumEvidence: 'never a total GBP sale value without area conversion',
  },
  internal_sale_comparables: {
    source: 'application_database asking listings',
    methodFamily: 'ASKING_LISTING',
    rawField: 'price / recommendedPrice',
    rawUnit: VALUE_UNITS.GBP_TOTAL,
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: false,
    blendParticipation: false,
    minimumEvidence: 'contextual only — cannot assess sale value',
  },
  last_sold: {
    source: 'PropertyData UPRN / HMLR last sale',
    methodFamily: 'FACT',
    rawField: 'lastSoldPrice',
    rawUnit: VALUE_UNITS.GBP_TOTAL,
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    canIndependentlyAssess: false,
    blendParticipation: false,
    minimumEvidence: 'observed fact, not a valuation method',
  },
};

const METHOD_CONTRACT = {
  valuation_sale_avm: { defaultUnit: VALUE_UNITS.GBP_TOTAL, evidenceFamily: 'sale_value' },
  uprn_profile: { defaultUnit: VALUE_UNITS.GBP_TOTAL, evidenceFamily: 'sale_value' },
  sold_prices_statistics: { defaultUnit: VALUE_UNITS.GBP_TOTAL, evidenceFamily: 'sale_value' },
  sqft_implied: { defaultUnit: VALUE_UNITS.GBP_TOTAL, evidenceFamily: 'sale_value' },
  sold_prices_per_sqf: { defaultUnit: VALUE_UNITS.GBP_PER_SQFT, evidenceFamily: 'area_rate' },
  internal_sale_comparables: { defaultUnit: VALUE_UNITS.GBP_TOTAL, evidenceFamily: 'asking_listing' },
};

function normalizeValueUnit(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (!key) return null;
  if (UNIT_ALIASES[key]) return UNIT_ALIASES[key];
  return VALUE_UNITS.UNKNOWN;
}

function emptyValidation(method, reasonCodes, extras = {}) {
  return {
    valid: false,
    eligibleForBlend: false,
    method: method || 'unknown',
    valueUnit: extras.valueUnit || VALUE_UNITS.UNKNOWN,
    normalizedUnit: extras.normalizedUnit || null,
    normalizedValue: null,
    reasonCodes,
    ...extras,
  };
}

/**
 * Canonical component validation boundary.
 * Invalid/unknown unit => ineligible. Never coerce invalid values to 0.
 */
function validateSaleComponent(component = {}, context = {}) {
  if (component == null || typeof component !== 'object' || Array.isArray(component)) {
    return emptyValidation(null, ['malformed_component']);
  }

  const method = component.method || context.method || 'unknown';
  const contract = METHOD_CONTRACT[method];
  if (!contract) {
    return emptyValidation(method, ['unknown_method']);
  }

  const rawValue = component.centralEstimate ?? component.average ?? component.value;
  if (rawValue !== null && typeof rawValue === 'object') {
    return emptyValidation(method, ['malformed_provider_value']);
  }

  const numeric = parseFiniteNumber(rawValue);
  if (numeric === null) {
    const asNumber = Number(rawValue);
    if (Number.isNaN(asNumber) || !Number.isFinite(asNumber)) {
      return emptyValidation(method, ['non_finite']);
    }
    return emptyValidation(method, ['malformed_provider_value']);
  }
  if (!Number.isFinite(numeric)) {
    return emptyValidation(method, ['non_finite']);
  }
  if (numeric === 0) return emptyValidation(method, ['non_positive', 'zero_rejected']);
  if (numeric < 0) return emptyValidation(method, ['non_positive', 'negative_rejected']);

  const declared = normalizeValueUnit(
    component.valueUnit ?? component.declaredUnit ?? component.unit ?? context.declaredUnit
  );
  let valueUnit;
  if (declared === VALUE_UNITS.UNKNOWN) {
    return emptyValidation(method, ['unknown_unit', 'unsupported_unit'], { valueUnit: VALUE_UNITS.UNKNOWN });
  }
  if (declared) {
    valueUnit = declared;
  } else {
    valueUnit = contract.defaultUnit;
  }

  if (RENT_UNITS.has(valueUnit)) {
    return emptyValidation(method, ['rent_cannot_become_sale_value', 'semantically_wrong_evidence_family'], {
      valueUnit,
    });
  }
  if (NON_PROPERTY_VALUE_UNITS.has(valueUnit)) {
    return emptyValidation(method, ['unsupported_unit', 'semantically_wrong_evidence_family'], { valueUnit });
  }
  if (AREA_RATE_UNITS.has(valueUnit)) {
    const area = parsePositiveArea(context.area ?? component.conversionBasis?.area);
    const converted = component.conversionBasis && isFinitePositiveMoney(component.centralEstimate);
    if (!converted || area == null) {
      const reason =
        valueUnit === VALUE_UNITS.GBP_PER_SQM
          ? 'gbp_per_sqm_cannot_become_total_without_area'
          : 'gbp_per_sqft_cannot_become_total_without_area';
      return emptyValidation(method, [reason, 'missing_conversion_basis'], { valueUnit });
    }
  }

  if (method === 'sqft_implied') {
    const basis = component.conversionBasis || {};
    const area = parsePositiveArea(basis.area);
    const rate = parsePositiveMoney(basis.rate);
    const rateUnit = normalizeValueUnit(basis.rateUnit) || VALUE_UNITS.GBP_PER_SQFT;
    if (area == null || rate == null) {
      return emptyValidation(method, ['missing_conversion_basis', 'invalid_area_derived_calculation'], {
        valueUnit,
      });
    }
    if (rateUnit !== VALUE_UNITS.GBP_PER_SQFT) {
      return emptyValidation(method, ['unsupported_unit', 'invalid_area_derived_calculation'], {
        valueUnit,
        sourceRateUnit: rateUnit,
      });
    }
    if (valueUnit !== VALUE_UNITS.GBP_TOTAL) {
      return emptyValidation(method, ['gbp_per_sqft_cannot_become_total_without_area'], { valueUnit });
    }
  }

  if (valueUnit !== VALUE_UNITS.GBP_TOTAL) {
    return emptyValidation(method, ['unsupported_unit'], { valueUnit });
  }

  if (contract.evidenceFamily !== 'sale_value' && method !== 'internal_sale_comparables') {
    return emptyValidation(method, ['semantically_wrong_evidence_family'], { valueUnit });
  }

  return {
    valid: true,
    eligibleForBlend: method !== 'internal_sale_comparables',
    method,
    valueUnit: VALUE_UNITS.GBP_TOTAL,
    normalizedUnit: VALUE_UNITS.GBP_TOTAL,
    normalizedValue: numeric,
    reasonCodes: [],
    unitSource: declared ? 'source_declared' : 'endpoint_contract',
  };
}

function askingDiagnostic(askingPrice, retained = []) {
  const asking = parsePositiveMoney(askingPrice);
  const central = retained.length ? parsePositiveMoney(retained[0].centralEstimate) : null;
  return {
    askingPrice: asking,
    role: 'context_and_price_position_baseline',
    notGroundTruth: true,
    notClamp: true,
    notCalibrationTarget: true,
    notCorrectionCoefficient: true,
    differenceFromRetained:
      asking != null && central != null
        ? { amount: asking - central, usedAsCorrection: false }
        : null,
  };
}

/**
 * Plausibility AFTER structural validation and existing eligibility.
 * Asking price never rejects, clamps, or replaces a valuation.
 */
function evaluatePlausibility({
  selectedComponents = [],
  eligibilities = [],
  askingPrice = null,
} = {}) {
  const byMethod = new Map((eligibilities || []).map((row) => [row.method, row]));
  const valid = [];
  const invalid = [];

  (selectedComponents || []).forEach((component) => {
    const validity = validateSaleComponent(component);
    if (!validity.valid || validity.valueUnit !== VALUE_UNITS.GBP_TOTAL) {
      invalid.push({ method: component?.method, reasonCodes: validity.reasonCodes });
      return;
    }
    valid.push(component);
  });

  if (!valid.length) {
    return {
      situation: 'INSUFFICIENT_EVIDENCE',
      assess: false,
      reason: 'insufficient_valid_components',
      quarantined: invalid,
      retained: [],
      askingDiagnostic: askingDiagnostic(askingPrice, []),
    };
  }

  const values = valid.map((item) => Number(item.centralEstimate));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ratio = min > 0 ? max / min : Number.POSITIVE_INFINITY;

  if (valid.length >= 2 && ratio >= ORDER_OF_MAGNITUDE_RATIO) {
    const independent = valid.filter((item) => byMethod.get(item.method)?.canAssessAlone);
    const weaker = valid.filter((item) => !byMethod.get(item.method)?.canAssessAlone);

    if (independent.length === 1 && weaker.length) {
      return {
        situation: 'COMPONENT_ANOMALY',
        assess: true,
        reason: 'quarantined_inconsistent_weaker_component',
        quarantined: weaker.map((item) => ({
          method: item.method,
          centralEstimate: item.centralEstimate,
          reason: 'grossly_inconsistent_with_independent_evidence',
        })),
        retained: independent,
        askingDiagnostic: askingDiagnostic(askingPrice, independent),
      };
    }

    return {
      situation: 'EXTREME_DISAGREEMENT',
      assess: false,
      reason: 'extreme_method_disagreement',
      quarantined: valid.map((item) => ({
        method: item.method,
        centralEstimate: item.centralEstimate,
        reason: 'extreme_method_disagreement',
      })),
      retained: [],
      askingDiagnostic: askingDiagnostic(askingPrice, []),
    };
  }

  return {
    situation: 'DEFENSIBLE_ASSESSMENT',
    assess: true,
    reason: 'independent_eligible_evidence',
    quarantined: invalid,
    retained: valid,
    askingDiagnostic: askingDiagnostic(askingPrice, valid),
  };
}

function validateAssessedBounds(blend) {
  if (!blend || !isFinitePositiveMoney(blend.central)) {
    return {
      valid: false,
      reason: 'invalid_central',
      central: null,
      lower: null,
      upper: null,
      boundsAvailable: false,
    };
  }

  let lower = optionalPositiveBound(blend.lower);
  let upper = optionalPositiveBound(blend.upper);
  if (lower != null && lower > blend.central) lower = null;
  if (upper != null && upper < blend.central) upper = null;
  if (lower != null && upper != null && lower > upper) {
    lower = null;
    upper = null;
  }

  return {
    valid: true,
    reason: null,
    central: blend.central,
    lower,
    upper,
    boundsAvailable: lower != null && upper != null,
  };
}

function isDefensibleAssessedValuation(valuation) {
  if (!valuation || valuation.success !== true) return false;
  if (valuation.insufficientEvidence === true || valuation.notAssessed === true) return false;
  if (valuation.assessmentState && valuation.assessmentState !== 'assessed') return false;
  if (valuation.assessmentSafety && valuation.assessmentSafety.assess === false) return false;
  const central = valuation.centralEstimate?.value ?? valuation.centralEstimate;
  return isFinitePositiveMoney(central);
}

module.exports = {
  ASSESSMENT_SAFETY_VERSION,
  ORDER_OF_MAGNITUDE_RATIO,
  VALUE_UNITS,
  COMPONENT_INVENTORY,
  METHOD_CONTRACT,
  normalizeValueUnit,
  validateSaleComponent,
  evaluatePlausibility,
  validateAssessedBounds,
  isDefensibleAssessedValuation,
};
