const config = {
  frontend: {
    baseUrl: process.env.CLIENT_URL || `http://localhost:${process.env.CLIENT_PORT || 3000}`,
    url: process.env.CLIENT_URL || `http://localhost:${process.env.CLIENT_PORT || 3000}`,
    loginPath: '/login',
    defaultRedirectPath: '/find'
  },
  backend: {
    port: process.env.PORT || 5050
  },
  auth: {
    google: {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${process.env.PORT || 5050}/api/auth/google/callback`
    },
    jwt: {
      secret: process.env.JWT_SECRET
    }
  },
  session: {
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }
};

module.exports = config; 