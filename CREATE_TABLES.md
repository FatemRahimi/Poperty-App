# Create All Database Tables

## Step 1: Grant Permissions (In PostgreSQL)

You're currently connected to PostgreSQL (`propertydb=#`). Run these commands:

```sql
GRANT USAGE ON SCHEMA public TO fatemehrahimi;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fatemehrahimi;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fatemehrahimi;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO fatemehrahimi;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO fatemehrahimi;
ALTER DATABASE propertydb OWNER TO fatemehrahimi;
```

**Then exit PostgreSQL:**
```sql
\q
```

## Step 2: Run All SQL Files

After granting permissions, run this command in PowerShell:

```powershell
node server/db/run-all-sql.js
```

This will:
- ✅ Run `init.sql` (creates all base tables)
- ✅ Run all 7 migrations (adds all fields)
- ✅ Create all indexes
- ✅ Set up everything

## What Tables Will Be Created

**Core Tables:**
- `users` - User accounts
- `admins` - Admin accounts
- `properties` - Property listings
- `property_images` - Property photos
- `property_amenities` - Property features
- `property_submissions` - Submission tracking
- `email_notifications` - Email logs

**Advisor Tables:**
- `advisor_profiles` - Advisor/company profiles
- `advisor_experts` - Team members

**System Tables:**
- `schema_migrations` - Migration tracking

## After Running

Once the script completes:
1. ✅ All tables will be created
2. ✅ All migrations applied
3. ✅ Database ready to use
4. ✅ Restart server: `npm run dev`
5. ✅ Google login will work!

---

**Quick Summary:**
1. Grant permissions (SQL commands above)
2. Exit PostgreSQL (`\q`)
3. Run: `node server/db/run-all-sql.js`
4. Done! 🎉

