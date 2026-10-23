/**
 * Streaming reader for the official Planning Data brownfield-land CSV.
 * Records are adapted into the existing entity-object parser.
 * This is not a second evidence parser.
 *
 * Memory: bytes are consumed from the file stream. Accepted observations are
 * retained once for the Phase 3D atomic batch. The raw file is not also kept
 * as a string.
 */

const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const { parseBrownfieldEntity } = require('./brownfieldLandParser');

const REQUIRED_COLUMNS = Object.freeze(['dataset', 'entity', 'entry-date']);

function createCsvRecordReader(onHeader, onRecord) {
  let field = '';
  let row = [];
  let quotes = false;
  let header = null;
  const decoder = new StringDecoder('utf8');

  function finishRow() {
    row.push(field);
    field = '';
    const current = row;
    row = [];
    if (current.every((cell) => cell === '')) return;
    if (!header) {
      header = current.map((cell) => cell.replace(/^\uFEFF/, ''));
      onHeader(header);
      return;
    }
    const record = {};
    header.forEach((key, index) => {
      record[key] = current[index] == null ? '' : current[index];
    });
    onRecord(record);
  }

  function consume(text) {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quotes) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        quotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[index + 1] === '\n') index += 1;
        finishRow();
      } else {
        field += char;
      }
    }
  }

  return {
    push(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      consume(decoder.write(buffer));
    },
    end() {
      consume(decoder.end());
      if (quotes) {
        const error = new Error('brownfield_artifact_truncated_csv');
        error.code = 'brownfield_artifact_truncated_csv';
        throw error;
      }
      if (field.length || row.length) finishRow();
      return header;
    },
  };
}

function assertBrownfieldCsvHeader(header) {
  const names = new Set(header || []);
  const missing = REQUIRED_COLUMNS.filter((column) => !names.has(column));
  if (!header || missing.length) {
    const error = new Error('brownfield_artifact_invalid_header');
    error.code = 'brownfield_artifact_invalid_header';
    error.missing = missing;
    throw error;
  }
}

function headerFromSample(sample) {
  const text = Buffer.isBuffer(sample) ? sample.toString('utf8') : String(sample || '');
  const newlineAt = text.search(/\r?\n/);
  if (newlineAt < 0) {
    const error = new Error('brownfield_artifact_invalid_header');
    error.code = 'brownfield_artifact_invalid_header';
    throw error;
  }
  const reader = createCsvRecordReader((header) => {
    assertBrownfieldCsvHeader(header);
  }, () => {});
  reader.push(text.slice(0, newlineAt + 1));
  reader.end();
}

async function parseBrownfieldCsvFile(filePath, options = {}) {
  const rows = [];
  const rejected = [];
  let dataRows = 0;
  let header = null;
  const reader = createCsvRecordReader((parsedHeader) => {
    header = parsedHeader;
    assertBrownfieldCsvHeader(parsedHeader);
  }, (record) => {
    dataRows += 1;
    const parsed = parseBrownfieldEntity(record, options);
    if (!parsed.ok) {
      rejected.push({ index: dataRows, reason: parsed.reason, entity: record.entity || null });
      return;
    }
    rows.push(parsed.row);
  });
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      try {
        reader.push(chunk);
      } catch (error) {
        stream.destroy(error);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      try {
        reader.end();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  if (!header) {
    const error = new Error('brownfield_artifact_invalid_header');
    error.code = 'brownfield_artifact_invalid_header';
    throw error;
  }
  return { rows, rejected, dataRows };
}

module.exports = {
  REQUIRED_COLUMNS,
  createCsvRecordReader,
  assertBrownfieldCsvHeader,
  headerFromSample,
  parseBrownfieldCsvFile,
};
