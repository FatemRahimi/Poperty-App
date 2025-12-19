# Fix "password authentication failed" Error

## ❌ The Problem

**Error:** `password authentication failed for user "fatemehrahimi"`

This means PostgreSQL cannot authenticate the user `fatemehrahimi` with the password `FArzaneh5475`.

## 🔍 Why This Happens

**Possible reasons:**

1. **User doesn't exist** - The user `fatemehrahimi` was never created in PostgreSQL
2. **Wrong password** - The user exists but the password doesn't match
3. **User exists but password is different** - Password was set differently than what's in `.env`

## ✅ Solution: Create the User (Step-by-Step)

### Step 1: Connect to PostgreSQL as `postgres` user

```powershell
psql -U postgres -h localhost
```

**Enter your PostgreSQL password** (the one you set during installation)

### Step 2: Check if user exists

Once connected, check if the user exists:

```sql
SELECT usename FROM pg_user WHERE usename = 'fatemehrahimi';
```

**If it returns nothing** → User doesn't exist (go to Step 3)
**If it returns a row** → User exists but password is wrong (go to Step 4)

### Step 3: Create the User (if doesn't exist)

```sql
-- Create the user with the password from your .env file
CREATE USER fatemehrahimi WITH PASSWORD 'FArzaneh5475';

-- Create the database if it doesn't exist
CREATE DATABASE propertydb;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi;

-- Exit PostgreSQL
\q
```

### Step 4: Reset Password (if user exists)

If the user exists but password is wrong:

```sql
-- Reset the password to match your .env file
ALTER USER fatemehrahimi WITH PASSWORD 'FArzaneh5475';

-- Make sure database exists
CREATE DATABASE propertydb;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi;

-- Exit
\q
```

## 🎯 Complete Setup Script

**Run all these commands in PostgreSQL:**

```sql
-- Create user (or update if exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'fatemehrahimi') THEN
        CREATE USER fatemehrahimi WITH PASSWORD 'FArzaneh5475';
    ELSE
        ALTER USER fatemehrahimi WITH PASSWORD 'FArzaneh5475';
    END IF;
END
$$;

-- Create database (if doesn't exist)
SELECT 'CREATE DATABASE propertydb'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'propertydb')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi;

-- Exit
\q
```

## ✅ Verify It Works

After creating the user, test the connection:

```powershell
cd server
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL}); p.query('SELECT 1').then(()=>{console.log('✅ Connection successful!');p.end();}).catch(e=>console.log('❌',e.message));"
```

## 🔄 After Fixing

1. ✅ User `fatemehrahimi` created with password `FArzaneh5475`
2. ✅ Database `propertydb` created
3. ✅ Privileges granted
4. ✅ Restart server: `npm run dev`
5. ✅ Google login should work now!

## 📝 Quick Reference

**Your .env file has:**
```env
DATABASE_URL=postgres://fatemehrahimi:FArzaneh5475@localhost:5432/propertydb
```

**So you need:**
- User: `fatemehrahimi`
- Password: `FArzaneh5475`
- Database: `propertydb`

**Create them in PostgreSQL using the commands above!**

