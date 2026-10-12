/**
 * Authoritative RdSAP construction_age_band letter → period labels.
 *
 * Source (authoritative): MHCLG / communitiesuk epb-view-models gem
 *   Helper::XmlEnumsToOutput::CONSTRUCTION_AGE_BAND
 *   Helper::XmlEnumsToOutput.construction_age_band_lookup
 *   https://github.com/communitiesuk/epb-view-models/blob/main/lib/helper/xml_enums_to_output.rb
 *
 * Schema/version applicability:
 * - E&W table CONSTRUCTION_AGE_BAND for non-NI schemas
 * - NI table CONSTRUCTION_AGE_BAND_NI when schema_type is SAP/RdSAP *-NI-*
 * - Letter K/L overrides depend on schema_type (and RdSAP report_type=2)
 *
 * Cohort certificates expose schema_type (e.g. RdSAP-Schema-21.0.1) sufficient
 * to select E&W vs NI and apply K/L overrides deterministically.
 */

const AUTHORITATIVE_SOURCE = Object.freeze({
  name: 'MHCLG epb-view-models Helper::XmlEnumsToOutput',
  gem: 'epb_view_models',
  repository: 'https://github.com/communitiesuk/epb-view-models',
  file: 'lib/helper/xml_enums_to_output.rb',
  constant: 'CONSTRUCTION_AGE_BAND',
  method: 'construction_age_band_lookup',
  docs: 'https://www.rubydoc.info/gems/epb_view_models/Helper/XmlEnumsToOutput',
});

const EAW_CONSTRUCTION_AGE_BAND = Object.freeze({
  A: 'England and Wales: before 1900',
  B: 'England and Wales: 1900-1929',
  C: 'England and Wales: 1930-1949',
  D: 'England and Wales: 1950-1966',
  E: 'England and Wales: 1967-1975',
  F: 'England and Wales: 1976-1982',
  G: 'England and Wales: 1983-1990',
  H: 'England and Wales: 1991-1995',
  I: 'England and Wales: 1996-2002',
  J: 'England and Wales: 2003-2006',
  K: 'England and Wales: 2007-2011',
  'K-pre-17.0': 'England and Wales: 2007 onwards',
  'K-12.0': 'Post-2006',
  L: 'England and Wales: 2012 onwards',
  'L-post-20': 'England and Wales: 2012-2021',
  M: 'England and Wales: 2022 onwards',
  0: 'Not applicable',
  NR: 'Not recorded',
});

const NI_CONSTRUCTION_AGE_BAND = Object.freeze({
  A: 'Northern Ireland: before 1919',
  'A-12.0': 'Pre-1900',
  B: 'Northern Ireland: 1919-1929',
  'B-12.0': '1900-1929',
  C: 'Northern Ireland: 1930-1949',
  'C-12.0': '1930-1949',
  D: 'Northern Ireland: 1950-1973',
  'D-12.0': '1950-1966',
  E: 'Northern Ireland: 1974-1977',
  'E-12.0': '1967-1975',
  F: 'Northern Ireland: 1978-1985',
  'F-12.0': '1976-1982',
  G: 'Northern Ireland: 1986-1991',
  'G-12.0': '1983-1990',
  H: 'Northern Ireland: 1992-1999',
  'H-12.0': '1991-1995',
  I: 'Northern Ireland: 2000-2006',
  'I-12.0': '1996-2002',
  J: 'Northern Ireland: not applicable',
  'J-12.0': '2003-2006',
  'K-RdSAP-NI': 'Northern Ireland: 2007-2013',
  'K-SAP-NI': 'Northern Ireland: 2007 onwards',
  'K-12.0': 'Post-2006',
  L: 'Northern Ireland: 2014 onwards',
  M: 'Northern Ireland: 2022 onwards',
  0: 'Not applicable',
  NR: 'Not recorded',
});

const SAP_PRE_17 = new Set([
  'SAP-Schema-16.3', 'SAP-Schema-16.2', 'SAP-Schema-16.1', 'SAP-Schema-16.0',
  'SAP-Schema-15.0', 'SAP-Schema-14.2', 'SAP-Schema-14.1', 'SAP-Schema-14.0',
  'SAP-Schema-13.0', 'SAP-Schema-12.0', 'SAP-Schema-11.2', 'SAP-Schema-11.0',
]);

const SCHEMES_THAT_USE_L = new Set([
  'SAP-Schema-19.2.0', 'SAP-Schema-19.1.0', 'SAP-Schema-19.0.0',
  'SAP-Schema-18.0.0', 'SAP-Schema-17.1', 'SAP-Schema-17.0',
  'RdSAP-Schema-20.0.0', 'RdSAP-Schema-19.0', 'RdSAP-Schema-18.0',
  'RdSAP-Schema-17.1', 'RdSAP-Schema-17.0',
]);

const SCHEMAS_POST_20 = new Set([
  'RdSAP-Schema-21.0.1', 'RdSAP-Schema-21.0.0',
  'RdSAP-Schema-NI-21.0.0', 'RdSAP-Schema-NI-21.0.1',
]);

const SAP_SCHEMAS_NI = new Set([
  'SAP-Schema-NI-18.0.0', 'SAP-Schema-NI-17.4', 'SAP-Schema-NI-17.3',
  'SAP-Schema-NI-17.2', 'SAP-Schema-NI-17.1', 'SAP-Schema-NI-17.0',
  'SAP-Schema-NI-16.1', 'SAP-Schema-NI-16.0', 'SAP-Schema-NI-15.0',
  'SAP-Schema-NI-14.2', 'SAP-Schema-NI-14.1', 'SAP-Schema-NI-14.0',
  'SAP-Schema-NI-13.0',
]);

const RDSAP_SCHEMAS_NI = new Set([
  'RdSAP-Schema-NI-21.0.0', 'RdSAP-Schema-NI-20.0.0', 'RdSAP-Schema-NI-19.0',
  'RdSAP-Schema-NI-18.0', 'RdSAP-Schema-NI-17.4', 'RdSAP-Schema-NI-17.3',
]);

const NI_SCHEMAS_PRE_12 = new Set(['SAP-Schema-NI-12.0', 'SAP-Schema-NI-11.2']);

function isRdSapReport(reportType) {
  return reportType == null || reportType === '' || String(reportType) === '2';
}

function decodeRdSapConstructionAgeBandCode(rawCode, schemaType = null, reportType = '2') {
  if (rawCode == null || rawCode === '') {
    return {
      ok: false,
      code: null,
      periodLabel: null,
      reason: 'absent',
      source: AUTHORITATIVE_SOURCE,
    };
  }

  const code = String(rawCode).trim().toUpperCase();
  const schema = schemaType ? String(schemaType) : null;
  const rdsap = isRdSapReport(reportType);

  if (code === 'NR' || code === '0') {
    return {
      ok: false,
      code,
      periodLabel: EAW_CONSTRUCTION_AGE_BAND[code] || null,
      reason: code === 'NR' ? 'not_recorded' : 'not_applicable',
      source: AUTHORITATIVE_SOURCE,
      schemaType: schema,
    };
  }

  if (code === 'K' && schema && RDSAP_SCHEMAS_NI.has(schema)) {
    return okResult(code, NI_CONSTRUCTION_AGE_BAND['K-RdSAP-NI'], schema, 'K-RdSAP-NI');
  }
  if (code === 'K' && schema && SAP_SCHEMAS_NI.has(schema)) {
    return okResult(code, NI_CONSTRUCTION_AGE_BAND['K-SAP-NI'], schema, 'K-SAP-NI');
  }
  if (schema && NI_SCHEMAS_PRE_12.has(schema)) {
    const key = `${code}-12.0`;
    const label = NI_CONSTRUCTION_AGE_BAND[key];
    if (!label) {
      return {
        ok: false, code, periodLabel: null, reason: 'unknown_ni_pre12_code',
        source: AUTHORITATIVE_SOURCE, schemaType: schema,
      };
    }
    return okResult(code, label, schema, key);
  }
  if (schema && (SAP_SCHEMAS_NI.has(schema) || RDSAP_SCHEMAS_NI.has(schema))) {
    const label = NI_CONSTRUCTION_AGE_BAND[code];
    if (!label || /not applicable/i.test(label)) {
      return {
        ok: false, code, periodLabel: label || null,
        reason: label ? 'not_applicable' : 'unknown_ni_code',
        source: AUTHORITATIVE_SOURCE, schemaType: schema,
      };
    }
    return okResult(code, label, schema, code);
  }

  if (code === 'K' && schema === 'SAP-Schema-12.0' && rdsap) {
    return okResult(code, EAW_CONSTRUCTION_AGE_BAND['K-12.0'], schema, 'K-12.0');
  }
  if (code === 'K' && schema && SAP_PRE_17.has(schema)) {
    return okResult(code, EAW_CONSTRUCTION_AGE_BAND['K-pre-17.0'], schema, 'K-pre-17.0');
  }
  if (code === 'L' && schema && SCHEMAS_POST_20.has(schema)) {
    return okResult(code, EAW_CONSTRUCTION_AGE_BAND['L-post-20'], schema, 'L-post-20');
  }
  if (code === 'L' && schema && !SCHEMES_THAT_USE_L.has(schema) && !SCHEMAS_POST_20.has(schema)) {
    // Authoritative lookup returns the raw letter when L is not valid for schema.
    return {
      ok: false,
      code,
      periodLabel: null,
      reason: 'letter_l_not_valid_for_schema',
      source: AUTHORITATIVE_SOURCE,
      schemaType: schema,
    };
  }

  const periodLabel = EAW_CONSTRUCTION_AGE_BAND[code] || null;
  if (!periodLabel) {
    return {
      ok: false,
      code,
      periodLabel: null,
      reason: 'unknown_code',
      source: AUTHORITATIVE_SOURCE,
      schemaType: schema,
    };
  }
  return okResult(code, periodLabel, schema, code);
}

function okResult(code, periodLabel, schemaType, lookupKey) {
  return {
    ok: true,
    code,
    lookupKey,
    periodLabel,
    reason: null,
    source: AUTHORITATIVE_SOURCE,
    schemaType,
  };
}

function parseOfficialPeriodBounds(periodLabel) {
  if (!periodLabel) return null;
  const text = String(periodLabel).trim();
  if (/not recorded|not applicable|unknown/i.test(text)) return null;

  const before = text.match(/before\s+(\d{4})/i);
  if (before) {
    return { minYear: null, maxYear: Number(before[1]) - 1, label: text, openEnded: 'before' };
  }
  const onwards = text.match(/(\d{4})\s+onwards/i);
  if (onwards) {
    return { minYear: Number(onwards[1]), maxYear: null, label: text, openEnded: 'onwards' };
  }
  const range = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) {
    return { minYear: Number(range[1]), maxYear: Number(range[2]), label: text, openEnded: null };
  }
  const post = text.match(/post[- ]?(\d{4})/i);
  if (post) {
    return { minYear: Number(post[1]) + 1, maxYear: null, label: text, openEnded: 'onwards' };
  }
  return null;
}

/**
 * Safe PropertyData construction_date mapping:
 * source period must lie wholly inside exactly one provider enum.
 * No midpoint, no majority-years, no truncation.
 */
function mapPeriodBoundsToPropertyDataEnum(bounds) {
  if (!bounds) return { mappable: false, value: null, reason: 'no_bounds' };
  const { minYear, maxYear } = bounds;
  const min = minYear == null ? Number.NEGATIVE_INFINITY : minYear;
  const max = maxYear == null ? Number.POSITIVE_INFINITY : maxYear;
  if (!(min <= max)) return { mappable: false, value: null, reason: 'invalid_bounds' };

  if (max < 1914) return { mappable: true, value: 'pre_1914', reason: 'wholly_pre_1914' };
  if (min >= 2000) return { mappable: true, value: '2000_onwards', reason: 'wholly_2000_onwards' };
  if (min >= 1914 && max < 2000) {
    return { mappable: true, value: '1914_2000', reason: 'wholly_1914_2000' };
  }
  return {
    mappable: false,
    value: null,
    reason: 'period_crosses_propertydata_enum_boundary',
    bounds: { minYear: minYear ?? null, maxYear: maxYear ?? null },
  };
}

function mapOfficialPeriodLabelToPropertyData(periodLabel) {
  const bounds = parseOfficialPeriodBounds(periodLabel);
  if (!bounds) return { mappable: false, value: null, reason: 'unparsed_period', periodLabel };
  return { ...mapPeriodBoundsToPropertyDataEnum(bounds), periodLabel, bounds };
}

function mapRdSapCodeToPropertyData(rawCode, schemaType = null, reportType = '2') {
  const decoded = decodeRdSapConstructionAgeBandCode(rawCode, schemaType, reportType);
  if (!decoded.ok) {
    return {
      mappable: false,
      value: null,
      reason: decoded.reason,
      decoded,
    };
  }
  const mapped = mapOfficialPeriodLabelToPropertyData(decoded.periodLabel);
  return { ...mapped, decoded };
}

module.exports = {
  AUTHORITATIVE_SOURCE,
  EAW_CONSTRUCTION_AGE_BAND,
  NI_CONSTRUCTION_AGE_BAND,
  decodeRdSapConstructionAgeBandCode,
  parseOfficialPeriodBounds,
  mapPeriodBoundsToPropertyDataEnum,
  mapOfficialPeriodLabelToPropertyData,
  mapRdSapCodeToPropertyData,
};
