const pool = require('../models/db');

async function checkDatabase() {
  try {
    console.log('\n📊 Checking Advisor Profiles Expert Team Data Size...\n');
    
    const result = await pool.query(`
      SELECT 
        user_id, 
        advisor_type,
        LENGTH(expert_team::text) as json_size,
        (expert_team::text LIKE '%data:image%') as has_base64
      FROM advisor_profiles 
      WHERE expert_team IS NOT NULL
      ORDER BY json_size DESC
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No advisor profiles found with expert team data');
    } else {
      console.log(`✅ Found ${result.rows.length} advisor profile(s) with expert teams:\n`);
      
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. User ID: ${row.user_id}`);
        console.log(`   Type: ${row.advisor_type}`);
        console.log(`   JSON Size: ${row.json_size} bytes`);
        console.log(`   Has Base64: ${row.has_base64 ? '❌ YES (PROBLEM!)' : '✅ NO (Good)'}`);
        
        if (row.json_size > 10000) {
          console.log(`   ⚠️  WARNING: JSON size is too large!`);
        } else if (row.json_size > 1000) {
          console.log(`   ⚠️  JSON size is slightly large but acceptable`);
        } else {
          console.log(`   ✅ JSON size is good`);
        }
        console.log('');
      });
      
      const hasProblems = result.rows.some(row => row.has_base64 || row.json_size > 10000);
      
      if (hasProblems) {
        console.log('❌ DATABASE HAS PROBLEMS - Run cleanup script again!');
        console.log('\nRun: node scripts/clean-base64.js\n');
      } else {
        console.log('✅ DATABASE IS CLEAN - No base64 strings found!');
        console.log('\nIf submission still fails, clear browser cache completely.\n');
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking database:', error);
    process.exit(1);
  }
}

checkDatabase();

