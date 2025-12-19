/**
 * Full Database Restore - Clears existing data and restores from backup
 * This will restore ALL your form data so you don't have to fill forms again
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function restoreBackupFull() {
  console.log(`${colors.cyan}🔄 Full Database Restore (Clears existing data first)${colors.reset}\n`);
  
  // Check for command line arguments
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
  
  // Sort by date (newest first)
  backupFiles.sort((a, b) => b.date - a.date);
  
  // Show available backups
  console.log(`${colors.blue}📋 Available backup files:${colors.reset}`);
  backupFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.name} (${file.date.toLocaleString()})`);
  });
  
  const selectedBackup = backupFiles[backupIndex];
  if (!selectedBackup) {
    console.log(`${colors.red}❌ Invalid backup selection${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`\n${colors.blue}📁 Selected: ${selectedBackup.name}${colors.reset}`);
  console.log(`${colors.yellow}⚠️  This will CLEAR all existing data and restore from backup!${colors.reset}\n`);
  
  // Find psql
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
  
  try {
    // Set PGPASSWORD environment variable
    process.env.PGPASSWORD = password;
    
    console.log(`${colors.blue}🔌 Step 1: Clearing existing data...${colors.reset}`);
    
    // Truncate tables (clears data but keeps structure)
    const truncateSQL = `
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
    `;
    
    const truncateCommand = `"${psqlPath}" -h localhost -U postgres -d propertydb -c "${truncateSQL.replace(/\n/g, ' ').replace(/\s+/g, ' ')}"`;
    
    try {
      await execAsync(truncateCommand, { maxBuffer: 10 * 1024 * 1024 });
      console.log(`${colors.green}✅ Existing data cleared${colors.reset}\n`);
    } catch (truncateError) {
      console.log(`${colors.yellow}⚠️  Some tables may not exist yet (this is OK)${colors.reset}\n`);
    }
    
    console.log(`${colors.blue}🔌 Step 2: Restoring backup data...${colors.reset}`);
    console.log(`${colors.blue}   Database: propertydb${colors.reset}`);
    console.log(`${colors.blue}   User: postgres${colors.reset}\n`);
    
    // Run psql to restore
    const command = `"${psqlPath}" -h localhost -U postgres -d propertydb -f "${selectedBackup.path}"`;
    
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.blue}📝 Restoring backup...${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      encoding: 'utf8'
    });
    
    // Filter out expected errors (already exists, etc.)
    const errorLines = stderr ? stderr.split('\n') : [];
    const unexpectedErrors = errorLines.filter(line => 
      line.includes('ERROR') && 
      !line.includes('already exists') &&
      !line.includes('duplicate key') &&
      !line.includes('multiple primary keys') &&
      !line.includes('violates foreign key constraint') // Some FK errors are expected if data is incomplete
    );
    
    if (stdout && !stdout.includes('ERROR')) {
      // Show only non-error output
      const cleanOutput = stdout.split('\n').filter(line => !line.includes('ERROR')).join('\n');
      if (cleanOutput.trim()) {
        console.log(cleanOutput);
      }
    }
    
    if (unexpectedErrors.length > 0) {
      console.log(`${colors.yellow}⚠️  Some unexpected errors (but restore may have succeeded):${colors.reset}`);
      unexpectedErrors.slice(0, 5).forEach(err => {
        console.log(`${colors.yellow}   ${err.substring(0, 150)}${colors.reset}`);
      });
    }
    
    console.log(`\n${colors.green}✅ Backup restore completed!${colors.reset}\n`);
    
    // Verify data
    console.log(`${colors.blue}🔍 Verifying restored data...${colors.reset}`);
    
    const verifyCommand = `"${psqlPath}" -h localhost -U postgres -d propertydb -t -c "SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM properties) as properties, (SELECT COUNT(*) FROM admins) as admins, (SELECT COUNT(*) FROM property_images) as images;"`;
    
    try {
      const { stdout: verifyOutput } = await execAsync(verifyCommand);
      const counts = verifyOutput.trim().split('|').map(c => c.trim());
      
      console.log(`${colors.green}📊 Data Summary:${colors.reset}`);
      console.log(`   Users: ${counts[0] || '0'}`);
      console.log(`   Properties: ${counts[1] || '0'}`);
      console.log(`   Admins: ${counts[2] || '0'}`);
      console.log(`   Property Images: ${counts[3] || '0'}`);
      
      if (parseInt(counts[1] || 0) > 0) {
        console.log(`\n${colors.green}🎉 All your form data has been restored!${colors.reset}`);
        console.log(`${colors.green}   You don't need to fill forms again!${colors.reset}\n`);
      } else {
        console.log(`\n${colors.yellow}⚠️  Properties count is 0. The backup may not have had property data.${colors.reset}\n`);
      }
    } catch (verifyError) {
      console.log(`${colors.yellow}⚠️  Could not verify data counts${colors.reset}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Restore failed:${colors.reset}`);
    if (error.code === 'ENOENT') {
      console.error(`${colors.red}   psql not found. Please add PostgreSQL bin directory to PATH.${colors.reset}`);
      console.error(`${colors.yellow}   Or install PostgreSQL and try again.${colors.reset}`);
    } else {
      console.error(error.message);
      if (error.stderr) {
        // Show only important errors
        const importantErrors = error.stderr.split('\n').filter(line => 
          line.includes('ERROR') && 
          !line.includes('already exists') &&
          !line.includes('duplicate key')
        );
        if (importantErrors.length > 0) {
          console.error(`${colors.red}Important errors:${colors.reset}`);
          importantErrors.slice(0, 10).forEach(err => console.error(`   ${err}`));
        }
      }
    }
    process.exit(1);
  } finally {
    // Clear password from environment
    delete process.env.PGPASSWORD;
  }
}

restoreBackupFull().catch(() => process.exit(1));

