# ⚠️ CRITICAL: Update JWT_SECRET in .env File

## 🔍 Problem Found

Your `JWT_SECRET` in `server/.env` is **only 12 characters** long. It needs to be **at least 32 characters** for JWT tokens to work correctly.

**This is why your admin dashboard is not working!**

## ✅ Quick Fix

### Option 1: Manual Update (Recommended)

1. Open `server/.env` file in your editor
2. Find the line: `JWT_SECRET=...`
3. Replace it with:
   ```env
   JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c
   ```
4. Also update `SESSION_SECRET` (if it exists):
   ```env
   SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c
   ```
5. **Save the file**
6. **Restart your server** (stop with Ctrl+C, then run `npm run dev` again)

### Option 2: PowerShell Script

Run this in PowerShell from the project root:

```powershell
$envFile = "server\.env"
$content = Get-Content $envFile -Raw
$newJWT = "JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c"
$newSession = "SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c"

# Replace JWT_SECRET
if ($content -match "JWT_SECRET=.*") {
    $content = $content -replace "JWT_SECRET=.*", $newJWT
    Write-Host "✅ Updated JWT_SECRET" -ForegroundColor Green
} else {
    $content += "`n$newJWT"
    Write-Host "✅ Added JWT_SECRET" -ForegroundColor Green
}

# Replace SESSION_SECRET
if ($content -match "SESSION_SECRET=.*") {
    $content = $content -replace "SESSION_SECRET=.*", $newSession
    Write-Host "✅ Updated SESSION_SECRET" -ForegroundColor Green
} else {
    $content += "`n$newSession"
    Write-Host "✅ Added SESSION_SECRET" -ForegroundColor Green
}

Set-Content $envFile -Value $content -NoNewline
Write-Host "`n✅ .env file updated! Please restart your server." -ForegroundColor Green
```

## 🔄 After Updating

1. **Stop the server** (Ctrl+C)
2. **Clear browser localStorage:**
   - Open DevTools (F12)
   - Application tab → Local Storage → `http://localhost:3000`
   - Delete `token` and `user`
3. **Restart server:** `npm run dev`
4. **Log in again** to admin dashboard

## ✅ Verify It's Fixed

Run this to check:
```bash
cd server
node db/check-admin-env.js
```

You should see:
```
✅ JWT_SECRET is set and has sufficient length
```

## 📋 Why This Matters

- JWT tokens are signed using `JWT_SECRET`
- If the secret is too short, token verification fails
- This causes all admin API calls to return 401/403 errors
- The admin dashboard can't load data without valid tokens

