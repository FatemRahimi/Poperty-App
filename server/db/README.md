# Database Schema and Migrations

This directory contains the database schema and migration files for the Property Management System.

## 📁 Directory Structure

```
server/db/
├── init.sql                    # Base database schema (run this first)
├── run-migrations.js          # Migration runner script
├── README.md                  # This file
└── migrations/               # Migration files (run in order)
    ├── 000_migration_tracker.sql
    ├── 001_add_smart_search.sql
    ├── 002_add_new_fields.sql
    ├── 003_add_epc_document_fields.sql
    ├── 004_add_commercial_lease_fields.sql
    ├── 005_add_uk_lease_fields.sql
    ├── 006_add_residential_accommodation.sql
    └── 007_add_property_consultant.sql
```

## 🚀 Quick Start

### 1. Initialize Database (First Time Setup)

Run the base schema:

```bash
psql -U your_user -d propertydb -f server/db/init.sql
```

Or using Node.js:

```bash
node -e "const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL||'postgres://fatemehrahimi@localhost:5432/propertydb'});const fs=require('fs');pool.query(fs.readFileSync('server/db/init.sql','utf8')).then(()=>{console.log('✅ Database initialized');process.exit(0);}).catch(e=>{console.error(e);process.exit(1);});"
```

### 2. Run Migrations

Run all pending migrations:

```bash
node server/db/run-migrations.js
```

Or with custom database URL:

```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname node server/db/run-migrations.js
```

## 📋 Migration Files

### Base Schema (`init.sql`)
- Creates all core tables: `users`, `admins`, `properties`, `property_images`, `property_amenities`, etc.
- Sets up indexes and relationships
- Creates advisor profiles tables

### Migration 001: Smart Search
- Enables PostgreSQL trigram extension
- Adds search indexes for city, category, zip_code, coordinates
- Adds full-text search indexes for title, description, address

### Migration 002: New Fields
- Adds EPC rating field
- Adds key features (JSONB)
- Adds layout file fields (name, URL, apartment size, floor number)
- Adds custom features field

### Migration 003: EPC Document Fields
- Adds EPC document storage fields (name, URL)

### Migration 004: Commercial Lease Fields
- Adds 23 commercial lease-specific fields:
  - Space information (subtypes, lease type, use class)
  - Building details (min divisible, vacant sqft, land acres)
  - Specifications (taxes, power, zoning, floor load)
  - Financial terms (service charge, business rates)
  - Facilities (heating/cooling, toilet/kitchen, utilities, security)
  - Operational (opening hours, multiple tenancy, signage, disability access)
  - Lease terms (break clause, deposit required)

### Migration 005: UK Lease Fields
- Adds UK-specific lease fields:
  - VAT on rent
  - Repairing obligation
  - Insurance responsibility
  - Rent review frequency

### Migration 006: Residential Accommodation
- Adds `has_residential_accommodation` boolean field

### Migration 007: Property Consultant
- Adds `property_consultant` field for when users skip advisor profile setup

## 🔄 Migration Tracking

The migration runner automatically tracks which migrations have been applied using the `schema_migrations` table. This ensures:
- ✅ Migrations are only run once
- ✅ Migrations run in the correct order
- ✅ You can see migration history

## 📊 Database Tables

### Core Tables
- **users** - User accounts (email, password, OAuth, etc.)
- **admins** - Admin accounts (separate from users for security)
- **properties** - Main property listings (sale, rent, lease)
- **property_images** - Property photos and images
- **property_amenities** - Property amenities/features
- **property_submissions** - Submission tracking and workflow
- **email_notifications** - Email notification log

### Advisor Tables
- **advisor_profiles** - Professional advisor/company profiles
- **advisor_experts** - Team members for company advisors

### System Tables
- **schema_migrations** - Migration tracking (auto-managed)

## 🛠️ Manual Migration

If you need to run a specific migration manually:

```bash
psql -U your_user -d propertydb -f server/db/migrations/XXX_migration_name.sql
```

**⚠️ Warning:** Manual migrations won't be tracked. Use the migration runner when possible.

## 🔍 Check Migration Status

```sql
SELECT * FROM schema_migrations ORDER BY applied_at;
```

## 📝 Creating New Migrations

1. Create a new file in `migrations/` directory:
   ```
   XXX_description.sql
   ```
   Where `XXX` is the next sequential number (e.g., `008_add_new_feature.sql`)

2. Write your migration SQL:
   ```sql
   -- Migration: 008_add_new_feature.sql
   -- Description: Add new feature
   -- Dependencies: 007
   
   ALTER TABLE properties 
   ADD COLUMN IF NOT EXISTS new_field VARCHAR(255);
   ```

3. Run migrations:
   ```bash
   node server/db/run-migrations.js
   ```

## 🔧 Troubleshooting

### Migration Fails
- Check PostgreSQL logs for detailed error messages
- Ensure all dependencies are met (previous migrations)
- Verify database connection string is correct

### Migration Already Applied
- The migration runner will skip already-applied migrations
- If you need to re-run, manually remove from `schema_migrations` table:
  ```sql
  DELETE FROM schema_migrations WHERE migration_name = 'XXX_migration_name';
  ```

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check connection string format: `postgres://user:pass@host:port/dbname`
- Ensure user has proper permissions

## 📚 Database Schema Documentation

### Properties Table Columns

#### Basic Information
- `id`, `user_id`, `title`, `description`
- `category` (rent/sale/lease)
- `property_type` (flat/house/studio/etc.)
- `property_category` (residential/commercial/land)

#### Address
- `house_number`, `street_name`, `address_line1`, `address_line2`
- `city`, `state`, `zip_code`, `country`
- `latitude`, `longitude`

#### Property Details
- `bedrooms`, `bathrooms`, `square_feet`, `lot_size`, `year_built`

#### Financial
- `price`, `weekly_rent`, `monthly_rent`, `lease_term`
- `deposit_amount`, `service_charge`, `business_rates`

#### Features
- `parking_spaces`, `has_garage`, `has_pool`, `has_garden`
- `furnished`, `pets_allowed`
- `key_features` (JSONB), `custom_features` (TEXT)

#### EPC & Documents
- `epc_rating`, `epc_document_name`, `epc_document_url`
- `layout_file_name`, `layout_file_url`

#### Commercial Lease Fields (23 fields)
- See Migration 004 for complete list

#### UK Lease Fields
- `vat_on_rent`, `repairing_obligation`
- `insurance_responsibility`, `rent_review_frequency`

#### Status & Workflow
- `status` (pending/approved/rejected/archived)
- `featured`, `availability_date`
- `created_at`, `updated_at`, `approved_at`, `approved_by`

## 🔐 Database Connection

Default connection string:
```
postgres://fatemehrahimi@localhost:5432/propertydb
```

Set custom connection via environment variable:
```bash
export DATABASE_URL=postgres://user:password@host:port/database
```

## 📞 Support

For database issues:
1. Check migration logs
2. Verify PostgreSQL version (requires PostgreSQL 12+)
3. Ensure all extensions are available (pg_trgm)

