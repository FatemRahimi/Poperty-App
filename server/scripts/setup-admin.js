const bcrypt = require('bcryptjs');
const pool = require('../models/db');
const adminConfig = require('../config/admin.config');

async function setupAdminUser() {
  try {
    console.log('🔐 Setting up production admin user...');
    
    // Hash the admin password
    const hashedPassword = await bcrypt.hash(adminConfig.password, 12);
    
    // Check if admin user already exists
    const existingAdmin = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = 'admin'",
      [adminConfig.email]
    );
    
    if (existingAdmin.rows.length > 0) {
      // Update existing admin
      await pool.query(
        `UPDATE users 
         SET password = $1, first_name = $2, last_name = $3, is_verified = true, updated_at = CURRENT_TIMESTAMP
         WHERE email = $4 AND role = 'admin'`,
        [hashedPassword, adminConfig.firstName, adminConfig.lastName, adminConfig.email]
      );
      console.log('✅ Admin user updated successfully');
    } else {
      // Create new admin user
      await pool.query(
        `INSERT INTO users (email, password, first_name, last_name, role, is_verified) 
         VALUES ($1, $2, $3, $4, 'admin', true)`,
        [adminConfig.email, hashedPassword, adminConfig.firstName, adminConfig.lastName]
      );
      console.log('✅ Admin user created successfully');
    }
    
    console.log('📧 Admin Email:', adminConfig.email);
    console.log('🔑 Admin Password:', adminConfig.password);
    console.log('🛡️ Secure Route:', `/admin-${adminConfig.routeSecret}`);
    console.log('🌐 Allowed IPs:', adminConfig.allowedIPs.join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
    process.exit(1);
  }
}

setupAdminUser(); 