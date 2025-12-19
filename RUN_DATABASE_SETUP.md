# Run Database Setup - Instructions

## ✅ I've Created the Setup Script

The script `server/db/setup-with-postgres.js` is ready. It will:
1. Ask for your PostgreSQL password
2. Create the database
3. Create the user
4. Run all SQL files
5. Update your .env file automatically

## 🚀 How to Run It

**Open PowerShell in your project directory and run:**

```powershell
cd "C:\New folder\property-main (1)"
node server/db/setup-with-postgres.js
```

**When prompted, enter your PostgreSQL password** (the one you set during installation).

## What It Will Do

1. ✅ Connect to PostgreSQL as `postgres` user
2. ✅ Create `propertydb` database
3. ✅ Create `fatemehrahimi` user (if needed)
4. ✅ Grant all privileges
5. ✅ Run `init.sql` (creates all tables)
6. ✅ Run all 7 migrations
7. ✅ Update `server/.env` with correct DATABASE_URL
8. ✅ Show you all created tables

## After Running

Once setup completes:
- ✅ Database will be ready
- ✅ All tables created
- ✅ `.env` file updated
- ✅ You can restart your server: `npm run dev`

## Alternative: Manual Setup

If you prefer to set it up manually:

1. **Edit `server/.env`** and add password:
   ```env
   DATABASE_URL=postgres://fatemehrahimi:YOUR_PASSWORD@localhost:5432/propertydb
   ```

2. **Then run:**
   ```powershell
   node server/db/setup-database.js
   ```

---

**Just run the script in your terminal - it will guide you through everything!**

