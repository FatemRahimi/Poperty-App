# Quick Fix Script for npm Command
# This script helps you run npm commands using Cursor's Node.js

Write-Host "🔍 Checking Node.js installation..." -ForegroundColor Cyan

# Check if Cursor's Node.js exists
$cursorNode = "C:\Program Files\cursor\resources\app\resources\helpers\node.exe"
if (Test-Path $cursorNode) {
    Write-Host "✓ Found Cursor's Node.js" -ForegroundColor Green
    
    # Try to use node directly to run npm
    Write-Host "`n📦 Attempting to use Node.js..." -ForegroundColor Cyan
    
    # Check if we can access npm through node
    $npmPath = "C:\Program Files\cursor\resources\app\resources\helpers\npm.cmd"
    if (Test-Path $npmPath) {
        Write-Host "✓ Found npm.cmd" -ForegroundColor Green
        $env:Path = $env:Path + ";C:\Program Files\cursor\resources\app\resources\helpers"
        Write-Host "`n✅ npm should now work in this session!" -ForegroundColor Green
        Write-Host "Try running: npm --version" -ForegroundColor Yellow
    } else {
        Write-Host "✗ npm.cmd not found in Cursor directory" -ForegroundColor Red
        Write-Host "`n⚠️  RECOMMENDATION: Install Node.js properly" -ForegroundColor Yellow
        Write-Host "`nPlease install Node.js from: https://nodejs.org/" -ForegroundColor Cyan
        Write-Host "Choose the LTS version and make sure to check 'Add to PATH' during installation." -ForegroundColor Cyan
    }
} else {
    Write-Host "✗ Cursor's Node.js not found" -ForegroundColor Red
    Write-Host "`n⚠️  Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
}

Write-Host "`n📋 Current PATH entries with 'node':" -ForegroundColor Cyan
$env:Path -split ';' | Where-Object { $_ -like "*node*" } | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }








