/**
 * Check .env file and DATABASE_URL format
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

console.log('Checking .env configuration...\n');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('❌ DATABASE_URL not found in .env file');
  console.log('\nPlease add to server/.env:');
  console.log('DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/propertydb');
  process.exit(1);
}

console.log('DATABASE_URL:', dbUrl.replace(/:([^:@]+)@/, ':****@')); // Hide password

// Check format
const match = dbUrl.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);

if (!match) {
  console.log('\n❌ Invalid DATABASE_URL format');
  console.log('Expected: postgres://user:password@host:port/database');
  console.log('Current:', dbUrl);
  process.exit(1);
}

console.log('\n✅ DATABASE_URL format is valid');
console.log('   User:', match[1]);
console.log('   Host:', match[3]);
console.log('   Port:', match[4]);
console.log('   Database:', match[5]);

// Check other required vars
console.log('\nChecking other environment variables...');
const required = {
  'CLIENT_URL': process.env.CLIENT_URL,
  'PORT': process.env.PORT,
  'JWT_SECRET': process.env.JWT_SECRET ? 'Set' : 'Missing',
  'GOOGLE_CLIENT_ID': process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing (optional)',
  'GOOGLE_CLIENT_SECRET': process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing (optional)',
};

Object.entries(required).forEach(([key, value]) => {
  const status = value ? '✅' : '⚠️';
  console.log(`   ${status} ${key}: ${value || 'Not set'}`);
});

