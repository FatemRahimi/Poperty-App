/**
 * Setup database using default postgres user
 * This will prompt for password or try common defaults
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function setupWithPostgres() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve, reject) => {
    console.log(`${colors.cyan}🚀 Database Setup (using postgres user)${colors.reset}\n`);
    console.log(`${colors.yellow}⚠️  We'll use the default 'postgres' user to set up the database${colors.reset}\n`);
    
    rl.question(`${colors.blue}Enter PostgreSQL password for 'postgres' user: ${colors.reset}`, async (password) => {
      rl.close();
      
      if (!password) {
        console.log(`${colors.red}❌ Password is required${colors.reset}`);
        process.exit(1);
      }

      try {
        // Connect as postgres user
        const adminPool = new Pool({
          user: 'postgres',
          password: password,
          host: 'localhost',
          port: 5432,
          database: 'postgres'
        });

        console.log(`${colors.blue}🔌 Connecting to PostgreSQL...${colors.reset}`);
        await adminPool.query('SELECT 1');
        console.log(`${colors.green}✅ Connected${colors.reset}\n`);

        // Create database if it doesn't exist
        console.log(`${colors.blue}📦 Creating database 'propertydb'...${colors.reset}`);
        await adminPool.query('CREATE DATABASE propertydb').catch(err => {
          if (err.code === '42P04') {
            console.log(`${colors.yellow}⚠️  Database already exists (this is OK)${colors.reset}`);
          } else {
            throw err;
          }
        });
        console.log(`${colors.green}✅ Database ready${colors.reset}\n`);

        // Create user if it doesn't exist
        console.log(`${colors.blue}👤 Creating user 'fatemehrahimi'...${colors.reset}`);
        await adminPool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'fatemehrahimi') THEN
              CREATE USER fatemehrahimi WITH PASSWORD '${password}';
            END IF;
          END
          $$;
        `).catch(() => {
          console.log(`${colors.yellow}⚠️  User might already exist (this is OK)${colors.reset}`);
        });
        
        // Grant privileges
        await adminPool.query('GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi');
        console.log(`${colors.green}✅ User created and granted privileges${colors.reset}\n`);

        await adminPool.end();

        // Now connect to propertydb and run setup
        const dbPool = new Pool({
          user: 'fatemehrahimi',
          password: password,
          host: 'localhost',
          port: 5432,
          database: 'propertydb'
        });

        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`${colors.blue}📝 Running init.sql (base schema)...${colors.reset}`);
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

        const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
        await dbPool.query(initSql).catch(err => {
          if (err.message.includes('already exists')) {
            console.log(`${colors.yellow}⚠️  Some tables already exist (this is OK)${colors.reset}\n`);
          } else {
            throw err;
          }
        });
        console.log(`${colors.green}✅ Base schema applied${colors.reset}\n`);

        // Run migrations
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`${colors.blue}📝 Running migrations...${colors.reset}`);
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

        // Migration tracker
        const trackerSql = fs.readFileSync(path.join(__dirname, 'migrations', '000_migration_tracker.sql'), 'utf8');
        await dbPool.query(trackerSql);

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql') && f !== '000_migration_tracker.sql')
          .sort();

        const applied = await dbPool.query('SELECT migration_name FROM schema_migrations');
        const appliedSet = new Set(applied.rows.map(r => r.migration_name));

        let appliedCount = 0;
        for (const file of files) {
          const name = file.replace('.sql', '');
          if (appliedSet.has(name)) {
            console.log(`${colors.yellow}⏭️  Skipping ${file} (already applied)${colors.reset}`);
            continue;
          }

          console.log(`${colors.blue}📝 Running ${file}...${colors.reset}`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await dbPool.query('BEGIN');
          await dbPool.query(sql);
          await dbPool.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [name]);
          await dbPool.query('COMMIT');
          console.log(`${colors.green}✅ ${file} applied${colors.reset}\n`);
          appliedCount++;
        }

        // Verify tables
        const tables = await dbPool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        `);

        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`${colors.green}✅ Setup Complete!${colors.reset}`);
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`   Migrations Applied: ${appliedCount}`);
        console.log(`   Tables Created: ${tables.rows.length}`);
        console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

        console.log(`${colors.green}📋 Tables:${colors.reset}`);
        tables.rows.forEach(r => console.log(`   - ${r.table_name}`));

        // Update .env file
        const envPath = path.join(__dirname, '../.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        
        const newDbUrl = `postgres://fatemehrahimi:${password}@localhost:5432/propertydb`;
        
        if (envContent.includes('DATABASE_URL=')) {
          envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${newDbUrl}`);
        } else {
          envContent += `\nDATABASE_URL=${newDbUrl}\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log(`\n${colors.green}✅ Updated server/.env with DATABASE_URL${colors.reset}`);

        await dbPool.end();
        console.log(`\n${colors.green}🎉 Database setup completed successfully!${colors.reset}\n`);
        resolve();

      } catch (error) {
        console.error(`\n${colors.red}❌ Error:${colors.reset}`, error.message);
        if (error.code === '28P01') {
          console.error(`${colors.yellow}💡 Wrong password. Please try again.${colors.reset}`);
        }
        reject(error);
      }
    });
  });
}

setupWithPostgres().catch(() => process.exit(1));

