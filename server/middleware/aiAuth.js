const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');
const AiSubscription = require('../models/AiSubscription');

/**
 * Authenticate JWT for AI routes.
 * Attaches req.user = { id, email, role, ... }
 */
const authenticateAI = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in to use AI Property Services.',
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role || 'user',
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid authentication token' });
  }
};

/**
 * Ensure user has remaining AI credits (or unlimited plan).
 */
const requireCredits = async (req, res, next) => {
  try {
    const check = await AiSubscription.canGenerate(req.user.id);
    req.aiSubscription = check.subscription;
    req.aiPlan = check.plan;

    if (!check.allowed) {
      return res.status(402).json({
        success: false,
        message: check.reason,
        code: 'INSUFFICIENT_CREDITS',
        subscription: check.subscription,
        plan: check.plan,
        upgradeUrl: '/ai-services/pricing',
      });
    }

    next();
  } catch (error) {
    console.error('Credit check error:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify AI credits' });
  }
};

module.exports = { authenticateAI, requireCredits };
