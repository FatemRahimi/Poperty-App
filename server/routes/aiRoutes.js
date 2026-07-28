const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateAI, requireCredits } = require('../middleware/aiAuth');
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

module.exports = router;
