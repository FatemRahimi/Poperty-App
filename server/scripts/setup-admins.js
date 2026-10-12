const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword || !String(adminPassword).trim()) {
  console.error('ADMIN_PASSWORD is required. Set it in the environment before running this script.');
  process.exit(1);
}

// Get admin from ENV (main super admin)
const MAIN_ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@example.com',
  password: adminPassword,
  first_name: process.env.ADMIN_FIRST_NAME || 'Admin',
  last_name: process.env.ADMIN_LAST_NAME || 'User',
  role: 'super_admin'
};

async function setupAdmins() {
  // Database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/propertydb'
  });

  try {
    console.log('🔧 Setting up admin users...');
    console.log(`📧 Main Admin Email: ${MAIN_ADMIN.email}`);

    const allAdmins = [MAIN_ADMIN];

    for (const admin of allAdmins) {
      // Hash the password
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      
      // Insert or update admin user in admins table
      const query = `
        INSERT INTO admins (email, password, first_name, last_name, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT (email) 
        DO UPDATE SET 
          password = EXCLUDED.password,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = EXCLUDED.role,
          is_active = true,
          password_changed_at = NOW(),
          updated_at = NOW()
        RETURNING id, email, first_name, last_name, role;
      `;
      
      const result = await pool.query(query, [
        admin.email,
        hashedPassword,
        admin.first_name,
        admin.last_name,
        admin.role
      ]);

      const user = result.rows[0];
      console.log(`✅ Admin created/updated: ${user.first_name} ${user.last_name} (${user.email}) - Role: ${user.role}`);
    }

    console.log('\n🎉 All admin users set up successfully!');
    console.log(`Role: ${MAIN_ADMIN.role}`);
    console.log('Admin password was taken from ADMIN_PASSWORD and was not printed.');

  } catch (error) {
    console.error('❌ Error setting up admin users:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupAdmins(); 