// server/controllers/authController.js

const pool = require("../models/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/email");
const crypto = require('crypto');
const config = require('../config/config');

exports.signup = async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  try {
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Insert user as unverified
    const insertResult = await pool.query(
      "INSERT INTO users (email, password, verified) VALUES ($1, $2, $3) RETURNING id",
      [email, hashed, false]
    );
    const userId = insertResult.rows[0].id;

    // Generate verification token
    const verificationToken = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    const verificationLink = `http://localhost:5050/api/auth/verify?token=${verificationToken}`;

    // Send verification email
    await sendVerificationEmail(email, verificationLink);

    return res.status(201).json({ message: "Sign up successful! Please check your email to verify your account." });
  } catch (err) {
    console.error("❌ Signup failed:", err);
    return res.status(500).json({ message: "Signup error", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // Prevent login if not verified
    if (!user.verified) {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
    return res.json({ token, user: { email: user.email } });
  } catch (err) {
    return res.status(500).json({ message: "Login error", error: err });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  console.log("Received password reset request for email:", email);

  try {
    // Check if user exists
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      console.log("No user found with email:", email);
      return res.status(404).json({ message: "No account with that email address exists." });
    }
    
    const user = userResult.rows[0];
    console.log("User found:", user.id);
    
    // Generate reset token (random bytes)
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log("Generated reset token");
    
    // Set token expiry (1 hour from now)
    const resetTokenExpiry = new Date();
    resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);
    
    // Store hashed token in database
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    await pool.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3", 
      [hashedToken, resetTokenExpiry, user.id]
    );
    console.log("Saved reset token to database");
    
    // Create reset URL
    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    console.log("Generated Reset URL:", resetUrl);
    
    // Send email
    await sendPasswordResetEmail(email, resetUrl);
    console.log("Password reset email sent to:", email);
    
    return res.status(200).json({ 
      message: "Password reset link sent! Please check your email." 
    });
  } catch (err) {
    console.error("❌ Forgot password error:", err);
    return res.status(500).json({ 
      message: "Error sending password reset email", 
      error: err.message 
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  
  try {
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with this token and valid expiry
    const userResult = await pool.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > $2", 
      [hashedToken, new Date()]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    
    const user = userResult.rows[0];
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update password and clear reset token
    await pool.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2", 
      [hashedPassword, user.id]
    );
    
    return res.status(200).json({ message: "Password reset successful. You can now log in with your new password." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    return res.status(500).json({ 
      message: "Password reset failed", 
      error: err.message 
    });
  }
};
