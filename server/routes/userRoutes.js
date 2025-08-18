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
    files: 5 // Maximum 5 files
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
  console.log('🔍 JWT Middleware called for:', req.method, req.path);
  console.log('🔍 Headers:', req.headers);
  
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    console.log('🔑 Token found, verifying...');
    
    jwt.verify(token, config.auth.jwt.secret, (err, user) => {
      if (err) {
        console.log('❌ JWT verification failed:', err.message);
        return res.sendStatus(403);
      }
      console.log('✅ JWT verified for user:', user.id);
      req.user = user;
      next();
    });
  } else {
    console.log('❌ No authorization header found');
    res.sendStatus(401);
  }
};

// Request logging middleware
router.use((req, res, next) => {
  console.log('📥 User route request:', req.method, req.path);
  console.log('📥 Request body:', req.body);
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
  { name: 'profilePhoto', maxCount: 1 }
]), saveAdvisorProfile);
router.put('/:userId/advisor-profile', authenticateJWT, upload.fields([
  { name: 'companyLogo', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 }
]), saveAdvisorProfile);
router.post('/:userId/advisor-profile/skip', authenticateJWT, skipAdvisorProfile);

module.exports = router; 