require('dotenv').config();
const pool = require('./models/db');

const EMAIL_TO_VERIFY = 'shahrzadrahy@gmail.com';

async function verifyUser(email) {
  try {
    console.log('Looking for user with email:', email);
    
    const results = await pool.query('SELECT id, email, verified FROM users WHERE email = $1', [email]);
    
    if (results.rows.length === 0) {
      console.log('User not found');
      return;
    }
    
    console.log('User found:', results.rows[0]);
    
    if (results.rows[0].verified) {
      console.log('User is already verified.');
      return;
    }
    
    await pool.query('UPDATE users SET verified = TRUE WHERE email = $1', [email]);
    console.log('User verified successfully!');
    
    const newResults = await pool.query('SELECT id, email, verified FROM users WHERE email = $1', [email]);
    console.log('Updated user:', newResults.rows[0]);
  } catch (error) {
    console.error('Error verifying user:', error);
  } finally {
    pool.end();
  }
}

verifyUser(EMAIL_TO_VERIFY); 