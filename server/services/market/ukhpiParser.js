/**
 * Deterministic UK House Price Index row parser.
 * Does not download, call a model, or turn a blank metric into zero.
 */

const crypto = require('crypto');
const { UKHPI_PROVENANCE } = require('../../architecture/officialMarketDataset');

const SOURCE = 'UK_HOUSE_PRICE_INDEX';
const DATASET = 'UK House Price Index';

const HEADER_MAP = Object.freeze({
  date: 'observationDate',
  regionname: 'geographyName',
  areacode: 'geographyCode',
  geographytype: 'geographyType',
  averageprice: 'averagePrice',
  index: 'indexValue',
  '1m%change': 'monthlyChange',
  '12m%change': 'annualChange',
  propertycategory: 'propertyCategory',
});

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

function normaliseHeader(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function parseObservationDate(raw) {
  if (!raw) return null;
  const text = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function parseMetric(raw) {
  if (raw == null || raw === '') return { value: null, invalid: false };
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function contentFingerprint(observation) {
  const payload = JSON.stringify({
    geographyCode: observation.geographyCode,
    observationDate: observation.observationDate,
    propertyCategory: observation.propertyCategory,
    indexValue: observation.indexValue,
    averagePrice: observation.averagePrice,
    annualChange: observation.annualChange,
    monthlyChange: observation.monthlyChange,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function parseUkhpiRow(fields, headerIndex, options = {}) {
  const read = (name) => {
    const index = headerIndex[name];
    if (index == null) return null;
    return fields[index] == null ? null : fields[index];
  };
  const observationDate = parseObservationDate(read('observationDate'));
  const geographyCode = read('geographyCode');
  if (!observationDate || !geographyCode) {
    return { ok: false, reason: 'missing_geography_or_date' };
  }
  const metrics = ['indexValue', 'averagePrice', 'annualChange', 'monthlyChange'];
  const parsed = {};
  for (const key of metrics) {
    const metric = parseMetric(read(key));
    if (metric.invalid) return { ok: false, reason: `invalid_${key}` };
    parsed[key] = metric.value;
  }
  const observation = {
    source: SOURCE,
    dataset: DATASET,
    geographyCode: String(geographyCode),
    geographyName: read('geographyName'),
    geographyType: read('geographyType') || options.geographyType || null,
    observationDate,
    indexValue: parsed.indexValue,
    averagePrice: parsed.averagePrice,
    annualChange: parsed.annualChange,
    monthlyChange: parsed.monthlyChange,
    propertyCategory: read('propertyCategory') || options.propertyCategory || 'all',
    releaseLabel: options.releaseLabel || null,
    datasetVersion: options.releaseLabel || null,
    ingestedAt: options.ingestedAt || null,
    provenance: {
      ...UKHPI_PROVENANCE,
      releaseDate: options.releaseLabel || null,
      datasetVersion: options.releaseLabel || null,
      ingestedAt: options.ingestedAt || null,
    },
  };
  observation.contentFingerprint = contentFingerprint(observation);
  return { ok: true, observation };
}

function parseUkhpiCsv(text, options = {}) {
  const lines = String(text || '').split(/\n/).map((line) => line.replace(/\r$/, '')).filter((line) => line.trim());
  if (!lines.length) return { header: false, rows: [], rejected: [{ reason: 'empty_file' }] };
  const headerFields = parseCsvLine(lines[0]).map(normaliseHeader);
  const headerIndex = {};
  headerFields.forEach((name, index) => {
    const mapped = HEADER_MAP[name];
    if (mapped) headerIndex[mapped] = index;
  });
  if (headerIndex.observationDate == null || headerIndex.geographyCode == null) {
    return { header: false, rows: [], rejected: [{ reason: 'missing_required_header' }] };
  }
  const rows = [];
  const rejected = [];
  lines.slice(1).forEach((line, offset) => {
    const parsed = parseUkhpiRow(parseCsvLine(line), headerIndex, options);
    if (!parsed.ok) rejected.push({ line: offset + 2, reason: parsed.reason });
    else rows.push(parsed.observation);
  });
  return { header: true, rows, rejected };
}

module.exports = {
  SOURCE,
  DATASET,
  HEADER_MAP,
  parseMetric,
  parseUkhpiCsv,
  contentFingerprint,
};
