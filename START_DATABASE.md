# Start PostgreSQL Database - Quick Guide

## ❌ Current Error
```
ECONNREFUSED ::1:5432
ECONNREFUSED 127.0.0.1:5432
```

**This means PostgreSQL is not running.**

## ✅ Solution: Start PostgreSQL

### Option 1: Start via Windows Services (Easiest)

1. **Open Services:**
   - Press `Win + R`
   - Type: `services.msc`
   - Press Enter

2. **Find PostgreSQL Service:**
   - Look for services with "PostgreSQL" in the name
   - Common names:
     - `postgresql-x64-16`
     - `postgresql-x64-15`
     - `postgresql-x64-14`
     - `PostgreSQL Database Server`

3. **Start the Service:**
   - Right-click on PostgreSQL service
   - Click **"Start"**
   - Wait for status to change to **"Running"**

4. **Verify:**
   - Status should show "Running"
   - Green checkmark or running indicator

### Option 2: Start via PowerShell (Run as Administrator)

```powershell
# Find PostgreSQL service
Get-Service | Where-Object {$_.DisplayName -like "*PostgreSQL*"}

# Start the service (replace SERVICE_NAME with actual name from above)
Start-Service postgresql-x64-16

# Verify it's running
Get-Service | Where-Object {$_.DisplayName -like "*PostgreSQL*"}
```

### Option 3: If PostgreSQL is NOT Installed

**Download and Install:**

1. **Download PostgreSQL:**
   - Visit: https://www.postgresql.org/download/windows/
   - Click "Download the installer"
   - Download PostgreSQL for Windows (64-bit)

2. **Install PostgreSQL:**
   - Run the installer
   - **Important:** Remember the password you set for `postgres` user
   - Default port: `5432` (keep this)
   - Default user: `postgres`
   - Installation directory: Usually `C:\Program Files\PostgreSQL\XX\`

3. **After Installation:**
   - PostgreSQL service should start automatically
   - Verify with: `Test-NetConnection localhost -Port 5432`

## 🔍 Verify PostgreSQL is Running

After starting, verify:

```powershell
# Check if port 5432 is listening
Test-NetConnection -ComputerName localhost -Port 5432

# Should return: TcpTestSucceeded : True
```

## 🗄️ Create Database (If Needed)

If database `propertydb` doesn't exist:

```powershell
# Connect to PostgreSQL (replace password)
psql -U postgres -h localhost

# In PostgreSQL prompt, run:
CREATE DATABASE propertydb;
CREATE USER fatemehrahimi WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE propertydb TO fatemehrahimi;
\q
```

Or use pgAdmin (GUI tool that comes with PostgreSQL).

## ✅ After Starting PostgreSQL

Once PostgreSQL is running:

1. ✅ Backend will automatically reconnect
2. ✅ Google OAuth will work (after you set up `.env` file)
3. ✅ Database operations will work
4. ✅ Your application will be fully functional

## 🚨 Common Issues

### Service Won't Start
- Check Windows Event Viewer for errors
- Verify PostgreSQL data directory exists
- Check if port 5432 is already in use

### Port Already in Use
```powershell
# Check what's using port 5432
netstat -ano | findstr :5432
```

### Can't Find Service
- PostgreSQL might not be installed
- Check: `Test-Path "C:\Program Files\PostgreSQL"`
- If false, install PostgreSQL first

## 📝 Quick Checklist

- [ ] PostgreSQL service is running
- [ ] Port 5432 is accessible
- [ ] Database `propertydb` exists
- [ ] User `fatemehrahimi` has access
- [ ] Backend can connect (check server logs)

## 🎯 Next Steps

After PostgreSQL is running:

1. **Set up Google OAuth** (if not done):
   - Create `server/.env` file
   - Add Google OAuth credentials
   - See `GOOGLE_OAUTH_SETUP.md`

2. **Restart your server:**
   ```bash
   npm run dev
   ```

3. **Test the application:**
   - Open http://localhost:3000
   - Try Google OAuth login
   - Should work now!

