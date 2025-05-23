const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authConfig = require('../config/auth.config');

const router = express.Router();

// Regular login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValidPassword = await User.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      authConfig.jwt.secret,
      { expiresIn: authConfig.jwt.expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        picture: user.picture,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error during login' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create(email, password, first_name, last_name);
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      authConfig.jwt.secret,
      { expiresIn: authConfig.jwt.expiresIn }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error during registration' });
  }
});

// Google OAuth routes
router.get('/google', (req, res, next) => {
  const redirectTo = req.query.redirectTo || '/dashboard';
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: JSON.stringify({ redirectTo })
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=authentication_failed`
  }),
  (req, res) => {
    try {
      // Get the redirect path from the state parameter
      const state = JSON.parse(req.query.state || '{}');
      const redirectPath = state.redirectTo || '/dashboard';
      
      // Create a JWT token
      const token = jwt.sign(
        { id: req.user.id, email: req.user.email },
        authConfig.jwt.secret,
        { expiresIn: authConfig.jwt.expiresIn }
      );
      
      // Prepare user data
      const userData = {
        id: req.user.id,
        email: req.user.email,
        first_name: req.user.first_name || '',
        last_name: req.user.last_name || '',
        picture: req.user.picture,
        isVerified: req.user.is_verified
      };
      
      // Redirect to frontend with token and user data
      res.redirect(
        `${process.env.CLIENT_URL}/auth/callback?` +
        `token=${encodeURIComponent(token)}&` +
        `user=${encodeURIComponent(JSON.stringify(userData))}&` +
        `redirectTo=${encodeURIComponent(redirectPath)}`
      );
    } catch (error) {
      console.error('Error in Google callback:', error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=authentication_failed`);
    }
  }
);

// Verify token
router.get('/verify', passport.authenticate('jwt', { session: false }), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router; 