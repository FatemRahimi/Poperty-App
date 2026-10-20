/**
 * Deterministic parser for MHCLG IoD 2025 File 10 v2 IMD sheet.
 * Exact headers only. No fuzzy column binding. No name-based geography.
 */

const crypto = require('crypto');
const XLSX = require('xlsx');
const {
  IOD2025_SOURCE,
  IOD2025_DATASET,
  IOD2025_SOURCE_PRODUCT,
  IOD2025_RELEASE_LABEL,
  IOD2025_GEOGRAPHY_TYPE,
  IOD2025_GEOGRAPHY_VINTAGE,
  IOD2025_SHEET_NAME,
  IOD2025_HEADERS,
  IOD2025_PROVENANCE,
  IOD2025_LIMITATIONS,
  MARKET_RECORD_KIND,
  isEnglandLadGssCode,
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

function parseOptionalNumber(raw, { integer = false } = {}) {
  if (raw == null || raw === '') return { ok: true, value: null, present: false };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'non_numeric_metric' };
    const value = integer ? Math.trunc(raw) : raw;
    return { ok: true, value, present: true };
  }
  const text = String(raw).trim();
  if (!text) return { ok: true, value: null, present: false };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, reason: 'non_numeric_metric' };
  const number = Number(text);
  if (!Number.isFinite(number)) return { ok: false, reason: 'non_numeric_metric' };
  return { ok: true, value: integer ? Math.trunc(number) : number, present: true };
}

function contentFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify({
    geographyCode: row.geographyCode,
    geographyVintage: row.geographyVintage,
    imdAverageScore: row.imdAverageScore,
    imdRankOfAverageScore: row.imdRankOfAverageScore,
    imdProportionMostDeprived10: row.imdProportionMostDeprived10,
    releaseLabel: row.releaseLabel,
  })).digest('hex');
}

function headerIndexFromFields(headerFields) {
  const index = {};
  const expected = Object.values(IOD2025_HEADERS);
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

function parseIodRow(fields, headerIndex, options = {}) {
  const read = (header) => {
    const i = headerIndex[header];
    if (i == null) return null;
    return fields[i];
  };
  const geographyCode = blank(read(IOD2025_HEADERS.geographyCode));
  if (!geographyCode || !isEnglandLadGssCode(geographyCode)) {
    return { ok: false, reason: 'invalid_lad_code' };
  }
  const average = parseOptionalNumber(read(IOD2025_HEADERS.averageScore));
  if (!average.ok) return { ok: false, reason: average.reason, geographyCode };
  const rank = parseOptionalNumber(read(IOD2025_HEADERS.rankOfAverageScore), { integer: true });
  if (!rank.ok) return { ok: false, reason: rank.reason, geographyCode };
  const proportion = parseOptionalNumber(read(IOD2025_HEADERS.proportionMostDeprived10));
  if (!proportion.ok) return { ok: false, reason: proportion.reason, geographyCode };

  const row = {
    source: IOD2025_SOURCE,
    dataset: IOD2025_DATASET,
    sourceProduct: IOD2025_SOURCE_PRODUCT,
    recordKind: MARKET_RECORD_KIND.OFFICIAL_OBSERVATION,
    geographyType: IOD2025_GEOGRAPHY_TYPE,
    geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
    geographyCode,
    geographyName: blank(read(IOD2025_HEADERS.geographyName)),
    imdAverageScore: average.value,
    imdRankOfAverageScore: rank.value,
    imdProportionMostDeprived10: proportion.value,
    releaseLabel: options.releaseLabel || IOD2025_RELEASE_LABEL,
    ingestedAt: options.ingestedAt || null,
    limitations: IOD2025_LIMITATIONS.slice(),
    provenance: {
      ...IOD2025_PROVENANCE,
      sourceProduct: IOD2025_SOURCE_PRODUCT,
      datasetVersion: options.releaseLabel || IOD2025_RELEASE_LABEL,
      ingestedAt: options.ingestedAt || null,
      geographyVintage: IOD2025_GEOGRAPHY_VINTAGE,
    },
  };
  row.contentFingerprint = contentFingerprint(row);
  return { ok: true, row };
}

function parseMatrix(matrix, options = {}) {
  if (!Array.isArray(matrix) || !matrix.length) {
    return { header: false, rows: [], rejected: [{ reason: 'empty_file' }] };
  }
  const headerFields = matrix[0].map((value) => (value == null ? null : String(value)));
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
  matrix.slice(1).forEach((fields, offset) => {
    if (!fields || fields.every((value) => value == null || String(value).trim() === '')) return;
    const parsed = parseIodRow(fields, index, options);
    if (!parsed.ok) rejected.push({ line: offset + 2, reason: parsed.reason, geographyCode: parsed.geographyCode || null });
    else rows.push(parsed.row);
  });
  return { header: true, rows, rejected, sheetName: IOD2025_SHEET_NAME };
}

function parseIodFile10ImdCsv(text, options = {}) {
  const lines = String(text || '').split(/\n/).filter((line) => line.replace(/\r$/, '').trim());
  const matrix = lines.map((line) => parseCsvLine(line));
  return parseMatrix(matrix, options);
}

function parseIodFile10Xlsx(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'array', cellDates: false });
  const sheet = workbook.Sheets[IOD2025_SHEET_NAME];
  if (!sheet) {
    return {
      header: false,
      rows: [],
      rejected: [{ reason: 'missing_imd_sheet', availableSheets: workbook.SheetNames.slice() }],
    };
  }
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  return parseMatrix(matrix, options);
}

module.exports = {
  parseIodFile10ImdCsv,
  parseIodFile10Xlsx,
  parseOptionalNumber,
  contentFingerprint,
  IOD2025_HEADERS,
};
