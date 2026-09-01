/**
 * Structural MIME / magic-byte checks. Not malware scanning.
 */

const { ALLOWED_MIME_TYPES, filenameExtension } = require('../../architecture/privateEvidenceContract');

const PDF_MAGIC = Buffer.from('%PDF-');
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MZ_MAGIC = Buffer.from('MZ');

function startsWith(buffer, magic) {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

function looksLikeHtmlOrScript(buffer) {
  const head = buffer.subarray(0, 64).toString('utf8').replace(/^\uFEFF/, '').trim().toLowerCase();
  return head.startsWith('<!doctype')
    || head.startsWith('<html')
    || head.startsWith('<script')
    || head.startsWith('<svg')
    || head.startsWith('<?xml');
}

function detectSignature(buffer) {
  if (startsWith(buffer, PDF_MAGIC)) return 'application/pdf';
  if (startsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';
  if (startsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (startsWith(buffer, MZ_MAGIC)) return 'application/x-msdownload';
  if (looksLikeHtmlOrScript(buffer)) return 'text/html';
  return null;
}

function validateContentSignature({ buffer, mimeType, originalFilename } = {}) {
  const declared = String(mimeType || '').toLowerCase();
  const allowedExt = ALLOWED_MIME_TYPES[declared];
  if (!allowedExt) {
    const err = new Error('UNSUPPORTED_FILE_TYPE');
    err.code = 'UNSUPPORTED_FILE_TYPE';
    throw err;
  }
  const ext = filenameExtension(originalFilename);
  if (ext && !allowedExt.includes(ext)) {
    const err = new Error('EXTENSION_MISMATCH');
    err.code = 'EXTENSION_MISMATCH';
    throw err;
  }
  const detected = detectSignature(buffer);
  if (!detected) {
    const err = new Error(declared === 'application/pdf' ? 'MALFORMED_PDF' : 'SIGNATURE_MISMATCH');
    err.code = err.message;
    throw err;
  }
  if (detected !== declared) {
    const err = new Error(detected === 'text/html' || detected === 'application/x-msdownload'
      ? 'UNSUPPORTED_ACTIVE_CONTENT'
      : 'SIGNATURE_MISMATCH');
    err.code = err.message;
    throw err;
  }
  if (looksLikeHtmlOrScript(buffer) && declared !== 'application/pdf') {
    const err = new Error('UNSUPPORTED_ACTIVE_CONTENT');
    err.code = 'UNSUPPORTED_ACTIVE_CONTENT';
    throw err;
  }
  return { mimeType: declared, detectedSignature: detected };
}

module.exports = {
  detectSignature,
  validateContentSignature,
};
