require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE ENVIRONMENT & DATABASE CHECK\n');
console.log('='.repeat(60));

// 1. Check .env file exists
const envPath = path.join(__dirname, '..', '.env');
console.log('\n📄 STEP 1: Checking .env file...\n');

if (!fs.existsSync(envPath)) {
  console.log('  ❌ .env file NOT FOUND at:', envPath);
  console.log('  💡 Create server/.env file with required variables');
  process.exit(1);
} else {
  console.log('  ✅ .env file exists at:', envPath);
  
  // Read and parse .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  console.log(`  📊 Found ${envLines.length} environment variables\n`);
}

// 2. Check all required environment variables
console.log('📋 STEP 2: Checking Required Environment Variables...\n');

const requiredVars = {
  'DATABASE_URL': {
    required: true,
    description: 'PostgreSQL connection string',
    format: 'postgres://user:password@host:port/database'
  },
  'JWT_SECRET': {
    required: true,
    description: 'JWT token signing secret (min 32 chars)',
    minLength: 32
  },
  'CLIENT_URL': {
    required: true,
    description: 'Frontend application URL'
  },
  'PORT': {
    required: true,
    description: 'Backend server port'
  }
};

const optionalVars = {
  'SESSION_SECRET': {
    description: 'Session secret (can use JWT_SECRET)',
    default: 'Uses JWT_SECRET if not set'
  },
  'GOOGLE_CLIENT_ID': {
    description: 'Google OAuth Client ID',
    required: false
  },
  'GOOGLE_CLIENT_SECRET': {
    description: 'Google OAuth Client Secret',
    required: false
  },
  'GOOGLE_CALLBACK_URL': {
    description: 'Google OAuth callback URL',
    required: false
  },
  'ADMIN_EMAIL': {
    description: 'Admin email address',
    default: 'admin@property.com'
  },
  'ADMIN_PASSWORD': {
    description: 'Admin password',
    default: 'SecureAdminPass2024!@#'
  },
  'ADMIN_ROUTE_SECRET': {
    description: 'Admin login route secret',
    default: 'x9k7m2p5q8'
  },
  'EMAIL_USER': {
    description: 'Email service user (for sending emails)',
    required: false
  },
  'EMAIL_PASSWORD': {
    description: 'Email service password',
    required: false
  },
  'EMAIL_SERVICE': {
    description: 'Email service provider',
    default: 'gmail'
  },
  'NODE_ENV': {
    description: 'Environment mode',
    default: 'development'
  }
};

let missingRequired = [];
let warnings = [];

// Check required variables
for (const [varName, config] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  if (!value) {
    console.log(`  ❌ ${varName}: MISSING`);
    console.log(`     ${config.description}`);
    missingRequired.push(varName);
  } else {
    // Mask sensitive values
    if (varName.includes('SECRET') || varName.includes('PASSWORD') || varName.includes('URL') && varName.includes('DATABASE')) {
      const masked = varName === 'DATABASE_URL' 
        ? value.replace(/:([^:@]+)@/, ':****@')
        : '*'.repeat(Math.min(value.length, 20));
      console.log(`  ✅ ${varName}: ${masked} (${value.length} chars)`);
    } else {
      console.log(`  ✅ ${varName}: ${value}`);
    }
    
    // Additional validation
    if (config.minLength && value.length < config.minLength) {
      console.log(`     ⚠️  WARNING: Too short (needs at least ${config.minLength} characters)`);
      warnings.push(`${varName} is too short`);
    }
    
    if (varName === 'DATABASE_URL') {
      // Validate DATABASE_URL format
      const dbUrlPattern = /^postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
      if (!dbUrlPattern.test(value)) {
        console.log(`     ⚠️  WARNING: Invalid format. Expected: postgres://user:password@host:port/database`);
        warnings.push('DATABASE_URL format may be invalid');
      } else {
        const match = value.match(dbUrlPattern);
        console.log(`     📊 User: ${match[1]}, Host: ${match[3]}, Port: ${match[4]}, Database: ${match[5]}`);
      }
    }
  }
}

// Check optional variables
console.log('\n📋 STEP 3: Checking Optional Environment Variables...\n');
for (const [varName, config] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  if (value) {
    if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
      console.log(`  ✅ ${varName}: ${'*'.repeat(Math.min(value.length, 20))} (${value.length} chars)`);
    } else {
      console.log(`  ✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`  ⚠️  ${varName}: Not set ${config.default ? `(default: ${config.default})` : ''}`);
  }
}

// 3. Test database connection
console.log('\n🔌 STEP 4: Testing Database Connection...\n');

async function testDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.log('  ❌ Cannot test database: DATABASE_URL not set');
    return;
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  
  try {
    // Test connection
    const testResult = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('  ✅ Database connection successful');
    console.log(`     Current time: ${testResult.rows[0].current_time}`);
    console.log(`     PostgreSQL: ${testResult.rows[0].pg_version.split(',')[0]}`);
    
    // Check database name
    const dbResult = await pool.query('SELECT current_database() as db_name');
    console.log(`     Database: ${dbResult.rows[0].db_name}`);
    
    // Check tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n  📊 Tables in database: ${tablesResult.rows.length}`);
    const expectedTables = [
      'users', 'admins', 'properties', 'property_images', 
      'property_amenities', 'property_submissions', 'email_notifications',
      'advisor_profiles', 'advisor_experts', 'schema_migrations'
    ];
    
    const existingTables = tablesResult.rows.map(r => r.table_name);
    const missingTables = expectedTables.filter(t => !existingTables.includes(t));
    
    if (missingTables.length > 0) {
      console.log(`     ⚠️  Missing tables: ${missingTables.join(', ')}`);
      warnings.push(`Missing tables: ${missingTables.join(', ')}`);
    } else {
      console.log(`     ✅ All expected tables exist`);
    }
    
    // Check admin users
    const adminsResult = await pool.query('SELECT COUNT(*) as count FROM admins WHERE is_active = true');
    console.log(`\n  👤 Active admin users: ${adminsResult.rows[0].count}`);
    
    if (adminsResult.rows[0].count === 0) {
      console.log(`     ⚠️  No active admin users found`);
      warnings.push('No active admin users');
    } else {
      const adminList = await pool.query('SELECT email, role FROM admins WHERE is_active = true LIMIT 5');
      adminList.rows.forEach(admin => {
        console.log(`     - ${admin.email} (${admin.role})`);
      });
    }
    
    // Check users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`\n  👥 Total users: ${usersResult.rows[0].count}`);
    
    // Check properties
    const propsResult = await pool.query('SELECT COUNT(*) as count FROM properties');
    console.log(`  🏠 Total properties: ${propsResult.rows[0].count}`);
    
    await pool.end();
    
  } catch (error) {
    console.log('  ❌ Database connection failed');
    console.log(`     Error: ${error.message}`);
    if (error.message.includes('password authentication failed')) {
      console.log('     💡 Check DATABASE_URL password in .env file');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('     💡 PostgreSQL server may not be running');
    } else if (error.message.includes('does not exist')) {
      console.log('     💡 Database may not exist. Run: node server/db/setup-database.js');
    }
    await pool.end();
  }
}

// Run database test
testDatabase().then(() => {
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📝 SUMMARY\n');
  
  if (missingRequired.length > 0) {
    console.log(`  ❌ Missing ${missingRequired.length} required variable(s): ${missingRequired.join(', ')}`);
    console.log('\n  🔧 TO FIX:');
    console.log('  1. Open server/.env file');
    console.log('  2. Add the missing variables');
    console.log('  3. Restart the server (npm run dev)');
    process.exit(1);
  } else {
    console.log('  ✅ All required environment variables are set!');
  }
  
  if (warnings.length > 0) {
    console.log(`\n  ⚠️  ${warnings.length} warning(s):`);
    warnings.forEach(w => console.log(`     - ${w}`));
  }
  
  console.log('\n  💡 Next steps:');
  console.log('     - If database connection failed, check DATABASE_URL');
  console.log('     - If JWT_SECRET is too short, update it to at least 32 characters');
  console.log('     - If admin dashboard doesn\'t work, check browser console and server logs');
  
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});


