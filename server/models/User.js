const { Pool } = require("pg");
require("dotenv").config();
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

class User {
  static async findByEmail(email) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(userData) {
    try {
      const { email, password, is_verified = false } = userData;
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const result = await pool.query(
        'INSERT INTO users (email, password, is_verified) VALUES ($1, $2, $3) RETURNING *',
        [email, hashedPassword, is_verified]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updatePassword(userId, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const result = await pool.query(
        'UPDATE users SET password = $1 WHERE id = $2 RETURNING *',
        [hashedPassword, userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updateProfile(userId, profileData) {
    try {
      const { first_name, last_name, phone } = profileData;
      const result = await pool.query(
        'UPDATE users SET first_name = $1, last_name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [first_name, last_name, phone, userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async verify(userId) {
    try {
      const result = await pool.query(
        'UPDATE users SET is_verified = TRUE WHERE id = $1 RETURNING *',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async setResetToken(userId, token, expiry) {
    try {
      const result = await pool.query(
        'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3 RETURNING *',
        [token, expiry, userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findByResetToken(token) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > $2',
        [token, new Date()]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async clearResetToken(userId) {
    try {
      const result = await pool.query(
        'UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1 RETURNING *',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async createOrUpdateFromGoogle(profile) {
    try {
      const googleId = profile.id;
      const email = profile.emails[0].value;
      const firstName = profile.name.givenName;
      const lastName = profile.name.familyName;
      const picture = profile.photos[0]?.value;

      // Check if user exists by Google ID
      let existingUser = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [googleId]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user with latest profile information
        const result = await pool.query(
          'UPDATE users SET first_name = $1, last_name = $2, picture = $3, updated_at = CURRENT_TIMESTAMP WHERE google_id = $4 RETURNING *',
          [firstName, lastName, picture, googleId]
        );
        return result.rows[0];
      }

      // Check if user exists by email (for linking existing accounts)
      existingUser = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        // Link Google account to existing user
        const result = await pool.query(
          'UPDATE users SET google_id = $1, first_name = $2, last_name = $3, picture = $4, is_verified = true, updated_at = CURRENT_TIMESTAMP WHERE email = $5 RETURNING *',
          [googleId, firstName, lastName, picture, email]
        );
        return result.rows[0];
      }

      // Create new user
      const result = await pool.query(
        'INSERT INTO users (email, google_id, first_name, last_name, picture, is_verified) VALUES ($1, $2, $3, $4, $5, true) RETURNING *',
        [email, googleId, firstName, lastName, picture]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in createOrUpdateFromGoogle:', error);
      throw error;
    }
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = User;
 