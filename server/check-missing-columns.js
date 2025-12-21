const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function checkColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN (
        'tenure', 'price_type', 'ground_rent', 'service_charges', 
        'floor_area_unit', 'is_new_build', 'is_chain_free', 
        'is_recently_renovated', 'has_balcony_terrace', 'has_accessible_access'
      )
      ORDER BY column_name
    `);

    console.log('\n✅ Columns that EXIST in database:');
    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    } else {
      console.log('  (none found)');
    }

    // Check all property columns
    const allColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      ORDER BY ordinal_position
    `);

    console.log(`\n📊 Total columns in properties table: ${allColumns.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkColumns();

