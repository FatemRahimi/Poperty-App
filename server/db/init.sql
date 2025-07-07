CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),  -- Made optional for Google OAuth users
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),  -- Added phone column
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

-- Add role column for admin functionality
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';

INSERT INTO users (email, first_name, last_name) VALUES ('test@example.com', 'Test', 'User');

-- Create admin user (password: admin123)
INSERT INTO users (email, password, first_name, last_name, role, is_verified) 
VALUES ('admin@property.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'User', 'admin', true) 
ON CONFLICT (email) DO NOTHING;

-- Properties table for all property types (sale, rent, lease)
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- 'rent', 'sale', 'lease' - Property category
  property_type VARCHAR(50), -- 'flat', 'house', 'studio', 'bungalow', 'maisonette', 'duplex', 'detached', 'semi-detached', 'terraced', etc.
  property_category VARCHAR(50), -- 'residential', 'commercial', 'land'
  
  -- Address information
  house_number VARCHAR(20), -- Property number (e.g., "123", "45A", "Flat 2")
  street_name VARCHAR(200), -- Street name (e.g., "Main Street", "Oak Avenue")
  address_line1 VARCHAR(255), -- Full street address (auto-populated from house_number + street_name)
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  
  -- Property details
  bedrooms INTEGER,
  bathrooms DECIMAL(3,1),
  square_feet INTEGER,
  lot_size DECIMAL(10,2),
  year_built INTEGER,
  
  -- Financial information
  price DECIMAL(12,2),
  weekly_rent DECIMAL(10,2), -- for rent properties
  monthly_rent DECIMAL(10,2), -- for rent properties
  lease_term INTEGER, -- for lease properties (months)
  deposit_amount DECIMAL(10,2),
  
  -- Property features
  parking_spaces INTEGER DEFAULT 0,
  has_garage BOOLEAN DEFAULT false,
  has_pool BOOLEAN DEFAULT false,
  has_garden BOOLEAN DEFAULT false,
  furnished BOOLEAN DEFAULT false,
  pets_allowed BOOLEAN DEFAULT false,
  
  -- Status and workflow
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'archived'
  featured BOOLEAN DEFAULT false,
  availability_date DATE,
  
  -- Contact information
  contact_name VARCHAR(255),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  
  -- SEO and metadata
  slug VARCHAR(255) UNIQUE,
  meta_keywords TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id)
);

-- Property images table
CREATE TABLE IF NOT EXISTS property_images (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  image_url VARCHAR(500) NOT NULL,
  image_type VARCHAR(50), -- 'main', 'interior', 'exterior', 'floorplan'
  image_order INTEGER DEFAULT 0,
  alt_text VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Property amenities table
CREATE TABLE IF NOT EXISTS property_amenities (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  amenity_name VARCHAR(100) NOT NULL,
  amenity_category VARCHAR(50), -- 'interior', 'exterior', 'community', 'nearby'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Property submissions tracking
CREATE TABLE IF NOT EXISTS property_submissions (
  id SERIAL PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  submission_type VARCHAR(50), -- 'new', 'edit', 'resubmission'
  admin_notes TEXT,
  rejection_reason TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email notifications log
CREATE TABLE IF NOT EXISTS email_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  property_id INTEGER REFERENCES properties(id),
  notification_type VARCHAR(50), -- 'submission_confirm', 'admin_alert', 'approval', 'rejection'
  email_subject VARCHAR(255),
  email_body TEXT,
  sent_to VARCHAR(255),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'sent' -- 'sent', 'failed', 'pending'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_building_type ON properties(property_type);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at);
CREATE INDEX IF NOT EXISTS idx_property_images_property_id ON property_images(property_id);
CREATE INDEX IF NOT EXISTS idx_property_amenities_property_id ON property_amenities(property_id);

-- Smart search indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_street_name ON properties(street_name);
CREATE INDEX IF NOT EXISTS idx_properties_category ON properties(category);
CREATE INDEX IF NOT EXISTS idx_properties_zip_code ON properties(zip_code);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);
CREATE INDEX IF NOT EXISTS idx_properties_coordinates ON properties(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_monthly_rent ON properties(monthly_rent);
CREATE INDEX IF NOT EXISTS idx_properties_bedrooms ON properties(bedrooms);
CREATE INDEX IF NOT EXISTS idx_properties_bathrooms ON properties(bathrooms);

-- Full-text search indexes for title and description
CREATE INDEX IF NOT EXISTS idx_properties_title_trgm ON properties USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_properties_description_trgm ON properties USING gin(description gin_trgm_ops);

-- Enable PostgreSQL trigram extension for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create initial super admin using ENV variables
-- This will be handled by the setup script

SELECT id, title, description, short_description 
FROM properties 
ORDER BY created_at DESC 
LIMIT 5;