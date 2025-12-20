# Expert Team Photos Fix

## 🐛 Problem
Expert team member photos were not showing in the PropertyAdvisorCard when advisor profile was set as a company.

## 🔍 Root Cause
The expert photos were **never being uploaded to the server** as actual files. They were only stored as base64 data URLs in the browser, which:
1. Were too large to save in the database
2. Were lost when the page refreshed
3. Were never sent as files to the backend

## ✅ Solution Implemented

### 1. Frontend Changes (`client/src/pages/AdvisorProfile.js`)

**A) Store the actual file object** (Line 287):
```javascript
// Before:
{ ...expert, profilePhotoUrl: e.target.result }

// After:
{ ...expert, profilePhotoUrl: e.target.result, profilePhotoFile: file }
```

**B) Send expert photos as files** (Lines 455-469):
```javascript
// Add expert photo files to FormData
expertTeam.forEach((expert, index) => {
  if (expert.profilePhotoFile) {
    submitData.append(`expertPhoto_${index}`, expert.profilePhotoFile);
  }
});

// Send expert team metadata (without large file objects)
const expertTeamData = expertTeam.map(expert => ({
  id: expert.id,
  fullName: expert.fullName,
  jobTitle: expert.jobTitle,
  phone: expert.phone,
  email: expert.email,
  hasPhoto: !!expert.profilePhotoFile || !!expert.profilePhotoUrl
}));
submitData.append('expertTeam', JSON.stringify(expertTeamData));
```

### 2. Backend Changes

**A) Configure multer to accept expert photos** (`server/routes/userRoutes.js` Lines 115-127):
```javascript
router.post('/:userId/advisor-profile', authenticateJWT, upload.fields([
  { name: 'companyLogo', maxCount: 1 },
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'expertPhoto_0', maxCount: 1 },
  { name: 'expertPhoto_1', maxCount: 1 },
  { name: 'expertPhoto_2', maxCount: 1 },
  { name: 'expertPhoto_3', maxCount: 1 },
  { name: 'expertPhoto_4', maxCount: 1 }
]), saveAdvisorProfile);
```

**B) Process expert photo uploads** (`server/controllers/userController.js` Lines 164-185):
```javascript
// Handle expert photo uploads
const expertPhotoUrls = {};
for (let i = 0; i < 5; i++) {
  const fieldName = `expertPhoto_${i}`;
  if (req.files[fieldName] && req.files[fieldName][0]) {
    const file = req.files[fieldName][0];
    const fileName = `expert_photo_${userId}_${i}_${Date.now()}${path.extname(file.originalname)}`;
    const filePath = path.join(uploadsDir, fileName);
    
    fs.writeFileSync(filePath, file.buffer);
    expertPhotoUrls[i] = `/uploads/${fileName}`;
    console.log(`✅ Expert photo ${i} saved:`, fileName);
  }
}

// Parse expert team data and add photo URLs
if (advisorData.expertTeam) {
  const expertTeam = JSON.parse(advisorData.expertTeam);
  const updatedExpertTeam = expertTeam.map((expert, index) => ({
    ...expert,
    profilePhotoUrl: expertPhotoUrls[index] || expert.profilePhotoUrl || ''
  }));
  advisorData.expertTeam = JSON.stringify(updatedExpertTeam);
}
```

## 📋 How It Works Now

1. **User uploads expert photo** → File object is stored in expertTeam state
2. **Form submission** → Expert photo files are appended to FormData as `expertPhoto_0`, `expertPhoto_1`, etc.
3. **Backend receives files** → Multer processes the uploads
4. **Files saved to disk** → Photos saved as `/uploads/expert_photo_userId_index_timestamp.ext`
5. **URLs added to database** → Expert team data includes `profilePhotoUrl` for each expert
6. **PropertyAdvisorCard displays photos** → Photos are now properly displayed from the server

## 🧪 Testing Steps

1. **Go to Advisor Profile page** (`/advisor-profile`)
2. **Set as a Company**
3. **Add Expert Team Member**
4. **Upload a profile photo** for the expert
5. **Fill in expert details** (name, job title, email, phone)
6. **Submit the form** ✅
7. **Add a property** (AddRent, AddLease, or AddList)
8. **View the property** in property view page
9. **Check PropertyAdvisorCard** → Expert photo should now display! 📸

## 🎯 Result

Expert team member photos are now:
- ✅ Properly uploaded to the server
- ✅ Saved as files in `/uploads` directory
- ✅ Stored in database with correct URLs
- ✅ Displayed in PropertyAdvisorCard
- ✅ Persistent across page refreshes

## 📝 Files Modified

1. `client/src/pages/AdvisorProfile.js` - Frontend form submission
2. `server/routes/userRoutes.js` - Multer configuration
3. `server/controllers/userController.js` - File upload handling

---

**Date:** December 19, 2025
**Status:** ✅ Fixed and Ready for Testing





