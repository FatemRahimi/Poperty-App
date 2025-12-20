const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  updateProfile, 
  checkAdvisorProfile, 
  saveAdvisorProfile, 
  skipAdvisorProfile, 
  getAdvisorProfileForEdit,
  getAdvisorProfileDetails,
  addExpertTeamMember, 
  updateExpertTeamMember, 
  deleteExpertTeamMember 
} = require('../controllers/userController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 7, // Maximum 7 files (company logo + profile photo + 5 experts)
    fields: 50, // Increase field limit
    fieldSize: 5 * 1024 * 1024 // 5MB per field
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum file size is 10MB per file.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 files allowed.'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + err.message
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  next();
};

// Middleware for JWT authentication
const jwt = require('jsonwebtoken');
const config = require('../config/config');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    
    jwt.verify(token, config.auth.jwt.secret, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Request logging middleware (disabled for performance)
router.use((req, res, next) => {
  next();
});

// User profile routes
router.put('/profile', authenticateJWT, updateProfile);

// Advisor profile routes
router.get('/:userId/advisor-profile', checkAdvisorProfile); // No authentication required
// Get advisor profile details for public viewing (PropertyAdvisorCard)
router.get('/:userId/advisor-profile/details', getAdvisorProfileDetails); // No authentication required
// Get advisor profile for editing
router.get('/:userId/advisor-profile/edit', authenticateJWT, getAdvisorProfileForEdit);

// Expert team management routes (temporarily disabled)
// router.post('/:advisorProfileId/expert-team', authenticateJWT, addExpertTeamMember);
// router.put('/expert-team/:expertId', authenticateJWT, updateExpertTeamMember);
// router.delete('/expert-team/:expertId', authenticateJWT, deleteExpertTeamMember);

// Save advisor profile
router.post('/:userId/advisor-profile', authenticateJWT, upload.fields([
  { name: 'companyLogo', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'expertPhoto_0', maxCount: 1 },
  { name: 'expertPhoto_1', maxCount: 1 },
  { name: 'expertPhoto_2', maxCount: 1 },
  { name: 'expertPhoto_3', maxCount: 1 },
  { name: 'expertPhoto_4', maxCount: 1 }
]), saveAdvisorProfile);

// Add error handling middleware for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('❌ Multer error:', error);
    return res.status(400).json({
      success: false,
      message: `File upload error: ${error.message}`,
      error: error.code
    });
  } else if (error) {
    console.error('❌ Upload error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Upload failed',
      error: error.toString()
    });
  }
  next();
});

router.put('/:userId/advisor-profile', authenticateJWT, upload.fields([
  { name: 'companyLogo', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'expertPhoto_0', maxCount: 1 },
  { name: 'expertPhoto_1', maxCount: 1 },
  { name: 'expertPhoto_2', maxCount: 1 },
  { name: 'expertPhoto_3', maxCount: 1 },
  { name: 'expertPhoto_4', maxCount: 1 }
]), saveAdvisorProfile);

// Text-only update endpoint (no file uploads) - for edit mode without new photos
router.patch('/:userId/advisor-profile/text-only', authenticateJWT, saveAdvisorProfile);

router.post('/:userId/advisor-profile/skip', authenticateJWT, skipAdvisorProfile);

module.exports = router; 