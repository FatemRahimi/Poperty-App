const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateAI, requireCredits } = require('../middleware/aiAuth');
const { requireIntelligenceAnalyseSlot } = require('../services/ai/propertyIntelligenceAnalyseGuard');
const {
  getPlans,
  getSubscription,
  upgradeSubscription,
  getHistory,
  getHistoryItem,
  deleteHistoryItem,
  createListing,
  createValuation,
  createBuyerMatch,
  getDashboard,
} = require('../controllers/aiController');
const {
  getIntelligenceOverview,
  searchProperties,
  getPropertyPreview,
  analysePropertyIntelligence,
  getPropertyAnalysisHistory,
  getPropertyAnalysisById,
  analyseInvestment,
  analyseRentEndpoint,
  getUserPropertiesList,
  analysePortfolioEndpoint,
  lookupIntelligence,
  resolveIntelligenceSubject,
  getRecentSubjectLookupsEndpoint,
  getSubjectPreviewEndpoint,
  getSubjectAnalysisHistory,
  analyseSubjectIntelligence,
  unlinkSubjectListing,
  compareIntelligenceWhatIf,
} = require('../controllers/intelligenceController');
const {
  handleEvidenceUpload,
  uploadLegalEvidence,
  listLegalEvidence,
  getLegalEvidence,
  downloadLegalEvidence,
  archiveLegalEvidence,
} = require('../controllers/evidenceDocumentController');

// Photo uploads for valuation (stored in memory; filenames passed through to AI context)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

// Public
router.get('/plans', getPlans);

// Authenticated
router.get('/subscription', authenticateAI, getSubscription);
router.post('/subscription/upgrade', authenticateAI, upgradeSubscription);
router.get('/dashboard', authenticateAI, getDashboard);
router.get('/history', authenticateAI, getHistory);
router.get('/history/:id', authenticateAI, getHistoryItem);
router.delete('/history/:id', authenticateAI, deleteHistoryItem);

// Generation endpoints (auth + credits)
router.post('/listing-writer', authenticateAI, requireCredits, createListing);
router.post(
  '/valuation',
  authenticateAI,
  requireCredits,
  upload.array('photos', 8),
  (req, res, next) => {
    // Normalise multipart body + photo metadata into JSON-friendly shape
    if (req.files?.length) {
      req.body.photos = req.files.map((f) => ({
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
      }));
    }
    // Coerce numeric fields from multipart strings
    ['bedrooms', 'bathrooms', 'size', 'sizeSqFt', 'price'].forEach((key) => {
      if (req.body[key] !== undefined && req.body[key] !== '') {
        req.body[key] = Number(req.body[key]);
      }
    });
    next();
  },
  createValuation
);
router.post('/buyer-match', authenticateAI, requireCredits, createBuyerMatch);

// Property Intelligence
router.get('/intelligence/overview', authenticateAI, getIntelligenceOverview);
router.post(
  '/intelligence/legal-evidence',
  authenticateAI,
  handleEvidenceUpload,
  uploadLegalEvidence
);
router.get('/intelligence/legal-evidence', authenticateAI, listLegalEvidence);
router.get('/intelligence/legal-evidence/:documentId', authenticateAI, getLegalEvidence);
router.get('/intelligence/legal-evidence/:documentId/file', authenticateAI, downloadLegalEvidence);
router.delete('/intelligence/legal-evidence/:documentId', authenticateAI, archiveLegalEvidence);
router.get('/intelligence/lookup', authenticateAI, lookupIntelligence);
router.get('/intelligence/subjects/recent', authenticateAI, getRecentSubjectLookupsEndpoint);
router.post('/intelligence/subjects/resolve', authenticateAI, requireCredits, resolveIntelligenceSubject);
router.get('/intelligence/subjects/:subjectId/preview', authenticateAI, getSubjectPreviewEndpoint);
router.get('/intelligence/subjects/:subjectId/history', authenticateAI, getSubjectAnalysisHistory);
router.post(
  '/intelligence/subjects/:subjectId/analyse',
  authenticateAI,
  requireCredits,
  requireIntelligenceAnalyseSlot,
  analyseSubjectIntelligence
);
router.post('/intelligence/subjects/:subjectId/unlink', authenticateAI, unlinkSubjectListing);
router.get('/intelligence/properties', authenticateAI, getUserPropertiesList);
router.get('/intelligence/properties/search', authenticateAI, searchProperties);
router.get('/intelligence/properties/:propertyId/preview', authenticateAI, getPropertyPreview);
router.get('/intelligence/properties/:propertyId/history', authenticateAI, getPropertyAnalysisHistory);
router.get('/intelligence/analysis/:id', authenticateAI, getPropertyAnalysisById);
router.post(
  '/intelligence/analyse/:propertyId',
  authenticateAI,
  requireCredits,
  requireIntelligenceAnalyseSlot,
  analysePropertyIntelligence
);
router.post('/intelligence/what-if', authenticateAI, compareIntelligenceWhatIf);
router.post('/investment/analyse', authenticateAI, requireCredits, analyseInvestment);
router.post('/rent/analyse', authenticateAI, requireCredits, analyseRentEndpoint);
router.post('/portfolio/analyse', authenticateAI, requireCredits, analysePortfolioEndpoint);

module.exports = router;
