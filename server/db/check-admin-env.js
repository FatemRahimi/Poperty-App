require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

console.log('🔍 Checking Admin Dashboard Environment Variables...\n');

const requiredVars = {
  'JWT_SECRET': {
    required: true,
    description: 'Secret key for JWT token signing and verification',
    impact: 'Admin authentication will fail without this'
  },
  'CLIENT_URL': {
    required: true,
    description: 'Frontend URL for redirects and links',
    impact: 'Email links and redirects may not work correctly'
  },
  'PORT': {
    required: true,
    description: 'Backend server port',
    impact: 'Server may not start on correct port'
  }
};

const optionalVars = {
  'ADMIN_EMAIL': {
    description: 'Admin email address (defaults to admin@property.com)',
    default: 'admin@property.com'
  },
  'ADMIN_PASSWORD': {
    description: 'Admin password (defaults to SecureAdminPass2024!@#)',
    default: 'SecureAdminPass2024!@#'
  },
  'ADMIN_ROUTE_SECRET': {
    description: 'Secret route for admin login page (defaults to x9k7m2p5q8)',
    default: 'x9k7m2p5q8'
  },
  'DATABASE_URL': {
    description: 'PostgreSQL connection string',
    impact: 'Database connections will fail'
  }
};

console.log('📋 REQUIRED VARIABLES:\n');
let missingRequired = [];
for (const [varName, info] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
      console.log(`  ✅ ${varName}: ${'*'.repeat(Math.min(value.length, 20))} (${value.length} chars)`);
    } else {
      console.log(`  ✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`  ❌ ${varName}: MISSING`);
    console.log(`     Description: ${info.description}`);
    console.log(`     Impact: ${info.impact}`);
    missingRequired.push(varName);
  }
}

console.log('\n📋 OPTIONAL VARIABLES:\n');
for (const [varName, info] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  if (value) {
    if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
      console.log(`  ✅ ${varName}: ${'*'.repeat(Math.min(value.length, 20))} (${value.length} chars)`);
    } else {
      console.log(`  ✅ ${varName}: ${value}`);
    }
  } else {
    console.log(`  ⚠️  ${varName}: Not set (using default: ${info.default || 'none'})`);
    if (info.impact) {
      console.log(`     Impact: ${info.impact}`);
    }
  }
}

console.log('\n🔍 CONFIGURATION CHECK:\n');

// Check JWT_SECRET
if (!process.env.JWT_SECRET) {
  console.log('  ❌ JWT_SECRET is missing!');
  console.log('     This will cause admin authentication to fail.');
  console.log('     Add to .env: JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c');
} else if (process.env.JWT_SECRET.length < 32) {
  console.log('  ⚠️  JWT_SECRET is too short (should be at least 32 characters)');
} else {
  console.log('  ✅ JWT_SECRET is set and has sufficient length');
}

// Check CLIENT_URL
if (!process.env.CLIENT_URL) {
  console.log('  ❌ CLIENT_URL is missing!');
  console.log('     Add to .env: CLIENT_URL=http://localhost:3000');
} else {
  console.log('  ✅ CLIENT_URL is set');
}

// Check PORT
if (!process.env.PORT) {
  console.log('  ⚠️  PORT is not set (will use default: 5050)');
} else {
  console.log(`  ✅ PORT is set to ${process.env.PORT}`);
}

// Check DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.log('  ⚠️  DATABASE_URL is missing!');
  console.log('     Database connections may fail.');
} else {
  const dbUrl = process.env.DATABASE_URL;
  // Check if password is in URL
  if (dbUrl.includes('@') && !dbUrl.includes('://') || dbUrl.split('@').length === 1) {
    console.log('  ⚠️  DATABASE_URL may be missing password');
  } else {
    console.log('  ✅ DATABASE_URL is set');
  }
}

console.log('\n📝 SUMMARY:\n');
if (missingRequired.length > 0) {
  console.log(`  ❌ Missing ${missingRequired.length} required variable(s): ${missingRequired.join(', ')}`);
  console.log('\n  🔧 TO FIX:');
  console.log('  1. Open server/.env file');
  console.log('  2. Add the missing variables');
  console.log('  3. Restart the server (npm run dev)');
  process.exit(1);
} else {
  console.log('  ✅ All required environment variables are set!');
  console.log('\n  💡 If admin dashboard still doesn\'t work:');
  console.log('     - Check browser console for API errors');
  console.log('     - Check server logs for authentication errors');
  console.log('     - Verify admin user exists in database');
  process.exit(0);
}

