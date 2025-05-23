const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class User {
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        google_id VARCHAR(255) UNIQUE,
        picture VARCHAR(255),
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    try {
      await pool.query(query);
      console.log('Users table created successfully');
    } catch (error) {
      console.error('Error creating users table:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in findById:', error);
      throw error;
    }
  }

  static async createOrUpdateFromGoogle(profile) {
    try {
      const { id, displayName, emails, photos } = profile;
      const email = emails[0].value;
      const picture = photos[0].value;
      
      // Split display name into first and last name
      const nameParts = displayName.split(' ');
      const first_name = nameParts[0];
      const last_name = nameParts.slice(1).join(' ');

      // Check if user exists with Google ID
      let result = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        // Check if user exists with same email
        result = await pool.query(
          'SELECT * FROM users WHERE email = $1',
          [email]
        );

        if (result.rows.length > 0) {
          // Update existing user with Google info
          result = await pool.query(
            `UPDATE users 
             SET google_id = $1, picture = $2, first_name = $3, last_name = $4, 
                 is_verified = true, updated_at = CURRENT_TIMESTAMP
             WHERE email = $5
             RETURNING *`,
            [id, picture, first_name, last_name, email]
          );
        } else {
          // Create new user
          result = await pool.query(
            `INSERT INTO users 
             (email, google_id, first_name, last_name, picture, is_verified)
             VALUES ($1, $2, $3, $4, $5, true)
             RETURNING *`,
            [email, id, first_name, last_name, picture]
          );
        }
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error in createOrUpdateFromGoogle:', error);
      throw error;
    }
  }

  static async verifyById(userId) {
    try {
      const result = await pool.query(
        `UPDATE users 
         SET is_verified = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error in verifyById:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in findByEmail:', error);
      throw error;
    }
  }

  static async create(email, password, first_name, last_name) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `INSERT INTO users (email, password, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [email, hashedPassword, first_name, last_name]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = User; 