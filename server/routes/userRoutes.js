const express = require('express');
const router = express.Router();
const { updateProfile, checkAdvisorProfile, saveAdvisorProfile, skipAdvisorProfile } = require('../controllers/userController');

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
router.post('/:userId/advisor-profile', authenticateJWT, saveAdvisorProfile);
router.post('/:userId/advisor-profile/skip', authenticateJWT, skipAdvisorProfile);

module.exports = router; 