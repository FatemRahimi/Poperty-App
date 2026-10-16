/**
 * Fixture/import parser for an ONS-style postcode geography extract.
 * Codes come from columns. Names are labels. Nothing is inferred.
 */

const crypto = require('crypto');
const { canonicalPostcode } = require('./canonicalPostcode');
const {
  GEOGRAPHY_LIMITATIONS,
  MARKET_RECORD_KIND,
  ONS_POSTCODE_DIRECTORY_PROVENANCE,
} = require('../../architecture/officialMarketDataset');

const SOURCE = 'ONS_POSTCODE_DIRECTORY';
const DATASET = 'ONS Postcode Directory';

const HEADER_MAP = Object.freeze({
  postcode: 'postcode',
  countrycode: 'countryCode',
  countryname: 'countryName',
  localauthoritycode: 'localAuthorityCode',
  localauthorityname: 'localAuthorityName',
  ukhpigeographycode: 'ukhpiGeographyCode',
  ukhpigeographyname: 'ukhpiGeographyName',
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

function blank(value) {
  if (value == null || String(value).trim() === '') return null;
  return String(value).trim();
}

function contentFingerprint(row) {
  return crypto.createHash('sha256').update(JSON.stringify({
    normalizedPostcode: row.normalizedPostcode,
    countryCode: row.countryCode,
    countryName: row.countryName,
    localAuthorityCode: row.localAuthorityCode,
    localAuthorityName: row.localAuthorityName,
    ukhpiGeographyCode: row.ukhpiGeographyCode,
    ukhpiGeographyName: row.ukhpiGeographyName,
  })).digest('hex');
}

function parseGeographyRow(fields, headerIndex, options = {}) {
  const read = (name) => {
    const index = headerIndex[name];
    if (index == null) return null;
    return blank(fields[index]);
  };
  const postcode = canonicalPostcode(read('postcode'));
  if (!postcode.ok) return { ok: false, reason: 'invalid_postcode' };
  const row = {
    source: SOURCE,
    dataset: DATASET,
    recordKind: MARKET_RECORD_KIND.GEOGRAPHY_CROSSWALK,
    normalizedPostcode: postcode.normalized,
    postcodeCompact: postcode.compact,
    countryCode: read('countryCode'),
    countryName: read('countryName'),
    localAuthorityCode: read('localAuthorityCode'),
    localAuthorityName: read('localAuthorityName'),
    ukhpiGeographyCode: read('ukhpiGeographyCode'),
    ukhpiGeographyName: read('ukhpiGeographyName'),
    releaseLabel: options.releaseLabel || 'unspecified',
    ingestedAt: options.ingestedAt || null,
    limitations: GEOGRAPHY_LIMITATIONS.slice(),
    provenance: {
      ...ONS_POSTCODE_DIRECTORY_PROVENANCE,
      releaseDate: options.releaseLabel || null,
      datasetVersion: options.releaseLabel || null,
      ingestedAt: options.ingestedAt || null,
      geographicCoverage: options.geographicCoverage || null,
    },
  };
  row.contentFingerprint = contentFingerprint(row);
  return { ok: true, row };
}

function parseGeographyCsv(text, options = {}) {
  const lines = String(text || '').split(/\n/).map((line) => line.replace(/\r$/, '')).filter((line) => line.trim());
  if (!lines.length) return { header: false, rows: [], rejected: [{ reason: 'empty_file' }] };
  const headerFields = parseCsvLine(lines[0]).map((value) => String(value || '').toLowerCase().replace(/\s+/g, ''));
  const headerIndex = {};
  headerFields.forEach((name, index) => {
    const mapped = HEADER_MAP[name];
    if (mapped) headerIndex[mapped] = index;
  });
  if (headerIndex.postcode == null) {
    return { header: false, rows: [], rejected: [{ reason: 'missing_postcode_header' }] };
  }
  const rows = [];
  const rejected = [];
  lines.slice(1).forEach((line, offset) => {
    const parsed = parseGeographyRow(parseCsvLine(line), headerIndex, options);
    if (!parsed.ok) rejected.push({ line: offset + 2, reason: parsed.reason });
    else rows.push(parsed.row);
  });
  return { header: true, rows, rejected };
}

module.exports = {
  SOURCE,
  DATASET,
  HEADER_MAP,
  parseGeographyCsv,
  contentFingerprint,
};
