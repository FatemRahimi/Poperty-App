// server/controllers/authController.js

const pool = require("../models/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../utils/email");
const crypto = require('crypto');
const config = require('../config/config');
const adminConfig = require('../config/admin.config');
const { recordFailedAttempt, clearFailedAttempts } = require('../middleware/adminSecurity');

exports.signup = async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  try {
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Insert user as verified for testing (temporarily)
    const insertResult = await pool.query(
      "INSERT INTO users (email, password, is_verified) VALUES ($1, $2, $3) RETURNING id",
      [email, hashed, true] // Set to true for testing
    );
    const userId = insertResult.rows[0].id;

    // Temporarily disable email verification for testing
    /*
    // Generate verification token
    const verificationToken = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    const verificationLink = `http://localhost:5050/api/auth/verify?token=${verificationToken}`;

    // Send verification email
    await sendVerificationEmail(email, verificationLink);
    */

    return res.status(201).json({ message: "Sign up successful! You can now log in." });
  } catch (err) {
    console.error("❌ Signup failed:", err);
    return res.status(500).json({ message: "Signup error", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    return res.status(400).json({ 
      error: "Email and password are required",
      field: email ? "password" : "email"
    });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: "Please enter a valid email address",
      field: "email"
    });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: "No account found with this email. Do you need to sign up?",
        field: "email",
        action: "suggest_signup"
      });
    }

    const user = result.rows[0];
    
    // Check if user has a password (might be Google-only user)
    if (!user.password) {
      return res.status(401).json({ 
        error: "This account uses Google Sign-In. Please use the 'Continue with Google' button.",
        field: "email",
        action: "use_google"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: "Incorrect password. Please try again.",
        field: "password"
      });
    }

    // Prevent login if not verified
    if (!user.is_verified) {
      return res.status(403).json({ 
        error: "Please verify your email before logging in. Check your inbox for a verification link.",
        field: "email",
        action: "resend_verification"
      });
    }

    // Create JWT token with consistent secret
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role || 'user'
      }, 
      config.auth.jwt.secret, 
      { expiresIn: "24h" }
    );

    // Return success response with user data
    return res.json({ 
      token, 
      user: { 
        id: user.id,
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        verified: user.is_verified,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ 
      error: "An error occurred during login. Please try again.",
      field: null
    });
  }
};

exports.adminLogin = async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  if (!email || !password) {
    recordFailedAttempt(req);
    return res.status(400).json({ 
      error: "Email and password are required",
      field: email ? "password" : "email"
    });
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    recordFailedAttempt(req);
    return res.status(400).json({ 
      error: "Please enter a valid email address",
      field: "email"
    });
  }

  try {
    // Check against admins table instead of users table
    const result = await pool.query("SELECT * FROM admins WHERE email = $1 AND is_active = true", [email]);
    
    if (result.rows.length === 0) {
      recordFailedAttempt(req);
      return res.status(401).json({ 
        error: "Invalid admin credentials.",
        field: "email"
      });
    }

    const admin = result.rows[0];
    
    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      recordFailedAttempt(req);
      return res.status(401).json({ 
        error: "Invalid admin credentials.",
        field: "password"
      });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(req);

    // Update last login timestamp
    await pool.query("UPDATE admins SET last_login = NOW() WHERE id = $1", [admin.id]);

    // Log successful admin login
    console.log(`✅ Admin login successful: ${email} (${admin.role}) from IP: ${req.adminSecurity?.clientIP || 'unknown'}`);

    // Create JWT token with admin role and shorter expiration for security
    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role,
        loginTime: Date.now(),
        adminTable: true // Flag to indicate this is from admins table
      }, 
      config.auth.jwt.secret, 
      { expiresIn: "8h" } // Shorter session for admin security
    );

    // Return success response with admin user data
    return res.json({ 
      token, 
      user: { 
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name || '',
        last_name: admin.last_name || '',
        role: admin.role,
        lastLogin: admin.last_login
      }
    });
  } catch (err) {
    console.error("❌ Admin login error:", err);
    recordFailedAttempt(req);
    return res.status(500).json({ 
      error: "An error occurred during admin login. Please try again.",
      field: null
    });
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
    
    // Try to send email, but don't fail if email sending fails
    try {
      await sendPasswordResetEmail(email, resetUrl);
      console.log("Password reset email sent to:", email);
      return res.status(200).json({ 
        message: "Password reset link sent! Please check your email." 
      });
    } catch (emailError) {
      console.log("❌ Email sending failed:", emailError.message);
      console.log("🔗 Reset URL for manual use:", resetUrl);
      // Still return success but mention email issue
      return res.status(200).json({ 
        message: "Password reset link generated! (Email sending temporarily unavailable - check server console for reset link)",
        resetUrl: resetUrl // Include URL for testing
      });
    }
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

// Admin credential management functions
exports.updateAdminPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const adminId = req.user.id; // From JWT token

  // Validation
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      error: "Current password and new password are required" 
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ 
      error: "New password must be at least 8 characters long" 
    });
  }

  try {
    // Get current admin
    const result = await pool.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const admin = result.rows[0];

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: "Current password is incorrect",
        field: "currentPassword"
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      "UPDATE admins SET password = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2", 
      [hashedPassword, adminId]
    );

    console.log(`✅ Admin password updated: ${admin.email}`);

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Update admin password error:", err);
    return res.status(500).json({ 
      error: "Failed to update password" 
    });
  }
};

exports.updateAdminEmail = async (req, res) => {
  const { password, newEmail } = req.body;
  const adminId = req.user.id; // From JWT token

  // Validation
  if (!password || !newEmail) {
    return res.status(400).json({ 
      error: "Password and new email are required" 
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    return res.status(400).json({ 
      error: "Please enter a valid email address",
      field: "newEmail"
    });
  }

  try {
    // Get current admin
    const result = await pool.query("SELECT * FROM admins WHERE id = $1", [adminId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const admin = result.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: "Password is incorrect",
        field: "password"
      });
    }

    // Check if new email already exists
    const emailExists = await pool.query("SELECT id FROM admins WHERE email = $1 AND id != $2", [newEmail, adminId]);
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ 
        error: "Email already in use by another admin",
        field: "newEmail"
      });
    }

    // Update email
    const oldEmail = admin.email;
    await pool.query(
      "UPDATE admins SET email = $1, updated_at = NOW() WHERE id = $2", 
      [newEmail, adminId]
    );

    console.log(`✅ Admin email updated: ${oldEmail} → ${newEmail}`);

    return res.json({ 
      message: "Email updated successfully",
      newEmail: newEmail
    });
  } catch (err) {
    console.error("❌ Update admin email error:", err);
    return res.status(500).json({ 
      error: "Failed to update email" 
    });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    // Get user count
    const userCount = await pool.query("SELECT COUNT(*) as count FROM users");
    
    // Get admin count
    const adminCount = await pool.query("SELECT COUNT(*) as count FROM admins WHERE is_active = true");
    
    // Mock data for now (can be extended)
    const stats = {
      totalUsers: parseInt(userCount.rows[0].count),
      totalAdmins: parseInt(adminCount.rows[0].count),
      totalProperties: 0, // TODO: Implement when properties table exists
      recentActivity: []
    };

    return res.json(stats);
  } catch (err) {
    console.error("❌ Get admin stats error:", err);
    return res.status(500).json({ 
      error: "Failed to fetch admin statistics" 
    });
  }
};

exports.getAdminUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, first_name, last_name, role, is_active, last_login, created_at FROM admins WHERE is_active = true ORDER BY created_at ASC"
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("❌ Get admin users error:", err);
    return res.status(500).json({ 
      error: "Failed to fetch admin users" 
    });
  }
};