# Fix "client password must be a string" Error

## ❌ The Problem

Your `.env` file has:
```
DATABASE_URL=postgres://fatemehrahimi:@localhost:5432/propertydb
```

Notice there's **NO PASSWORD** between `fatemehrahimi:` and `@` - that's the problem!

## ✅ The Solution

You need to add your PostgreSQL password to the DATABASE_URL.

### Step 1: Open `server/.env` File

Open the file: `server/.env` in your code editor.

### Step 2: Find the DATABASE_URL Line

Look for a line that says:
```
DATABASE_URL=postgres://fatemehrahimi:@localhost:5432/propertydb
```

### Step 3: Add Your Password

Change it to (add your password after the colon):
```
DATABASE_URL=postgres://fatemehrahimi:YOUR_PASSWORD@localhost:5432/propertydb
```

**Replace `YOUR_PASSWORD` with your actual PostgreSQL password.**

### Step 4: Save the File

Save the `.env` file.

### Step 5: Restart Your Server

Stop the server (Ctrl+C) and restart:
```powershell
npm run dev
```

## 📝 Example

**Before (WRONG):**
```env
DATABASE_URL=postgres://fatemehrahimi:@localhost:5432/propertydb
```

**After (CORRECT):**
```env
DATABASE_URL=postgres://fatemehrahimi:mypassword123@localhost:5432/propertydb
```

## 🔍 How to Find Your PostgreSQL Password

**If you don't remember your password:**

1. **It's the password you set during PostgreSQL installation**
2. **Or try the default:** `postgres` (if you didn't change it)
3. **Or reset it** (see below)

## 🔧 Reset PostgreSQL Password (If Needed)

If you forgot your password:

1. **Stop PostgreSQL service:**
   ```powershell
   Stop-Service postgresql-x64-16
   ```

2. **Edit `pg_hba.conf`:**
   - Location: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
   - Find: `host all all 127.0.0.1/32 scram-sha-256`
   - Change to: `host all all 127.0.0.1/32 trust`
   - Save

3. **Start PostgreSQL:**
   ```powershell
   Start-Service postgresql-x64-16
   ```

4. **Reset password:**
   ```powershell
   psql -U postgres -h localhost
   ```
   Then in PostgreSQL:
   ```sql
   ALTER USER fatemehrahimi WITH PASSWORD 'new_password';
   \q
   ```

5. **Restore `pg_hba.conf`:**
   - Change back to: `host all all 127.0.0.1/32 scram-sha-256`
   - Restart PostgreSQL

## ✅ Verify It's Fixed

After updating `.env` and restarting:

1. **Check server logs** - should NOT see password errors
2. **Try Google login** - should work now
3. **Check database connection** - should connect successfully

## 🎯 Quick Checklist

- [ ] Opened `server/.env` file
- [ ] Found `DATABASE_URL` line
- [ ] Added password: `postgres://fatemehrahimi:PASSWORD@localhost:5432/propertydb`
- [ ] Saved the file
- [ ] Restarted server (`npm run dev`)
- [ ] No more password errors
- [ ] Google login works

---

**That's it! Just add the password to DATABASE_URL and restart.**

