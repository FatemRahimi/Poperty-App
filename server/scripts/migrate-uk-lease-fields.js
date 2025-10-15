const pool = require('../models/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Running UK lease fields migration...');
    
    // Add VAT on Rent field
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS vat_on_rent VARCHAR(50)
    `);
    console.log('✅ Added vat_on_rent column');
    
    // Add Repairing Obligations field
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS repairing_obligation VARCHAR(100)
    `);
    console.log('✅ Added repairing_obligation column');
    
    // Add Insurance Responsibility field
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS insurance_responsibility VARCHAR(100)
    `);
    console.log('✅ Added insurance_responsibility column');
    
    // Add Rent Review Frequency field
    await client.query(`
      ALTER TABLE properties 
      ADD COLUMN IF NOT EXISTS rent_review_frequency INTEGER
    `);
    console.log('✅ Added rent_review_frequency column');
    
    // Add indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_vat_on_rent ON properties(vat_on_rent)
    `);
    console.log('✅ Created index on vat_on_rent');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_repairing_obligation ON properties(repairing_obligation)
    `);
    console.log('✅ Created index on repairing_obligation');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_insurance_responsibility ON properties(insurance_responsibility)
    `);
    console.log('✅ Created index on insurance_responsibility');
    
    // Verify the changes
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'properties' 
      AND column_name IN ('vat_on_rent', 'repairing_obligation', 'insurance_responsibility', 'rent_review_frequency')
      ORDER BY column_name
    `);
    
    console.log('\n📊 Migration complete! New columns:');
    console.table(result.rows);
    
    console.log('\n✅ UK lease fields migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('✅ Migration script finished');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });

