# Quick Start Guide - Fix npm Not Recognized

## The Problem
Each new PowerShell session doesn't automatically see npm because PATH needs to be refreshed.

## Quick Fix (For Current Session)

Run this in your PowerShell terminal:

```powershell
$env:Path += ";C:\Program Files\nodejs"
npm --version  # Verify it works
npm run dev     # Start servers
```

## Permanent Fix (One-Time Setup)

I've added Node.js to your PowerShell profile. **Restart PowerShell/VS Code** and npm will work automatically!

Or manually add to profile:
```powershell
notepad $PROFILE
```

Add this line:
```powershell
$env:Path += ";C:\Program Files\nodejs"
```

Save and restart PowerShell.

## Easy Way - Use the Script

Just run:
```powershell
.\START_SERVERS.ps1
```

This script automatically:
- ✅ Refreshes PATH
- ✅ Verifies npm works
- ✅ Starts development servers

## Why This Happens

- Node.js is installed ✅
- But PowerShell loads PATH when it starts
- If PowerShell opened before Node.js was installed, it doesn't see npm
- Solution: Refresh PATH or restart PowerShell

## After Restarting PowerShell

Once you restart PowerShell/VS Code, npm will work automatically. No need to refresh PATH anymore!

