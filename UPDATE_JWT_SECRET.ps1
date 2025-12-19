# Script to update JWT_SECRET in server/.env file
Write-Host "`n🔧 Updating JWT_SECRET in server/.env file...`n" -ForegroundColor Cyan

$envFile = "server\.env"

if (-not (Test-Path $envFile)) {
    Write-Host "❌ Error: $envFile not found!" -ForegroundColor Red
    Write-Host "   Please make sure you're running this from the project root directory." -ForegroundColor Yellow
    exit 1
}

$content = Get-Content $envFile -Raw
$newJWT = "JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c"
$newSession = "SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c"

$updated = $false

# Replace JWT_SECRET
if ($content -match "(?m)^JWT_SECRET=.*") {
    $content = $content -replace "(?m)^JWT_SECRET=.*", $newJWT
    Write-Host "✅ Updated JWT_SECRET" -ForegroundColor Green
    $updated = $true
} else {
    # Add JWT_SECRET if it doesn't exist
    if (-not ($content -match "JWT_SECRET")) {
        $content += "`n$newJWT`n"
        Write-Host "✅ Added JWT_SECRET" -ForegroundColor Green
        $updated = $true
    }
}

# Replace SESSION_SECRET
if ($content -match "(?m)^SESSION_SECRET=.*") {
    $content = $content -replace "(?m)^SESSION_SECRET=.*", $newSession
    Write-Host "✅ Updated SESSION_SECRET" -ForegroundColor Green
    $updated = $true
} else {
    # Add SESSION_SECRET if it doesn't exist
    if (-not ($content -match "SESSION_SECRET")) {
        $content += "`n$newSession`n"
        Write-Host "✅ Added SESSION_SECRET" -ForegroundColor Green
        $updated = $true
    }
}

if ($updated) {
    Set-Content $envFile -Value $content -NoNewline
    Write-Host "`n✅ .env file updated successfully!" -ForegroundColor Green
    Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Stop your server (Ctrl+C)" -ForegroundColor White
    Write-Host "   2. Clear browser localStorage (F12 → Application → Local Storage)" -ForegroundColor White
    Write-Host "   3. Restart server: npm run dev" -ForegroundColor White
    Write-Host "   4. Log in to admin dashboard again" -ForegroundColor White
} else {
    Write-Host "`n⚠️  No changes needed - JWT_SECRET already looks correct" -ForegroundColor Yellow
    Write-Host "   Run 'cd server; node db/check-admin-env.js' to verify" -ForegroundColor Yellow
}

Write-Host ""

