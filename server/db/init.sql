CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),  -- Made optional for Google OAuth users
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  google_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Separate Admin Table for better security
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin', -- 'super_admin' or 'admin'
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255), 
ADD COLUMN reset_token_expiry TIMESTAMP;

-- Add picture column
ALTER TABLE users ADD COLUMN picture text;

-- Add is_verified column
ALTER TABLE users ADD COLUMN is_verified boolean DEFAULT false;

-- Add role column for admin functionality (keeping for backward compatibility)
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';

INSERT INTO users (email, first_name, last_name) VALUES ('test@example.com', 'Test', 'User');

-- Create initial super admin using ENV variables
-- This will be handled by the setup script