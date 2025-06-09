const express = require("express");
const router = express.Router();
const passport = require('passport');
const config = require('../config/config');
const { signup, login, adminLogin, forgotPassword, resetPassword, getAdminStats, getAdminUsers } = require("../controllers/authController");
const { adminSecurityMiddleware } = require('../middleware/adminSecurity');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Regular authentication routes
router.post("/signup", signup);
router.post("/login", login);
router.post("/password", forgotPassword);
router.post("/reset-password", resetPassword);

// Admin authentication route with security middleware
router.post("/admin-login", adminSecurityMiddleware, adminLogin);

// Google authentication routes
router.get('/google', (req, res, next) => {
  const redirectTo = req.query.redirectTo || config.frontend.defaultRedirectPath;
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    state: JSON.stringify({ redirectTo })
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${config.frontend.baseUrl}${config.frontend.loginPath}` 
  }),
  function(req, res) {
    try {
      // Get the redirect path from the state parameter
      const state = JSON.parse(req.query.state || '{}');
      const redirectPath = state.redirectTo || config.frontend.defaultRedirectPath;
      
      // Create a JWT token
      const token = jwt.sign(
        { 
          id: req.user.id, 
          email: req.user.email,
          first_name: req.user.first_name,
          last_name: req.user.last_name
        },
        config.auth.jwt.secret,
        { expiresIn: '24h' }
      );
      
      // Prepare user data
      const userData = {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name || '',
        last_name: req.user.last_name || '',
        googleId: req.user.google_id
      };
      
      // Ensure the redirect path starts with a slash
      const finalRedirectPath = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
      
      // Redirect to frontend with token and user data
      res.redirect(
        `${config.frontend.baseUrl}/auth/callback?` +
        `token=${encodeURIComponent(token)}&` +
        `user=${encodeURIComponent(JSON.stringify(userData))}&` +
        `redirectTo=${encodeURIComponent(finalRedirectPath)}`
      );
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect(`${config.frontend.baseUrl}${config.frontend.loginPath}?error=authentication_failed`);
    }
  }
);

// Apple authentication routes
/* APPLE LOGIN ROUTES - COMMENTED FOR FUTURE USE
router.get('/apple', (req, res, next) => {
  const redirectTo = req.query.redirectTo || config.frontend.defaultRedirectPath;
  passport.authenticate('apple', {
    state: JSON.stringify({ redirectTo })
  })(req, res, next);
});

router.post('/apple/callback',
  passport.authenticate('apple', { 
    failureRedirect: `${config.frontend.baseUrl}${config.frontend.loginPath}` 
  }),
  function(req, res) {
    const state = JSON.parse(req.query.state || '{}');
    const redirectPath = state.redirectTo || config.frontend.defaultRedirectPath;
    res.redirect(`${config.frontend.baseUrl}${redirectPath}`);
  }
);
*/

// Check authentication status
router.get('/check', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      isAuthenticated: true, 
      user: {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name,
        last_name: req.user.last_name
      }
    });
  } else {
    res.json({ isAuthenticated: false, user: null });
  }
});

// JWT Token verification route
router.get('/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    
    // Check if user still exists in database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Return user data if valid
    res.json({ 
      valid: true, 
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Email verification route
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  try {
    const payload = jwt.verify(token, config.auth.jwt.secret);
    await User.verifyById(payload.userId);
    // Redirect to login page with success message
    res.redirect(`${config.frontend.url}/login?verified=success`);
  } catch (err) {
    console.error('Verification error:', err);
    res.redirect(`${config.frontend.url}/login?verified=error`);
  }
});

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Error during logout' });
    }
    res.redirect(`${config.frontend.baseUrl}${config.frontend.loginPath}`);
  });
});

// JWT Authentication Middleware for Admin Routes
const authenticateAdminJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin access token required' });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    
    // Check if this is an admin token
    if (!decoded.role || !['admin', 'super_admin'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
};

// Admin API Routes
router.get('/admin/stats', authenticateAdminJWT, getAdminStats);
router.get('/admin/users', authenticateAdminJWT, getAdminUsers);

module.exports = router;