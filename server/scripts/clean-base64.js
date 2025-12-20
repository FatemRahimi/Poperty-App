const pool = require('../models/db');

async function cleanBase64Photos() {
  try {
    console.log('🧹 Starting base64 cleanup...');
    
    // Update expert_team JSONB to remove base64 data URLs
    const updateQuery = `
      UPDATE advisor_profiles
      SET expert_team = (
        SELECT jsonb_agg(
          CASE
            WHEN (expert->>'profilePhotoUrl' LIKE 'data:image/%')
            THEN expert - 'profilePhotoUrl'
            ELSE expert
          END
        )
        FROM jsonb_array_elements(expert_team) AS expert
      )
      WHERE expert_team IS NOT NULL
        AND expert_team::text LIKE '%data:image/%'
    `;
    
    const result = await pool.query(updateQuery);
    
    console.log(`✅ Cleaned ${result.rowCount} advisor profiles`);
    console.log('✅ Base64 cleanup complete!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning base64 photos:', error);
    process.exit(1);
  }
}

cleanBase64Photos();

