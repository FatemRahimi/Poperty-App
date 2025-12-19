require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function resetAdminPassword() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'fa.rahimi5475@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'FArzaneh5475';

    console.log('\n🔐 Resetting Admin Password\n');
    console.log('='.repeat(60));
    console.log(`📧 Admin Email: ${adminEmail}`);
    console.log(`🔑 New Password: ${adminPassword}`);
    console.log('='.repeat(60));

    // Check if admin exists
    const checkResult = await pool.query(
      'SELECT id, email, role FROM admins WHERE email = $1',
      [adminEmail]
    );

    if (checkResult.rows.length === 0) {
      console.log(`\n❌ Admin user not found: ${adminEmail}`);
      console.log('\n💡 Creating new admin user...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Create admin user
      const insertResult = await pool.query(`
        INSERT INTO admins (email, password, first_name, last_name, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        RETURNING id, email, first_name, last_name, role
      `, [
        adminEmail,
        hashedPassword,
        process.env.ADMIN_FIRST_NAME || 'Admin',
        process.env.ADMIN_LAST_NAME || 'User',
        'super_admin'
      ]);

      const admin = insertResult.rows[0];
      console.log(`\n✅ Admin user created successfully!`);
      console.log(`   ID: ${admin.id}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Role: ${admin.role}`);
    } else {
      const admin = checkResult.rows[0];
      console.log(`\n✅ Admin user found: ${admin.email} (${admin.role})`);
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      // Update password
      await pool.query(`
        UPDATE admins 
        SET password = $1, 
            password_changed_at = NOW(),
            updated_at = NOW()
        WHERE email = $2
      `, [hashedPassword, adminEmail]);

      console.log(`\n✅ Password updated successfully!`);
      console.log(`   Email: ${adminEmail}`);
      console.log(`   Password: ${adminPassword}`);
    }

    // Verify the password works
    console.log('\n🔍 Verifying password...');
    const verifyResult = await pool.query(
      'SELECT password FROM admins WHERE email = $1',
      [adminEmail]
    );

    if (verifyResult.rows.length > 0) {
      const storedHash = verifyResult.rows[0].password;
      const isMatch = await bcrypt.compare(adminPassword, storedHash);
      
      if (isMatch) {
        console.log('✅ Password verification successful!');
      } else {
        console.log('❌ Password verification failed!');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📝 Login Information:');
    console.log(`   URL: http://localhost:3000/admin-x9k7m2p5q8`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('='.repeat(60));
    console.log('\n✅ Done! You can now login with the password from .env file.\n');

  } catch (error) {
    console.error('\n❌ Error resetting admin password:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();


