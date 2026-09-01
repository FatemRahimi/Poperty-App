/**
 * Owner-authorized private legal evidence endpoints.
 * Never expose storage keys or filesystem paths.
 */

const multer = require('multer');
const {
  MAX_EVIDENCE_BYTES,
} = require('../architecture/privateEvidenceContract');
const {
  ingestPrivateLegalDocument,
  listReadableDocuments,
  archiveReadableDocument,
  readAuthorizedFile,
  publicError,
} = require('../services/evidence/privateEvidenceIngest');

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1 },
}).single('document');

function sendIngestError(res, error) {
  const mapped = error.expose
    ? { status: error.status, code: error.code, message: error.message }
    : publicError(error.code || 'MALFORMED_UPLOAD');
  return res.status(mapped.status || 400).json({
    success: false,
    code: mapped.code,
    message: mapped.message,
  });
}

function handleEvidenceUpload(req, res, next) {
  evidenceUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        ...publicError('FILE_TOO_LARGE'),
      });
    }
    return res.status(400).json({
      success: false,
      ...publicError('MALFORMED_UPLOAD'),
    });
  });
}

async function uploadLegalEvidence(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, ...publicError('UNAUTHENTICATED') });
    }
    const result = await ingestPrivateLegalDocument({
      userId: req.user.id,
      userRole: req.user.role,
      file: req.file,
      documentType: req.body?.documentType,
      sourceType: req.body?.sourceType,
      propertyId: req.body?.propertyId || null,
      subjectId: req.body?.subjectId || null,
      subjectKind: req.body?.subjectKind || null,
      subjectKey: req.body?.subjectKey || null,
      documentDate: req.body?.documentDate || null,
      declaredTitleNumber: req.body?.titleNumber || req.body?.declaredTitleNumber || null,
      declaredTenure: req.body?.declaredTenure || null,
      uprn: req.body?.uprn || null,
      supersededDocumentId: req.body?.supersededDocumentId || null,
    });
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      document: result.document,
    });
  } catch (error) {
    return sendIngestError(res, error);
  }
}

async function listLegalEvidence(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, ...publicError('UNAUTHENTICATED') });
    }
    const documents = await listReadableDocuments({
      userId: req.user.id,
      role: req.user.role,
      propertyId: req.query.propertyId || null,
      subjectId: req.query.subjectId || null,
    });
    return res.json({ success: true, documents });
  } catch (error) {
    return sendIngestError(res, error);
  }
}

async function getLegalEvidence(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, ...publicError('UNAUTHENTICATED') });
    }
    const { getReadableDocument, toSafeRecord } = require('../services/evidence/privateEvidenceIngest');
    const record = await getReadableDocument(req.params.documentId, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.json({ success: true, document: toSafeRecord(record) });
  } catch (error) {
    return sendIngestError(res, error);
  }
}

async function downloadLegalEvidence(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, ...publicError('UNAUTHENTICATED') });
    }
    const file = await readAuthorizedFile(req.params.documentId, {
      userId: req.user.id,
      role: req.user.role,
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(file.originalFilename || 'document').replace(/"/g, '')}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(file.buffer);
  } catch (error) {
    return sendIngestError(res, error);
  }
}

async function archiveLegalEvidence(req, res) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, ...publicError('UNAUTHENTICATED') });
    }
    const result = await archiveReadableDocument(req.params.documentId, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.json({
      success: true,
      archived: true,
      deleted: result.deleted === true,
      bytesRemoved: result.bytesRemoved === true,
      lifecycleState: result.lifecycleState,
      document: result.document,
    });
  } catch (error) {
    return sendIngestError(res, error);
  }
}

module.exports = {
  handleEvidenceUpload,
  uploadLegalEvidence,
  listLegalEvidence,
  getLegalEvidence,
  downloadLegalEvidence,
  archiveLegalEvidence,
};
