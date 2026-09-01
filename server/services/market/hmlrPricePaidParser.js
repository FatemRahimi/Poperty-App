/**
 * Stream-safe HMLR Price Paid Data and lookup parsers.
 * Does not download, query providers, or infer missing prices as zero.
 */

const { MATCH_METHOD } = require('../../architecture/officialSaleTransaction');

const SOURCE = 'HMLR_PRICE_PAID_DATA';

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
    if (trimmed === '') return null;
    return trimmed;
  });
}

function compactPostcode(value) {
  if (!value) return null;
  const compact = String(value).toUpperCase().replace(/\s+/g, '');
  return compact || null;
}

function parsePositivePrice(raw) {
  if (raw == null || raw === '') {
    return { present: false, value: null, invalid: false };
  }
  const n = Number(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n)) return { present: false, value: null, invalid: true };
  if (n <= 0) return { present: false, value: null, invalid: true };
  return { present: true, value: n, invalid: false };
}

function parseIsoDate(raw) {
  if (!raw) return null;
  const text = String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function parsePpdRow(line, { datasetVersion = null, retrievedAt = null } = {}) {
  const fields = parseCsvLine(line);
  if (!fields.length || fields.every((value) => value == null)) {
    return { ok: false, reason: 'empty' };
  }
  const sourceTransactionId = fields[0];
  if (!sourceTransactionId) return { ok: false, reason: 'missing_source_id' };

  const price = parsePositivePrice(fields[1]);
  if (price.invalid) return { ok: false, reason: 'invalid_price', sourceTransactionId };

  const recordStatus = fields[15] || 'A';
  const transferDate = parseIsoDate(fields[2]);
  const postcode = fields[3];
  const row = {
    source: SOURCE,
    source_transaction_id: sourceTransactionId,
    record_status: recordStatus,
    live: recordStatus !== 'D',
    price_gbp: price.present ? price.value : null,
    price_present: price.present,
    transfer_date: transferDate,
    postcode,
    postcode_compact: compactPostcode(postcode),
    property_type_code: fields[4],
    new_build_indicator: fields[5],
    tenure_code: fields[6],
    paon: fields[7],
    saon: fields[8],
    street: fields[9],
    locality: fields[10],
    town_city: fields[11],
    district: fields[12],
    county: fields[13],
    category_type: fields[14],
    uprn: null,
    inspire_id: null,
    match_method: MATCH_METHOD.UNMATCHED,
    dataset_version: datasetVersion,
    retrieved_at: retrievedAt,
    evidence_as_of: transferDate,
    provenance: {
      source: SOURCE,
      dataset: 'Price Paid Data',
      method: 'hmlr_price_paid_file',
      datasetVersion,
    },
    limitations: [
      'Official completed sale is not a current valuation.',
      'UPRN is not a title number.',
      'INSPIRE ID is not a title number.',
    ],
  };
  if (recordStatus === 'D') {
    return { ok: true, deleted: true, row };
  }
  return { ok: true, deleted: false, row };
}

function parseLookupRow(line) {
  const fields = parseCsvLine(line);
  const sourceTransactionId = fields[0];
  const linked = fields[1];
  if (!sourceTransactionId || !linked) return null;
  return { sourceTransactionId, value: linked };
}

module.exports = {
  SOURCE,
  parseCsvLine,
  compactPostcode,
  parsePositivePrice,
  parseIsoDate,
  parsePpdRow,
  parseLookupRow,
};
