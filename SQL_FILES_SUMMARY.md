# All SQL Files Summary and Verification

## 📋 Complete List of SQL Files

### ✅ Active SQL Files (Will Be Applied)

#### 1. **Base Schema: `server/db/init.sql`**
**Purpose:** Creates all core database tables and structure

**Creates Tables:**
- ✅ `users` - User accounts (with columns: id, email, password, first_name, last_name, phone, google_id, picture, is_verified, role, reset_token, reset_token_expiry)
- ✅ `admins` - Admin accounts (separate table for security)
- ✅ `properties` - Main property listings table (100+ columns for sale/rent/lease)
- ✅ `property_images` - Property photos
- ✅ `property_amenities` - Property features
- ✅ `property_submissions` - Submission tracking
- ✅ `email_notifications` - Email logs
- ✅ `advisor_profiles` - Advisor/company profiles
- ✅ `advisor_experts` - Team members

**Also:**
- ✅ Creates indexes for performance
- ✅ Sets up foreign keys and relationships
- ✅ Enables pg_trgm extension
- ✅ Inserts test data

**Status:** ✅ Ready to apply

---

#### 2. **Migration Tracker: `server/db/migrations/000_migration_tracker.sql`**
**Purpose:** Tracks which migrations have been applied

**Creates:**
- ✅ `schema_migrations` table

**Status:** ✅ Ready to apply

---

#### 3. **Migration 001: `server/db/migrations/001_add_smart_search.sql`**
**Purpose:** Add smart search indexes

**Actions:**
- ✅ Enables pg_trgm extension
- ✅ Creates indexes on: city, category, zip_code, state, coordinates, price, monthly_rent, bedrooms, bathrooms
- ✅ Creates trigram indexes on: title, description, address_line1
- ✅ Cleans empty address entries

**Status:** ✅ Ready to apply

---

#### 4. **Migration 002: `server/db/migrations/002_add_new_fields.sql`**
**Purpose:** Add EPC rating, key features, layout fields

**Adds Columns to `properties`:**
- ✅ `epc_rating` VARCHAR(10)
- ✅ `key_features` JSONB
- ✅ `layout_file_name` VARCHAR(255)
- ✅ `layout_file_url` TEXT
- ✅ `apartment_size` VARCHAR(50)
- ✅ `floor_number` VARCHAR(50)
- ✅ `custom_features` TEXT

**Also:**
- ✅ Creates indexes
- ✅ Sets default values

**Status:** ✅ Ready to apply

---

#### 5. **Migration 003: `server/db/migrations/003_add_epc_document_fields.sql`**
**Purpose:** Add EPC document storage

**Adds Columns to `properties`:**
- ✅ `epc_document_name` VARCHAR(255)
- ✅ `epc_document_url` TEXT

**Also:**
- ✅ Creates indexes

**Status:** ✅ Ready to apply

---

#### 6. **Migration 004: `server/db/migrations/004_add_commercial_lease_fields.sql`**
**Purpose:** Add 23 commercial lease fields

**Adds Columns to `properties`:**
- ✅ `space_subtypes` VARCHAR(255)
- ✅ `lease_type` VARCHAR(100)
- ✅ `use_class` VARCHAR(100)
- ✅ `min_divisible` INTEGER
- ✅ `vacant_sqft` INTEGER
- ✅ `land_acres` DECIMAL(10,2)
- ✅ `lot_size_unit` VARCHAR(50)
- ✅ `taxes_per_sqft` DECIMAL(10,2)
- ✅ `power` VARCHAR(255)
- ✅ `zoning` VARCHAR(255)
- ✅ `floor_load_capacity` VARCHAR(100)
- ✅ `service_charge` DECIMAL(10,2)
- ✅ `business_rates` DECIMAL(10,2)
- ✅ `heating_cooling` VARCHAR(100)
- ✅ `toilet_kitchen` VARCHAR(100)
- ✅ `utilities` JSONB
- ✅ `security` JSONB
- ✅ `opening_hours` VARCHAR(255)
- ✅ `is_multiple_tenancy` BOOLEAN
- ✅ `signage_allowed` BOOLEAN
- ✅ `disability_access` BOOLEAN
- ✅ `break_clause` BOOLEAN
- ✅ `deposit_required` BOOLEAN

**Also:**
- ✅ Creates indexes
- ✅ Adds documentation comments

**Status:** ✅ Ready to apply

---

#### 7. **Migration 005: `server/db/migrations/005_add_uk_lease_fields.sql`**
**Purpose:** Add UK-specific lease fields

**Adds Columns to `properties`:**
- ✅ `vat_on_rent` VARCHAR(50)
- ✅ `repairing_obligation` VARCHAR(100)
- ✅ `insurance_responsibility` VARCHAR(100)
- ✅ `rent_review_frequency` INTEGER

**Also:**
- ✅ Adds documentation comments

**Status:** ✅ Ready to apply

---

#### 8. **Migration 006: `server/db/migrations/006_add_residential_accommodation.sql`**
**Purpose:** Add residential accommodation flag

**Adds Columns to `properties`:**
- ✅ `has_residential_accommodation` BOOLEAN DEFAULT false

**Also:**
- ✅ Adds documentation comment

**Status:** ✅ Ready to apply

---

#### 9. **Migration 007: `server/db/migrations/007_add_property_consultant.sql`**
**Purpose:** Add property consultant field

**Adds Columns to `properties`:**
- ✅ `property_consultant` VARCHAR(255)

**Also:**
- ✅ Adds documentation comment

**Status:** ✅ Ready to apply

---

#### 10. **Migration 008: `server/db/migrations/008_add_advisor_profile_fields.sql`**
**Purpose:** Add missing advisor profile fields

**Adds Columns to `advisor_profiles`:**
- ✅ `expert_team` JSONB DEFAULT '[]'::jsonb
- ✅ `company_website` VARCHAR(255)
- ✅ `company_email` VARCHAR(255)
- ✅ `contact_phone` VARCHAR(50)

**Also:**
- ✅ Creates indexes
- ✅ Adds documentation comments

**Status:** ✅ Ready to apply

---

#### 11. **Permissions: `server/db/grant-permissions.sql`**
**Purpose:** Grant permissions to user

**Actions:**
- ✅ Grants schema usage
- ✅ Grants table privileges
- ✅ Grants sequence privileges
- ✅ Sets default privileges
- ✅ Makes user database owner

**Status:** ✅ Ready to apply (can be run manually in PostgreSQL)

---

### 📦 Backup/Old Files (Not Used)

**Location:** `server/db/migrations/old/`
- These are backups of old migration files
- Not used in current setup
- Kept for reference only

**Files:**
- `add-commercial-lease-fields.sql` (old version)
- `add-uk-lease-fields.sql` (old version)
- `add-has-residential-accommodation.sql` (old version)
- `add-new-fields.sql` (old version)
- `add-epc-document-fields.sql` (old version)
- `add_property_consultant.sql` (old version)

**Status:** ⚠️ Not used (backups only)

---

### 💾 Database Backup Files

**Location:** Root and `server/backups/`
- `propertydb_backup_20250612_215249.sql` - Old backup
- `server/backups/propertydb_backup_20250618_023548.sql` - Database backup

**Status:** ⚠️ Backup files (not applied)

---

## ✅ SQL Commands Verification

### All SQL Files Are Valid ✅

**Checked:**
- ✅ Syntax is correct
- ✅ All use `IF NOT EXISTS` (safe to run multiple times)
- ✅ Proper dependencies (migrations run in order)
- ✅ All foreign keys properly defined
- ✅ All indexes properly created
- ✅ All comments added for documentation

### Tables Created Summary

**Total Tables:** 10
1. users
2. admins
3. properties
4. property_images
5. property_amenities
6. property_submissions
7. email_notifications
8. advisor_profiles
9. advisor_experts
10. schema_migrations

### Migrations Summary

**Total Migrations:** 8
1. 001 - Smart search indexes
2. 002 - EPC & key features
3. 003 - EPC documents
4. 004 - Commercial lease (23 fields)
5. 005 - UK lease fields
6. 006 - Residential accommodation
7. 007 - Property consultant
8. 008 - Advisor profile fields

### Properties Table Columns

**Total Columns:** 100+ columns including:
- Basic info (title, description, category, type)
- Address (house_number, street_name, city, state, zip_code, coordinates)
- Property details (bedrooms, bathrooms, square_feet, year_built)
- Financial (price, rent, deposit, service_charge, business_rates)
- Features (parking, garage, pool, garden, furnished, pets)
- EPC (rating, document)
- Layout files
- Commercial lease fields (23 fields)
- UK lease fields (4 fields)
- Status and workflow fields

## 🚀 Ready to Apply

**All SQL files are:**
- ✅ Syntactically correct
- ✅ Properly organized
- ✅ Safe to run (use IF NOT EXISTS)
- ✅ Complete (all backend tables covered)
- ✅ Documented

**To apply all SQL files:**
```powershell
node server/db/setup-as-postgres.js
```

This will run all SQL files in the correct order and create everything in your PostgreSQL database!

