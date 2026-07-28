-- AI Property Services: subscriptions, usage credits, and generation history

CREATE TABLE IF NOT EXISTS ai_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  credits_remaining INTEGER NOT NULL DEFAULT 3,
  credits_monthly INTEGER NOT NULL DEFAULT 3,
  max_users INTEGER NOT NULL DEFAULT 1,
  billing_cycle_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  billing_cycle_end TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB NOT NULL DEFAULT '{}',
  credits_used INTEGER NOT NULL DEFAULT 1,
  model_used VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  error_message TEXT,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_subscriptions_user_id ON ai_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_subscriptions_plan ON ai_subscriptions(plan);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id ON ai_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_type ON ai_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at DESC);

-- Seed free subscription helper note:
-- Subscriptions are created on first AI dashboard / generate access via application code.
