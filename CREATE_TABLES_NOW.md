# Create All Database Tables - Quick Guide

## ❌ Current Error
```
relation "users" does not exist
```

**This means the database tables haven't been created yet.**

## ✅ Solution: Run Setup Script

**In PowerShell, run:**

```powershell
node server/db/setup-as-postgres.js
```

**When prompted, enter your PostgreSQL password** (the one you set during installation).

## What This Script Does

1. ✅ Connects to PostgreSQL as `postgres` user
2. ✅ Grants permissions to `fatemehrahimi` user
3. ✅ Creates all 10 tables:
   - users
   - admins
   - properties
   - property_images
   - property_amenities
   - property_submissions
   - email_notifications
   - advisor_profiles
   - advisor_experts
   - schema_migrations
4. ✅ Runs all 8 migrations (adds all fields)
5. ✅ Grants permissions on all tables
6. ✅ Shows you all created tables

## After Running

Once the script completes successfully:

1. ✅ All tables will exist in your PostgreSQL database
2. ✅ Google login will work
3. ✅ Your application will be fully functional
4. ✅ No need to restart server (it will auto-reconnect)

## Verify It Worked

After running the script, verify:

```powershell
node server/db/verify-tables.js
```

This will show you all created tables.

## If You Get Permission Errors

If you see "permission denied", the script handles this by:
- Running as `postgres` user (has all permissions)
- Granting permissions to `fatemehrahimi` automatically

---

**Just run: `node server/db/setup-as-postgres.js` and enter your PostgreSQL password!**

