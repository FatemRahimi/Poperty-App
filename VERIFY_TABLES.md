# Backend Tables Verification

## ✅ All Required Tables Covered

### Core Tables (from init.sql):

1. **users** ✅
   - Used by: User.js, authController.js, propertyController.js
   - Columns: id, email, password, first_name, last_name, phone, google_id, picture, is_verified, role, reset_token, reset_token_expiry

2. **admins** ✅
   - Separate admin table for security
   - Columns: id, email, password, first_name, last_name, role, is_active, last_login, etc.

3. **properties** ✅
   - Main table used extensively
   - Used by: propertyController.js (all CRUD operations)
   - Has 100+ columns including all property types (sale/rent/lease)

4. **property_images** ✅
   - Used by: propertyController.js (INSERT, SELECT, DELETE)
   - Columns: id, property_id, image_url, image_type, image_order, alt_text

5. **property_amenities** ✅
   - Used by: propertyController.js (INSERT, DELETE)
   - Columns: id, property_id, amenity_name, amenity_category

6. **property_submissions** ✅
   - Used by: propertyController.js (INSERT for tracking)
   - Columns: id, property_id, user_id, submission_type, admin_notes, rejection_reason, reviewed_by, reviewed_at

7. **email_notifications** ✅
   - Used by: propertyController.js (INSERT for email logs)
   - Columns: id, user_id, property_id, notification_type, email_subject, email_body, sent_to, sent_at, status

8. **advisor_profiles** ✅
   - Used for professional dashboard
   - Columns: id, user_id, company_name, director_name, company_logo_url, etc.

9. **advisor_experts** ✅
   - Used for company team members
   - Columns: id, advisor_profile_id, full_name, job_title, profile_photo_url, phone, email

10. **schema_migrations** ✅
    - Used by: run-migrations.js, run-all-sql.js
    - Tracks which migrations have been applied

## ✅ All Migrations Covered:

1. **001_add_smart_search.sql** ✅
   - Adds pg_trgm extension
   - Adds search indexes

2. **002_add_new_fields.sql** ✅
   - EPC rating, key_features, layout files, custom_features

3. **003_add_epc_document_fields.sql** ✅
   - EPC document storage

4. **004_add_commercial_lease_fields.sql** ✅
   - 23 commercial lease fields

5. **005_add_uk_lease_fields.sql** ✅
   - UK-specific lease fields

6. **006_add_residential_accommodation.sql** ✅
   - has_residential_accommodation field

7. **007_add_property_consultant.sql** ✅
   - property_consultant field

## ✅ Verification Complete

**All tables used by backend code are covered:**
- ✅ All INSERT statements reference existing tables
- ✅ All SELECT statements reference existing tables
- ✅ All UPDATE statements reference existing tables
- ✅ All DELETE statements reference existing tables
- ✅ All JOIN operations reference existing tables
- ✅ All foreign keys are properly defined

## 📋 Summary

**Total Tables:** 10
- 7 core tables (users, admins, properties, property_images, property_amenities, property_submissions, email_notifications)
- 2 advisor tables (advisor_profiles, advisor_experts)
- 1 system table (schema_migrations)

**All tables are properly defined in init.sql and all migrations are organized!**

