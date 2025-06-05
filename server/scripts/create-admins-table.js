const { Pool } = require('pg');
require('dotenv').config();

async function createAdminsTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
  });

  try {
    console.log('🔧 Creating admins table...');

    // Create the admins table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin', -- 'super_admin' or 'admin'
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await pool.query(createTableQuery);
    console.log('✅ Admins table created successfully!');

    // Check if table was created
    const checkQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'admins' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    const result = await pool.query(checkQuery);
    console.log('\n📋 Admins table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error) {
    console.error('❌ Error creating admins table:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdminsTable(); 