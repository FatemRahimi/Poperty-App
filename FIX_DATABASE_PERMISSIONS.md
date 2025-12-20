# 🔧 Fix Database Permissions - QUICK SOLUTION

## 🚨 **Error:**
```
error: 'must be owner of table users'
```

The database user `fatemehrahimi` needs ownership of all tables in the database.

---

## ✅ **SOLUTION: Run This Command**

### **Windows - PowerShell or Command Prompt:**

1. **Open Command Prompt or PowerShell as Administrator**

2. **Copy and paste this ONE command:**

```powershell
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -d propertydb -f "server/db/fix-all-tables.sql"
```

**OR** if you have psql in your PATH:

```bash
psql -U postgres -d propertydb -f server/db/fix-all-tables.sql
```

3. **Enter your postgres password when prompted**

4. **You should see:**
```
✅ ALL PERMISSIONS GRANTED SUCCESSFULLY!
```

---

### **Mac/Linux:**

```bash
sudo -u postgres psql -d propertydb -f server/db/fix-all-tables.sql
```

---

## 📝 **Alternative: Manual Commands**

If the script doesn't work, run these commands manually:

### **Step 1: Connect to PostgreSQL**

```bash
# Windows
psql -U postgres

# Mac/Linux
sudo -u postgres psql
```

### **Step 2: Run These Commands**

```sql
-- Connect to database
\c propertydb

-- Grant all schema privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO fatemehrahimi;

-- Grant all table privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi;

-- Grant all sequence privileges
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi;

-- Make fatemehrahimi the owner of public schema
ALTER SCHEMA public OWNER TO fatemehrahimi;

-- Transfer ownership of all tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO fatemehrahimi';
    END LOOP;
END $$;

-- Transfer ownership of all sequences
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO fatemehrahimi';
    END LOOP;
END $$;

-- Exit
\q
```

---

## 🧪 **Test the Fix**

1. **Restart your development server:**
   ```bash
   # Press Ctrl+C to stop
   # Then restart with:
   npm run dev
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete)

3. **Test the form:**
   - Go to `http://localhost:3000/advisor-profile`
   - Click "Set as a Person"
   - Fill:
     - Full Name: "Test User"
     - Job Title: "Estate Agent"
   - Click Submit
   - ✅ **Should work now!**

---

## 🔍 **Verify Permissions**

Check which user owns the tables:

```sql
-- Connect
psql -U postgres -d propertydb

-- Check table ownership
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected output after fix:**
```
 schemaname |     tablename      |   tableowner   
------------+--------------------+----------------
 public     | users              | fatemehrahimi
 public     | properties         | fatemehrahimi
 public     | advisor_profiles   | fatemehrahimi
 public     | advisor_experts    | fatemehrahimi
 ... (all tables should show fatemehrahimi)
```

---

## 🎯 **Why This Happens**

The `saveAdvisorProfile` function in the backend:
1. Creates `advisor_profiles` table
2. Creates `advisor_experts` table
3. Inserts/updates data
4. Calls `markAdvisorProfileCompleted()` which updates the **`users` table**

Step 4 fails because `fatemehrahimi` doesn't own the `users` table. The fix transfers ownership of **ALL tables** to `fatemehrahimi`.

---

## 🚀 **Quick Fix Alternative**

If you can't run the scripts, change the database user to `postgres` in your `.env` file:

**File:** `server/.env`

```env
# BEFORE
DATABASE_URL=postgres://fatemehrahimi@localhost:5432/propertydb

# AFTER (use superuser)
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/propertydb
```

Replace `YOUR_PASSWORD` with your actual postgres password, then restart the server.

---

## ✅ **After Fixing**

The advisor profile submission will work for:
- ✅ Person type
- ✅ Company type
- ✅ With or without file uploads
- ✅ In create mode
- ✅ In edit mode

---

**Run the fix script and test again!** 🚀










