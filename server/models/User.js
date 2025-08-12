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

  // Check if user has completed advisor profile
  static async checkAdvisorProfile(userId) {
    try {
      // First, ensure the columns exist
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS has_completed_advisor_profile BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS has_skipped_advisor_profile BOOLEAN DEFAULT FALSE
      `);

      // Check if user exists in the database
      const userExists = await pool.query(
        'SELECT id FROM users WHERE id = $1',
        [userId]
      );
      
      if (userExists.rows.length === 0) {
        console.log('User does not exist in database, returning false');
        return { hasCompleted: false, hasSkipped: false };
      }

      const result = await pool.query(
        'SELECT has_completed_advisor_profile, has_skipped_advisor_profile FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return { hasCompleted: false, hasSkipped: false };
      }
      
      const user = result.rows[0];
      return {
        hasCompleted: user.has_completed_advisor_profile === true,
        hasSkipped: user.has_skipped_advisor_profile === true
      };
    } catch (error) {
      console.error('Error checking advisor profile:', error);
      // If there's an error, assume user hasn't completed advisor profile
      return { hasCompleted: false, hasSkipped: false };
    }
  }

  // Save advisor profile
  static async saveAdvisorProfile(userId, advisorData) {
    try {
      // First, create or update advisor profile table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS advisor_profiles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          advisor_type VARCHAR(20) NOT NULL,
          company_name VARCHAR(255),
          director_name VARCHAR(255),
          company_logo_url TEXT,
          company_website VARCHAR(255),
          company_description TEXT,
          full_name VARCHAR(255),
          profile_photo_url TEXT,
          job_title VARCHAR(255),
          professional_bio TEXT,
          contact_phone VARCHAR(50),
          contact_email VARCHAR(255),
          office_hours VARCHAR(255),
          office_address TEXT,
          office_city VARCHAR(100),
          office_postcode VARCHAR(20),
          is_advisor BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create advisor_experts table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS advisor_experts (
          id SERIAL PRIMARY KEY,
          advisor_profile_id INTEGER REFERENCES advisor_profiles(id) ON DELETE CASCADE,
          full_name VARCHAR(255) NOT NULL,
          job_title VARCHAR(255) NOT NULL,
          profile_photo_url TEXT,
          phone VARCHAR(50),
          email VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const {
        advisorType,
        companyName,
        directorName,
        companyLogoUrl,
        companyWebsite,
        companyDescription,
        fullName,
        profilePhotoUrl,
        jobTitle,
        professionalBio,
        contactPhone,
        contactEmail,
        officeHours,
        officeAddress,
        officeCity,
        officePostcode,
        expertTeam,
        isAdvisor
      } = advisorData;

      // Check if advisor profile already exists
      const existingProfile = await pool.query(
        'SELECT id FROM advisor_profiles WHERE user_id = $1',
        [userId]
      );

      let profileId;

      if (existingProfile.rows.length > 0) {
        // Update existing profile
        const result = await pool.query(`
          UPDATE advisor_profiles SET
            advisor_type = $1,
            company_name = $2,
            director_name = $3,
            company_logo_url = $4,
            company_website = $5,
            company_description = $6,
            full_name = $7,
            profile_photo_url = $8,
            job_title = $9,
            professional_bio = $10,
            contact_phone = $11,
            contact_email = $12,
            office_hours = $13,
            office_address = $14,
            office_city = $15,
            office_postcode = $16,
            is_advisor = $17,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $18
          RETURNING *
        `, [
          advisorType,
          companyName,
          directorName,
          companyLogoUrl,
          companyWebsite,
          companyDescription,
          fullName,
          profilePhotoUrl,
          jobTitle,
          professionalBio,
          contactPhone,
          contactEmail,
          officeHours,
          officeAddress,
          officeCity,
          officePostcode,
          isAdvisor || false,
          userId
        ]);
        
        profileId = result.rows[0].id;
        
        // Clear existing expert team members
        await pool.query(
          'DELETE FROM advisor_experts WHERE advisor_profile_id = $1',
          [profileId]
        );
      } else {
        // Create new profile
        const result = await pool.query(`
          INSERT INTO advisor_profiles (
            user_id, advisor_type, company_name, director_name, company_logo_url,
            company_website, company_description, full_name, profile_photo_url,
            job_title, professional_bio, contact_phone, contact_email,
            office_hours, office_address, office_city, office_postcode, is_advisor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING *
        `, [
          userId, advisorType, companyName, directorName, companyLogoUrl,
          companyWebsite, companyDescription, fullName, profilePhotoUrl,
          jobTitle, professionalBio, contactPhone, contactEmail,
          officeHours, officeAddress, officeCity, officePostcode, isAdvisor || false
        ]);
        
        profileId = result.rows[0].id;
      }

      // Add expert team members if provided
      if (expertTeam && Array.isArray(expertTeam) && expertTeam.length > 0) {
        for (const expert of expertTeam) {
          if (expert.fullName && expert.jobTitle) {
            await pool.query(`
              INSERT INTO advisor_experts (
                advisor_profile_id, full_name, job_title, profile_photo_url, phone, email
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              profileId,
              expert.fullName,
              expert.jobTitle,
              expert.profilePhotoUrl || null,
              expert.phone || null,
              expert.email || null
            ]);
          }
        }
      }

      // Mark advisor profile as completed
      await this.markAdvisorProfileCompleted(userId);

      return { id: profileId, success: true };
    } catch (error) {
      throw error;
    }
  }

  // Mark advisor profile as skipped
  static async skipAdvisorProfile(userId) {
    try {
      // Add has_skipped_advisor_profile column if it doesn't exist
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS has_skipped_advisor_profile BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS has_completed_advisor_profile BOOLEAN DEFAULT FALSE
      `);

      const result = await pool.query(
        'UPDATE users SET has_skipped_advisor_profile = TRUE WHERE id = $1 RETURNING *',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Mark advisor profile as completed
  static async markAdvisorProfileCompleted(userId) {
    try {
      // Add has_completed_advisor_profile column if it doesn't exist
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS has_completed_advisor_profile BOOLEAN DEFAULT FALSE
      `);

      const result = await pool.query(
        'UPDATE users SET has_completed_advisor_profile = TRUE WHERE id = $1 RETURNING *',
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

  // Get advisor profile details by user ID (for public view)
  static async getAdvisorProfileDetailsByUserId(userId) {
    try {
      const result = await pool.query(
        `SELECT ap.id, ap.user_id, ap.advisor_type, ap.company_name, ap.director_name, 
                ap.company_logo_url, ap.company_website, ap.company_description,
                ap.full_name, ap.profile_photo_url, ap.job_title, ap.professional_bio, 
                ap.contact_phone, ap.contact_email, ap.office_hours, ap.office_address, 
                ap.office_city, ap.office_postcode, ap.is_advisor, ap.expert_team,
                u.email as account_email, u.phone as account_phone
         FROM advisor_profiles ap
         LEFT JOIN users u ON ap.user_id = u.id
         WHERE ap.user_id = $1 AND ap.is_advisor = true
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const profile = result.rows[0];

      // Parse expert_team JSONB field
      let experts = [];
      if (profile.expert_team && typeof profile.expert_team === 'string') {
        try {
          experts = JSON.parse(profile.expert_team);
        } catch (error) {
          console.error('Error parsing expert_team JSON:', error);
          experts = [];
        }
      } else if (profile.expert_team && Array.isArray(profile.expert_team)) {
        experts = profile.expert_team;
      }

      return {
        ...profile,
        experts: experts
      };
    } catch (error) {
      console.error('Error fetching advisor profile details:', error);
      throw error;
    }
  }

  // Get advisor profile for editing (authenticated user)
  static async getAdvisorProfileForEdit(userId) {
    try {
      const profileResult = await pool.query(
        `SELECT id, user_id, advisor_type, company_name, director_name, company_logo_url, company_website, company_description,
                full_name, profile_photo_url, job_title, professional_bio, contact_phone, contact_email,
                office_hours, office_address, office_city, office_postcode, is_advisor, expert_team, created_at, updated_at
         FROM advisor_profiles
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );

      if (profileResult.rows.length === 0) {
        return null;
      }

      const profile = profileResult.rows[0];

      // Parse expert_team JSONB field
      let experts = [];
      if (profile.expert_team && typeof profile.expert_team === 'string') {
        try {
          experts = JSON.parse(profile.expert_team);
        } catch (error) {
          console.error('Error parsing expert_team JSON:', error);
          experts = [];
        }
      } else if (profile.expert_team && Array.isArray(profile.expert_team)) {
        experts = profile.expert_team;
      }

      return {
        ...profile,
        experts: experts
      };
    } catch (error) {
      console.error('Error fetching advisor profile for edit:', error);
      throw error;
    }
  }

  // Add expert team member
  static async addExpertTeamMember(advisorProfileId, expertData) {
    try {
      // First get the current expert team
      const profileResult = await pool.query(
        'SELECT expert_team FROM advisor_profiles WHERE id = $1',
        [advisorProfileId]
      );

      if (profileResult.rows.length === 0) {
        throw new Error('Advisor profile not found');
      }

      let currentExperts = [];
      const currentExpertTeam = profileResult.rows[0].expert_team;
      
      if (currentExpertTeam && typeof currentExpertTeam === 'string') {
        try {
          currentExperts = JSON.parse(currentExpertTeam);
        } catch (error) {
          console.error('Error parsing existing expert_team:', error);
          currentExperts = [];
        }
      } else if (currentExpertTeam && Array.isArray(currentExpertTeam)) {
        currentExperts = currentExpertTeam;
      }

      // Create new expert with unique ID
      const newExpert = {
        id: Date.now() + Math.random(), // Simple unique ID
        fullName: expertData.fullName,
        jobTitle: expertData.jobTitle,
        profilePhotoUrl: expertData.profilePhotoUrl || null,
        phone: expertData.phone || null,
        email: expertData.email || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Add to existing experts
      currentExperts.push(newExpert);

      // Update the expert_team field
      const result = await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [JSON.stringify(currentExperts), advisorProfileId]
      );
      
      return newExpert;
    } catch (error) {
      console.error('Error adding expert team member:', error);
      throw error;
    }
  }

  // Update expert team member
  static async updateExpertTeamMember(expertId, expertData) {
    try {
      // Find the advisor profile that contains this expert
      const profileResult = await pool.query(
        'SELECT id, expert_team FROM advisor_profiles WHERE expert_team::text LIKE $1',
        [`%${expertId}%`]
      );

      if (profileResult.rows.length === 0) {
        throw new Error('Expert not found');
      }

      const profile = profileResult.rows[0];
      let experts = [];
      
      if (profile.expert_team && typeof profile.expert_team === 'string') {
        try {
          experts = JSON.parse(profile.expert_team);
        } catch (error) {
          console.error('Error parsing expert_team:', error);
          throw new Error('Invalid expert team data');
        }
      } else if (profile.expert_team && Array.isArray(profile.expert_team)) {
        experts = profile.expert_team;
      }

      // Find and update the expert
      const expertIndex = experts.findIndex(expert => expert.id == expertId);
      if (expertIndex === -1) {
        throw new Error('Expert not found');
      }

      // Update expert data
      experts[expertIndex] = {
        ...experts[expertIndex],
        fullName: expertData.fullName,
        jobTitle: expertData.jobTitle,
        profilePhotoUrl: expertData.profilePhotoUrl || experts[expertIndex].profilePhotoUrl,
        phone: expertData.phone || experts[expertIndex].phone,
        email: expertData.email || experts[expertIndex].email,
        updatedAt: new Date().toISOString()
      };

      // Update the expert_team field
      await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(experts), profile.id]
      );
      
      return experts[expertIndex];
    } catch (error) {
      console.error('Error updating expert team member:', error);
      throw error;
    }
  }

  // Delete expert team member
  static async deleteExpertTeamMember(expertId) {
    try {
      // Find the advisor profile that contains this expert
      const profileResult = await pool.query(
        'SELECT id, expert_team FROM advisor_profiles WHERE expert_team::text LIKE $1',
        [`%${expertId}%`]
      );

      if (profileResult.rows.length === 0) {
        throw new Error('Expert not found');
      }

      const profile = profileResult.rows[0];
      let experts = [];
      
      if (profile.expert_team && typeof profile.expert_team === 'string') {
        try {
          experts = JSON.parse(profile.expert_team);
        } catch (error) {
          console.error('Error parsing expert_team:', error);
          throw new Error('Invalid expert team data');
        }
      } else if (profile.expert_team && Array.isArray(profile.expert_team)) {
        experts = profile.expert_team;
      }

      // Remove the expert
      const filteredExperts = experts.filter(expert => expert.id != expertId);
      
      if (filteredExperts.length === experts.length) {
        throw new Error('Expert not found');
      }

      // Update the expert_team field
      await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(filteredExperts), profile.id]
      );
      
      return true;
    } catch (error) {
      console.error('Error deleting expert team member:', error);
      throw error;
    }
  }
}

module.exports = User;
 