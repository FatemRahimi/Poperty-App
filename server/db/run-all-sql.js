/**
 * Run all SQL files to set up the database
 * This will run init.sql and all migrations
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

async function runAllSQL() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log(`${colors.cyan}🚀 Setting up database tables...${colors.reset}\n`);

    // Step 1: Run init.sql
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Step 1: Running init.sql (base schema)...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const initSqlPath = path.join(__dirname, 'init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf8');
    
    try {
      await pool.query(initSql);
      console.log(`${colors.green}✅ Base schema (init.sql) applied successfully${colors.reset}\n`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`${colors.yellow}⚠️  Some tables already exist (this is OK)${colors.reset}\n`);
      } else {
        throw error;
      }
    }

    // Step 2: Run migrations
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Step 2: Running migrations...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    // Create migration tracker table
    const trackerPath = path.join(__dirname, 'migrations', '000_migration_tracker.sql');
    const trackerSql = fs.readFileSync(trackerPath, 'utf8');
    await pool.query(trackerSql);

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file !== '000_migration_tracker.sql')
      .sort();

    console.log(`📋 Found ${files.length} migration files\n`);

    // Get already applied migrations
    const appliedResult = await pool.query('SELECT migration_name FROM schema_migrations');
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
        
        await pool.query('BEGIN');
        await pool.query(migrationSQL);
        await pool.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        );
        await pool.query('COMMIT');
        
        console.log(`${colors.green}✅ ${file} applied successfully${colors.reset}\n`);
        appliedCount++;
        
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`${colors.red}❌ Error running ${file}:${colors.reset}`);
        console.error(error.message);
        throw error;
      }
    }

    // Verify tables
    console.log(`${colors.blue}🔍 Verifying tables...${colors.reset}`);
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    // Summary
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ Database Setup Complete!${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`   Base Schema: ${colors.green}Applied${colors.reset}`);
    console.log(`   Migrations Applied: ${colors.green}${appliedCount}${colors.reset}`);
    console.log(`   Migrations Skipped: ${colors.yellow}${skippedCount}${colors.reset}`);
    console.log(`   Total Tables: ${colors.green}${tablesResult.rows.length}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    console.log(`${colors.green}📋 Tables created:${colors.reset}`);
    tablesResult.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });

    console.log(`\n${colors.green}🎉 All tables created successfully!${colors.reset}\n`);
    console.log(`${colors.cyan}You can now restart your server: npm run dev${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Setup failed:${colors.reset}`);
    console.error(error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runAllSQL();

