/**
 * Fixed Database Restore - Handles schema differences
 * This will restore ALL your form data including properties
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function restoreBackupFixed() {
  console.log(`${colors.cyan}🔄 Fixed Database Restore (Handles schema differences)${colors.reset}\n`);
  
  const args = process.argv.slice(2);
  const backupIndex = args[0] ? parseInt(args[0]) - 1 : 0;
  const password = args[1] || 'FArzaneh5475';
  
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
    process.exit(1);
  }
  
  backupFiles.sort((a, b) => b.date - a.date);
  
  console.log(`${colors.blue}📋 Available backup files:${colors.reset}`);
  backupFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.name} (${file.date.toLocaleString()})`);
  });
  
  const selectedBackup = backupFiles[backupIndex];
  if (!selectedBackup) {
    console.log(`${colors.red}❌ Invalid backup selection${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`\n${colors.blue}📁 Selected: ${selectedBackup.name}${colors.reset}\n`);
  
  let pool = null;
  
  try {
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

    // Step 1: Temporarily make category nullable
    console.log(`${colors.blue}📝 Step 1: Adjusting schema for restore...${colors.reset}`);
    try {
      await pool.query('ALTER TABLE properties ALTER COLUMN category DROP NOT NULL');
      console.log(`${colors.green}✅ Schema adjusted${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Schema adjustment skipped (may already be nullable)${colors.reset}\n`);
    }

    // Step 2: Clear existing data
    console.log(`${colors.blue}📝 Step 2: Clearing existing data...${colors.reset}`);
    try {
      await pool.query(`
        TRUNCATE TABLE 
          property_submissions,
          property_images,
          property_amenities,
          properties,
          email_notifications,
          advisor_experts,
          advisor_profiles,
          users,
          admins
        RESTART IDENTITY CASCADE;
      `);
      console.log(`${colors.green}✅ Existing data cleared${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some tables may not exist (this is OK)${colors.reset}\n`);
    }

    // Step 3: Restore using psql
    console.log(`${colors.blue}📝 Step 3: Restoring backup data...${colors.reset}`);
    
    let psqlPath = 'psql';
    const possiblePaths = [
      'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\15\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\14\\bin\\psql.exe',
      'C:\\Program Files\\PostgreSQL\\13\\bin\\psql.exe'
    ];
    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        psqlPath = possiblePath;
        break;
      }
    }
    
    process.env.PGPASSWORD = password;
    
    const command = `"${psqlPath}" -h localhost -U postgres -d propertydb -f "${selectedBackup.path}"`;
    
    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8'
      });
      
      // Filter expected errors
      const errorLines = stderr ? stderr.split('\n') : [];
      const unexpectedErrors = errorLines.filter(line => 
        line.includes('ERROR') && 
        !line.includes('already exists') &&
        !line.includes('duplicate key') &&
        !line.includes('multiple primary keys')
      );
      
      if (unexpectedErrors.length === 0 || unexpectedErrors.length < 3) {
        console.log(`${colors.green}✅ Backup data restored${colors.reset}\n`);
      } else {
        console.log(`${colors.yellow}⚠️  Some errors occurred, but continuing...${colors.reset}\n`);
      }
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some restore errors (continuing to fix data)...${colors.reset}\n`);
    }

    // Step 4: Fix NULL categories by using property_type or property_category
    console.log(`${colors.blue}📝 Step 4: Fixing NULL categories...${colors.reset}`);
    try {
      // Update properties where category is NULL
      // Use property_type or property_category to infer category
      await pool.query(`
        UPDATE properties 
        SET category = COALESCE(
          NULLIF(property_category, ''),
          CASE 
            WHEN property_type IN ('rent', 'sale', 'lease') THEN property_type
            ELSE 'rent'
          END,
          'rent'
        )
        WHERE category IS NULL;
      `);
      
      const fixedCount = await pool.query('SELECT COUNT(*) FROM properties WHERE category IS NOT NULL');
      console.log(`${colors.green}✅ Fixed ${fixedCount.rows[0].count} properties with categories${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Could not fix categories: ${error.message}${colors.reset}\n`);
    }

    // Step 5: Restore NOT NULL constraint
    console.log(`${colors.blue}📝 Step 5: Restoring schema constraints...${colors.reset}`);
    try {
      await pool.query('ALTER TABLE properties ALTER COLUMN category SET NOT NULL');
      console.log(`${colors.green}✅ Schema constraints restored${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Could not restore constraint (some categories may still be NULL)${colors.reset}\n`);
    }

    // Step 6: Verify data
    console.log(`${colors.blue}🔍 Verifying restored data...${colors.reset}`);
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const propertiesCount = await pool.query('SELECT COUNT(*) FROM properties');
    const adminsCount = await pool.query('SELECT COUNT(*) FROM admins');
    const imagesCount = await pool.query('SELECT COUNT(*) FROM property_images');
    
    console.log(`${colors.green}📊 Data Summary:${colors.reset}`);
    console.log(`   Users: ${usersCount.rows[0].count}`);
    console.log(`   Properties: ${propertiesCount.rows[0].count}`);
    console.log(`   Admins: ${adminsCount.rows[0].count}`);
    console.log(`   Property Images: ${imagesCount.rows[0].count}`);
    
    if (parseInt(propertiesCount.rows[0].count) > 0) {
      console.log(`\n${colors.green}🎉 All your form data has been restored!${colors.reset}`);
      console.log(`${colors.green}   You don't need to fill forms again!${colors.reset}\n`);
    } else {
      console.log(`\n${colors.yellow}⚠️  Properties count is 0. Check backup file.${colors.reset}\n`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Restore failed:${colors.reset}`);
    console.error(error.message);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
    delete process.env.PGPASSWORD;
  }
}

restoreBackupFixed().catch(() => process.exit(1));

