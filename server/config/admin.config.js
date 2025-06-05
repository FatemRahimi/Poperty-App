require('dotenv').config();

const adminConfig = {
  // Admin credentials from environment variables
  email: process.env.ADMIN_EMAIL || 'admin@property.com',
  password: process.env.ADMIN_PASSWORD || 'SecureAdminPass2024!@#',
  firstName: process.env.ADMIN_FIRST_NAME || 'Admin',
  lastName: process.env.ADMIN_LAST_NAME || 'User',
  
  // Security settings
  routeSecret: process.env.ADMIN_ROUTE_SECRET || 'x9k7m2p5q8',
  allowedIPs: process.env.ALLOWED_ADMIN_IPS ? 
    process.env.ALLOWED_ADMIN_IPS.split(',') : 
    ['127.0.0.1'],
  
  // Rate limiting
  maxLoginAttempts: 5,
  lockoutDuration: 30 * 60 * 1000, // 30 minutes
  
  // Security features
  requireIPWhitelist: process.env.NODE_ENV === 'production',
  logFailedAttempts: true,
  sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
};

module.exports = adminConfig; 