# Stop all Node.js processes (stops dev servers)
# Use this if ports are in use

Write-Host "🔍 Finding Node.js processes..." -ForegroundColor Cyan

# Find processes using ports 3000 and 5050
$port3000 = netstat -ano | findstr ":3000" | findstr "LISTENING"
$port5050 = netstat -ano | findstr ":5050" | findstr "LISTENING"

if ($port3000) {
    $pid3000 = ($port3000 -split '\s+')[-1]
    Write-Host "Found process $pid3000 on port 3000" -ForegroundColor Yellow
    Stop-Process -Id $pid3000 -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Stopped process on port 3000" -ForegroundColor Green
}

if ($port5050) {
    $pid5050 = ($port5050 -split '\s+')[-1]
    Write-Host "Found process $pid5050 on port 5050" -ForegroundColor Yellow
    Stop-Process -Id $pid5050 -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Stopped process on port 5050" -ForegroundColor Green
}

Write-Host "`n✅ Ports should be free now. You can run: npm run dev" -ForegroundColor Green

