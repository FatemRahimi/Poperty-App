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


ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255), 
ADD COLUMN reset_token_expiry TIMESTAMP;