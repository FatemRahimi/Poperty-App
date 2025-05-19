const config = {
  frontend: {
    baseUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
    loginPath: '/login',
    defaultRedirectPath: '/find'
  },
  backend: {
    port: process.env.PORT || 5050
  },
  session: {
    secret: process.env.JWT_SECRET,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }
};

module.exports = config; 