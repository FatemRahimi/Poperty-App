/**
 * Check Google OAuth Configuration
 * This script verifies your OAuth setup
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}🔍 Checking Google OAuth Configuration${colors.reset}\n`);

const checks = {
  'GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID,
  'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET,
  'GOOGLE_CALLBACK_URL': process.env.GOOGLE_CALLBACK_URL,
  'CLIENT_URL': process.env.CLIENT_URL,
  'PORT': process.env.PORT,
  'JWT_SECRET': process.env.JWT_SECRET
};

let allGood = true;

console.log(`${colors.blue}📋 Environment Variables:${colors.reset}\n`);

Object.entries(checks).forEach(([key, value]) => {
  if (value) {
    if (key === 'GOOGLE_CLIENT_SECRET') {
      console.log(`   ${colors.green}✅${colors.reset} ${key}: ${'*'.repeat(Math.min(value.length, 20))} (${value.length} chars)`);
    } else {
      console.log(`   ${colors.green}✅${colors.reset} ${key}: ${value}`);
    }
  } else {
    console.log(`   ${colors.red}❌${colors.reset} ${key}: ${colors.red}MISSING${colors.reset}`);
    allGood = false;
  }
});

console.log();

// Validate Google Client ID format
if (checks.GOOGLE_CLIENT_ID) {
  if (!checks.GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')) {
    console.log(`${colors.yellow}⚠️  Warning: GOOGLE_CLIENT_ID doesn't look like a valid Google Client ID${colors.reset}`);
    console.log(`   Expected format: something.apps.googleusercontent.com`);
    allGood = false;
  }
}

// Validate callback URL
if (checks.GOOGLE_CALLBACK_URL) {
  const expectedCallback = `http://localhost:${checks.PORT || 5050}/api/auth/google/callback`;
  if (checks.GOOGLE_CALLBACK_URL !== expectedCallback) {
    console.log(`${colors.yellow}⚠️  Warning: Callback URL may not match${colors.reset}`);
    console.log(`   Current: ${checks.GOOGLE_CALLBACK_URL}`);
    console.log(`   Expected: ${expectedCallback}`);
    console.log(`   Make sure this EXACT URL is in Google Console's "Authorized redirect URIs"`);
  }
} else {
  const defaultCallback = `http://localhost:${checks.PORT || 5050}/api/auth/google/callback`;
  console.log(`${colors.yellow}⚠️  GOOGLE_CALLBACK_URL not set, using default:${colors.reset}`);
  console.log(`   ${defaultCallback}`);
  console.log(`   Make sure this EXACT URL is in Google Console`);
}

console.log();

if (allGood) {
  console.log(`${colors.green}✅ All required environment variables are set!${colors.reset}\n`);
  console.log(`${colors.blue}📝 Next Steps:${colors.reset}`);
  console.log(`   1. Verify in Google Cloud Console:`);
  console.log(`      - Authorized redirect URI: ${checks.GOOGLE_CALLBACK_URL || `http://localhost:${checks.PORT || 5050}/api/auth/google/callback`}`);
  console.log(`      - Authorized JavaScript origin: ${checks.CLIENT_URL || 'http://localhost:3000'}`);
  console.log(`   2. Make sure OAuth consent screen is configured`);
  console.log(`   3. If app is in "Testing" mode, add your email as a test user`);
  console.log(`   4. Restart your server: npm run dev`);
} else {
  console.log(`${colors.red}❌ Some environment variables are missing!${colors.reset}\n`);
  console.log(`${colors.yellow}💡 How to Fix:${colors.reset}`);
  console.log(`   1. Create or edit: server/.env`);
  console.log(`   2. Add the missing variables`);
  console.log(`   3. Get Google OAuth credentials from: https://console.cloud.google.com/`);
  console.log(`   4. See GOOGLE_OAUTH_SETUP.md for detailed instructions`);
}

console.log();

