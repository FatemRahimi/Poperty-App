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
          company_email VARCHAR(255),
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
          expert_team JSONB,
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
        officeHours,
        officeAddress,
        officeCity,
        officePostcode,
        expertTeam,
        isAdvisor
      } = advisorData;

      // Validate and clean expertTeam data
      let processedExpertTeam = [];
      if (expertTeam && Array.isArray(expertTeam)) {
        console.log('👥 Processing expert team with', expertTeam.length, 'members');
        
        processedExpertTeam = expertTeam
          .filter(expert => expert && typeof expert === 'object') // Filter out invalid entries
          .map((expert, index) => {
            // Clean and validate each expert
            const cleanExpert = {
              id: expert.id || `expert_${Date.now()}_${index}`, // Generate unique ID if missing
              fullName: (expert.fullName || expert.full_name || '').trim(),
              jobTitle: (expert.jobTitle || expert.job_title || '').trim(),
              profilePhotoUrl: expert.profilePhotoUrl || expert.profile_photo_url || null,
              phone: expert.phone || null,
              email: expert.email || null,
              createdAt: expert.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            // Validate required fields
            if (!cleanExpert.fullName || !cleanExpert.jobTitle) {
              console.log(`⚠️ Skipping expert ${index}: missing required fields`);
              return null;
            }
            
            // Clean email if present
            if (cleanExpert.email && typeof cleanExpert.email === 'string') {
              cleanExpert.email = cleanExpert.email.trim();
              if (cleanExpert.email.length > 255) {
                cleanExpert.email = cleanExpert.email.substring(0, 255);
              }
            }
            
            // Clean phone if present
            if (cleanExpert.phone && typeof cleanExpert.phone === 'string') {
              cleanExpert.phone = cleanExpert.phone.trim();
              if (cleanExpert.phone.length > 50) {
                cleanExpert.phone = cleanExpert.phone.substring(0, 50);
              }
            }
            
            console.log(`✅ Processed expert: ${cleanExpert.fullName} - ${cleanExpert.jobTitle}`);
            return cleanExpert;
          })
          .filter(expert => expert !== null); // Remove any null entries
      }
      
      console.log('👥 Final processed expert team count:', processedExpertTeam.length);
      if (processedExpertTeam.length > 0) {
        console.log('👥 Expert team members:', processedExpertTeam.map(e => `${e.fullName} (${e.jobTitle})`));
      }

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
            company_email = $6,
            company_description = $7,
            full_name = $8,
            profile_photo_url = $9,
            job_title = $10,
            professional_bio = $11,
            contact_phone = $12,
            office_hours = $13,
            office_address = $14,
            office_city = $15,
            office_postcode = $16,
            expert_team = $17,
            is_advisor = $18,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $19
          RETURNING *
        `, [
          advisorType,
          companyName,
          directorName,
          companyLogoUrl,
          companyWebsite,
          advisorData.companyEmail,
          companyDescription,
          fullName,
          profilePhotoUrl,
          jobTitle,
          professionalBio,
          contactPhone,
          officeHours,
          officeAddress,
          officeCity,
          officePostcode,
          JSON.stringify(processedExpertTeam),
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
            company_website, company_email, company_description, full_name, profile_photo_url,
            job_title, professional_bio, contact_phone,
            office_hours, office_address, office_city, office_postcode, expert_team, is_advisor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING *
        `, [
          userId, advisorType, companyName, directorName, companyLogoUrl,
          companyWebsite, advisorData.companyEmail, companyDescription, fullName, profilePhotoUrl,
          jobTitle, professionalBio, contactPhone,
          officeHours, officeAddress, officeCity, officePostcode, JSON.stringify(processedExpertTeam), isAdvisor || false
        ]);
        
        profileId = result.rows[0].id;
      }

      // Add expert team members if provided
      if (processedExpertTeam && processedExpertTeam.length > 0) {
        for (const expert of processedExpertTeam) {
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

      console.log('✅ Advisor profile saved successfully with ID:', profileId);
      return { id: profileId, success: true };
    } catch (error) {
      console.error('❌ Error in saveAdvisorProfile:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
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
                ap.company_logo_url, ap.company_website, ap.company_email, ap.company_description,
                ap.full_name, ap.profile_photo_url, ap.job_title, ap.professional_bio, 
                ap.contact_phone, ap.office_hours, ap.office_address, 
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
      if (profile.expert_team) {
        try {
          if (typeof profile.expert_team === 'string') {
            experts = JSON.parse(profile.expert_team);
          } else if (Array.isArray(profile.expert_team)) {
            experts = profile.expert_team;
          } else if (typeof profile.expert_team === 'object') {
            // Handle case where it might be a PostgreSQL JSONB object
            experts = [profile.expert_team];
          }
          
          // Validate and clean the parsed experts
          if (Array.isArray(experts)) {
            experts = experts
              .filter(expert => expert && typeof expert === 'object')
              .map(expert => ({
                id: expert.id || `expert_${Date.now()}_${Math.random()}`,
                fullName: expert.fullName || expert.full_name || '',
                jobTitle: expert.jobTitle || expert.job_title || '',
                profilePhotoUrl: expert.profilePhotoUrl || expert.profile_photo_url || null,
                phone: expert.phone || null,
                email: expert.email || null,
                createdAt: expert.createdAt || expert.created_at || new Date().toISOString(),
                updatedAt: expert.updatedAt || expert.updated_at || new Date().toISOString()
              }))
              .filter(expert => expert.fullName && expert.jobTitle);
          } else {
            experts = [];
          }
          
          console.log('✅ Successfully parsed', experts.length, 'expert team members for public view');
        } catch (error) {
          console.error('❌ Error parsing expert_team JSON for public view:', error);
          console.error('❌ Raw expert_team data:', profile.expert_team);
          experts = [];
        }
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
      // First get the advisor profile
      const profileResult = await pool.query(
        `SELECT id, user_id, advisor_type, company_name, director_name, company_logo_url, company_website, company_email, company_description,
                full_name, profile_photo_url, job_title, professional_bio, contact_phone,
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
      let experts = [];

      // First check if expert_team field has data (JSONB field)
      if (profile.expert_team && profile.expert_team.length > 0) {
        console.log('✅ Found expert team data in expert_team JSONB field');
        experts = profile.expert_team.map(expert => ({
          id: expert.id,
          full_name: expert.fullName || expert.full_name || '',
          job_title: expert.jobTitle || expert.job_title || '',
          profile_photo_url: expert.profilePhotoUrl || expert.profile_photo_url || '',
          phone: expert.phone || '',
          email: expert.email || ''
        }));
        console.log(`👥 Parsed ${experts.length} experts from expert_team JSONB field`);
      } else {
        // If no data in expert_team field, check advisor_experts table
        console.log('🔍 No data in expert_team field, checking advisor_experts table...');
        const expertsResult = await pool.query(
          `SELECT id, full_name, job_title, profile_photo_url, phone, email, created_at, updated_at
           FROM advisor_experts
           WHERE advisor_profile_id = $1
           ORDER BY id ASC`,
          [profile.id]
        );
        
        experts = expertsResult.rows;
        console.log(`✅ Successfully retrieved ${experts.length} expert team members from advisor_experts table`);
      }

      console.log('👥 Expert team members:', experts);

      return {
        id: profile.id,
        user_id: profile.user_id,
        advisor_type: profile.advisor_type,
        company_name: profile.company_name,
        director_name: profile.director_name,
        company_logo_url: profile.company_logo_url,
        company_website: profile.company_website,
        company_email: profile.company_email,
        company_description: profile.company_description,
        full_name: profile.full_name,
        profile_photo_url: profile.profile_photo_url,
        job_title: profile.job_title,
        professional_bio: profile.professional_bio,
        contact_phone: profile.contact_phone,
        office_hours: profile.office_hours,
        office_address: profile.office_address,
        office_city: profile.office_city,
        office_postcode: profile.office_postcode,
        is_advisor: profile.is_advisor,
        experts: experts,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      };
    } catch (error) {
      console.error('❌ Error in getAdvisorProfileForEdit:', error);
      throw error;
    }
  }

  // Add expert team member
  static async addExpertTeamMember(advisorProfileId, expertData) {
    try {
      console.log('👥 Adding expert team member to profile:', advisorProfileId);
      console.log('👥 Expert data:', expertData);
      
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
      
      // Parse existing expert team
      if (currentExpertTeam) {
        try {
          if (typeof currentExpertTeam === 'string') {
            currentExperts = JSON.parse(currentExpertTeam);
          } else if (Array.isArray(currentExpertTeam)) {
            currentExperts = currentExpertTeam;
          } else if (typeof currentExpertTeam === 'object') {
            currentExperts = [currentExpertTeam];
          }
          
          // Ensure it's an array
          if (!Array.isArray(currentExperts)) {
            currentExperts = [];
          }
        } catch (error) {
          console.error('❌ Error parsing existing expert_team:', error);
          currentExperts = [];
        }
      }

      // Validate and clean the new expert data
      if (!expertData.fullName || !expertData.jobTitle) {
        throw new Error('Full name and job title are required for expert team member');
      }

      // Create new expert with unique ID
      const newExpert = {
        id: `expert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fullName: expertData.fullName.trim(),
        jobTitle: expertData.jobTitle.trim(),
        profilePhotoUrl: expertData.profilePhotoUrl || null,
        phone: expertData.phone ? expertData.phone.trim() : null,
        email: expertData.email ? expertData.email.trim() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Validate email length
      if (newExpert.email && newExpert.email.length > 255) {
        newExpert.email = newExpert.email.substring(0, 255);
      }

      // Validate phone length
      if (newExpert.phone && newExpert.phone.length > 50) {
        newExpert.phone = newExpert.phone.substring(0, 50);
      }

      // Add to existing experts
      currentExperts.push(newExpert);

      console.log('👥 Updated expert team count:', currentExperts.length);

      // Update the expert_team field
      const result = await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [JSON.stringify(currentExperts), advisorProfileId]
      );
      
      console.log('✅ Expert team member added successfully');
      return newExpert;
    } catch (error) {
      console.error('❌ Error adding expert team member:', error);
      throw error;
    }
  }

  // Update expert team member
  static async updateExpertTeamMember(expertId, expertData) {
    try {
      console.log('👥 Updating expert team member:', expertId);
      console.log('👥 Update data:', expertData);
      
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
      
      // Parse existing expert team
      if (profile.expert_team) {
        try {
          if (typeof profile.expert_team === 'string') {
            experts = JSON.parse(profile.expert_team);
          } else if (Array.isArray(profile.expert_team)) {
            experts = profile.expert_team;
          } else if (typeof profile.expert_team === 'object') {
            experts = [profile.expert_team];
          }
          
          // Ensure it's an array
          if (!Array.isArray(experts)) {
            experts = [];
          }
        } catch (error) {
          console.error('❌ Error parsing expert_team:', error);
          throw new Error('Invalid expert team data');
        }
      }

      // Find and update the expert
      const expertIndex = experts.findIndex(expert => expert.id == expertId);
      if (expertIndex === -1) {
        throw new Error('Expert not found');
      }

      // Validate required fields
      if (!expertData.fullName || !expertData.jobTitle) {
        throw new Error('Full name and job title are required');
      }

      // Update expert data
      experts[expertIndex] = {
        ...experts[expertIndex],
        fullName: expertData.fullName.trim(),
        jobTitle: expertData.jobTitle.trim(),
        profilePhotoUrl: expertData.profilePhotoUrl || experts[expertIndex].profilePhotoUrl,
        phone: expertData.phone ? expertData.phone.trim() : experts[expertIndex].phone,
        email: expertData.email ? expertData.email.trim() : experts[expertIndex].email,
        updatedAt: new Date().toISOString()
      };

      // Validate email length
      if (experts[expertIndex].email && experts[expertIndex].email.length > 255) {
        experts[expertIndex].email = experts[expertIndex].email.substring(0, 255);
      }

      // Validate phone length
      if (experts[expertIndex].phone && experts[expertIndex].phone.length > 50) {
        experts[expertIndex].phone = experts[expertIndex].phone.substring(0, 50);
      }

      console.log('👥 Updated expert:', experts[expertIndex].fullName);

      // Update the expert_team field
      await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(experts), profile.id]
      );
      
      console.log('✅ Expert team member updated successfully');
      return experts[expertIndex];
    } catch (error) {
      console.error('❌ Error updating expert team member:', error);
      throw error;
    }
  }

  // Delete expert team member
  static async deleteExpertTeamMember(expertId) {
    try {
      console.log('👥 Deleting expert team member:', expertId);
      
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
      
      // Parse existing expert team
      if (profile.expert_team) {
        try {
          if (typeof profile.expert_team === 'string') {
            experts = JSON.parse(profile.expert_team);
          } else if (Array.isArray(profile.expert_team)) {
            experts = profile.expert_team;
          } else if (typeof profile.expert_team === 'object') {
            experts = [profile.expert_team];
          }
          
          // Ensure it's an array
          if (!Array.isArray(experts)) {
            experts = [];
          }
        } catch (error) {
          console.error('❌ Error parsing expert_team:', error);
          throw new Error('Invalid expert team data');
        }
      }

      // Find the expert to delete
      const expertToDelete = experts.find(expert => expert.id == expertId);
      if (!expertToDelete) {
        throw new Error('Expert not found');
      }

      console.log('👥 Deleting expert:', expertToDelete.fullName);

      // Remove the expert
      const filteredExperts = experts.filter(expert => expert.id != expertId);
      
      if (filteredExperts.length === experts.length) {
        throw new Error('Expert not found');
      }

      console.log('👥 Expert team count after deletion:', filteredExperts.length);

      // Update the expert_team field
      await pool.query(
        'UPDATE advisor_profiles SET expert_team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(filteredExperts), profile.id]
      );
      
      console.log('✅ Expert team member deleted successfully');
      return true;
    } catch (error) {
      console.error('❌ Error deleting expert team member:', error);
      throw error;
    }
  }
}

module.exports = User;
 