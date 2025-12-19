# Google OAuth Setup Guide

## Error You're Seeing
```
TokenError: Bad Request
```

This means Google OAuth credentials are missing or incorrectly configured.

## Required Environment Variables

Your application needs these environment variables in `server/.env`:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5050/api/auth/google/callback
CLIENT_URL=http://localhost:3000
PORT=5050
JWT_SECRET=your_jwt_secret_here
DATABASE_URL=postgres://fatemehrahimi@localhost:5432/propertydb
```

## Step-by-Step Setup

### 1. Create Google OAuth Credentials

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create a New Project (or select existing):**
   - Click "Select a project" → "New Project"
   - Name it (e.g., "Property Management")
   - Click "Create"

3. **Enable Google+ API:**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" or "Google Identity"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure OAuth consent screen first:
     - User Type: External (for testing)
     - App name: Your app name
     - User support email: Your email
     - Developer contact: Your email
     - Click "Save and Continue"
     - Scopes: Add `email`, `profile`, `openid`
     - Test users: Add your email (for testing)
     - Click "Save and Continue"

5. **Create OAuth Client:**
   - Application type: "Web application"
   - Name: "Property Management App"
   - **Authorized JavaScript origins:**
     ```
     http://localhost:3000
     http://localhost:5050
     ```
   - **Authorized redirect URIs:**
     ```
     http://localhost:5050/api/auth/google/callback
     ```
   - Click "Create"
   - **Copy the Client ID and Client Secret**

### 2. Create `.env` File

Create `server/.env` file with your credentials:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here

# OAuth Callback URL
GOOGLE_CALLBACK_URL=http://localhost:5050/api/auth/google/callback

# Application URLs
CLIENT_URL=http://localhost:3000
PORT=5050

# JWT Secret (generate a random string)
JWT_SECRET=your_random_secret_key_here_minimum_32_characters

# Database
DATABASE_URL=postgres://fatemehrahimi@localhost:5432/propertydb

# Session Secret (can be same as JWT_SECRET)
SESSION_SECRET=your_random_secret_key_here_minimum_32_characters
```

### 3. Generate JWT Secret

Generate a secure random string for JWT_SECRET:

**Option 1: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option 2: Using PowerShell**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**Option 3: Online Generator**
- Visit: https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys" (256-bit)

### 4. Restart Your Server

After creating `.env` file:

1. Stop the current server (Ctrl+C)
2. Restart: `npm run dev`
3. Try Google OAuth login again

## Common Issues

### Issue 1: Redirect URI Mismatch

**Error:** `redirect_uri_mismatch`

**Solution:**
- Make sure the redirect URI in Google Console **exactly** matches:
  ```
  http://localhost:5050/api/auth/google/callback
  ```
- No trailing slashes
- Use `http` not `https` for localhost
- Check both "Authorized redirect URIs" in Google Console

### Issue 2: Invalid Client ID

**Error:** `invalid_client`

**Solution:**
- Verify `GOOGLE_CLIENT_ID` in `.env` matches Google Console
- Make sure there are no extra spaces or quotes
- Client ID should end with `.apps.googleusercontent.com`

### Issue 3: OAuth Consent Screen Not Configured

**Error:** `access_denied`

**Solution:**
- Complete OAuth consent screen setup in Google Console
- Add test users if app is in "Testing" mode
- Publish app or add your email as test user

### Issue 4: API Not Enabled

**Error:** `access_denied` or `invalid_request`

**Solution:**
- Enable "Google+ API" or "Google Identity" in Google Cloud Console
- Go to "APIs & Services" → "Library"
- Search and enable the API

## Verify Configuration

Check if environment variables are loaded:

```javascript
// Add this temporarily to server.js to verify
console.log('Google Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
console.log('Google Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
console.log('Callback URL:', process.env.GOOGLE_CALLBACK_URL || 'Using default');
```

## Testing

1. **Start your servers:**
   ```bash
   npm run dev
   ```

2. **Open browser:**
   - Go to: http://localhost:3000
   - Click "Sign in with Google"
   - Should redirect to Google login
   - After login, should redirect back to your app

3. **Check server logs:**
   - Look for any OAuth errors
   - Verify callback is being called

## Production Setup

For production, update:

1. **Google Console:**
   - Add production redirect URI:
     ```
     https://yourdomain.com/api/auth/google/callback
     ```
   - Add production JavaScript origin:
     ```
     https://yourdomain.com
     ```

2. **Environment Variables:**
   ```env
   GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
   CLIENT_URL=https://yourdomain.com
   NODE_ENV=production
   ```

## Security Notes

- ⚠️ **Never commit `.env` file to Git**
- ✅ Add `.env` to `.gitignore`
- ✅ Use different credentials for development and production
- ✅ Rotate secrets regularly
- ✅ Keep OAuth credentials secure

## Quick Checklist

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured
- [ ] OAuth 2.0 client created
- [ ] Redirect URI added: `http://localhost:5050/api/auth/google/callback`
- [ ] JavaScript origin added: `http://localhost:3000`
- [ ] `.env` file created in `server/` directory
- [ ] `GOOGLE_CLIENT_ID` set in `.env`
- [ ] `GOOGLE_CLIENT_SECRET` set in `.env`
- [ ] `GOOGLE_CALLBACK_URL` set in `.env`
- [ ] Server restarted after `.env` changes

