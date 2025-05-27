const config = require('./config');

module.exports = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy_client_id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret',
    callbackURL: `${config.backend.baseUrl}/api/auth/google/callback`
  },
  apple: {
    clientID: process.env.APPLE_CLIENT_ID || 'dummy_client_id',
    teamID: process.env.APPLE_TEAM_ID || 'dummy_team_id',
    keyID: process.env.APPLE_KEY_ID || 'dummy_key_id',
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || 'dummy_key_path',
    callbackURL: `${config.backend.baseUrl}/api/auth/apple/callback`
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret',
    expiresIn: '24h'
  },
  session: {
    secret: process.env.SESSION_SECRET || 'default_session_secret'
  }
}; 