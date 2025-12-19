# Database Schema Documentation

## Overview

The Property Management System uses PostgreSQL as its database. The schema is organized into:
- **Base Schema** (`init.sql`) - Core tables and structure
- **Migrations** (`migrations/`) - Incremental changes and additions

## Database: `propertydb`

## Tables

### 1. `users`
User accounts table for regular users.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Unique user ID |
| email | VARCHAR(255) UNIQUE | User email address |
| password | VARCHAR(255) | Hashed password (nullable for OAuth) |
| first_name | VARCHAR(100) | User's first name |
| last_name | VARCHAR(100) | User's last name |
| phone | VARCHAR(20) | Phone number |
| google_id | VARCHAR(255) UNIQUE | Google OAuth ID |
| picture | TEXT | Profile picture URL |
| is_verified | BOOLEAN | Email verification status |
| role | VARCHAR(20) | User role (user/admin) |
| reset_token | VARCHAR(255) | Password reset token |
| reset_token_expiry | TIMESTAMP | Token expiration |
| created_at | TIMESTAMP | Account creation date |
| updated_at | TIMESTAMP | Last update date |

**Indexes:**
- Primary key on `id`
- Unique index on `email`
- Unique index on `google_id`

---

### 2. `admins`
Separate admin accounts table for better security.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Admin ID |
| email | VARCHAR(255) UNIQUE | Admin email |
| password | VARCHAR(255) | Hashed password |
| first_name | VARCHAR(100) | Admin first name |
| last_name | VARCHAR(100) | Admin last name |
| role | VARCHAR(20) | Role (admin/super_admin) |
| is_active | BOOLEAN | Account active status |
| last_login | TIMESTAMP | Last login time |
| password_changed_at | TIMESTAMP | Password change date |
| created_at | TIMESTAMP | Account creation |
| updated_at | TIMESTAMP | Last update |

---

### 3. `properties`
Main property listings table (sale, rent, lease).

#### Basic Information
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Property ID |
| user_id | INTEGER | Owner user ID (FK to users) |
| title | VARCHAR(255) | Property title |
| description | TEXT | Full description |
| category | VARCHAR(50) | Property category (rent/sale/lease) |
| property_type | VARCHAR(50) | Type (flat/house/studio/etc.) |
| property_category | VARCHAR(50) | Category (residential/commercial/land) |
| status | VARCHAR(20) | Status (pending/approved/rejected/archived) |
| featured | BOOLEAN | Featured property flag |
| slug | VARCHAR(255) UNIQUE | URL-friendly slug |

#### Address Information
| Column | Type | Description |
|--------|------|-------------|
| house_number | VARCHAR(20) | Property number |
| street_name | VARCHAR(200) | Street name |
| address_line1 | VARCHAR(255) | Full street address |
| address_line2 | VARCHAR(255) | Additional address |
| city | VARCHAR(100) | City |
| state | VARCHAR(100) | State/County |
| zip_code | VARCHAR(20) | Postal code |
| country | VARCHAR(100) | Country (default: USA) |
| latitude | DECIMAL(10,8) | GPS latitude |
| longitude | DECIMAL(11,8) | GPS longitude |

#### Property Details
| Column | Type | Description |
|--------|------|-------------|
| bedrooms | INTEGER | Number of bedrooms |
| bathrooms | DECIMAL(3,1) | Number of bathrooms |
| square_feet | INTEGER | Property size in sqft |
| lot_size | DECIMAL(10,2) | Lot size |
| year_built | INTEGER | Year built |
| apartment_size | VARCHAR(50) | Apartment size |
| floor_number | VARCHAR(50) | Floor number |

#### Financial Information
| Column | Type | Description |
|--------|------|-------------|
| price | DECIMAL(12,2) | Sale price |
| weekly_rent | DECIMAL(10,2) | Weekly rent |
| monthly_rent | DECIMAL(10,2) | Monthly rent |
| lease_term | INTEGER | Lease term (months) |
| deposit_amount | DECIMAL(10,2) | Deposit amount |
| service_charge | DECIMAL(10,2) | Service charge (commercial) |
| business_rates | DECIMAL(10,2) | Business rates (commercial) |
| taxes_per_sqft | DECIMAL(10,2) | Taxes per sqft (commercial) |

#### Property Features
| Column | Type | Description |
|--------|------|-------------|
| parking_spaces | INTEGER | Number of parking spaces |
| has_garage | BOOLEAN | Has garage |
| has_pool | BOOLEAN | Has pool |
| has_garden | BOOLEAN | Has garden |
| furnished | BOOLEAN | Furnished |
| pets_allowed | BOOLEAN | Pets allowed |
| student_housing | BOOLEAN | Student housing |
| key_features | JSONB | Array of key features |
| custom_features | TEXT | Custom features (JSON array) |

#### EPC & Documents
| Column | Type | Description |
|--------|------|-------------|
| epc_rating | VARCHAR(10) | EPC rating (A-G) |
| epc_document_name | VARCHAR(255) | EPC document filename |
| epc_document_url | TEXT | EPC document URL |
| layout_file_name | VARCHAR(255) | Layout/floor plan filename |
| layout_file_url | TEXT | Layout/floor plan URL |

#### Commercial Lease Fields (Migration 004)
| Column | Type | Description |
|--------|------|-------------|
| space_subtypes | VARCHAR(255) | Space subtypes (Warehouse, Showroom) |
| lease_type | VARCHAR(100) | Lease type (FRI, IRL, Inclusive) |
| use_class | VARCHAR(100) | UK use class (E, B2, B8, Sui Generis) |
| min_divisible | INTEGER | Minimum divisible area (sqft) |
| vacant_sqft | INTEGER | Vacant square footage |
| land_acres | DECIMAL(10,2) | Land size in acres |
| lot_size_unit | VARCHAR(50) | Lot size unit (acres/sqft/sqm) |
| power | VARCHAR(255) | Power specifications |
| zoning | VARCHAR(255) | Zoning classification |
| floor_load_capacity | VARCHAR(100) | Floor loading capacity |
| heating_cooling | VARCHAR(100) | HVAC system type |
| toilet_kitchen | VARCHAR(100) | Facilities type |
| utilities | JSONB | Utilities object {water, gas, internet, electricity} |
| security | JSONB | Security features {cctv, keyFob, secureAccess} |
| opening_hours | VARCHAR(255) | Permitted operating hours |
| is_multiple_tenancy | BOOLEAN | Multiple tenancy allowed |
| signage_allowed | BOOLEAN | External signage permitted |
| disability_access | BOOLEAN | Disability access available |
| break_clause | BOOLEAN | Break clause in lease |
| deposit_required | BOOLEAN | Deposit required |

#### UK Lease Fields (Migration 005)
| Column | Type | Description |
|--------|------|-------------|
| vat_on_rent | VARCHAR(50) | VAT status (included/excluded/not-applicable) |
| repairing_obligation | VARCHAR(100) | Repair responsibility |
| insurance_responsibility | VARCHAR(100) | Insurance responsibility |
| rent_review_frequency | INTEGER | Rent review frequency (years) |

#### Additional Fields
| Column | Type | Description |
|--------|------|-------------|
| has_residential_accommodation | BOOLEAN | Commercial property with residential accommodation |
| property_consultant | VARCHAR(255) | Consultant name (when advisor skipped) |
| contact_name | VARCHAR(255) | Contact person name |
| contact_phone | VARCHAR(20) | Contact phone |
| contact_email | VARCHAR(255) | Contact email |
| availability_date | DATE | Availability date |
| meta_keywords | TEXT | SEO keywords |
| created_at | TIMESTAMP | Creation date |
| updated_at | TIMESTAMP | Last update |
| approved_at | TIMESTAMP | Approval date |
| approved_by | INTEGER | Approver user ID (FK to users) |

**Indexes:**
- Primary key on `id`
- Foreign key on `user_id` → `users(id)`
- Indexes on: `status`, `category`, `property_type`, `city`, `zip_code`, `state`, `price`, `monthly_rent`, `bedrooms`, `bathrooms`
- Full-text search indexes on: `title`, `description`, `address_line1`
- Coordinate index on `(latitude, longitude)`
- JSONB indexes on: `key_features`, `utilities`, `security`

---

### 4. `property_images`
Property photos and images.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Image ID |
| property_id | INTEGER | Property ID (FK to properties) |
| image_url | VARCHAR(500) | Image URL |
| image_type | VARCHAR(50) | Type (main/interior/exterior/floorplan) |
| image_order | INTEGER | Display order |
| alt_text | VARCHAR(255) | Alt text for accessibility |
| created_at | TIMESTAMP | Upload date |

**Indexes:**
- Foreign key on `property_id` → `properties(id)`
- Index on `property_id` for faster lookups

---

### 5. `property_amenities`
Property amenities and features.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Amenity ID |
| property_id | INTEGER | Property ID (FK to properties) |
| amenity_name | VARCHAR(100) | Amenity name |
| amenity_category | VARCHAR(50) | Category (interior/exterior/community/nearby) |
| created_at | TIMESTAMP | Creation date |

**Indexes:**
- Foreign key on `property_id` → `properties(id)`

---

### 6. `property_submissions`
Tracks property submission workflow.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Submission ID |
| property_id | INTEGER | Property ID (FK to properties) |
| user_id | INTEGER | User ID (FK to users) |
| submission_type | VARCHAR(50) | Type (new/edit/resubmission) |
| admin_notes | TEXT | Admin notes |
| rejection_reason | TEXT | Rejection reason |
| reviewed_by | INTEGER | Reviewer user ID (FK to users) |
| reviewed_at | TIMESTAMP | Review date |
| created_at | TIMESTAMP | Submission date |

---

### 7. `email_notifications`
Email notification log.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Notification ID |
| user_id | INTEGER | User ID (FK to users) |
| property_id | INTEGER | Property ID (FK to properties) |
| notification_type | VARCHAR(50) | Type (submission_confirm/admin_alert/approval/rejection) |
| email_subject | VARCHAR(255) | Email subject |
| email_body | TEXT | Email body |
| sent_to | VARCHAR(255) | Recipient email |
| sent_at | TIMESTAMP | Sent date |
| status | VARCHAR(20) | Status (sent/failed/pending) |

---

### 8. `advisor_profiles`
Professional advisor/company profiles.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Profile ID |
| user_id | INTEGER | User ID (FK to users) |
| company_name | VARCHAR(255) | Company name |
| director_name | VARCHAR(255) | Director name |
| company_logo_url | TEXT | Logo URL |
| company_tagline | VARCHAR(500) | Company tagline |
| company_description | TEXT | Company description |
| full_name | VARCHAR(255) | Full name |
| job_title | VARCHAR(255) | Job title |
| profile_photo_url | TEXT | Profile photo URL |
| professional_bio | TEXT | Professional bio |
| contact_email | VARCHAR(255) | Contact email |
| office_hours | VARCHAR(255) | Office hours |
| office_address | TEXT | Office address |
| office_city | VARCHAR(100) | Office city |
| office_postcode | VARCHAR(20) | Office postcode |
| is_advisor | BOOLEAN | Is advisor flag |
| advisor_type | VARCHAR(20) | Type (person/company) |
| created_at | TIMESTAMP | Creation date |
| updated_at | TIMESTAMP | Last update |

**Indexes:**
- Foreign key on `user_id` → `users(id)`
- Indexes on: `is_advisor`, `advisor_type`

---

### 9. `advisor_experts`
Team members for company advisors.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Expert ID |
| advisor_profile_id | INTEGER | Advisor profile ID (FK to advisor_profiles) |
| full_name | VARCHAR(255) | Expert full name |
| job_title | VARCHAR(255) | Job title |
| profile_photo_url | TEXT | Photo URL |
| phone | VARCHAR(20) | Phone number |
| email | VARCHAR(255) | Email address |
| created_at | TIMESTAMP | Creation date |
| updated_at | TIMESTAMP | Last update |

**Indexes:**
- Foreign key on `advisor_profile_id` → `advisor_profiles(id)`

---

### 10. `schema_migrations`
Migration tracking table (auto-managed).

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | Migration record ID |
| migration_name | VARCHAR(255) UNIQUE | Migration filename (without .sql) |
| applied_at | TIMESTAMP | When migration was applied |
| applied_by | VARCHAR(100) | User who applied migration |

**Indexes:**
- Unique index on `migration_name`

---

## Relationships

```
users (1) ──→ (many) properties
users (1) ──→ (1) advisor_profiles
properties (1) ──→ (many) property_images
properties (1) ──→ (many) property_amenities
properties (1) ──→ (many) property_submissions
advisor_profiles (1) ──→ (many) advisor_experts
```

## Extensions

- **pg_trgm** - Trigram extension for fuzzy text search (enabled in Migration 001)

## Indexes Summary

### Performance Indexes
- City, state, zip_code, category lookups
- Price and rent range queries
- Bedroom/bathroom filters
- Coordinate-based location searches
- Full-text search on title, description, address

### JSONB Indexes
- GIN indexes on `key_features`, `utilities`, `security` for efficient JSON queries

## Migration History

See `server/db/migrations/` directory for complete migration history.

## Notes

- All migrations use `IF NOT EXISTS` to be idempotent
- Foreign keys use `ON DELETE CASCADE` for data integrity
- Timestamps use `CURRENT_TIMESTAMP` defaults
- JSONB fields allow flexible schema for complex data

