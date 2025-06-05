const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

// Get admin from ENV (main super admin)
const MAIN_ADMIN = {
  email: process.env.ADMIN_EMAIL || 'fa.rahimi5475@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'FArzaneh5475',
  first_name: process.env.ADMIN_FIRST_NAME || 'Fatemeh',
  last_name: process.env.ADMIN_LAST_NAME || 'Rahimi',
  role: 'super_admin'
};

// Additional predefined admins (can be customized later through dashboard)
const ADDITIONAL_ADMINS = [
  {
    email: 'manager@property.com', 
    password: 'SecureAdminPass2024!',
    first_name: 'Property',
    last_name: 'Manager',
    role: 'admin'
  },
  {
    email: 'sales@property.com',
    password: 'SecureAdminPass2024!', 
    first_name: 'Sales',
    last_name: 'Director',
    role: 'admin'
  },
  {
    email: 'support@property.com',
    password: 'SecureAdminPass2024!',
    first_name: 'Support', 
    last_name: 'Lead',
    role: 'admin'
  },
  {
    email: 'sysadmin@property.com',
    password: 'SecureAdminPass2024!',
    first_name: 'System',
    last_name: 'Administrator', 
    role: 'admin'
  }
];

async function setupAdmins() {
  // Database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
  });

  try {
    console.log('🔧 Setting up admin users...');
    console.log(`📧 Main Admin Email: ${MAIN_ADMIN.email}`);

    // Setup all admins (main + additional)
    const allAdmins = [MAIN_ADMIN, ...ADDITIONAL_ADMINS];

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
    console.log('\n📋 Admin Login Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔑 MAIN ADMIN (from .env):`);
    console.log(`   Email: ${MAIN_ADMIN.email}`);
    console.log(`   Password: ${MAIN_ADMIN.password}`);
    console.log(`   Role: ${MAIN_ADMIN.role}`);
    console.log('');
    
    console.log(`👥 ADDITIONAL ADMINS:`);
    ADDITIONAL_ADMINS.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.first_name} ${admin.last_name}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Password: ${admin.password}`);
      console.log(`   Role: ${admin.role}`);
      console.log('');
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🌐 Admin Login URL: http://localhost:3000/admin-x9k7m2p5q8');
    console.log('💡 Use your ENV email/password to login as main super admin');

  } catch (error) {
    console.error('❌ Error setting up admin users:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupAdmins(); 