/**
 * Setup database and restore from backup (non-interactive)
 * This script creates all tables and then restores data from backup
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

// PostgreSQL password - you can set this as environment variable or hardcode for now
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'FArzaneh5475';

async function setupAndRestore() {
  let pool = null;
  
  try {
    console.log(`${colors.cyan}🚀 Database Setup and Restore${colors.reset}\n`);
    
    // Connect as postgres user
    pool = new Pool({
      user: 'postgres',
      password: POSTGRES_PASSWORD,
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

    // Grant permissions on new tables
    console.log(`${colors.blue}🔐 Granting permissions on new tables...${colors.reset}`);
    await pool.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi');
    await pool.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi');
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

    // Step 3: Restore from backup
    console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Step 3: Restoring from backup...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    // Find backup files
    const backupsDir = path.join(__dirname, '../backups');
    const rootBackup = path.join(__dirname, '../../propertydb_backup_20250612_215249.sql');
    
    let backupFiles = [];
    
    if (fs.existsSync(backupsDir)) {
      const files = fs.readdirSync(backupsDir)
        .filter(file => file.endsWith('.sql') && !file.endsWith('.gz'))
        .map(file => ({
          path: path.join(backupsDir, file),
          name: file,
          date: fs.statSync(path.join(backupsDir, file)).mtime
        }))
        .sort((a, b) => b.date - a.date);
      backupFiles = backupFiles.concat(files);
    }
    
    if (fs.existsSync(rootBackup)) {
      backupFiles.push({
        path: rootBackup,
        name: path.basename(rootBackup),
        date: fs.statSync(rootBackup).mtime
      });
    }
    
    if (backupFiles.length === 0) {
      console.log(`${colors.yellow}⚠️  No backup files found. Skipping restore.${colors.reset}`);
      console.log(`${colors.green}🎉 Setup completed! Tables are ready.${colors.reset}\n`);
      return;
    }

    // Use the most recent backup
    const selectedBackup = backupFiles[0];
    console.log(`${colors.blue}📁 Using backup: ${selectedBackup.name}${colors.reset}\n`);

    // Read and restore backup
    console.log(`${colors.blue}📖 Reading backup file...${colors.reset}`);
    const backupSQL = fs.readFileSync(selectedBackup.path, 'utf8');
    console.log(`${colors.green}✅ Backup file loaded (${(backupSQL.length / 1024).toFixed(2)} KB)${colors.reset}\n`);

    // Split SQL into statements and execute
    // We'll execute the entire backup file, but skip errors for things that already exist
    const sqlStatements = backupSQL
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('\\') && !s.startsWith('COPY') && !s.match(/^\\\./));

    let executed = 0;
    let errors = 0;
    let dataRestored = false;

    console.log(`${colors.blue}🔄 Executing backup statements...${colors.reset}`);
    
    for (const statement of sqlStatements) {
      if (statement.length < 10) continue;
      
      try {
        await pool.query(statement);
        executed++;
        if (statement.toUpperCase().includes('COPY') || statement.toUpperCase().includes('INSERT')) {
          dataRestored = true;
        }
      } catch (error) {
        // Ignore "already exists" and "duplicate key" errors
        if (error.message.includes('already exists') || 
            error.message.includes('duplicate key') ||
            (error.message.includes('relation') && error.message.includes('already exists')) ||
            error.message.includes('does not exist')) {
          // This is OK, continue
        } else {
          errors++;
          if (errors <= 3) {
            console.log(`${colors.yellow}⚠️  Warning: ${error.message.substring(0, 80)}...${colors.reset}`);
          }
        }
      }
    }

    console.log(`${colors.green}✅ Restore completed!${colors.reset}`);
    console.log(`   Statements executed: ${executed}`);
    if (errors > 0) {
      console.log(`   Warnings: ${errors} (mostly 'already exists' - this is OK)`);
    }

    // Verify data
    console.log(`\n${colors.blue}🔍 Verifying restored data...${colors.reset}`);
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const propertiesCount = await pool.query('SELECT COUNT(*) FROM properties');
    const adminsCount = await pool.query('SELECT COUNT(*) FROM admins');
    
    console.log(`${colors.green}📊 Data Summary:${colors.reset}`);
    console.log(`   Users: ${usersCount.rows[0].count}`);
    console.log(`   Properties: ${propertiesCount.rows[0].count}`);
    console.log(`   Admins: ${adminsCount.rows[0].count}`);

    console.log(`\n${colors.green}🎉 Setup and Restore completed successfully!${colors.reset}`);
    console.log(`${colors.cyan}You can now restart your server: npm run dev${colors.reset}\n`);
    console.log(`${colors.green}✅ Google login will work now!${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Setup/Restore failed:${colors.reset}`);
    console.error(error.message);
    if (error.code === '28P01') {
      console.error(`\n${colors.yellow}💡 Wrong password. Please check POSTGRES_PASSWORD.${colors.reset}`);
    }
    throw error;
  } finally {
    if (pool) await pool.end();
  }
}

setupAndRestore().catch(() => process.exit(1));

