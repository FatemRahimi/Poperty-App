const express = require("express");
const cors = require("cors");
const session = require('express-session');
const passport = require('passport');
const config = require('./config/config');
require('./config/passport');
const authRoutes = require("./routes/authRoutes");

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use("/api/auth", authRoutes);

module.exports = app;
