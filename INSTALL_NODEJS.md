# Installing Node.js on Windows

## Problem
`npm` command is not recognized because Node.js is not installed system-wide (only available through Cursor's bundled version).

## Solution: Install Node.js

### Option 1: Using Winget (Recommended - Windows 10/11)
```powershell
# Install Node.js LTS version
winget install OpenJS.NodeJS.LTS

# After installation, restart PowerShell or run:
refreshenv
```

### Option 2: Using Chocolatey (If installed)
```powershell
# Install Node.js
choco install nodejs-lts

# Refresh environment
refreshenv
```

### Option 3: Manual Installation
1. Download Node.js from: https://nodejs.org/
2. Choose the **LTS (Long Term Support)** version
3. Run the installer
4. Make sure to check "Add to PATH" during installation
5. Restart PowerShell after installation

### Option 4: Using Scoop (If installed)
```powershell
scoop install nodejs-lts
```

## Verify Installation

After installation, restart PowerShell and verify:

```powershell
# Check Node.js version
node --version

# Check npm version
npm --version

# Both should return version numbers
```

## After Installation

Once Node.js is installed, you can run:

```powershell
cd "C:\New folder\property-main (1)"
npm run dev
```

## Troubleshooting

### If npm still not recognized after installation:

1. **Restart PowerShell** - Environment variables need to reload
2. **Check PATH manually**:
   ```powershell
   $env:PATH -split ';' | Select-String -Pattern "node"
   ```
3. **Add Node.js to PATH manually** (if needed):
   ```powershell
   # Usually Node.js installs to:
   # C:\Program Files\nodejs\
   
   # Add to PATH temporarily:
   $env:PATH += ";C:\Program Files\nodejs"
   
   # Or permanently (requires admin):
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\nodejs", "User")
   ```

## Quick Install Command

If you have winget available, run this in PowerShell (as Administrator recommended):

```powershell
winget install OpenJS.NodeJS.LTS
```

Then restart PowerShell and test with:
```powershell
node --version
npm --version
```

