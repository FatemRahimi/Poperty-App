# Restore Database from Backup SQL File
# This script restores data from a backup file into your PostgreSQL database

Write-Host "`n🔄 Database Restore from Backup" -ForegroundColor Cyan
Write-Host ""

# Find backup files
$backupsDir = "server\backups"
$rootBackup = "propertydb_backup_20250612_215249.sql"

$backupFiles = @()

# Check backups directory
if (Test-Path $backupsDir) {
    $files = Get-ChildItem -Path $backupsDir -Filter "*.sql" | Where-Object { $_.Name -notlike "*.gz" } | Sort-Object LastWriteTime -Descending
    foreach ($file in $files) {
        $backupFiles += @{
            Path = $file.FullName
            Name = $file.Name
            Date = $file.LastWriteTime
        }
    }
}

# Check root backup
if (Test-Path $rootBackup) {
    $file = Get-Item $rootBackup
    $backupFiles += @{
        Path = $file.FullName
        Name = $file.Name
        Date = $file.LastWriteTime
    }
}

# Sort by date (newest first)
$backupFiles = $backupFiles | Sort-Object Date -Descending

if ($backupFiles.Count -eq 0) {
    Write-Host "❌ No backup files found!" -ForegroundColor Red
    Write-Host "   Looking in: $backupsDir" -ForegroundColor Yellow
    Write-Host "   Looking in: $rootBackup" -ForegroundColor Yellow
    exit 1
}

# Show available backups
Write-Host "📋 Available backup files:" -ForegroundColor Blue
for ($i = 0; $i -lt $backupFiles.Count; $i++) {
    $file = $backupFiles[$i]
    Write-Host "   $($i + 1). $($file.Name) ($($file.Date.ToString('yyyy-MM-dd HH:mm')))" -ForegroundColor White
}

# Get user selection
Write-Host ""
$selection = Read-Host "Select backup file (1-$($backupFiles.Count)) or press Enter for latest"
$selectedIndex = if ([string]::IsNullOrWhiteSpace($selection)) { 0 } else { [int]$selection - 1 }

if ($selectedIndex -lt 0 -or $selectedIndex -ge $backupFiles.Count) {
    Write-Host "❌ Invalid selection" -ForegroundColor Red
    exit 1
}

$selectedBackup = $backupFiles[$selectedIndex]
Write-Host "`n📁 Selected: $($selectedBackup.Name)" -ForegroundColor Blue
Write-Host ""

# Get PostgreSQL password
$password = Read-Host "Enter PostgreSQL password for 'postgres' user" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
)

# Set PGPASSWORD environment variable
$env:PGPASSWORD = $passwordPlain

Write-Host "`n🔌 Connecting to PostgreSQL..." -ForegroundColor Blue

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    # Try common PostgreSQL installation paths
    $possiblePaths = @(
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe",
        "C:\Program Files\PostgreSQL\14\bin\psql.exe",
        "C:\Program Files\PostgreSQL\13\bin\psql.exe"
    )
    
    $found = $false
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $psqlPath = $path
            $found = $true
            break
        }
    }
    
    if (-not $found) {
        Write-Host "❌ psql not found. Please add PostgreSQL bin directory to PATH." -ForegroundColor Red
        Write-Host "   Or run: node server/db/restore-backup.js" -ForegroundColor Yellow
        exit 1
    }
} else {
    $psqlPath = $psqlPath.Path
}

Write-Host "✅ Using: $psqlPath" -ForegroundColor Green
Write-Host ""

# Restore backup
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📝 Restoring backup..." -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

try {
    # Run psql to restore
    $restoreCommand = "& `"$psqlPath`" -h localhost -U postgres -d propertydb -f `"$($selectedBackup.Path)`""
    Invoke-Expression $restoreCommand
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Backup restored successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Verifying data..." -ForegroundColor Blue
        
        # Verify data counts
        $verifyQuery = "SELECT 
            (SELECT COUNT(*) FROM users) as users_count,
            (SELECT COUNT(*) FROM properties) as properties_count,
            (SELECT COUNT(*) FROM admins) as admins_count"
        
        $verifyResult = & $psqlPath -h localhost -U postgres -d propertydb -t -c $verifyQuery
        
        Write-Host "`n📊 Data Summary:" -ForegroundColor Green
        Write-Host "   $verifyResult" -ForegroundColor White
        
        Write-Host "`n🎉 Restore completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Restore failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "   Check the error messages above" -ForegroundColor Yellow
    }
} catch {
    Write-Host "`n❌ Error during restore:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    # Clear password from environment
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""

