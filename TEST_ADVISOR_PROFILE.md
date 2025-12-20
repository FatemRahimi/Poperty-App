# Advisor Profile Submission - Debugging Guide

## ✅ What We Fixed

1. **Database Cleanup**: Removed all base64 image data from `advisor_profiles.expert_team` field
2. **Backend Stripping**: Server strips base64 on retrieval (line 724 in User.js)
3. **Backend Saving**: Server only saves clean URLs, not base64 (line 193 in userController.js)
4. **Frontend**: Only sends File objects, not base64 strings (line 458 in AdvisorProfile.js)

---

## 🔍 Current Issue

The submission is failing with **"Unexpected end of form"** error. This typically means:
- The HTTP request is **timing out** before completion
- The payload is **too large**
- There's a **network interruption**

---

## 📋 Step-by-Step Testing Procedure

### Step 1: Clear Browser Completely

**IMPORTANT**: You MUST do this after database cleanup!

1. Open your browser (Chrome/Edge)
2. Press **F12** (Developer Tools)
3. Go to **Application** tab
4. Expand **Storage** in left sidebar:
   - Right-click **Local Storage** → Click **Clear**
   - Right-click **Session Storage** → Click **Clear**
   - Right-click **Cookies** → Click **Clear**
   - Right-click **Cache Storage** → Click **Clear all**
5. Close DevTools
6. Press **Ctrl + Shift + Delete**
7. Select:
   - ✅ **Cached images and files**
   - ✅ **Cookies and other site data**
8. Click **Clear data**
9. **Close browser completely** (all tabs)
10. Reopen browser

---

### Step 2: Test with Browser Console Open

1. Open browser
2. Go to http://localhost:3000
3. Press **F12** immediately
4. Go to **Console** tab (keep it open)
5. Log in as the user with advisor profile (itechdevelopers3@gmail.com)
6. Go to **Dashboard**
7. Click **Advisor Profile** tab
8. Click **Edit** button

**What to check:**
- Console should show: `📝 Form data:` 
- Console should show: `👥 Expert team:`
- **CHECK**: Does `👥 Expert team:` show base64 strings?
  - If YES → Browser cache not cleared properly
  - If NO → Good, continue

---

### Step 3: Try Submitting

1. Make a small change (e.g., edit company description)
2. Click **Submit**
3. Watch the **Console** tab

**Expected Console Output:**
```
📡 Making API call to save advisor profile...
📋 Added advisorType: company
📋 Added companyName: ...
👥 Expert team data being sent: [...]
📡 Response status: 200
✅ Advisor profile saved successfully
```

**If you see an error:**
- Copy the ENTIRE console output
- Check **Network** tab in DevTools
- Find the request to `/api/users/41/advisor-profile`
- Click on it
- Look at **Headers** → **Request Payload**
- **CHECK**: Is the payload huge (>10MB)?

---

### Step 4: Check Server Logs

While submitting, watch the server terminal (terminal 1.txt).

**Expected Server Output:**
```
🔍 Save advisor profile request received
User ID: 41
👥 Original expert team data received from frontend
👥 Expert team data cleaned and ready to save
✅ Expert team data updated with photo URLs
✅ Advisor profile saved and marked as completed
```

**If you see:**
```
Error: Unexpected end of form
```

This means the HTTP request body is being cut off mid-transmission.

---

## 🔧 Troubleshooting

### Issue 1: "Unexpected end of form" persists

**Cause**: Browser still has base64 strings in memory

**Fix**:
```powershell
# In PowerShell terminal:
cd "E:\New folder\property-main (1)"

# Verify database is clean:
cd server
node -e "const pool = require('./models/db'); pool.query('SELECT user_id, LENGTH(expert_team::text) as size FROM advisor_profiles WHERE expert_team IS NOT NULL').then(r => { console.log('Profiles:', r.rows); process.exit(0); });"
```

Expected output: `size` should be small (<1000 characters)

If size is large (>10000):
```powershell
# Run cleanup again:
node scripts/clean-base64.js
```

---

### Issue 2: Photos not showing after edit

**Cause**: Expert photos were stripped but not replaced with new uploads

**Check**:
1. In browser console, before submitting, check:
```javascript
// Type this in console:
console.log(expertTeam.map(e => ({ name: e.fullName, hasFile: e.profilePhotoFile instanceof File })));
```

2. If `hasFile: false` for all experts, it means you need to re-upload their photos

---

### Issue 3: Request times out

**Cause**: Network or server timeout

**Fix**:
1. Restart server:
```powershell
# Stop server (Ctrl+C in terminal 1)
# Start again:
npm run dev
```

2. Check request size in browser DevTools → Network tab
3. If payload >5MB, there's still base64 somewhere

---

## 🎯 What Should Happen (Success Flow)

1. **Frontend**: User clicks Submit
2. **Frontend**: Creates FormData with:
   - Form fields (text)
   - File objects (not base64)
   - Expert team JSON (without profilePhotoUrl if no new file)
3. **Backend**: Receives FormData
4. **Backend**: Saves uploaded files to disk
5. **Backend**: Strips any base64 from expertTeam JSON
6. **Backend**: Updates URLs in expertTeam JSON
7. **Backend**: Saves to database as clean JSON
8. **Database**: Stores small JSON (~500 bytes per expert)
9. **Frontend**: Receives success response
10. **Frontend**: Redirects to dashboard

Total time: 2-5 seconds

---

## 📞 If Still Failing

Please provide:

1. **Browser Console Output** (entire console after clicking Submit)
2. **Server Terminal Output** (last 50 lines from when you clicked Submit)
3. **Network Tab Info**:
   - Request URL
   - Request Method (should be PUT)
   - Request size (in KB)
   - Response status
4. **Database Check**:
   ```sql
   SELECT user_id, LENGTH(expert_team::text) as json_size 
   FROM advisor_profiles 
   WHERE user_id = 41;
   ```
   What is `json_size`?

---

## 🚀 Quick Fix Commands

If all else fails, reset advisor profile for this user:

```sql
-- Connect to database
psql -U postgres -d propertydb

-- Delete advisor profile (will need to recreate)
DELETE FROM advisor_profiles WHERE user_id = 41;

-- Exit
\q
```

Then create advisor profile from scratch.

