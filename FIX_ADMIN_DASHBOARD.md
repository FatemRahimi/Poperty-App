# Fix Admin Dashboard Issues

## ✅ Good News

- ✅ All required environment variables are set
- ✅ Admin users exist in database (5 active admins)
- ✅ Database connection is working
- ✅ CLIENT_URL and PORT are configured correctly

## ❌ Critical Issue Found

**JWT_SECRET is too short** (12 characters, needs at least 32)
- This causes JWT token signing/verification to fail
- Admin authentication will not work properly
- Tokens cannot be verified, causing 401/403 errors

## 🔧 Fix: Update JWT_SECRET in server/.env

### Step 1: Open `server/.env` file

### Step 2: Find this line:
```env
JWT_SECRET=your_current_short_secret
```

### Step 3: Replace it with a longer secret (at least 32 characters):
```env
JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c
```

Or generate a new one:
```env
JWT_SECRET=your_very_long_random_secret_key_at_least_32_characters_long_123456789
```

### Step 4: Also set SESSION_SECRET (can be same as JWT_SECRET):
```env
SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c
```

### Step 5: Restart the server

After updating `.env`:
1. Stop the server (Ctrl+C)
2. Restart: `npm run dev`

## ✅ Required Environment Variables for Admin Dashboard

Make sure your `server/.env` file has:

```env
# JWT Secret (MUST be at least 32 characters)
JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c

# Session Secret (can be same as JWT_SECRET)
SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c

# Client URL
CLIENT_URL=http://localhost:3000

# Server Port
PORT=5050

# Database
DATABASE_URL=postgres://fatemehrahimi:FArzaneh5475@localhost:5432/propertydb

# Admin Configuration (optional, has defaults)
ADMIN_EMAIL=shahrzadrahy
ADMIN_PASSWORD=your_admin_password
ADMIN_ROUTE_SECRET=x9k7m2p5q8
```

## 🔍 Verify Admin User Exists

After fixing JWT_SECRET, verify admin user exists in database:

```powershell
# Check if admin exists
node -e "const {Pool}=require('pg');require('dotenv').config({path:'server/.env'});const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT email, role FROM admins WHERE is_active=true').then(r=>{console.log('Admins:',r.rows);p.end()});"
```

## 🐛 Common Issues

1. **"Invalid or expired admin token"**
   - JWT_SECRET is too short or changed
   - Fix: Update JWT_SECRET to at least 32 characters

2. **"Admin access required"**
   - User role is not 'admin' or 'super_admin'
   - Fix: Check admin user exists in `admins` table with correct role

3. **"401 Unauthorized"**
   - Token not being sent correctly
   - Fix: Check browser console for Authorization header

4. **Dashboard loads but shows no data**
   - API endpoints returning errors
   - Fix: Check server logs and browser console for API errors

## 📝 Test Admin Login

1. Go to: `http://localhost:3000/admin-x9k7m2p5q8`
2. Enter admin email and password
3. Check browser console for errors
4. Check server logs for authentication errors
