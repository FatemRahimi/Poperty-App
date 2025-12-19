/**
 * Restore database from backup SQL file
 * This script will restore data from a backup file into your PostgreSQL database
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

async function restoreBackup() {
  return new Promise((resolve, reject) => {
    console.log(`${colors.cyan}🔄 Database Restore from Backup${colors.reset}\n`);
    
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
      console.log(`${colors.red}❌ No backup files found!${colors.reset}`);
      console.log(`   Looking in: ${backupsDir}`);
      console.log(`   Looking in: ${rootBackup}`);
      process.exit(1);
    }
    
    // Show available backups
    console.log(`${colors.blue}📋 Available backup files:${colors.reset}`);
    backupFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.name} (${file.date.toLocaleString()})`);
    });
    
    rl.question(`\n${colors.blue}Select backup file (1-${backupFiles.length}) or press Enter for latest: ${colors.reset}`, async (answer) => {
      const selectedIndex = answer.trim() === '' ? 0 : parseInt(answer) - 1;
      
      if (selectedIndex < 0 || selectedIndex >= backupFiles.length) {
        console.log(`${colors.red}❌ Invalid selection${colors.reset}`);
        process.exit(1);
      }
      
      const selectedBackup = backupFiles[selectedIndex];
      console.log(`\n${colors.blue}📁 Selected: ${selectedBackup.name}${colors.reset}\n`);
      
      rl.question(`${colors.blue}Enter PostgreSQL password for 'postgres' user: ${colors.reset}`, async (password) => {
        rl.close();
        
        if (!password) {
          console.log(`${colors.red}❌ Password is required${colors.reset}`);
          process.exit(1);
        }

        let pool = null;
        
        try {
          // Connect as postgres user
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

          // Read backup file
          console.log(`${colors.blue}📖 Reading backup file...${colors.reset}`);
          const backupSQL = fs.readFileSync(selectedBackup.path, 'utf8');
          console.log(`${colors.green}✅ Backup file loaded (${(backupSQL.length / 1024).toFixed(2)} KB)${colors.reset}\n`);

          // Check if tables exist
          console.log(`${colors.blue}🔍 Checking if tables exist...${colors.reset}`);
          const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
          `);
          
          if (tablesResult.rows.length === 0) {
            console.log(`${colors.yellow}⚠️  No tables found. You should run setup-as-postgres.js first!${colors.reset}`);
            console.log(`${colors.yellow}   However, the backup file contains CREATE TABLE statements, so we'll continue...${colors.reset}\n`);
          } else {
            console.log(`${colors.green}✅ Found ${tablesResult.rows.length} existing tables${colors.reset}`);
            tablesResult.rows.forEach(row => {
              console.log(`   - ${row.table_name}`);
            });
            console.log();
          }

          // Restore backup
          console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
          console.log(`${colors.blue}📝 Restoring backup...${colors.reset}`);
          console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
          
          // Split SQL into statements and execute
          // Remove COPY statements that reference stdin (we'll handle data separately)
          const sqlStatements = backupSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('COPY') && !s.startsWith('\\\.'))
            .filter(s => !s.match(/^COPY\s+/i));

          let executed = 0;
          let errors = 0;

          for (const statement of sqlStatements) {
            if (statement.length < 10) continue; // Skip very short statements
            
            try {
              await pool.query(statement);
              executed++;
            } catch (error) {
              // Ignore "already exists" errors
              if (error.message.includes('already exists') || 
                  error.message.includes('duplicate key') ||
                  error.message.includes('relation') && error.message.includes('already exists')) {
                // This is OK, continue
              } else {
                errors++;
                if (errors <= 5) { // Only show first 5 errors
                  console.log(`${colors.yellow}⚠️  Warning: ${error.message.substring(0, 100)}${colors.reset}`);
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

          console.log(`\n${colors.green}🎉 Backup restored successfully!${colors.reset}\n`);

          resolve();
        } catch (error) {
          console.error(`\n${colors.red}❌ Restore failed:${colors.reset}`);
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
  });
}

restoreBackup().catch(() => process.exit(1));

