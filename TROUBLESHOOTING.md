# 🔧 Development Troubleshooting Guide

## Quick Fix - Run This Script
```bash
./fix-dev-issues.sh
```

## Common Issues & Manual Solutions

### 1. Port Already In Use (EADDRINUSE)
**Problem:** `Error: listen EADDRINUSE: address already in use :::5050`

**Quick Fix:**
```bash
# Find what's using the port
lsof -i :5050

# Kill the process (replace PID with actual process ID)
kill -9 <PID>

# Or kill all Node.js processes
pkill -f node
```

### 2. PostgreSQL Connection Refused (ECONNREFUSED)
**Problem:** `connect ECONNREFUSED 127.0.0.1:5432`

**Quick Fix:**
```bash
# Stop and restart PostgreSQL
brew services restart postgresql@14

# If that doesn't work, manual cleanup:
brew services stop postgresql@14
rm -f /usr/local/var/postgresql@14/postmaster.pid
brew services start postgresql@14

# Test connection
psql -h localhost -p 5432 -U $(whoami) -d postgres -c "SELECT 1;"
```

### 3. Database Doesn't Exist
**Problem:** `database "username" does not exist`

**Solution:**
```bash
createdb $(whoami)
```

### 4. Multiple Node Processes Running
**Problem:** Can't start server, multiple processes conflict

**Solution:**
```bash
# Kill all Node.js processes
pkill -f node

# Or more specific:
ps aux | grep node | grep -v grep | awk '{print $2}' | xargs kill -9
```

## Development Startup Routine

### Every Time You Start Development:
1. Run the fix script: `./fix-dev-issues.sh`
2. Start backend: `cd server && npm start`
3. Start frontend: `cd client && npm start`

### If Issues Persist:
1. Restart your computer (clears all processes)
2. Run the fix script again
3. Check if you have multiple terminals running the same commands

## Environment Setup (First Time)

### PostgreSQL Setup:
```bash
# Install PostgreSQL
brew install postgresql@14

# Start service
brew services start postgresql@14

# Create your user database
createdb $(whoami)

# Test connection
psql -d postgres -c "SELECT version();"
```

### Node.js Dependencies:
```bash
# Backend
cd server && npm install

# Frontend  
cd client && npm install
```

## Tips to Avoid Issues

1. **Always stop servers properly:** Use `Ctrl+C` instead of closing terminal
2. **Use the fix script:** Run it whenever you encounter port/database issues
3. **One terminal per service:** Don't run multiple instances
4. **Check before starting:** Use `lsof -i :5050` and `lsof -i :3000` to verify ports are free

## Still Having Issues?

If the automatic script doesn't work:
1. Restart your computer
2. Run the script again
3. Check for any error messages and search for specific solutions
4. Make sure you don't have other development projects running on the same ports 