const adminConfig = require('../config/admin.config');

// Rate limiting storage (in production, use Redis)
const loginAttempts = new Map();

const adminSecurityMiddleware = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // IP Whitelist Check (only in production)
  if (adminConfig.requireIPWhitelist) {
    const isAllowedIP = adminConfig.allowedIPs.some(allowedIP => {
      return clientIP.includes(allowedIP) || allowedIP === '0.0.0.0';
    });
    
    if (!isAllowedIP) {
      console.warn(`🚫 Unauthorized admin access attempt from IP: ${clientIP}`);
      return res.status(403).json({ 
        error: 'Access denied. Your IP is not authorized.',
        code: 'IP_NOT_ALLOWED'
      });
    }
  }
  
  // Rate Limiting
  const attemptKey = `${clientIP}-admin-login`;
  const attempts = loginAttempts.get(attemptKey) || { count: 0, firstAttempt: Date.now() };
  
  // Reset attempts after lockout duration
  if (Date.now() - attempts.firstAttempt > adminConfig.lockoutDuration) {
    loginAttempts.delete(attemptKey);
    attempts.count = 0;
    attempts.firstAttempt = Date.now();
  }
  
  // Check if IP is locked out
  if (attempts.count >= adminConfig.maxLoginAttempts) {
    const remainingTime = Math.ceil((adminConfig.lockoutDuration - (Date.now() - attempts.firstAttempt)) / 60000);
    console.warn(`🚫 IP ${clientIP} is locked out. Attempts: ${attempts.count}`);
    return res.status(429).json({ 
      error: `Too many login attempts. Try again in ${remainingTime} minutes.`,
      code: 'RATE_LIMITED',
      retryAfter: remainingTime
    });
  }
  
  // Store middleware info for later use
  req.adminSecurity = {
    clientIP,
    attemptKey,
    attempts
  };
  
  next();
};

const recordFailedAttempt = (req) => {
  if (req.adminSecurity && adminConfig.logFailedAttempts) {
    const { attemptKey, attempts, clientIP } = req.adminSecurity;
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(attemptKey, attempts);
    
    console.warn(`⚠️ Failed admin login attempt ${attempts.count}/${adminConfig.maxLoginAttempts} from IP: ${clientIP}`);
  }
};

const clearFailedAttempts = (req) => {
  if (req.adminSecurity) {
    const { attemptKey } = req.adminSecurity;
    loginAttempts.delete(attemptKey);
  }
};

module.exports = {
  adminSecurityMiddleware,
  recordFailedAttempt,
  clearFailedAttempts
}; 