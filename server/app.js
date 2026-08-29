require("dotenv").config(); // Load environment variables FIRST
const express = require("express");
const cors = require("cors");
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const config = require('./config/config');
require('./config/passport');
const authRoutes = require("./routes/authRoutes");
const propertyRoutes = require("./routes/propertyRoutes");
const userRoutes = require("./routes/userRoutes");
const aiRoutes = require("./routes/aiRoutes");

const app = express();

// Startup configuration validation (non-blocking warnings)
(() => {
  const requiredEnv = [
    'CLIENT_URL',
    'PORT',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    // Prefer GOOGLE_CALLBACK_URL but fall back exists in config
    'JWT_SECRET',
    // SESSION_SECRET can reuse JWT_SECRET via config, but warn if absent
  ];

  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn('⚠️  Missing environment variables:', missing.join(', '));
  }

  if (!process.env.GOOGLE_CALLBACK_URL) {
    const inferred = `http://localhost:${process.env.PORT || 5050}/api/auth/google/callback`;
    console.warn('ℹ️  GOOGLE_CALLBACK_URL not set. Using default:', inferred);
  }

  if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET) {
    console.warn('⚠️  Neither SESSION_SECRET nor JWT_SECRET is set. Sessions/JWT may be insecure.');
  }

  const { isPropertyDataConfigured, getPropertyDataSetupStatus } = require('./config/propertyIntelligence.config');
  if (!isPropertyDataConfigured()) {
    const setup = getPropertyDataSetupStatus();
    console.warn(`⚠️  PropertyData UK lookup is OFF (${setup.reason}). ${setup.message}`);
  } else {
    console.log('✅ PropertyData UK property lookup is enabled');
  }
})();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (only for errors)
app.use((req, res, next) => {
  next();
});

// Session configuration
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: config.session.cookie
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/properties", propertyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/ai", aiRoutes);

module.exports = app;