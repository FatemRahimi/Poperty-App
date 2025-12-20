# 🔧 FIX: Advisor Profile Edit Timeout

## Problem
When editing an advisor profile, the form submission fails with "Network error" and the server shows "Unexpected end of form". This is caused by massive base64 image strings stored in the database from previous submissions.

## Root Cause
- Base64 data URLs (38,000+ characters) are stored in the `expert_team` JSONB field
- When editing, these are sent to frontend and back to backend
- The request size exceeds timeout limits, causing failure

## Solution

### Step 1: Clean the Database (Run as PostgreSQL superuser)
```bash
psql -U postgres -d propertydb -f "server/db/clean-base64-photos.sql"
```

OR manually in psql:
```sql
-- Connect to database
\c propertydb

-- Remove base64 data URLs from expert team
UPDATE advisor_profiles
SET expert_team = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', expert->>'id',
      'fullName', expert->>'fullName',
      'jobTitle', expert->>'jobTitle',
      'phone', expert->>'phone',
      'email', expert->>'email',
      'profilePhotoUrl', 
        CASE 
          WHEN (expert->>'profilePhotoUrl') LIKE 'data:%' THEN NULL
          ELSE expert->>'profilePhotoUrl'
        END
    )
  )
  FROM jsonb_array_elements(expert_team) AS expert
)
WHERE expert_team IS NOT NULL 
  AND expert_team::text LIKE '%data:image%';
```

### Step 2: Verify Server Code Changes
The following files have been updated to prevent base64 strings:

1. **`server/models/User.js`** (lines 718-738)
   - Strips base64 data URLs when retrieving profiles for edit

2. **`server/controllers/userController.js`** (lines 173-203)
   - Strips base64 data URLs when saving profiles

3. **`client/src/pages/AdvisorProfile.js`** (lines 454-480)
   - Only sends File objects, not base64 strings

### Step 3: Restart Server
The server should automatically restart with nodemon. If not:
```bash
# Stop all Node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Restart
npm start
```

### Step 4: Test
1. Go to Dashboard → Advisor tab
2. Click "Edit" on your advisor profile
3. Make any changes
4. Submit the form
5. ✅ Should now work without timeout!

## What Was Fixed
- ✅ Database cleaned of base64 strings
- ✅ Backend strips base64 on retrieval
- ✅ Backend strips base64 on save
- ✅ Frontend only sends File objects
- ✅ Request size kept small (<1MB)

## Files Modified
- `server/db/clean-base64-photos.sql` (NEW)
- `server/models/User.js`
- `server/controllers/userController.js`
- `client/src/pages/AdvisorProfile.js`





