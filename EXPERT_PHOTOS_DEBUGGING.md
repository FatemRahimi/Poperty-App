# 🐛 Expert Photos Debugging - Enhanced Logging

## Issue Reported

Expert team images are not showing in PropertyAdvisorCard when advisor profile is set as a company.

## Debugging Changes Applied

### 1. Frontend Logging (`client/src/pages/AdvisorProfile.js`)

**Lines 455-476**: Added detailed logging for expert photo submission

```javascript
// Add expert photo files
console.log('👥 Expert team before submission:', expertTeam);
expertTeam.forEach((expert, index) => {
  if (expert.profilePhotoFile) {
    submitData.append(`expertPhoto_${index}`, expert.profilePhotoFile);
    console.log(`📁 Added expert photo ${index}:`, {
      name: expert.fullName,
      fileName: expert.profilePhotoFile.name,
      fileSize: expert.profilePhotoFile.size,
      fileType: expert.profilePhotoFile.type
    });
  } else {
    console.log(`⚠️ No photo file for expert ${index}: ${expert.fullName}`);
  }
});

// Add expert team data
const expertTeamData = expertTeam.map((expert, index) => ({
  id: expert.id,
  fullName: expert.fullName,
  jobTitle: expert.jobTitle,
  phone: expert.phone,
  email: expert.email,
  hasPhoto: !!expert.profilePhotoFile || !!expert.profilePhotoUrl
}));
console.log('👥 Expert team data being sent:', expertTeamData);
```

### 2. Backend Logging (`server/controllers/userController.js`)

**Lines 156-186**: Added detailed logging for expert photo processing

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
    console.log(`✅ Expert photo ${i} saved: ${fileName}`);
  }
}

console.log('📸 Expert photo URLs generated:', expertPhotoUrls);

// Parse expert team data and add photo URLs
if (advisorData.expertTeam) {
  try {
    const expertTeam = JSON.parse(advisorData.expertTeam);
    console.log('👥 Original expert team data (before adding URLs):', JSON.stringify(expertTeam, null, 2));
    
    const updatedExpertTeam = expertTeam.map((expert, index) => ({
      ...expert,
      profilePhotoUrl: expertPhotoUrls[index] || expert.profilePhotoUrl || ''
    }));
    
    console.log('👥 Updated expert team data (after adding URLs):', JSON.stringify(updatedExpertTeam, null, 2));
    
    advisorData.expertTeam = JSON.stringify(updatedExpertTeam);
    console.log('✅ Expert team data updated with photo URLs');
  } catch (error) {
    console.error('❌ Error parsing expert team data:', error);
  }
} else {
  console.log('⚠️ No expertTeam data found in advisorData');
}
```

## Testing Steps

### Step 1: Submit Advisor Profile as Company with Expert Team

1. **Go to Advisor Profile** (`/advisor-profile`)
2. **Select "Set as a Company"**
3. **Fill in company details**
4. **Add Expert Team Member:**
   - Click "Add Expert Team Member"
   - Enter name: "John Doe"
   - Enter job title: "Property Consultant"
   - Enter email and phone
   - **Upload a profile photo**
5. **Submit the form**

### Step 2: Check Browser Console

Look for these log messages:

```
👥 Expert team before submission: [{ id: "...", fullName: "John Doe", ... }]
📁 Added expert photo 0: { name: "John Doe", fileName: "photo.jpg", fileSize: 123456, fileType: "image/jpeg" }
👥 Expert team data being sent: [{ id: "...", fullName: "John Doe", jobTitle: "Property Consultant", hasPhoto: true }]
```

**Expected:**
- ✅ Should see expert team array with member details
- ✅ Should see expert photo file being added
- ✅ `hasPhoto` should be `true`

**If NOT working:**
- ❌ No expert photo file logged → Photo upload not working in frontend
- ❌ `hasPhoto` is `false` → Photo not stored in `profilePhotoFile`

### Step 3: Check Server Terminal

Look for these log messages:

```
✅ Expert photo 0 saved: expert_photo_30_0_1234567890.jpg
📸 Expert photo URLs generated: { '0': '/uploads/expert_photo_30_0_1234567890.jpg' }
👥 Original expert team data (before adding URLs): [
  {
    "id": "...",
    "fullName": "John Doe",
    "jobTitle": "Property Consultant",
    "hasPhoto": true
  }
]
👥 Updated expert team data (after adding URLs): [
  {
    "id": "...",
    "fullName": "John Doe",
    "jobTitle": "Property Consultant",
    "hasPhoto": true,
    "profilePhotoUrl": "/uploads/expert_photo_30_0_1234567890.jpg"
  }
]
✅ Expert team data updated with photo URLs
```

**Expected:**
- ✅ Should see expert photo saved to disk
- ✅ Should see `expertPhotoUrls` object with index mapping
- ✅ Should see `profilePhotoUrl` added to expert data

**If NOT working:**
- ❌ No expert photo saved → Multer not receiving files
- ❌ Empty `expertPhotoUrls` → Files not in `req.files`
- ❌ No `profilePhotoUrl` in updated data → Mapping logic failing

### Step 4: Check Database

After submission, check the database:

```sql
SELECT expert_team FROM advisor_profiles WHERE user_id = 30;
```

**Expected result:**
```json
[
  {
    "id": "expert_1234567890_0",
    "fullName": "John Doe",
    "jobTitle": "Property Consultant",
    "phone": "01234567890",
    "email": "john@example.com",
    "profilePhotoUrl": "/uploads/expert_photo_30_0_1234567890.jpg",
    "hasPhoto": true,
    "createdAt": "2025-12-20T...",
    "updatedAt": "2025-12-20T..."
  }
]
```

**If NOT working:**
- ❌ No `profilePhotoUrl` → Not saved to database
- ❌ Empty string `""` → File wasn't uploaded or mapping failed

### Step 5: Check Property View

1. **Create a property** (AddRent, AddLease, or AddList)
2. **Select expert** from company contact section
3. **Submit property**
4. **View property** in property view page
5. **Check PropertyAdvisorCard**

**Expected:**
- ✅ Should see expert photo in Property Consultant section
- ✅ Photo should load from `/uploads/expert_photo_...`

**If NOT working:**
- ❌ No photo showing → Check browser network tab for 404 error
- ❌ 404 error → File not saved or wrong path
- ❌ Broken image → Check file exists in `/uploads` directory

## Common Issues and Solutions

### Issue 1: Photo not uploading from frontend

**Symptom**: `⚠️ No photo file for expert 0: John Doe`

**Solution**:
- Check `handleExpertPhotoUpload` function (line 280)
- Verify file input is calling the handler correctly
- Check `profilePhotoFile` is being stored in state

### Issue 2: Multer not receiving files

**Symptom**: Backend shows empty `expertPhotoUrls: {}`

**Solution**:
- Check `multer` configuration in `userRoutes.js` (lines 106-114)
- Verify field names match: `expertPhoto_0`, `expertPhoto_1`, etc.
- Check FormData is being sent with correct content-type

### Issue 3: Files saved but URLs not in database

**Symptom**: Files exist in `/uploads` but `profilePhotoUrl` is empty

**Solution**:
- Check expert team mapping logic (lines 175-178)
- Verify index alignment between uploaded files and expert array
- Check database update query

### Issue 4: Photo not displaying in PropertyAdvisorCard

**Symptom**: Data is correct but photo doesn't show

**Solution**:
- Check PropertyAdvisorCard parsing logic (line 599 in User.js)
- Verify `profile_photo_url` field mapping
- Check image src path is correct
- Verify `/uploads` directory is served statically

## Verification Checklist

After implementing the debugging:

- [ ] Browser console shows expert team array before submission
- [ ] Browser console shows photo file details (name, size, type)
- [ ] Browser console shows `hasPhoto: true`
- [ ] Server terminal shows photo saved to disk
- [ ] Server terminal shows photo URLs generated
- [ ] Server terminal shows updated expert data with URLs
- [ ] Database shows `profilePhotoUrl` in expert_team JSONB
- [ ] File exists in `/uploads` directory
- [ ] PropertyAdvisorCard displays the expert photo
- [ ] No 404 errors in browser network tab

## Next Steps

1. **Run the server** (it should already be running)
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Test the flow** following Step 1-5 above
4. **Collect logs** from both browser console and server terminal
5. **Share the logs** so we can identify exactly where the issue is

---

**Status**: 🔍 Enhanced Debugging Active  
**Date**: December 20, 2025  
**Files Modified**:
- `client/src/pages/AdvisorProfile.js` (enhanced logging)
- `server/controllers/userController.js` (enhanced logging)





