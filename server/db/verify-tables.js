/**
 * Verify all tables exist in PostgreSQL database
 * This confirms the SQL files were applied successfully
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function verifyTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log(`${colors.cyan}🔍 Verifying database tables...${colors.reset}\n`);

    // Expected tables
    const expectedTables = [
      'users',
      'admins',
      'properties',
      'property_images',
      'property_amenities',
      'property_submissions',
      'email_notifications',
      'advisor_profiles',
      'advisor_experts',
      'schema_migrations'
    ];

    // Get actual tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const actualTables = result.rows.map(row => row.table_name);

    console.log(`${colors.blue}📋 Expected Tables: ${expectedTables.length}${colors.reset}`);
    console.log(`${colors.blue}📋 Actual Tables Found: ${actualTables.length}${colors.reset}\n`);

    // Check each expected table
    let allFound = true;
    const missing = [];
    const found = [];

    expectedTables.forEach(table => {
      if (actualTables.includes(table)) {
        found.push(table);
        console.log(`${colors.green}✅ ${table}${colors.reset}`);
      } else {
        missing.push(table);
        console.log(`${colors.red}❌ ${table} - MISSING${colors.reset}`);
        allFound = false;
      }
    });

    // Check for extra tables
    const extra = actualTables.filter(t => !expectedTables.includes(t));
    if (extra.length > 0) {
      console.log(`\n${colors.yellow}📋 Extra tables found:${colors.reset}`);
      extra.forEach(table => {
        console.log(`${colors.yellow}   ℹ️  ${table}${colors.reset}`);
      });
    }

    // Check migrations
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Checking migrations...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const migrationsResult = await pool.query('SELECT migration_name FROM schema_migrations ORDER BY migration_name');
    const appliedMigrations = migrationsResult.rows.map(row => row.migration_name);

    const expectedMigrations = [
      '001_add_smart_search',
      '002_add_new_fields',
      '003_add_epc_document_fields',
      '004_add_commercial_lease_fields',
      '005_add_uk_lease_fields',
      '006_add_residential_accommodation',
      '007_add_property_consultant',
      '008_add_advisor_profile_fields'
    ];

    expectedMigrations.forEach(migration => {
      if (appliedMigrations.includes(migration)) {
        console.log(`${colors.green}✅ ${migration}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️  ${migration} - Not applied${colors.reset}`);
      }
    });

    // Summary
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    if (allFound) {
      console.log(`${colors.green}✅ All tables exist!${colors.reset}`);
      console.log(`   Tables: ${found.length}/${expectedTables.length}`);
      console.log(`   Migrations: ${appliedMigrations.length}/${expectedMigrations.length}`);
    } else {
      console.log(`${colors.red}❌ Some tables are missing!${colors.reset}`);
      console.log(`   Missing: ${missing.join(', ')}`);
      console.log(`\n${colors.yellow}💡 Run: node server/db/run-all-sql.js${colors.reset}`);
    }
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    // Test connection
    console.log(`${colors.blue}🧪 Testing database connection...${colors.reset}`);
    await pool.query('SELECT 1');
    console.log(`${colors.green}✅ Database connection successful!${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Verification failed:${colors.reset}`);
    console.error(error.message);
    
    if (error.code === '28P01') {
      console.error(`\n${colors.yellow}💡 Password authentication failed${colors.reset}`);
      console.error(`   Check your DATABASE_URL in server/.env`);
    } else if (error.code === 'ECONNREFUSED') {
      console.error(`\n${colors.yellow}💡 Cannot connect to PostgreSQL${colors.reset}`);
      console.error(`   Make sure PostgreSQL is running`);
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyTables();

