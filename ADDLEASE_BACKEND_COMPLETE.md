# AddLease Backend Implementation - Complete

## ✅ Database Schema Updated

### Migration File Created
- **File**: `/server/db/migrations/add-commercial-lease-fields.sql`
- **Status**: ✅ Successfully executed
- **Fields Added**: 23 new columns to `properties` table

### Commercial Lease Fields Added to Database

#### Basic Space Information (3 fields)
1. ✅ `space_subtypes` VARCHAR(255) - Commercial space subtypes
2. ✅ `lease_type` VARCHAR(100) - FRI, IRL, or Inclusive
3. ✅ `use_class` VARCHAR(100) - UK use class (E, B2, B8, Sui Generis)

#### Building Details & Measurements (6 fields)
4. ✅ `min_divisible` INTEGER - Minimum divisible area in sqft
5. ✅ `vacant_sqft` INTEGER - Vacant square footage
6. ✅ `land_acres` DECIMAL(10,2) - Land size in acres
7. ✅ `lot_size_unit` VARCHAR(50) - Unit for lot size (acres/sqft/sqm)

#### Building Specifications (4 fields)
8. ✅ `taxes_per_sqft` DECIMAL(10,2) - Tax amount per square foot
9. ✅ `power` VARCHAR(255) - Power specifications
10. ✅ `zoning` VARCHAR(255) - Zoning classification
11. ✅ `floor_load_capacity` VARCHAR(100) - Floor loading capacity

#### Financial Terms (2 fields)
12. ✅ `service_charge` DECIMAL(10,2) - Monthly service charge
13. ✅ `business_rates` DECIMAL(10,2) - Annual business rates

#### Facilities & Amenities (4 fields)
14. ✅ `heating_cooling` VARCHAR(100) - HVAC system type
15. ✅ `toilet_kitchen` VARCHAR(100) - Facilities type
16. ✅ `utilities` JSONB - {water, gas, internet, electricity}
17. ✅ `security` JSONB - {cctv, keyFob, secureAccess}

#### Operational & Regulatory (4 fields)
18. ✅ `opening_hours` VARCHAR(255) - Permitted operating hours
19. ✅ `is_multiple_tenancy` BOOLEAN - Multiple tenancy allowed
20. ✅ `signage_allowed` BOOLEAN - External signage permitted
21. ✅ `disability_access` BOOLEAN - Disability access available

#### Lease Terms (2 fields)
22. ✅ `break_clause` BOOLEAN - Break clause in lease
23. ✅ `deposit_required` BOOLEAN - Deposit requirement

### UK-Specific Lease Fields (Already Existed)
- ✅ `vat_on_rent` VARCHAR(50)
- ✅ `repairing_obligation` VARCHAR(100)
- ✅ `insurance_responsibility` VARCHAR(100)
- ✅ `rent_review_frequency` INTEGER

### Indexes Created
- ✅ Performance indexes on all searchable fields
- ✅ JSONB GIN indexes for utilities and security

---

## ✅ Backend Controller Updated

### File Modified
- **File**: `/server/controllers/propertyController.js`

### Changes Made

#### 1. submitProperty Function (Create New Lease)
✅ Added destructuring for all 23+ commercial lease fields
✅ Added field mappings (camelCase + snake_case support)
✅ Updated INSERT query to include all commercial lease fields
✅ Extended VALUES array with all mapped values
✅ Added floorPlan file upload support (alias for layoutFile)
✅ EPC document upload already supported

#### 2. updateProperty Function (Edit Existing Lease)
✅ Added destructuring for all commercial lease fields
✅ Added field mappings with fallback to existing values
✅ Updated UPDATE query to include all commercial lease fields
✅ Extended params array with all mapped values
✅ Added floorPlan file upload support
✅ Preserves existing values when fields not updated

---

## ✅ Frontend Form Complete

### File: `/client/src/pages/AddLease.js`

#### Form Data State (All 40+ Fields)
✅ All form fields defined in state
✅ Session storage integration for draft saving
✅ Edit mode support with pre-populated data

#### File Upload Handlers
✅ `handlePhotoChange` - Photos & videos (up to 15 files, 1GB each)
✅ `handleFloorPlanChange` - Floor plan upload (512MB max)
✅ `handleEpcDocumentChange` - EPC document upload (512MB max)

#### Form Submission
✅ All fields mapped in `fieldMapping` object
✅ FormData includes all commercial lease fields
✅ File uploads appended: photos, floorPlan, epcDocument
✅ Proper backend endpoint routing (create/update)

---

## 📋 Complete Field List (AddLease Form)

### Step 1: Property Information

#### Basic Space Info
- ✅ Space Type* (dropdown)
- ✅ Space Subtypes (text) → `space_subtypes`
- ✅ Space Name* (text) → `title`
- ✅ Multiple Tenancy (checkbox) → `is_multiple_tenancy`

#### Address Fields (Optional)
- ✅ House Number/Unit → `house_number`
- ✅ Street Name → `street_name`
- ✅ City* → `city`
- ✅ Postal Code* → `postcode`/`zip_code`
- ✅ Country → `country`

#### Building Details
- ✅ Building Size (sqft)* → `square_feet`
- ✅ Min Divisible (sqft) → `min_divisible`
- ✅ Vacant SQFT* → `vacant_sqft`
- ✅ Land Acres → `land_acres`
- ✅ Lot Size → `lot_size`
- ✅ Lot Size Unit → `lot_size_unit`

#### Building Specs
- ✅ Taxes (per sqft) → `taxes_per_sqft`
- ✅ Parking Spaces → `parking_spaces`
- ✅ Power → `power`

#### Location Info
- ✅ Zoning (Use Class) → `zoning`
- ✅ Lease Type* → `lease_type`

### Step 2: Lease Terms & Features

#### Lease Terms
- ✅ Lease Length (years)* → `lease_term`
- ✅ Rent per Month (£)* → `monthly_rent`
- ✅ Service Charge (£) → `service_charge`
- ✅ Break Clause (checkbox) → `break_clause`
- ✅ Deposit Required (checkbox) → `deposit_required`
- ✅ Deposit Amount (£) - conditional → `deposit_amount`

#### Financial Details
- ✅ Business Rates (£) → `business_rates`
- ✅ Floor Loading Capacity → `floor_load_capacity`
- ✅ VAT on Rent → `vat_on_rent`
- ✅ Rent Review Frequency (Years) → `rent_review_frequency`
- ✅ Repairing Obligations → `repairing_obligation`
- ✅ Insurance Responsibility → `insurance_responsibility`

#### Compliance & Certification
- ✅ EPC Rating* → `epc_rating`

#### Features & Utilities
- ✅ Water (checkbox) → `utilities.water`
- ✅ Gas (checkbox) → `utilities.gas`
- ✅ Internet (checkbox) → `utilities.internet`
- ✅ Electricity (checkbox) → `utilities.electricity`
- ✅ Heating/Cooling (dropdown) → `heating_cooling`
- ✅ Toilets/Kitchen (dropdown) → `toilet_kitchen`

#### Security & Access
- ✅ CCTV (checkbox) → `security.cctv`
- ✅ Key Fob Access (checkbox) → `security.keyFob`
- ✅ Secure Access (checkbox) → `security.secureAccess`
- ✅ Parking Available (checkbox) → `parking_spaces`
- ✅ Disability Access (checkbox) → `disability_access`

#### Use and Regulations
- ✅ Permitted Use (Use Class)* → `use_class`
- ✅ Opening Hours Allowed → `opening_hours`
- ✅ Signage Allowed (checkbox) → `signage_allowed`

### Step 3: Description & Media

#### Property Description
- ✅ Description* (textarea) → `description`

#### Upload Photos & Videos
- ✅ Photos & Videos (up to 15 files) → `property_images` table

#### Layout of Property
- ✅ Floor Plan Upload → `layout_file_name`, `layout_file_url`

#### Upload EPC Document
- ✅ EPC Document Upload → `epc_document_name`, `epc_document_url`

#### Contact Information
- ✅ Contact Phone → `contact_phone`
- ✅ Property Consultant → `property_consultant`

---

## 🔄 Data Flow Summary

### Frontend → Backend
```
AddLease Form
    ↓
FormData with all fields
    ↓
POST /api/properties/submit
    ↓
propertyController.submitProperty()
    ↓
Field destructuring & mapping
    ↓
INSERT INTO properties (86 columns)
    ↓
File uploads processed
    ↓
Email notifications sent
    ↓
Success response
```

### Edit Mode Flow
```
AddLease Form (Edit Mode)
    ↓
Pre-populated with existing data
    ↓
FormData with updated fields
    ↓
PUT /api/properties/update/:id
    ↓
propertyController.updateProperty()
    ↓
Field destructuring & mapping
    ↓
UPDATE properties (95 columns)
    ↓
File uploads processed
    ↓
Success response
```

---

## ✅ Verification Checklist

### Database
- [x] Migration file created
- [x] Migration executed successfully
- [x] 23 commercial lease columns added
- [x] Indexes created for performance
- [x] JSONB columns for complex data (utilities, security)
- [x] Comments added for documentation

### Backend
- [x] submitProperty: All fields destructured
- [x] submitProperty: All fields mapped
- [x] submitProperty: INSERT query updated (86 columns)
- [x] submitProperty: VALUES array updated
- [x] submitProperty: File uploads supported (photos, floorPlan, epcDocument)
- [x] updateProperty: All fields destructured
- [x] updateProperty: All fields mapped
- [x] updateProperty: UPDATE query updated (95 columns)
- [x] updateProperty: params array updated
- [x] updateProperty: File uploads supported

### Frontend
- [x] All form fields in state
- [x] All fields in fieldMapping object
- [x] File upload handlers implemented
- [x] Files appended to FormData
- [x] Helpful placeholders added
- [x] Form validation implemented
- [x] Session storage for drafts
- [x] Edit mode support

---

## 🎯 Result

The AddLease form is now **fully integrated** with the backend:
- ✅ All 40+ fields have database columns
- ✅ All fields are properly mapped in backend
- ✅ All file uploads are handled
- ✅ Create and Edit operations fully supported
- ✅ No data loss - every field saves to database
- ✅ Proper data types and validation

The form should now submit successfully! 🎉

