require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const nodemailer = require('nodemailer');

const BASE_URL = 'http://localhost:5050';
const testEmail = process.env.TEST_EMAIL || process.env.EMAIL_USER;
const adminEmail = process.env.ADMIN_EMAIL;

async function checkEmailConfig() {
  console.log('\n=== Email Configuration ===');
  console.log('EMAIL_USER set:', !!process.env.EMAIL_USER);
  console.log('EMAIL_PASSWORD set:', !!process.env.EMAIL_PASSWORD);
  console.log('EMAIL_PASS set:', !!process.env.EMAIL_PASS);
  console.log('ADMIN_EMAIL:', adminEmail || '(not set)');
  console.log('Test recipient:', testEmail);
}

async function testDirectVerificationEmail() {
  console.log('\n=== Test 1: Verification email (auth/register) ===');
  const link = `${process.env.CLIENT_URL || 'http://localhost:3000'}/login?verified=test`;
  await sendVerificationEmail(testEmail, link);
  console.log('✅ Verification email sent to', testEmail);
}

async function testDirectPasswordResetEmail() {
  console.log('\n=== Test 2: Password reset email ===');
  const link = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/test-token`;
  await sendPasswordResetEmail(testEmail, link);
  console.log('✅ Password reset email sent to', testEmail);
}

async function testPropertyEmailLogic() {
  console.log('\n=== Test 3: Property notification email logic ===');
  const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  const emailConfiguredFixed = !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
  console.log('Current propertyController check (EMAIL_PASS):', emailConfigured ? 'PASS' : 'FAIL - emails skipped');
  console.log('Correct check (EMAIL_PASSWORD):', emailConfiguredFixed ? 'PASS' : 'FAIL');

  if (!emailConfiguredFixed) {
    console.log('⚠️ Property emails would be skipped due to config check');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Customer confirmation email
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: testEmail,
    subject: '[TEST] Property Submission Confirmed - Test Property',
    html: '<p>Test customer property submission confirmation email.</p>',
  });
  console.log('✅ Customer property email sent to', testEmail);

  // Admin alert email
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: adminEmail || testEmail,
    subject: '[TEST] New Property Submission: Test Property',
    html: '<p>Test admin property submission alert email.</p>',
  });
  console.log('✅ Admin property email sent to', adminEmail || testEmail);
}

async function testSignupApi() {
  console.log('\n=== Test 4: Signup API (register flow) ===');
  const uniqueEmail = `test.user.${Date.now()}@mailinator.com`;
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail, password: 'TestPass123!' }),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
  console.log('Note: signup verification email is currently commented out in authController.js');
}

async function testForgotPasswordApi() {
  console.log('\n=== Test 5: Forgot password API ===');
  const res = await fetch(`${BASE_URL}/api/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
}

async function main() {
  try {
    await checkEmailConfig();
    await testDirectVerificationEmail();
    await testDirectPasswordResetEmail();
    await testPropertyEmailLogic();
    await testSignupApi();
    await testForgotPasswordApi();
    console.log('\n=== All tests completed ===');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    if (err.response) console.error(err.response);
    process.exit(1);
  }
}

main();
