# Complete Backend Setup Guide

## Current Status

✅ **SQL Files Organized:**
- Base schema: `server/db/init.sql`
- 7 migrations: `server/db/migrations/001-007_*.sql`
- Migration runner: `server/db/run-migrations.js`
- Setup script: `server/db/setup-database.js`

❌ **Issue Found:**
- DATABASE_URL in `.env` is missing password
- Current: `postgres://fatemehrahimi@localhost:5432/propertydb`
- Needed: `postgres://fatemehrahimi:YOUR_PASSWORD@localhost:5432/propertydb`

## Step-by-Step Setup

### Step 1: Fix DATABASE_URL in `.env`

**Edit `server/.env` file:**

Find this line:
```env
DATABASE_URL=postgres://fatemehrahimi@localhost:5432/propertydb
```

Change it to (add your PostgreSQL password):
```env
DATABASE_URL=postgres://fatemehrahimi:YOUR_PASSWORD@localhost:5432/propertydb
```

**Replace `YOUR_PASSWORD` with your actual PostgreSQL password.**

### Step 2: Run Database Setup

After fixing the password, run:

```powershell
node server/db/setup-database.js
```

This script will:
1. ✅ Check database connection
2. ✅ Create `propertydb` database if it doesn't exist
3. ✅ Run `init.sql` (base schema)
4. ✅ Run all 7 migrations in order
5. ✅ Verify all tables are created

### Step 3: Verify Setup

After setup completes, verify:

```powershell
# Check if database exists
psql -U fatemehrahimi -h localhost -d propertydb -c "\dt"

# Or check via Node.js
node -e "const {Pool}=require('pg');require('dotenv').config({path:'server/.env'});const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT table_name FROM information_schema.tables WHERE table_schema=\\'public\\' ORDER BY table_name').then(r=>{console.log('Tables:',r.rows.map(x=>x.table_name).join(', '));p.end()});"
```

## SQL Files Summary

### Base Schema (`init.sql`)
Creates:
- `users` table
- `admins` table  
- `properties` table (main property listings)
- `property_images` table
- `property_amenities` table
- `property_submissions` table
- `email_notifications` table
- `advisor_profiles` table
- `advisor_experts` table
- All indexes and relationships

### Migrations (in order):

1. **001_add_smart_search.sql**
   - Enables pg_trgm extension
   - Adds search indexes

2. **002_add_new_fields.sql**
   - EPC rating
   - Key features (JSONB)
   - Layout files
   - Custom features

3. **003_add_epc_document_fields.sql**
   - EPC document storage

4. **004_add_commercial_lease_fields.sql**
   - 23 commercial lease fields
   - Space types, lease terms, facilities

5. **005_add_uk_lease_fields.sql**
   - UK-specific lease fields
   - VAT, repairing obligation, insurance

6. **006_add_residential_accommodation.sql**
   - `has_residential_accommodation` flag

7. **007_add_property_consultant.sql**
   - `property_consultant` field

## Quick Commands

### Check .env Configuration
```powershell
node server/db/check-env.js
```

### Fix DATABASE_URL Format
```powershell
node server/db/fix-database-url.js
```

### Complete Database Setup
```powershell
node server/db/setup-database.js
```

### Run Migrations Only (if database exists)
```powershell
node server/db/run-migrations.js
```

## Expected Tables After Setup

After running setup, you should have:
- `users`
- `admins`
- `properties`
- `property_images`
- `property_amenities`
- `property_submissions`
- `email_notifications`
- `advisor_profiles`
- `advisor_experts`
- `schema_migrations`

## Troubleshooting

### Error: "password authentication failed"
- Check your PostgreSQL password in `.env`
- Verify user `fatemehrahimi` exists and has correct password

### Error: "database does not exist"
- The setup script will create it automatically
- Or create manually: `CREATE DATABASE propertydb;`

### Error: "relation already exists"
- This is OK - means tables already exist
- Migrations will skip already-applied changes

### Error: "ECONNREFUSED"
- PostgreSQL service is not running
- Start it: `Start-Service postgresql-x64-16` (or your version)

## After Setup

Once database is set up:
1. ✅ Restart your server: `npm run dev`
2. ✅ Database connection will work
3. ✅ Google OAuth will work (after setting credentials)
4. ✅ All backend features will be functional

