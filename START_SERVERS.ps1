# PowerShell script to start development servers
# This script refreshes PATH and starts the dev servers

Write-Host "🔧 Refreshing PATH..." -ForegroundColor Cyan

# Add Node.js to PATH for this session
$env:Path += ";C:\Program Files\nodejs"

# Verify npm is available
Write-Host "`n✅ Checking npm..." -ForegroundColor Cyan
npm --version
node --version

Write-Host "`n🚀 Starting development servers..." -ForegroundColor Green
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "   Backend:  http://localhost:5050" -ForegroundColor Yellow
Write-Host "`nPress Ctrl+C to stop the servers`n" -ForegroundColor Gray

# Start the servers
npm run dev

