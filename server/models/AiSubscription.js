const pool = require('./db');

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    creditsMonthly: 3,
    unlimited: false,
    maxUsers: 1,
    features: [
      '3 AI generations per month',
      'Listing Writer (basic)',
      'Buyer Match Assistant',
      'Save generation history',
    ],
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 49,
    creditsMonthly: -1,
    unlimited: true,
    maxUsers: 1,
    features: [
      'Unlimited property descriptions',
      'AI marketing tools',
      'SEO titles & social adverts',
      'Valuation reports',
      'Email marketing copy',
      'Priority generation speed',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: 149,
    creditsMonthly: -1,
    unlimited: true,
    maxUsers: 10,
    features: [
      'Everything in Professional',
      'Multiple users (up to 10)',
      'Advanced valuation reports',
      'Team usage dashboard',
      'Priority support',
      'Custom branding on reports',
    ],
  },
};

class AiSubscription {
  static getPlans() {
    return PLANS;
  }

  static async ensureForUser(userId) {
    const existing = await this.findByUserId(userId);
    if (existing) return existing;

    const plan = PLANS.free;
    const result = await pool.query(
      `INSERT INTO ai_subscriptions
        (user_id, plan, status, credits_remaining, credits_monthly, max_users, billing_cycle_end)
       VALUES ($1, $2, 'active', $3, $4, $5, NOW() + INTERVAL '30 days')
       ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, plan.id, plan.creditsMonthly, plan.creditsMonthly, plan.maxUsers]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM ai_subscriptions WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  static async canGenerate(userId) {
    const sub = await this.ensureForUser(userId);
    const plan = PLANS[sub.plan] || PLANS.free;

    if (sub.status !== 'active') {
      return { allowed: false, reason: 'Subscription inactive', subscription: sub, plan };
    }

    if (plan.unlimited || sub.credits_remaining < 0) {
      return { allowed: true, subscription: sub, plan };
    }

    if (sub.credits_remaining <= 0) {
      return {
        allowed: false,
        reason: 'No credits remaining. Upgrade your plan to continue.',
        subscription: sub,
        plan,
      };
    }

    return { allowed: true, subscription: sub, plan };
  }

  static async consumeCredit(userId, amount = 1) {
    const check = await this.canGenerate(userId);
    if (!check.allowed) return check;

    const plan = check.plan;
    if (plan.unlimited) {
      return { ...check, consumed: 0 };
    }

    const result = await pool.query(
      `UPDATE ai_subscriptions
       SET credits_remaining = credits_remaining - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
         AND credits_remaining >= $1
       RETURNING *`,
      [amount, userId]
    );

    if (!result.rows[0]) {
      const sub = await this.findByUserId(userId);
      return {
        allowed: false,
        reason: 'No credits remaining. Upgrade your plan to continue.',
        subscription: sub,
        plan,
      };
    }

    return {
      allowed: true,
      consumed: amount,
      subscription: result.rows[0],
      plan,
    };
  }

  static async restoreCredit(userId, amount = 1) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return this.findByUserId(userId);
    const result = await pool.query(
      `UPDATE ai_subscriptions
       SET credits_remaining = credits_remaining + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
         AND credits_remaining >= 0
       RETURNING *`,
      [n, userId]
    );
    return result.rows[0] || null;
  }

  static async upgrade(userId, planId) {
    const plan = PLANS[planId];
    if (!plan) throw new Error('Invalid plan');

    await this.ensureForUser(userId);

    const credits = plan.unlimited ? -1 : plan.creditsMonthly;
    const result = await pool.query(
      `UPDATE ai_subscriptions
       SET plan = $1,
           credits_remaining = $2,
           credits_monthly = $3,
           max_users = $4,
           status = 'active',
           billing_cycle_start = CURRENT_TIMESTAMP,
           billing_cycle_end = NOW() + INTERVAL '30 days',
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $5
       RETURNING *`,
      [plan.id, credits, plan.creditsMonthly, plan.maxUsers, userId]
    );

    return { subscription: result.rows[0], plan };
  }

  static async getUsageSummary(userId) {
    const subscription = await this.ensureForUser(userId);
    const plan = PLANS[subscription.plan] || PLANS.free;

    const usage = await pool.query(
      `SELECT request_type, COUNT(*)::int AS count
       FROM ai_requests
       WHERE user_id = $1 AND status = 'completed'
       GROUP BY request_type`,
      [userId]
    );

    const totals = await pool.query(
      `SELECT
         COUNT(*)::int AS total_requests,
         COALESCE(SUM(credits_used), 0)::int AS total_credits_used
       FROM ai_requests
       WHERE user_id = $1`,
      [userId]
    );

    return {
      subscription,
      plan,
      usageByType: usage.rows,
      totals: totals.rows[0],
    };
  }
}

module.exports = AiSubscription;
