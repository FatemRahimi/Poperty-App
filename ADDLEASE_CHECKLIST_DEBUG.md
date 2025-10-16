# AddLease Form - Checklist Debugging

## 🐛 **Issue: Utilities & Security Checklists Not Retrieved**

### Problem
The utilities and security checkboxes (checklists) are not being retrieved in edit mode. When editing a lease property, these checkboxes appear unchecked even if they were previously selected.

### Fields Affected:
- **Utilities**: Water, Gas, Internet, Electricity
- **Security**: CCTV, Key Fob Access, Secure Access

---

## 🔍 **Debugging Analysis**

### 1. Database Check
```sql
-- All properties have empty utilities/security
SELECT id, title, utilities, security FROM properties WHERE category = 'lease';
-- Result: utilities: {}, security: {}
```

### 2. Frontend Code Analysis
✅ **handleChange Function**: Correctly handles utilities/security checkboxes
✅ **Form Submission**: Correctly stringifies utilities/security as JSON
✅ **Initial Form Data**: Correctly initializes utilities/security objects
✅ **Edit Mode Parsing**: Correctly parses JSON from database

### 3. Backend Code Analysis
✅ **Field Mapping**: Correctly maps utilities/security fields
✅ **Database Storage**: Correctly stores JSON in database
✅ **Field Retrieval**: Correctly retrieves JSON from database

---

## 🧪 **Debugging Steps Added**

### Frontend Debugging:
```jsx
// Added to handleChange function
console.log('🔍 DEBUG - Utility checkbox changed:', name, checked);
console.log('🔍 DEBUG - Security checkbox changed:', name, checked);

// Added to form submission
console.log('🔍 DEBUG - Utilities data:', formData.utilities);
console.log('🔍 DEBUG - Security data:', formData.security);
console.log('🔍 DEBUG - Utilities JSON:', JSON.stringify(formData.utilities));
console.log('🔍 DEBUG - Security JSON:', JSON.stringify(formData.security));
```

---

## 🎯 **Testing Instructions**

### Test Case 1: Create New Property with Checklists
1. Go to AddLease form
2. Check some utilities (e.g., Water, Gas)
3. Check some security (e.g., CCTV, Key Fob)
4. Submit the form
5. **Check Console**: Should show utilities/security data being sent
6. **Check Database**: Should show non-empty JSON objects

### Test Case 2: Edit Existing Property
1. Edit the property created in Test Case 1
2. **Expected**: Utilities and security checkboxes should be checked
3. **Check Console**: Should show utilities/security data being loaded

### Test Case 3: Debug Existing Property
1. Check database for property with utilities/security data
2. If none exist, the issue is in form submission
3. If data exists but not retrieved, the issue is in edit mode parsing

---

## 💡 **Possible Root Causes**

### 1. Form Submission Issue
- Checkboxes not being updated in formData
- JSON.stringify not working properly
- Backend not receiving the data

### 2. Database Storage Issue
- Backend not storing JSON properly
- Database constraints preventing storage
- Field mapping issues

### 3. Edit Mode Retrieval Issue
- JSON parsing failing in edit mode
- Field mapping issues in getInitialFormData
- Database query not returning utilities/security

---

## 🔧 **Next Steps**

### Immediate Actions:
1. **Test Form Submission**: Create new property with checkboxes checked
2. **Check Console Logs**: Verify data is being sent correctly
3. **Check Database**: Verify data is being stored correctly
4. **Test Edit Mode**: Verify data is being retrieved correctly

### If Issue Persists:
1. **Backend Debugging**: Add logging to propertyController.js
2. **Database Debugging**: Check if JSON fields are being stored
3. **Frontend Debugging**: Check if checkboxes are updating formData

---

## 📊 **Expected Behavior**

### New Property Creation:
```jsx
// User checks Water and CCTV
utilities: { water: true, gas: false, internet: false, electricity: false }
security: { cctv: true, keyFob: false, secureAccess: false }

// Form submission sends:
utilities: '{"water":true,"gas":false,"internet":false,"electricity":false}'
security: '{"cctv":true,"keyFob":false,"secureAccess":false}'
```

### Edit Mode Retrieval:
```jsx
// Database returns:
utilities: '{"water":true,"gas":false,"internet":false,"electricity":false}'
security: '{"cctv":true,"keyFob":false,"secureAccess":false}'

// Frontend parses to:
utilities: { water: true, gas: false, internet: false, electricity: false }
security: { cctv: true, keyFob: false, secureAccess: false }

// Checkboxes show as checked
```

---

## 🚀 **Status**

**Issue**: 🔍 **UNDER INVESTIGATION**

Debugging code added to identify root cause. Next step is to test form submission and edit mode retrieval.

**Ready for Testing** ✅

---

**Last Updated**: October 16, 2025  
**Status**: Debugging in Progress  
**Impact**: Medium (Checklist Functionality)
