# How to Start PostgreSQL Database

## Current Status
✅ Frontend: Compiled successfully (http://localhost:3000)
✅ Backend: Running on port 5050
❌ Database: PostgreSQL not running (connection refused on port 5432)

## Error You're Seeing
```
ECONNREFUSED ::1:5432
ECONNREFUSED 127.0.0.1:5432
```

This means PostgreSQL is installed but not running.

## How to Start PostgreSQL

### Option 1: Start PostgreSQL Service (Windows)

1. **Open Services:**
   - Press `Win + R`
   - Type `services.msc` and press Enter
   - Or search "Services" in Start Menu

2. **Find PostgreSQL Service:**
   - Look for service names like:
     - `postgresql-x64-XX` (where XX is version number)
     - `PostgreSQL Database Server`
     - `postgresql-XX`

3. **Start the Service:**
   - Right-click on the PostgreSQL service
   - Click "Start"
   - Wait for status to change to "Running"

### Option 2: Start via PowerShell (Run as Administrator)

```powershell
# Find PostgreSQL service name
Get-Service | Where-Object {$_.DisplayName -like "*PostgreSQL*"}

# Start the service (replace SERVICE_NAME with actual name)
Start-Service postgresql-x64-XX
```

### Option 3: Start via Command Prompt (Run as Administrator)

```cmd
# Find PostgreSQL service name
sc query | findstr postgres

# Start the service (replace SERVICE_NAME with actual name)
net start postgresql-x64-XX
```

### Option 4: Start via pg_ctl (If installed)

```powershell
# Navigate to PostgreSQL bin directory (adjust version number)
cd "C:\Program Files\PostgreSQL\16\bin"

# Start PostgreSQL
.\pg_ctl.exe -D "C:\Program Files\PostgreSQL\16\data" start
```

## Verify PostgreSQL is Running

After starting, verify it's running:

```powershell
# Check if port 5432 is listening
Test-NetConnection -ComputerName localhost -Port 5432

# Should return: TcpTestSucceeded : True
```

## If PostgreSQL is Not Installed

If you don't have PostgreSQL installed:

1. **Download PostgreSQL:**
   - Visit: https://www.postgresql.org/download/windows/
   - Download PostgreSQL installer for Windows

2. **Install PostgreSQL:**
   - Run the installer
   - Remember the password you set for `postgres` user
   - Default port is 5432
   - Default user is `postgres`

3. **After Installation:**
   - PostgreSQL service should start automatically
   - Verify with: `Test-NetConnection localhost -Port 5432`

## Database Connection Info

Your application is configured to connect to:
- **Host:** localhost
- **Port:** 5432
- **Database:** propertydb
- **User:** fatemehrahimi (from your code)

## After Starting PostgreSQL

Once PostgreSQL is running:
1. ✅ Backend will automatically reconnect
2. ✅ Google OAuth will work
3. ✅ All database operations will work
4. ✅ Your application will be fully functional

## Troubleshooting

### Service Won't Start
- Check Windows Event Viewer for errors
- Verify PostgreSQL data directory exists
- Check if another PostgreSQL instance is running

### Port 5432 Already in Use
- Another application might be using port 5432
- Check: `netstat -ano | findstr :5432`
- Stop conflicting service or change PostgreSQL port

### Connection Still Fails
- Verify database `propertydb` exists
- Check user `fatemehrahimi` has proper permissions
- Verify connection string in `.env` file

## Quick Check Commands

```powershell
# Check PostgreSQL service status
Get-Service | Where-Object {$_.DisplayName -like "*PostgreSQL*"}

# Check if port 5432 is open
Test-NetConnection localhost -Port 5432

# Check PostgreSQL processes
Get-Process | Where-Object {$_.ProcessName -like "*postgres*"}
```

