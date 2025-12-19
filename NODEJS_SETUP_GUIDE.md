# Node.js and npm Setup Guide

## Current Issue
`npm` command is not recognized because Node.js is not properly installed or not in your system PATH.

## Solution Options

### Option 1: Install Node.js Properly (Recommended)

1. **Download Node.js**
   - Visit: https://nodejs.org/
   - Download the LTS (Long Term Support) version for Windows
   - Choose the Windows Installer (.msi) 64-bit

2. **Install Node.js**
   - Run the installer
   - **IMPORTANT**: Check "Add to PATH" during installation
   - Follow the installation wizard
   - Restart your terminal/PowerShell after installation

3. **Verify Installation**
   ```powershell
   node --version
   npm --version
   ```

### Option 2: Use Cursor's Node.js Temporarily

If you need to run npm immediately, you can add Cursor's Node.js to your PATH for this session:

```powershell
# Add Cursor's Node.js to PATH for current session
$env:Path = $env:Path + ";C:\Program Files\cursor\resources\app\resources\helpers"

# Verify npm works
npm --version

# Now you can run
npm run dev
```

**Note**: This only works for the current PowerShell session. You'll need to do this every time you open a new terminal.

### Option 3: Add Cursor's Node.js to System PATH Permanently

1. **Open System Environment Variables**
   - Press `Win + R`
   - Type `sysdm.cpl` and press Enter
   - Go to "Advanced" tab
   - Click "Environment Variables"

2. **Edit PATH Variable**
   - Under "System variables", find "Path"
   - Click "Edit"
   - Click "New"
   - Add: `C:\Program Files\cursor\resources\app\resources\helpers`
   - Click "OK" on all dialogs

3. **Restart Terminal**
   - Close and reopen PowerShell
   - Test: `npm --version`

## Quick Fix for Current Session

Run these commands in PowerShell:

```powershell
# Add Cursor's Node.js to PATH
$env:Path = $env:Path + ";C:\Program Files\cursor\resources\app\resources\helpers"

# Verify it works
npm --version

# Navigate to project
cd "C:\New folder\property-main (1)"

# Run development servers
npm run dev
```

## After Node.js is Installed

Once Node.js is properly installed, you can:

1. **Start the development servers:**
   ```powershell
   cd "C:\New folder\property-main (1)"
   npm run dev
   ```

2. **Install dependencies (if needed):**
   ```powershell
   npm install
   cd server
   npm install
   cd ../client
   npm install
   ```

3. **Access your application:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5050

## Troubleshooting

### If npm still not found after installation:
1. Restart your computer
2. Open a new PowerShell window
3. Verify PATH: `$env:Path -split ';' | Select-String -Pattern "node"`

### If you get permission errors:
- Run PowerShell as Administrator
- Or install Node.js for current user only

### Check Node.js installation:
```powershell
# Check if node.exe exists
Test-Path "C:\Program Files\nodejs\node.exe"

# Check version
node --version
npm --version
```

## Recommended: Install Node.js LTS

For the best experience, install Node.js LTS version from nodejs.org. This ensures:
- ✅ npm is included
- ✅ Proper PATH configuration
- ✅ System-wide availability
- ✅ Better compatibility with tools








