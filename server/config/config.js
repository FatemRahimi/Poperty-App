module.exports = {
  backend: {
    baseUrl: process.env.BACKEND_URL || 'http://localhost:5050'
  },
  frontend: {
    baseUrl: process.env.FRONTEND_URL || 'http://localhost:3001'
  },
  auth: {
    google: {
      callbackPath: '/api/auth/google/callback',
      getCallbackUrl: () => `${config.backend.baseUrl}${config.auth.google.callbackPath}`
    }
  },
  session: {
    secret: process.env.JWT_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }
}; 