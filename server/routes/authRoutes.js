const express = require("express");
const router = express.Router();
const passport = require('passport');
const config = require('../config/config');
const { signup, login, forgotPassword, resetPassword } = require("../controllers/authController");
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Regular authentication routes
router.post("/signup", signup);
router.post("/login", login);
router.post("/password", forgotPassword);
router.post("/reset-password", resetPassword);

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
        { id: req.user.id, email: req.user.email },
        process.env.JWT_SECRET,
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

// Check authentication status
router.get('/check', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      isAuthenticated: true, 
      user: {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name || '',
        last_name: req.user.last_name || ''
      }
    });
  } else {
    res.json({ isAuthenticated: false });
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

// Email verification route
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await User.verifyById(payload.userId);
    // Redirect to login page with success message
    res.redirect(`${config.frontend.url}/login?verified=success`);
  } catch (err) {
    console.error('Verification error:', err);
    res.redirect(`${config.frontend.url}/login?verified=error`);
  }
});

module.exports = router;
