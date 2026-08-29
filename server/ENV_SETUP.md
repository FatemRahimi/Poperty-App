# Environment Variables Setup

## ⚠️ Missing `.env` File

Your application needs a `.env` file in the `server/` directory with Google OAuth credentials.

## Quick Setup

### 1. Create `server/.env` file

Create a new file: `server/.env`

### 2. Copy this template and fill in your Google OAuth credentials:

```env
# Google OAuth Configuration
# Get these from: https://console.cloud.google.com/
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5050/api/auth/google/callback

# Application URLs
CLIENT_URL=http://localhost:3000
PORT=5050

# JWT Secret (I generated one for you - use this)
JWT_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c

# Session Secret (can be same as JWT_SECRET)
SESSION_SECRET=7ba9516fe3e5222799df2ba09d2b73608062b68089b37c360fb4683c1c445c1c

# Database Configuration
DATABASE_URL=postgres://fatemehrahimi@localhost:5432/propertydb

# AI Property Services (optional — mock outputs used when unset)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

# Property Intelligence Platform — Phase 2 external data (all server-side)
PROPERTY_INTELLIGENCE_ENABLED=true
PROPERTYDATA_ENABLED=false
PROPERTYDATA_API_KEY=
PROPERTYDATA_BASE_URL=https://api.propertydata.co.uk
PROPERTYDATA_TIMEOUT_MS=15000

# Future providers (stubs until credentials licensed)
SPRIFT_ENABLED=false
SPRIFT_API_KEY=
HOMETRACK_ENABLED=false
HOMETRACK_CLIENT_ID=
HOMETRACK_CLIENT_SECRET=

# Environment
NODE_ENV=development
```

### 3. Get Google OAuth Credentials

1. Go to: https://console.cloud.google.com/
2. Create a project (or select existing)
3. Enable "Google+ API" or "Google Identity"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Configure OAuth consent screen first (if prompted)
6. Create OAuth client:
   - Type: Web application
   - Authorized redirect URIs: `http://localhost:5050/api/auth/google/callback`
   - Authorized JavaScript origins: `http://localhost:3000`
7. Copy the Client ID and Client Secret
8. Paste them into your `.env` file

### 4. Restart Server

After creating `.env` file:
```bash
# Stop server (Ctrl+C)
# Then restart:
npm run dev
```

## See Full Guide

For detailed instructions, see: `GOOGLE_OAUTH_SETUP.md`

