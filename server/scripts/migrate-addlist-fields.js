const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb' });
  const client = await pool.connect();
  try {
    console.log('🔧 Running AddList (sale) columns migration...');
    const statements = [
      // Media extras
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS layout_file_name TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS layout_file_url TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS epc_document_name TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS epc_document_url TEXT`,
      // Additional Information fields
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS heating_type TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS broadband_availability TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS accessibility_features TEXT`,
      // Layout of property extras
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS apartment_size TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS floor_number TEXT`,
      // Financials & tenure
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS tenure TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS service_charges NUMERIC`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS ground_rent NUMERIC`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS price_type TEXT`,
      // Area unit (optional)
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS floor_area_unit TEXT`,
      // Location Information fields
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS local_authority TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS nearest_transport_links TEXT`,
      // Step 5 feature toggles (booleans)
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS has_balcony_terrace BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS is_new_build BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS is_chain_free BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS is_recently_renovated BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS has_accessible_access BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS has_parking BOOLEAN`,
      // MISSING COLUMNS: Add the missing columns that are causing errors
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS house_number TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS street_name TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS reception_rooms INTEGER`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS short_description TEXT`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS virtual_tour_link TEXT`,
      // ADDITIONAL MISSING COLUMNS: Critical for AddList functionality
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS year_built INTEGER`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS has_garden BOOLEAN`,
      `ALTER TABLE IF EXISTS properties ADD COLUMN IF NOT EXISTS is_furnished BOOLEAN`
    ];
    for (const sql of statements) {
      await client.query(sql);
      console.log('✅ Added column:', sql.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0] || 'unknown');
    }
    console.log('✅ Migration complete: All AddList columns ensured');
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})(); 