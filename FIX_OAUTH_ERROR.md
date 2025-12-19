# Fix: "Failed to obtain access token" Error

## ✅ Your Environment Variables Are Correct!

Your `.env` file has all the required variables. The issue is in **Google Cloud Console configuration**.

## 🔧 Step-by-Step Fix

### Step 1: Verify Redirect URI in Google Console

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/
   - Select your project

2. **Go to OAuth 2.0 Client:**
   - Navigate to: **APIs & Services** → **Credentials**
   - Find your OAuth 2.0 Client ID (the one starting with `332963737140-...`)
   - Click on it to edit

3. **Check Authorized redirect URIs:**
   - Must **EXACTLY** match: `http://localhost:5050/api/auth/google/callback`
   - ✅ No trailing slash
   - ✅ Use `http` not `https`
   - ✅ No extra spaces
   - ✅ Case-sensitive

4. **Check Authorized JavaScript origins:**
   - Must include: `http://localhost:3000`
   - Must include: `http://localhost:5050`
   - ✅ No trailing slashes
   - ✅ Use `http` not `https`

5. **Click "Save"**

### Step 2: Configure OAuth Consent Screen

1. **Go to OAuth Consent Screen:**
   - Navigate to: **APIs & Services** → **OAuth consent screen**

2. **If not configured:**
   - User Type: **External** (for testing)
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**

3. **Add Scopes:**
   - Click **Add or Remove Scopes**
   - Add these scopes:
     - `email`
     - `profile`
     - `openid`
   - Click **Update** → **Save and Continue**

4. **Add Test Users (IMPORTANT!):**
   - If app is in "Testing" mode, you MUST add test users
   - Click **Add Users**
   - Add your Google account email (the one you'll use to login)
   - Click **Add** → **Save and Continue**

5. **Review and Submit:**
   - Review the summary
   - Click **Back to Dashboard**

### Step 3: Enable Required APIs

1. **Go to APIs & Services → Library:**
   - Search for: **"Google+ API"** or **"People API"**
   - Click on it
   - Click **Enable**

2. **Also enable:**
   - **Google Identity** (if available)
   - **Google OAuth2 API**

### Step 4: Verify Your Configuration

Run this check:
```bash
node server/db/check-oauth.js
```

### Step 5: Restart Your Server

1. **Stop the server** (Ctrl+C in terminal)
2. **Restart:**
   ```bash
   npm run dev
   ```

### Step 6: Test Again

1. Open: http://localhost:3000
2. Click "Sign in with Google"
3. Should redirect to Google login
4. After login, should redirect back to your app

## 🚨 Common Issues

### Issue 1: "redirect_uri_mismatch"

**Cause:** Redirect URI in Google Console doesn't match exactly

**Fix:**
- Go to Google Console → Credentials → Your OAuth Client
- Check "Authorized redirect URIs"
- Must be EXACTLY: `http://localhost:5050/api/auth/google/callback`
- No trailing slash, no spaces, exact match

### Issue 2: "access_denied"

**Cause:** OAuth consent screen not configured or user not added as test user

**Fix:**
- Complete OAuth consent screen setup
- If in "Testing" mode, add your email as test user
- Make sure scopes (email, profile, openid) are added

### Issue 3: "invalid_client"

**Cause:** Client ID or Secret is wrong

**Fix:**
- Verify `GOOGLE_CLIENT_ID` in `.env` matches Google Console
- Verify `GOOGLE_CLIENT_SECRET` in `.env` matches Google Console
- No extra spaces or quotes

### Issue 4: "Failed to obtain access token" (Your Current Error)

**Possible Causes:**
1. **Redirect URI mismatch** - Most common
2. **OAuth consent screen not configured**
3. **Test user not added** (if app is in Testing mode)
4. **API not enabled**
5. **Network/SSL issues**

**Fix:**
- Follow Steps 1-3 above
- Make sure redirect URI is EXACTLY: `http://localhost:5050/api/auth/google/callback`
- Add your email as test user in OAuth consent screen
- Enable Google+ API or People API

## 📋 Quick Checklist

- [ ] Redirect URI in Google Console: `http://localhost:5050/api/auth/google/callback` (exact match)
- [ ] JavaScript origin: `http://localhost:3000` and `http://localhost:5050`
- [ ] OAuth consent screen configured
- [ ] Scopes added: `email`, `profile`, `openid`
- [ ] Your email added as test user (if in Testing mode)
- [ ] Google+ API or People API enabled
- [ ] Server restarted after changes

## 🔍 Debug Steps

If still not working, check server logs:

1. **Look for OAuth errors in terminal**
2. **Check the exact error message**
3. **Verify the callback URL being used:**
   - Should be: `http://localhost:5050/api/auth/google/callback`
   - Check server logs when clicking "Sign in with Google"

## 💡 Still Not Working?

1. **Double-check redirect URI:**
   - Copy from Google Console
   - Paste into `.env` file
   - Make sure they match EXACTLY

2. **Try creating a new OAuth client:**
   - Sometimes recreating helps
   - Make sure to update `.env` with new credentials

3. **Check Google Console for errors:**
   - Look for any warnings or errors
   - Check API quotas

4. **Verify network:**
   - Make sure you can access Google services
   - Check firewall/antivirus isn't blocking

## 📞 Need More Help?

Check these files for more details:
- `GOOGLE_OAUTH_SETUP.md` - Detailed setup guide
- `server/ENV_SETUP.md` - Environment variables guide

