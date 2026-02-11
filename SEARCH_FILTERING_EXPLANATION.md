# 🔍 Search Filtering Explanation

## Overview
This document explains how property search filtering works in the FindProperty → SearchResults flow.

---

## 📍 Step 1: User Input on FindProperty Page

### User Actions:
1. **Selects Category**: Residential / Commercial / Farms
2. **Selects Transaction Type**: Buy / Rent / Lease
3. **Enters Location**: e.g., "B46" (postcode), "London" (city), or "Oxford Street" (street)
4. **Selects Radius**: e.g., "3 miles"
5. **Clicks Search Button**

### Mapping Functions:

#### 1. `mapSearchTypeToCategory()` - Maps UI transaction type to database category
```javascript
'buy' → 'sale'      // Buy properties are stored as 'sale' in database
'rent' → 'rent'     // Rent stays the same
'lease' → 'lease'   // Lease stays the same
```

#### 2. `mapCategoryToPropertyCategory()` - Maps UI category to database property_category
```javascript
'residential' → 'residential'  // Residential properties
'commercial' → 'commercial'    // Commercial properties
'farms' → 'land'              // Farms are stored as 'land' in database
```

### Example:
- User selects: **Residential** + **Rent** + Location: **"B46"** + Radius: **"3 miles"**
- Mapped to:
  - `category = 'rent'`
  - `propertyCategory = 'residential'`
  - `q = 'B46'`
  - `radius = '3'`

---

## 📡 Step 2: API Call to Backend

### URL Parameters Sent:
```
/api/properties/search?q=B46&category=rent&radius=3&show_all_statuses=false
```

**Note**: `propertyCategory` is NOT sent to backend (filtered on frontend later)

### Backend Filtering (in `server/routes/propertyRoutes.js`):

#### Filter 1: Status Filter (Security)
```sql
WHERE p.status = 'approved'
```
- **Purpose**: Only show approved properties (public search)
- **For UserDashboard**: Would filter by `user_id` instead

#### Filter 2: Location + Radius Filter
**If radius is provided** (e.g., "3 miles"):

**A. For Cities** (e.g., "London"):
```sql
AND (
  LOWER(p.city) = LOWER('London') OR 
  p.city ILIKE '%London%' OR
  p.address_line1 ILIKE '%London%' OR
  p.address_line2 ILIKE '%London%'
)
```
- No radius calculation for cities (shows all properties in city)

**B. For Postcodes/Streets** (e.g., "B46"):
```sql
AND ((
  -- Database text search
  p.title ILIKE '%B46%' OR 
  p.description ILIKE '%B46%' OR 
  p.address_line1 ILIKE '%B46%' OR 
  p.address_line2 ILIKE '%B46%' OR 
  p.city ILIKE '%B46%' OR 
  p.zip_code ILIKE '%B46%' OR
  p.property_type ILIKE '%B46%'
) OR (
  -- Geocoding + Radius search (Haversine formula)
  p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND
  (6371 * acos(
    cos(radians(lat)) * cos(radians(p.latitude)) * 
    cos(radians(p.longitude) - radians(lng)) + 
    sin(radians(lat)) * sin(radians(p.latitude))
  )) <= 3  -- radius in miles
))
```

**How it works:**
1. **Step 1**: Searches database for exact text matches (title, address, postcode, etc.)
2. **Step 2**: Geocodes "B46" to get latitude/longitude
3. **Step 3**: Calculates distance from geocoded point to each property using Haversine formula
4. **Step 4**: Includes properties within 3 miles radius

**If NO radius provided**:
- Only does text search (no geocoding/radius calculation)

#### Filter 3: Category Filter (rent/sale/lease)
```sql
AND p.category = 'rent'
```
- Filters by transaction type: `rent`, `sale`, or `lease`

#### Filter 4: Property Type Filter (optional)
```sql
AND p.property_type = 'flat'  -- if user selected property type filter
```
- Filters by building type: `flat`, `house`, `studio`, etc.

#### Filter 5: Price Filters (optional)
```sql
AND (p.price >= 100000 OR p.monthly_rent >= 100000)  -- min_price
AND (p.price <= 500000 OR p.monthly_rent <= 500000)  -- max_price
```

#### Filter 6: Bedroom Filters (optional)
```sql
AND p.bedrooms >= 2  -- min_bedrooms
AND p.bedrooms <= 4  -- max_bedrooms
```

---

## 🎯 Step 3: Frontend Filtering (in SearchResults.js)

### Backend Returns:
```json
{
  "success": true,
  "properties": [
    {
      "id": 1,
      "title": "Modern Apartment",
      "category": "rent",
      "property_category": "residential",  // ← This is what we filter by
      "property_type": "flat",
      "city": "Birmingham",
      "zip_code": "B46 2PQ",
      "latitude": 52.4862,
      "longitude": -1.8904,
      ...
    },
    ...
  ],
  "total": 15
}
```

### Frontend Filter: Property Category

**Why filter on frontend?**
- Backend doesn't support `property_category` filtering yet
- We filter after getting results from API

**Filter Logic:**
```javascript
// Step 1: Get all properties from API
let results = data.properties || [];  // e.g., 15 properties

// Step 2: Filter by property_category
if (propertyCategory === 'residential') {
  results = results.filter(property => {
    return property.property_category === 'residential';
  });
  // e.g., 15 → 10 properties (5 were commercial/land)
}

// Step 3: Case-insensitive matching
const propCategory = (property.property_category || '').toLowerCase().trim();
const expectedCategory = propertyCategory.toLowerCase().trim();
const matches = propCategory === expectedCategory;
```

**Fallback Logic:**
- If filtering removes ALL results, show all results instead (with warning)
- This prevents empty results if property_category values don't match

---

## 📊 Complete Filter Flow Example

### Scenario: Search for "B46" + Residential + Rent + 3 miles

#### Step 1: FindProperty Page
```
User Input:
- Category: "Residential"
- Transaction: "Rent"
- Location: "B46"
- Radius: "3"

Mapped Values:
- category = "rent"
- propertyCategory = "residential"
- q = "B46"
- radius = "3"
```

#### Step 2: API Call
```
GET /api/properties/search?q=B46&category=rent&radius=3&show_all_statuses=false
```

#### Step 3: Backend SQL Query (simplified)
```sql
SELECT p.*
FROM properties p
WHERE 
  p.status = 'approved'                    -- Filter 1: Only approved
  AND (
    p.zip_code ILIKE '%B46%'              -- Filter 2a: Text search
    OR (
      -- Filter 2b: Radius search (within 3 miles of B46 geocoded location)
      (6371 * acos(...)) <= 3
    )
  )
  AND p.category = 'rent'                 -- Filter 3: Transaction type
```

**Result**: Returns 15 properties (mix of residential, commercial, land)

#### Step 4: Frontend Filtering
```javascript
// Backend returned 15 properties
results = [15 properties]

// Filter by property_category = 'residential'
results = results.filter(p => p.property_category === 'residential')

// Result: 10 properties (5 were commercial/land, filtered out)
```

#### Step 5: Display Results
- Shows 10 residential rent properties within 3 miles of B46

---

## 🔍 Why Nothing Might Be Found

### Possible Issues:

1. **No Approved Properties**
   - Properties exist but status is "pending" or "rejected"
   - **Check**: Database `status` column

2. **No Properties Matching Location**
   - No properties with postcode/city matching "B46"
   - Properties don't have coordinates for radius search
   - **Check**: `zip_code`, `city`, `latitude`, `longitude` columns

3. **No Properties Matching Category**
   - No properties with `category = 'rent'`
   - **Check**: Database `category` column

4. **Property Category Mismatch**
   - Properties have `property_category = null` or different value
   - Expected: `'residential'`, Found: `'Residential'` (case mismatch)
   - **Check**: Database `property_category` column values

5. **Radius Too Small**
   - Properties exist but are 4 miles away (radius set to 3 miles)
   - **Solution**: Increase radius

---

## 🐛 Debugging Tips

### Check Browser Console Logs:

1. **API Request**:
   ```
   📡 Full API URL: /api/properties/search?q=B46&category=rent&radius=3&show_all_statuses=false
   ```

2. **API Response**:
   ```
   ✅ API Response: { success: true, propertiesCount: 15, total: 15 }
   ```

3. **Raw Results**:
   ```
   📦 Raw API results: 15 properties
   ```

4. **Property Categories**:
   ```
   📊 Property categories in results: { residential: 10, commercial: 3, land: 2 }
   ```

5. **Filtering**:
   ```
   🏘️ Filtered by property_category: residential, 15 → 10 properties
   ```

6. **Final Results**:
   ```
   📊 Final results: 10 properties for "B46" (rent, residential)
   ```

---

## 📝 Summary

**Filtering Order:**
1. ✅ **Backend**: Status (approved only)
2. ✅ **Backend**: Location + Radius (geocoding + Haversine)
3. ✅ **Backend**: Category (rent/sale/lease)
4. ✅ **Backend**: Property Type, Price, Bedrooms (if specified)
5. ✅ **Frontend**: Property Category (residential/commercial/land)

**Key Points:**
- Location + Radius filtering happens on **backend** (database + geocoding)
- Property Category filtering happens on **frontend** (after API response)
- All filters are **AND** conditions (must match all)
- Search includes **ALL users' approved properties** (public search)

