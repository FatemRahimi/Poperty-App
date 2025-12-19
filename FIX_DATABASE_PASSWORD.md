# Fix Database Password Error

## ✅ Good News!
PostgreSQL is installed and running! The error changed from `ECONNREFUSED` to a password error, which means the database is accessible.

## ❌ Current Error
```
SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

This means your `DATABASE_URL` in `.env` file is missing the password.

## 🔧 Fix: Update DATABASE_URL

### Step 1: Find Your PostgreSQL Password

**Remember the password you set during PostgreSQL installation?**

If you don't remember:
- It's the password you set for the `postgres` superuser during installation
- Or you can reset it (see below)

### Step 2: Update `server/.env` File

Your `DATABASE_URL` needs to include the password in this format:

```env
DATABASE_URL=postgres://username:password@localhost:5432/database
```

**Example:**
```env
DATABASE_URL=postgres://postgres:your_password_here@localhost:5432/propertydb
```

Or if you created a user `fatemehrahimi`:
```env
DATABASE_URL=postgres://fatemehrahimi:your_password_here@localhost:5432/propertydb
```

### Step 3: Create/Update `.env` File

Create or edit `server/.env` file with this content:

```env
# Database Configuration (UPDATE THE PASSWORD!)
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/propertydb

# Google OAuth (if you have them)
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5050/api/auth/google/callback

# Application URLs
CLIENT_URL=http://localhost:3000
PORT=5050

# JWT Secret
JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c
SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c

# Environment
NODE_ENV=development
```

**Replace `YOUR_POSTGRES_PASSWORD` with your actual PostgreSQL password.**

### Step 4: Create Database and User (If Needed)

If the database `propertydb` doesn't exist, create it:

**Option 1: Using psql (Command Line)**

```powershell
# Connect to PostgreSQL (enter your password when prompted)
psql -U postgres -h localhost

# In PostgreSQL prompt:
CREATE DATABASE propertydb;
CREATE USER fatemehrahimi WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi;
\q
```

**Option 2: Using pgAdmin (GUI)**

1. Open pgAdmin (should be installed with PostgreSQL)
2. Connect to PostgreSQL server (use your password)
3. Right-click "Databases" → "Create" → "Database"
4. Name: `propertydb`
5. Click "Save"

### Step 5: Restart Server

After updating `.env`:

```bash
# Stop server (Ctrl+C)
# Then restart:
npm run dev
```

## 🔍 If You Forgot PostgreSQL Password

### Reset PostgreSQL Password (Windows)

1. **Stop PostgreSQL service:**
   ```powershell
   # Run as Administrator
   Stop-Service postgresql-x64-16
   ```

2. **Edit pg_hba.conf:**
   - Location: `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`
   - Find line: `host all all 127.0.0.1/32 scram-sha-256`
   - Change to: `host all all 127.0.0.1/32 trust`
   - Save file

3. **Start PostgreSQL:**
   ```powershell
   Start-Service postgresql-x64-16
   ```

4. **Reset password:**
   ```powershell
   psql -U postgres -h localhost
   ```
   ```sql
   ALTER USER postgres WITH PASSWORD 'new_password';
   \q
   ```

5. **Restore pg_hba.conf:**
   - Change back to: `host all all 127.0.0.1/32 scram-sha-256`
   - Restart PostgreSQL service

## ✅ Verify Connection

Test if connection works:

```powershell
# Test connection (replace password)
psql -U postgres -h localhost -d propertydb
# Enter password when prompted
# If successful, you'll see: propertydb=#
```

## 📝 Quick Checklist

- [ ] PostgreSQL is running (✅ Already done!)
- [ ] Know your PostgreSQL password
- [ ] Created `server/.env` file
- [ ] Updated `DATABASE_URL` with password
- [ ] Database `propertydb` exists
- [ ] Restarted server
- [ ] Connection works

## 🎯 After Fixing

Once the password is correct:
- ✅ Database connection will work
- ✅ Google OAuth will work (after setting up credentials)
- ✅ Your application will be fully functional

