# AddLease Form Submission Fix - Complete Summary

## Issues Found and Fixed

### 1. **Critical: Incorrect Field Mapping (FIXED ✅)**
**Problem**: In `client/src/pages/AddLease.js` line 603, the `lot_size` field was incorrectly mapped to `formData.leaseTerm`:
```javascript
lot_size: formData.leaseTerm, // WRONG! This was causing data corruption
```

**Fix**: Changed to proper value:
```javascript
lot_size: '', // Not used for commercial lease properties
parking_spaces: formData.parkingSpaces || (formData.parking ? 1 : 0),
```

### 2. **Photo Validation Issues in Edit Mode (FIXED ✅)**
**Problem**: The validation was too strict for edit mode, preventing updates when existing photos were present.

**Fix**: Updated `validateStep3()` function to:
- Allow edit mode submissions with existing photos
- Properly check for both new and existing photos
- Add null safety checks for photoPreviewUrls and photoFiles

### 3. **Missing keptPhotos Handling in Edit Mode (FIXED ✅)**
**Problem**: When editing a lease property, the form wasn't sending information about which existing photos to keep.

**Fix**: Added proper keptPhotos handling:
```javascript
// In edit mode, also send list of existing photos to keep
if (editMode) {
  const existingPhotos = photoPreviewUrls.filter(p => p.isExisting).map(p => p.url);
  if (existingPhotos.length > 0) {
    submitFormData.append('keptPhotos', JSON.stringify(existingPhotos));
  }
}
```

### 4. **Backend JSON Parsing for Photo Arrays (FIXED ✅)**
**Problem**: Backend wasn't properly parsing JSON-stringified arrays for `keptPhotos` and `deletedPhotos`.

**Fix**: Updated `server/controllers/propertyController.js` to parse JSON strings:
```javascript
if (typeof keptPhotos === 'string') {
  try {
    // Try to parse as JSON first (e.g., from JSON.stringify)
    keptPhotos = JSON.parse(keptPhotos);
  } catch (e) {
    // If not JSON, treat as single string URL
    keptPhotos = [keptPhotos];
  }
}
```

### 5. **Database Schema (VERIFIED ✅)**
**Status**: All commercial lease fields are present in the database:
- `space_subtypes`, `lease_type`, `use_class`
- `min_divisible`, `vacant_sqft`, `land_acres`, `lot_size_unit`
- `taxes_per_sqft`, `power`, `zoning`, `floor_load_capacity`
- `service_charge`, `business_rates`
- `heating_cooling`, `toilet_kitchen`
- `utilities` (JSONB), `security` (JSONB)
- `opening_hours`, `is_multiple_tenancy`, `signage_allowed`, `disability_access`
- `break_clause`, `deposit_required`
- UK-specific fields: `vat_on_rent`, `repairing_obligation`, `insurance_responsibility`, `rent_review_frequency`

## Testing Checklist

### Before Testing
1. ✅ Ensure backend server is running (`cd server && npm start`)
2. ✅ Ensure frontend is running (`cd client && npm start`)
3. ✅ Verify database migration has been applied
4. ✅ Have a valid user account logged in

### Test Cases

#### Test Case 1: New Lease Property Submission
1. Navigate to `/addlease`
2. Fill out all required fields:
   - Step 1: Space Type, Space Name, City, Postcode, Total Area
   - Step 2: Lease Term, Monthly Rent, Use Class, EPC Rating
   - Step 3: Description, Upload at least 1 photo
3. Click "Submit Listing"
4. **Expected Result**: 
   - Success message displayed
   - Redirect to dashboard after 2 seconds
   - Property appears in dashboard with "pending" status

#### Test Case 2: Edit Existing Lease Property
1. From dashboard, click "Edit" on an existing lease property
2. Make changes to any fields
3. Keep some existing photos, remove others, add new ones
4. Click "Update Property"
5. **Expected Result**:
   - Success message displayed
   - Property status changed to "pending" (if it was approved)
   - Existing photos preserved correctly
   - New photos added
   - Removed photos deleted

#### Test Case 3: Validation Tests
1. Try to submit without required fields - should show validation errors
2. Try to submit without photos - should show error
3. Try to upload files larger than 1GB - should show size error
4. Try to upload more than 15 files - should show count error

## Files Modified

1. **client/src/pages/AddLease.js**
   - Fixed lot_size field mapping (line 603)
   - Enhanced validateStep3() function (lines 509-531)
   - Added keptPhotos handling for edit mode (lines 699-705)

2. **server/controllers/propertyController.js**
   - Added JSON parsing for keptPhotos and deletedPhotos (lines 1901-1923)

3. **server/db/migrations/add-commercial-lease-fields.sql**
   - Already applied - all commercial lease fields present

## API Endpoints Used

### New Lease Submission
- **Endpoint**: `POST /api/properties/submit`
- **Headers**: `Authorization: Bearer {token}`
- **Content-Type**: `multipart/form-data`
- **Fields**: All lease-specific fields mapped correctly

### Edit Lease Property
- **Endpoint**: `PUT /api/properties/update/:id`
- **Headers**: `Authorization: Bearer {token}`
- **Content-Type**: `multipart/form-data`
- **Fields**: All lease-specific fields + keptPhotos array

## Common Issues and Solutions

### Issue: Form submits but no response
**Solution**: Check browser console for network errors, verify backend server is running on port 5050

### Issue: "Authentication failed" error
**Solution**: Verify user is logged in and token is valid in localStorage

### Issue: "City is required" error
**Solution**: Ensure city field is filled in Step 1 (it's required but might not be marked with *)

### Issue: Photos not uploading
**Solution**: 
- Check file size (max 1GB per file)
- Check total count (max 15 files)
- Verify file types are images or videos

### Issue: Edit mode doesn't keep existing photos
**Solution**: Fixed in this update - keptPhotos now properly sent to backend

## Debug Logging

The form includes extensive console logging for debugging:
- `🔍 Form Data before mapping` - Shows form values before submission
- `FormData contents` - Shows all fields being sent to backend
- `🔄 Approved property being edited` - Status change notification
- Server logs show received data and validation results

## Next Steps

1. ✅ All fixes applied
2. ⏳ Test the form with real data
3. ⏳ Verify email notifications work
4. ⏳ Verify admin approval workflow

## Rollback Instructions

If issues persist, you can rollback by:
1. `git checkout HEAD -- client/src/pages/AddLease.js`
2. `git checkout HEAD -- server/controllers/propertyController.js`

**Last Updated**: October 16, 2025
**Status**: Ready for Testing ✅

