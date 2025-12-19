require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function checkAdmins() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const result = await pool.query('SELECT id, email, role, is_active, last_login FROM admins ORDER BY id');
    
    console.log('\n🔍 Admin Users in Database:\n');
    
    if (result.rows.length === 0) {
      console.log('  ❌ No admin users found!');
      console.log('\n  💡 To create admin users, run:');
      console.log('     node server/scripts/setup-admins.js');
    } else {
      result.rows.forEach((admin, index) => {
        console.log(`  ${index + 1}. ${admin.email}`);
        console.log(`     Role: ${admin.role}`);
        console.log(`     Active: ${admin.is_active ? '✅ Yes' : '❌ No'}`);
        console.log(`     Last Login: ${admin.last_login || 'Never'}`);
        console.log('');
      });
    }
    
    // Check active admins
    const activeAdmins = result.rows.filter(a => a.is_active);
    console.log(`\n📊 Summary: ${activeAdmins.length} active admin(s) out of ${result.rows.length} total`);
    
  } catch (error) {
    console.error('❌ Error checking admins:', error.message);
  } finally {
    await pool.end();
  }
}

checkAdmins();


