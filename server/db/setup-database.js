/**
 * Complete Database Setup Script
 * 
 * This script:
 * 1. Checks database connection
 * 2. Creates database if it doesn't exist
 * 3. Runs init.sql (base schema)
 * 4. Runs all migrations
 * 
 * Usage:
 *   node server/db/setup-database.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Parse DATABASE_URL
function parseDatabaseUrl(url) {
  if (!url) {
    throw new Error('DATABASE_URL is not set in .env file');
  }
  
  // Format: postgres://user:password@host:port/database
  const match = url.match(/postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    throw new Error('Invalid DATABASE_URL format. Expected: postgres://user:password@host:port/database');
  }
  
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5]
  };
}

async function setupDatabase() {
  let adminPool = null;
  let dbPool = null;
  
  try {
    console.log(`${colors.cyan}🚀 Starting database setup...${colors.reset}\n`);
    
    // Get DATABASE_URL from environment
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found in .env file. Please set it in server/.env');
    }
    
    console.log(`${colors.blue}📋 Database URL found${colors.reset}`);
    const dbConfig = parseDatabaseUrl(dbUrl);
    
    // Connect to PostgreSQL server (without database name)
    adminPool = new Pool({
      user: dbConfig.user,
      password: dbConfig.password,
      host: dbConfig.host,
      port: dbConfig.port,
      database: 'postgres' // Connect to default postgres database
    });
    
    console.log(`${colors.blue}🔌 Connecting to PostgreSQL server...${colors.reset}`);
    await adminPool.query('SELECT 1');
    console.log(`${colors.green}✅ Connected to PostgreSQL server${colors.reset}\n`);
    
    // Check if database exists
    console.log(`${colors.blue}🔍 Checking if database '${dbConfig.database}' exists...${colors.reset}`);
    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbConfig.database]
    );
    
    if (dbCheck.rows.length === 0) {
      console.log(`${colors.yellow}📦 Database '${dbConfig.database}' does not exist. Creating...${colors.reset}`);
      await adminPool.query(`CREATE DATABASE "${dbConfig.database}"`);
      console.log(`${colors.green}✅ Database '${dbConfig.database}' created${colors.reset}\n`);
    } else {
      console.log(`${colors.green}✅ Database '${dbConfig.database}' already exists${colors.reset}\n`);
    }
    
    // Close admin connection
    await adminPool.end();
    
    // Connect to the target database
    dbPool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    console.log(`${colors.blue}🔌 Connecting to database '${dbConfig.database}'...${colors.reset}`);
    await dbPool.query('SELECT 1');
    console.log(`${colors.green}✅ Connected to database${colors.reset}\n`);
    
    // Step 1: Run init.sql
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Step 1: Running init.sql (base schema)...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    const initSqlPath = path.join(__dirname, 'init.sql');
    if (!fs.existsSync(initSqlPath)) {
      throw new Error(`init.sql not found at ${initSqlPath}`);
    }
    
    const initSql = fs.readFileSync(initSqlPath, 'utf8');
    
    try {
      await dbPool.query(initSql);
      console.log(`${colors.green}✅ Base schema (init.sql) applied successfully${colors.reset}\n`);
    } catch (error) {
      // Some errors are OK (like "table already exists")
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log(`${colors.yellow}⚠️  Some tables already exist (this is OK)${colors.reset}\n`);
      } else {
        throw error;
      }
    }
    
    // Step 2: Run migrations
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Step 2: Running migrations...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    // Ensure migration tracker table exists
    const trackerPath = path.join(__dirname, 'migrations', '000_migration_tracker.sql');
    const trackerSQL = fs.readFileSync(trackerPath, 'utf8');
    await dbPool.query(trackerSQL);
    
    // Get list of migration files (excluding tracker)
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file !== '000_migration_tracker.sql')
      .sort();
    
    console.log(`📋 Found ${files.length} migration files\n`);
    
    // Get already applied migrations
    const appliedResult = await dbPool.query('SELECT migration_name FROM schema_migrations');
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.migration_name));
    
    let appliedCount = 0;
    let skippedCount = 0;
    
    // Run each migration
    for (const file of files) {
      const migrationName = file.replace('.sql', '');
      
      if (appliedMigrations.has(migrationName)) {
        console.log(`${colors.yellow}⏭️  Skipping ${file} (already applied)${colors.reset}`);
        skippedCount++;
        continue;
      }
      
      console.log(`${colors.blue}📝 Running ${file}...${colors.reset}`);
      
      try {
        const migrationPath = path.join(migrationsDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await dbPool.query('BEGIN');
        await dbPool.query(migrationSQL);
        await dbPool.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        );
        await dbPool.query('COMMIT');
        
        console.log(`${colors.green}✅ ${file} applied successfully${colors.reset}\n`);
        appliedCount++;
        
      } catch (error) {
        await dbPool.query('ROLLBACK');
        console.error(`${colors.red}❌ Error running ${file}:${colors.reset}`);
        console.error(error.message);
        throw error;
      }
    }
    
    // Summary
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ Database Setup Complete!${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`   Base Schema: ${colors.green}Applied${colors.reset}`);
    console.log(`   Migrations Applied: ${colors.green}${appliedCount}${colors.reset}`);
    console.log(`   Migrations Skipped: ${colors.yellow}${skippedCount}${colors.reset}`);
    console.log(`   Total Migrations: ${files.length}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    // Verify tables exist
    console.log(`${colors.blue}🔍 Verifying database tables...${colors.reset}`);
    const tablesResult = await dbPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n${colors.green}✅ Found ${tablesResult.rows.length} tables:${colors.reset}`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log(`\n${colors.green}🎉 Database setup completed successfully!${colors.reset}\n`);
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Database setup failed:${colors.reset}`);
    console.error(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`\n${colors.yellow}💡 Tip: Make sure PostgreSQL is running${colors.reset}`);
      console.error(`   Check: Test-NetConnection localhost -Port 5432`);
    } else if (error.message.includes('password')) {
      console.error(`\n${colors.yellow}💡 Tip: Check your DATABASE_URL password in .env file${colors.reset}`);
    }
    
    process.exit(1);
  } finally {
    if (adminPool) await adminPool.end();
    if (dbPool) await dbPool.end();
  }
}

// Run setup
if (require.main === module) {
  setupDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };

