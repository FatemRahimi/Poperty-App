# PowerShell script to fix database permissions
# This script runs the SQL commands to grant permissions to fatemehrahimi user

Write-Host ""
Write-Host "🔧 Fixing Database Permissions" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host ""

$psqlPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
$sqlFile = "server\db\grant-permissions.sql"
$dbName = "propertydb"

if (-not (Test-Path $psqlPath)) {
    Write-Host "❌ psql not found at: $psqlPath" -ForegroundColor Red
    Write-Host "💡 Please run manually: psql -U postgres -d propertydb -f server/db/grant-permissions.sql" -ForegroundColor Yellow
    exit 1
}

Write-Host "📝 ROOT CAUSE EXPLANATION:" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "❌ Problem: 'permission denied for table users'" -ForegroundColor Red
Write-Host ""
Write-Host "🔍 Why this happens:" -ForegroundColor Cyan
Write-Host "   1. PostgreSQL tables are created by the 'postgres' superuser"
Write-Host "   2. By default, only the creator has full permissions"
Write-Host "   3. Your app connects as 'fatemehrahimi' user"
Write-Host "   4. This user needs explicit GRANT permissions to access tables"
Write-Host ""
Write-Host "💡 Solution:" -ForegroundColor Green
Write-Host "   We need to grant permissions as 'postgres' superuser"
Write-Host "   This allows 'fatemehrahimi' to SELECT, INSERT, UPDATE on tables"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

Write-Host "🚀 Running SQL commands to fix permissions..." -ForegroundColor Cyan
Write-Host ""

# Run psql with the SQL file
& $psqlPath -U postgres -d $dbName -f $sqlFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=" * 70
    Write-Host "✅ Permissions fixed successfully!" -ForegroundColor Green
    Write-Host "=" * 70
    Write-Host ""
    Write-Host "💡 Google OAuth should work now!" -ForegroundColor Green
    Write-Host "   The app can now create/update users when they login with Google." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Failed to run SQL commands. Exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Manual fix:" -ForegroundColor Yellow
    Write-Host "   1. Run: psql -U postgres -d propertydb"
    Write-Host "   2. Enter your postgres password"
    Write-Host "   3. Copy and paste the SQL commands from grant-permissions.sql file"
    Write-Host ""
}

