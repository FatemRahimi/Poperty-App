/**
 * Deterministic parser for ONS Census 2021 TS054 Tenure LTLA CSV (edition 2021 v4).
 * Historical Census household tenure. Raw categories preserved. No shares.
 */

const crypto = require('crypto');
const {
  CENSUS2021_TS054_SOURCE,
  CENSUS2021_TS054_DATASET,
  CENSUS2021_TS054_DATASET_ID,
  CENSUS2021_TS054_EDITION,
  CENSUS2021_TS054_VERSION,
  CENSUS2021_TS054_SOURCE_PRODUCT,
  CENSUS2021_TS054_RELEASE_LABEL,
  CENSUS2021_TS054_REFERENCE_PERIOD,
  CENSUS2021_TS054_RELEASE_DATE,
  CENSUS2021_TS054_VERSION_DATE,
  CENSUS2021_TS054_GEOGRAPHY_TYPE,
  CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
  CENSUS2021_TS054_HEADERS,
  CENSUS2021_TS054_CATEGORY_BY_CODE,
  CENSUS2021_TS054_AGGREGATES,
  CENSUS2021_TS054_PROVENANCE,
  CENSUS2021_TS054_LIMITATIONS,
  MARKET_RECORD_KIND,
  isEnglandWalesLadGssCode,
} = require('../../architecture/officialAreaEconomicDataset');

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  const text = String(line || '').replace(/\r$/, '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((value) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
}

function blank(value) {
  if (value == null || String(value).trim() === '') return null;
  return String(value).trim();
}

function parseHouseholdCount(raw) {
  if (raw == null || raw === '') return { ok: false, reason: 'missing_household_count' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'non_numeric_household_count' };
    if (!Number.isInteger(raw)) return { ok: false, reason: 'non_integer_household_count' };
    if (raw < 0) return { ok: false, reason: 'negative_household_count' };
    return { ok: true, value: raw, present: true };
  }
  const text = String(raw).trim();
  if (!text) return { ok: false, reason: 'missing_household_count' };
  if (/^-?\d+\.\d+$/.test(text)) return { ok: false, reason: 'non_integer_household_count' };
  if (!/^-?\d+$/.test(text)) return { ok: false, reason: 'non_numeric_household_count' };
  const number = Number(text);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return { ok: false, reason: 'non_integer_household_count' };
  }
  if (number < 0) return { ok: false, reason: 'negative_household_count' };
  return { ok: true, value: number, present: true };
}

function contentFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify({
    geographyCode: row.geographyCode,
    geographyVintage: row.geographyVintage,
    referencePeriod: row.referencePeriod,
    categoryCode: row.categoryCode,
    categoryLabel: row.categoryLabel,
    householdCount: row.householdCount,
    releaseLabel: row.releaseLabel,
    datasetId: row.datasetId,
    edition: row.edition,
    version: row.version,
  })).digest('hex');
}

function headerIndexFromFields(headerFields) {
  const index = {};
  const expected = Object.values(CENSUS2021_TS054_HEADERS);
  headerFields.forEach((name, i) => {
    const normalized = blank(name);
    if (!normalized) return;
    expected.forEach((header) => {
      if (normalized === header) index[header] = i;
    });
  });
  const missing = expected.filter((header) => index[header] == null);
  return { index, missing };
}

function parseTenureRow(fields, headerIndex, options = {}) {
  const read = (header) => {
    const i = headerIndex[header];
    if (i == null) return null;
    return fields[i];
  };
  const geographyCode = blank(read(CENSUS2021_TS054_HEADERS.geographyCode));
  if (!geographyCode || !isEnglandWalesLadGssCode(geographyCode)) {
    return { ok: false, reason: 'invalid_lad_code' };
  }
  const categoryCode = blank(read(CENSUS2021_TS054_HEADERS.categoryCode));
  const expected = categoryCode ? CENSUS2021_TS054_CATEGORY_BY_CODE[categoryCode] : null;
  if (!expected) {
    return { ok: false, reason: 'unsupported_tenure_category', geographyCode, categoryCode };
  }
  const categoryLabel = blank(read(CENSUS2021_TS054_HEADERS.categoryLabel));
  if (categoryLabel !== expected.label) {
    return {
      ok: false,
      reason: 'tenure_category_label_mismatch',
      geographyCode,
      categoryCode,
      categoryLabel,
    };
  }
  const count = parseHouseholdCount(read(CENSUS2021_TS054_HEADERS.observation));
  if (!count.ok) return { ok: false, reason: count.reason, geographyCode, categoryCode };

  const row = {
    source: CENSUS2021_TS054_SOURCE,
    dataset: CENSUS2021_TS054_DATASET,
    datasetId: CENSUS2021_TS054_DATASET_ID,
    edition: CENSUS2021_TS054_EDITION,
    version: CENSUS2021_TS054_VERSION,
    sourceProduct: CENSUS2021_TS054_SOURCE_PRODUCT,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    geographyType: CENSUS2021_TS054_GEOGRAPHY_TYPE,
    geographyVintage: options.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
    geographyCode,
    geographyName: blank(read(CENSUS2021_TS054_HEADERS.geographyName)),
    categoryCode: expected.code,
    categoryLabel: expected.label,
    householdCount: count.value,
    referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
    releaseLabel: options.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL,
    releaseDate: CENSUS2021_TS054_RELEASE_DATE,
    versionDate: CENSUS2021_TS054_VERSION_DATE,
    historicalCensusContext: true,
    ingestedAt: options.ingestedAt || null,
    limitations: CENSUS2021_TS054_LIMITATIONS.slice(),
    provenance: {
      ...CENSUS2021_TS054_PROVENANCE,
      sourceProduct: CENSUS2021_TS054_SOURCE_PRODUCT,
      datasetId: CENSUS2021_TS054_DATASET_ID,
      edition: CENSUS2021_TS054_EDITION,
      version: CENSUS2021_TS054_VERSION,
      datasetVersion: options.releaseLabel || CENSUS2021_TS054_RELEASE_LABEL,
      releaseDate: CENSUS2021_TS054_VERSION_DATE,
      originalReleaseDate: CENSUS2021_TS054_RELEASE_DATE,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      geographyVintage: options.geographyVintage || CENSUS2021_TS054_GEOGRAPHY_VINTAGE,
      historicalCensusContext: true,
      metricNature: 'CENSUS_OBSERVATION',
      ingestedAt: options.ingestedAt || null,
    },
  };
  row.contentFingerprint = contentFingerprint(row);
  return { ok: true, row };
}

function parseCensus2021Ts054TenureCsv(text, options = {}) {
  const lines = String(text || '').split(/\n/).filter((line) => line.replace(/\r$/, '').trim());
  if (!lines.length) return { header: false, rows: [], rejected: [{ reason: 'empty_file' }] };
  const headerFields = parseCsvLine(lines[0]);
  const { index, missing } = headerIndexFromFields(headerFields);
  if (missing.length) {
    return {
      header: false,
      rows: [],
      rejected: [{ reason: 'missing_required_header', missing }],
    };
  }
  const rows = [];
  const rejected = [];
  lines.slice(1).forEach((line, offset) => {
    const fields = parseCsvLine(line);
    if (!fields || fields.every((value) => value == null)) return;
    const parsed = parseTenureRow(fields, index, options);
    if (!parsed.ok) {
      rejected.push({
        line: offset + 2,
        reason: parsed.reason,
        geographyCode: parsed.geographyCode || null,
        categoryCode: parsed.categoryCode || null,
        categoryLabel: parsed.categoryLabel || null,
      });
    } else {
      rows.push(parsed.row);
    }
  });
  return { header: true, rows, rejected };
}

function buildTenureAggregates(observations) {
  const byCode = new Map();
  (observations || []).forEach((row) => {
    byCode.set(String(row.categoryCode), row);
  });
  return Object.values(CENSUS2021_TS054_AGGREGATES).map((aggregate) => {
    const components = aggregate.componentCodes.map((code) => {
      const row = byCode.get(String(code));
      return {
        categoryCode: code,
        categoryLabel: row ? row.categoryLabel : (CENSUS2021_TS054_CATEGORY_BY_CODE[code]?.label || null),
        householdCount: row ? row.householdCount : null,
        present: row != null && row.householdCount != null,
      };
    });
    const missingComponent = components.some((item) => !item.present);
    const householdCount = missingComponent
      ? null
      : components.reduce((sum, item) => sum + item.householdCount, 0);
    return {
      aggregateId: aggregate.id,
      recordKind: MARKET_RECORD_KIND.DERIVED_METRIC,
      factClass: 'DERIVED',
      aggregationKind: 'SOURCE_DIRECTED_AGGREGATION',
      householdCount,
      unit: 'HOUSEHOLDS',
      componentCodes: aggregate.componentCodes.slice(),
      components,
      calculationMethod: `sum(${aggregate.componentCodes.join(' + ')})`,
      note: aggregate.note,
      referencePeriod: CENSUS2021_TS054_REFERENCE_PERIOD,
      complete: !missingComponent,
    };
  });
}

module.exports = {
  parseCensus2021Ts054TenureCsv,
  parseHouseholdCount,
  contentFingerprint,
  buildTenureAggregates,
  CENSUS2021_TS054_HEADERS,
};
