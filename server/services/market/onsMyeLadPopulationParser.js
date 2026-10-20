/**
 * Deterministic parser for ONS Explore Local Statistics population-count ltla CSV.
 * Official mid-year population ESTIMATES. No growth calculation. No name joins.
 */

const crypto = require('crypto');
const {
  ONS_MYE_SOURCE,
  ONS_MYE_DATASET,
  ONS_MYE_SOURCE_PRODUCT,
  ONS_MYE_RELEASE_LABEL,
  ONS_MYE_GEOGRAPHY_TYPE,
  ONS_MYE_GEOGRAPHY_VINTAGE,
  ONS_MYE_INDICATOR,
  ONS_MYE_HEADERS,
  ONS_MYE_PROVENANCE,
  ONS_MYE_LIMITATIONS,
  MARKET_RECORD_KIND,
  isLadGssCode,
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

function parseObservationDate(raw) {
  const text = blank(raw);
  if (!text) return { ok: false, reason: 'missing_period' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, reason: 'invalid_period' };
  return { ok: true, value: text };
}

function parsePopulationCount(raw) {
  if (raw == null || raw === '') return { ok: false, reason: 'missing_population' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'non_numeric_population' };
    if (!Number.isInteger(raw)) return { ok: false, reason: 'non_integer_population' };
    if (raw < 0) return { ok: false, reason: 'negative_population' };
    return { ok: true, value: raw, present: true };
  }
  const text = String(raw).trim();
  if (!text) return { ok: false, reason: 'missing_population' };
  if (/^-?\d+\.\d+$/.test(text)) return { ok: false, reason: 'non_integer_population' };
  if (!/^-?\d+$/.test(text)) return { ok: false, reason: 'non_numeric_population' };
  const number = Number(text);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return { ok: false, reason: 'non_integer_population' };
  }
  if (number < 0) return { ok: false, reason: 'negative_population' };
  return { ok: true, value: number, present: true };
}

function contentFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify({
    geographyCode: row.geographyCode,
    geographyVintage: row.geographyVintage,
    observationDate: row.observationDate,
    totalUsualResidentPopulation: row.totalUsualResidentPopulation,
    releaseLabel: row.releaseLabel,
    indicator: row.indicator,
  })).digest('hex');
}

function headerIndexFromFields(headerFields) {
  const index = {};
  const expected = Object.values(ONS_MYE_HEADERS);
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

function parsePopulationRow(fields, headerIndex, options = {}) {
  const read = (header) => {
    const i = headerIndex[header];
    if (i == null) return null;
    return fields[i];
  };
  const indicator = blank(read(ONS_MYE_HEADERS.indicator));
  if (indicator !== ONS_MYE_INDICATOR) {
    return { ok: false, reason: 'unsupported_indicator', indicator };
  }
  const geographyCode = blank(read(ONS_MYE_HEADERS.geographyCode));
  if (!geographyCode || !isLadGssCode(geographyCode)) {
    return { ok: false, reason: 'invalid_lad_code' };
  }
  const period = parseObservationDate(read(ONS_MYE_HEADERS.period));
  if (!period.ok) return { ok: false, reason: period.reason, geographyCode };
  const population = parsePopulationCount(read(ONS_MYE_HEADERS.value));
  if (!population.ok) return { ok: false, reason: population.reason, geographyCode };

  const row = {
    source: ONS_MYE_SOURCE,
    dataset: ONS_MYE_DATASET,
    sourceProduct: ONS_MYE_SOURCE_PRODUCT,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    indicator: ONS_MYE_INDICATOR,
    geographyType: ONS_MYE_GEOGRAPHY_TYPE,
    geographyVintage: options.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE,
    geographyCode,
    geographyName: blank(read(ONS_MYE_HEADERS.geographyName)),
    observationDate: period.value,
    totalUsualResidentPopulation: population.value,
    releaseLabel: options.releaseLabel || ONS_MYE_RELEASE_LABEL,
    ingestedAt: options.ingestedAt || null,
    limitations: ONS_MYE_LIMITATIONS.slice(),
    provenance: {
      ...ONS_MYE_PROVENANCE,
      sourceProduct: ONS_MYE_SOURCE_PRODUCT,
      // datasetVersion / releaseLabel = mid-year edition family; not publication date.
      datasetVersion: options.releaseLabel || ONS_MYE_RELEASE_LABEL,
      releaseDate: ONS_MYE_PROVENANCE.releaseDate,
      referencePeriod: period.value,
      ingestedAt: options.ingestedAt || null,
      geographyVintage: options.geographyVintage || ONS_MYE_GEOGRAPHY_VINTAGE,
      metricNature: 'ESTIMATE',
    },
  };
  row.contentFingerprint = contentFingerprint(row);
  return { ok: true, row };
}

function parseOnsMyeLadPopulationCsv(text, options = {}) {
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
    const parsed = parsePopulationRow(fields, index, options);
    if (!parsed.ok) {
      rejected.push({
        line: offset + 2,
        reason: parsed.reason,
        geographyCode: parsed.geographyCode || null,
        indicator: parsed.indicator || null,
      });
    } else {
      rows.push(parsed.row);
    }
  });
  return { header: true, rows, rejected };
}

module.exports = {
  parseOnsMyeLadPopulationCsv,
  parsePopulationCount,
  parseObservationDate,
  contentFingerprint,
  ONS_MYE_HEADERS,
};
