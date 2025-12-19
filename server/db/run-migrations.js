/**
 * Database Migration Runner
 * 
 * This script runs all pending database migrations in order.
 * It tracks which migrations have been applied using the schema_migrations table.
 * 
 * Usage:
 *   node server/db/run-migrations.js
 * 
 * Or with custom database URL:
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname node server/db/run-migrations.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
});

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log(`${colors.cyan}🚀 Starting database migrations...${colors.reset}\n`);

    // Ensure migration tracker table exists
    const trackerPath = path.join(__dirname, 'migrations', '000_migration_tracker.sql');
    const trackerSQL = fs.readFileSync(trackerPath, 'utf8');
    await client.query(trackerSQL);
    console.log(`${colors.green}✅ Migration tracker table ready${colors.reset}`);

    // Get list of migration files (excluding tracker)
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file !== '000_migration_tracker.sql')
      .sort(); // Sort alphabetically to ensure order

    console.log(`\n📋 Found ${files.length} migration files\n`);

    // Get already applied migrations
    const appliedResult = await client.query('SELECT migration_name FROM schema_migrations');
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
        
        // Run migration in a transaction
        await client.query('BEGIN');
        await client.query(migrationSQL);
        
        // Record migration as applied
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migrationName]
        );
        
        await client.query('COMMIT');
        console.log(`${colors.green}✅ ${file} applied successfully${colors.reset}\n`);
        appliedCount++;
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`${colors.red}❌ Error running ${file}:${colors.reset}`);
        console.error(error.message);
        throw error;
      }
    }

    // Summary
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ Migration Summary:${colors.reset}`);
    console.log(`   Applied: ${colors.green}${appliedCount}${colors.reset}`);
    console.log(`   Skipped: ${colors.yellow}${skippedCount}${colors.reset}`);
    console.log(`   Total: ${files.length}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Migration failed:${colors.reset}`, error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migrations
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log(`${colors.green}🎉 All migrations completed!${colors.reset}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`${colors.red}💥 Migration process failed:${colors.reset}`, error);
      process.exit(1);
    });
}

module.exports = { runMigrations };

