/**
 * Setup database as postgres user (has all permissions)
 * This will create all tables and grant permissions
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupAsPostgres() {
  return new Promise((resolve, reject) => {
    console.log(`${colors.cyan}🚀 Database Setup (as postgres user)${colors.reset}\n`);
    
    rl.question(`${colors.blue}Enter PostgreSQL password for 'postgres' user: ${colors.reset}`, async (password) => {
      rl.close();
      
      if (!password) {
        console.log(`${colors.red}❌ Password is required${colors.reset}`);
        process.exit(1);
      }

      let pool = null;
      
      try {
        // Connect as postgres user to propertydb
        pool = new Pool({
          user: 'postgres',
          password: password,
          host: 'localhost',
          port: 5432,
          database: 'propertydb'
        });

        console.log(`${colors.blue}🔌 Connecting to PostgreSQL...${colors.reset}`);
        await pool.query('SELECT 1');
        console.log(`${colors.green}✅ Connected${colors.reset}\n`);

        // Grant permissions first
        console.log(`${colors.blue}🔐 Granting permissions...${colors.reset}`);
        await pool.query('GRANT USAGE ON SCHEMA public TO fatemehrahimi');
        await pool.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi');
        await pool.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi');
        await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fatemehrahimi');
        await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fatemehrahimi');
        console.log(`${colors.green}✅ Permissions granted${colors.reset}\n`);

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

        // Migration tracker
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

        // Grant permissions on new tables (ensure all permissions are set)
        console.log(`${colors.blue}🔐 Granting permissions on all tables...${colors.reset}`);
        await pool.query('GRANT USAGE ON SCHEMA public TO fatemehrahimi');
        await pool.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi');
        await pool.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi');
        await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fatemehrahimi');
        await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fatemehrahimi');
        await pool.query('ALTER DATABASE propertydb OWNER TO fatemehrahimi');
        console.log(`${colors.green}✅ Permissions granted on all tables${colors.reset}\n`);

        // Verify tables
        const tablesResult = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        `);

        // Summary
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
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

        console.log(`\n${colors.green}🎉 All tables created successfully!${colors.reset}`);
        console.log(`${colors.cyan}You can now restart your server: npm run dev${colors.reset}\n`);
        console.log(`${colors.green}✅ Google login will work now!${colors.reset}\n`);

        resolve();
      } catch (error) {
        console.error(`\n${colors.red}❌ Setup failed:${colors.reset}`);
        console.error(error.message);
        if (error.code === '28P01') {
          console.error(`\n${colors.yellow}💡 Wrong password. Please try again.${colors.reset}`);
        }
        reject(error);
      } finally {
        if (pool) await pool.end();
      }
    });
  });
}

setupAsPostgres().catch(() => process.exit(1));

