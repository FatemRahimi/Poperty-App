# EPC Document Upload - Visual Summary

## ✅ Implementation Complete

The EPC (Energy Performance Certificate) document upload has been successfully added to the AddRent form!

---

## 📍 Where to Find It

### AddRent Form - Section 4:

```
┌──────────────────────────────────────────────────────┐
│ SECTION 4: PROPERTY DESCRIPTION & MEDIA              │
├──────────────────────────────────────────────────────┤
│                                                        │
│ [Property Description - 80 words minimum]            │
│                                                        │
│ ────────────────────────────────────────────────────│
│                                                        │
│ [Upload Photos & Videos]                             │
│                                                        │
│ ────────────────────────────────────────────────────│
│                                                        │
│ Layout of Property                                   │
│   [Upload Floor Plan]                                │
│   [Approximate Area] [Floor Number]                  │
│                                                        │
│ ────────────────────────────────────────────────────│
│                                                        │
│ Upload EPC Document (Mandatory by Law)          ✨   │
│ ┌────────────────────────────────────────────────┐ │
│ │         📋                                      │ │
│ │   Click to upload EPC document                 │ │
│ │   PDF, JPG, PNG • Max 512MB • Required by law  │ │
│ └────────────────────────────────────────────────┘ │
│                                                        │
│ ────────────────────────────────────────────────────│
│                                                        │
│ [Contact Information]                                │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 🎨 Upload Interface

### Before Upload:

```
┌─────────────────────────────────────────────────┐
│ Upload EPC Document (Mandatory by Law)           │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │                                            │ │
│  │              📋                            │ │
│  │                                            │ │
│  │   Click to upload EPC document             │ │
│  │                                            │ │
│  │   PDF, JPG, PNG • Max 512MB • Required by  │ │
│  │   law                                      │ │
│  │                                            │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  👆 Click to select EPC document file            │
└─────────────────────────────────────────────────┘
```

### After Uploading PDF:

```
┌─────────────────────────────────────────────────┐
│ Upload EPC Document (Mandatory by Law)           │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │ 📄 epc_certificate.pdf                 ✕ │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  ✅ EPC document uploaded successfully           │
└─────────────────────────────────────────────────┘
```

### After Uploading Image:

```
┌─────────────────────────────────────────────────┐
│ Upload EPC Document (Mandatory by Law)           │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌───────────────────────────────────────────┐ │
│  │                                            │ │
│  │   [EPC Certificate Image Preview]          │ │
│  │                                            │ │
│  └───────────────────────────────────────────┘ │
│                                                   │
│  📄 epc_certificate.jpg                      ✕ │
│                                                   │
│  ✅ EPC document uploaded with preview           │
└─────────────────────────────────────────────────┘
```

---

## 🔄 User Flow

### Creating New Property:

```
Step 1: Navigate to AddRent form
        ↓
Step 2: Fill Sections 1-3
        ↓
Step 3: In Section 4, scroll to EPC section
        ↓
Step 4: Click upload area
        ↓
Step 5: Select EPC file (PDF or image)
        ↓
Step 6: File appears with:
        • Filename display
        • Image preview (if image file)
        • Remove button (✕)
        ↓
Step 7: Can remove and re-upload if needed
        ↓
Step 8: Submit property
        ↓
Step 9: Backend saves EPC document
        ↓
Step 10: EPC stored in database
```

### Editing Existing Property:

```
Step 1: Open property in edit mode
        ↓
Step 2: Navigate to Section 4
        ↓
Step 3: See existing EPC (if uploaded previously)
        │
        ├─ Option A: Keep existing → Do nothing
        │
        ├─ Option B: Remove existing → Click ✕
        │
        └─ Option C: Replace → Upload new file
        ↓
Step 4: Submit changes
        ↓
Step 5: Backend updates EPC document
```

---

## 📊 File Type Support

### PDF Files:
```
┌────────────────────────────┐
│ 📄 epc_certificate.pdf  ✕ │
└────────────────────────────┘
No preview, shows filename only
```

### Image Files (JPG, PNG):
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │ [EPC Certificate Preview]    │ │
│ │ [Shows actual image]         │ │
│ └─────────────────────────────┘ │
│                                  │
│ epc_certificate.jpg          ✕ │
└─────────────────────────────────┘
Shows image preview + filename
```

---

## ⚠️ Error Handling

### File Too Large:

```
User selects 600MB file
        ↓
Alert: "EPC document file size must be under 512MB"
        ↓
File NOT uploaded
        ↓
User selects smaller file
```

### Wrong File Type:

```
User selects .docx file
        ↓
Browser blocks selection (accept filter)
        ↓
Only shows: PDF, JPG, PNG in file picker
```

---

## 🎯 Comparison with Sale Form

### AddList (Sale) - Section 6:

```
┌─────────────────────────────────────┐
│ Upload EPC Document (Mandatory by   │
│ Law)                                 │
│ ┌─────────────────────────────────┐ │
│ │ 📋 Click to upload              │ │
│ │ PDF, JPG, PNG • Max 512MB       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### AddRent (Rent) - Section 4:

```
┌─────────────────────────────────────┐
│ Upload EPC Document (Mandatory by   │
│ Law)                                 │
│ ┌─────────────────────────────────┐ │
│ │ 📋 Click to upload              │ │
│ │ PDF, JPG, PNG • Max 512MB       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Result:** Identical! ✅

---

## 💾 Data Storage

### Frontend (During Form Fill):

```javascript
State Variables:
├─ epcDocumentFile: File object or null
├─ existingEpcUrl: "/uploads/123_epc_cert.pdf" or ""
└─ existingEpcName: "epc_certificate.pdf" or ""
```

### Backend (After Submission):

```javascript
File System:
└─ /uploads/
   └─ {propertyId}_epc_{originalname}
      Example: 123_epc_epc_certificate.pdf
```

### Database:

```sql
Table: properties
├─ epc_document_name: VARCHAR(255)
│  Example: "epc_certificate.pdf"
│
└─ epc_document_url: TEXT
   Example: "/uploads/123_epc_epc_certificate.pdf"
```

---

## 🎨 Styling Details

### Upload Button:
```css
Background: White
Border: 1px dashed gray
Padding: 2rem
Border-radius: 8px
Cursor: pointer
Hover: Slightly darker background
```

### Icon:
```
📋 (Document emoji)
Font-size: 2rem
Color: Primary blue
```

### Text:
```
Main: "Click to upload EPC document"
  Font-weight: 500
  Color: Dark gray

Sub: "PDF, JPG, PNG • Max 512MB • Required by law"
  Font-size: 0.875rem
  Color: Medium gray
```

### Preview Image:
```css
Max-width: 100%
Border-radius: 8px
Box-shadow: 0 1px 3px rgba(0,0,0,0.1)
Margin-bottom: 0.5rem
```

### Remove Button (✕):
```css
Background: Red
Color: White
Border-radius: 50%
Width: 24px
Height: 24px
Font-size: 1.2rem
Hover: Darker red
Cursor: pointer
```

---

## 📱 Responsive Design

### Desktop:
```
┌───────────────────────────────────────────┐
│ Upload EPC Document (Mandatory by Law)     │
│ ┌───────────────────────────────────────┐ │
│ │    📋 Click to upload EPC document    │ │
│ │    PDF, JPG, PNG • Max 512MB          │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

### Mobile:
```
┌─────────────────────────┐
│ Upload EPC Document     │
│ (Mandatory by Law)      │
│ ┌─────────────────────┐ │
│ │  📋                 │ │
│ │  Tap to upload      │ │
│ │  PDF, JPG, PNG      │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

---

## ✅ Feature Checklist

User Features:
- [x] Click to upload
- [x] File type filtering (PDF, images only)
- [x] File size validation (512MB max)
- [x] Image preview for image files
- [x] Filename display for all files
- [x] Remove uploaded file
- [x] Replace existing file (edit mode)
- [x] Keep existing file (edit mode)
- [x] Visual feedback (file name, preview)

Technical Features:
- [x] State management
- [x] Edit mode support
- [x] Backend integration
- [x] Database storage
- [x] Error handling
- [x] Responsive design
- [x] Same as AddList implementation

---

## 🎉 Success Indicators

When using the form, you'll know it's working when:

1. **Upload Area Appears:** ✅
   - See "Upload EPC Document (Mandatory by Law)" heading
   - See upload button with 📋 icon

2. **File Selection Works:** ✅
   - Click opens file picker
   - Only shows PDF and image files

3. **File Upload Works:** ✅
   - Selected file appears below upload button
   - Image files show preview
   - Filename is displayed

4. **File Removal Works:** ✅
   - Click ✕ button removes file
   - Can upload again after removal

5. **Edit Mode Works:** ✅
   - Existing EPC displays on form load
   - Can remove or replace existing file

6. **Submission Works:** ✅
   - Form submits successfully
   - EPC document saved to server
   - Database updated with file info

---

## 🚀 Ready to Use!

The EPC document upload is now:
- ✅ Fully implemented
- ✅ Tested and working
- ✅ Matching AddList functionality
- ✅ Ready for production

**Just create or edit a rental property to see it in action!**

---

**Status:** Production Ready ✅  
**Last Updated:** October 14, 2025  
**Build:** Successful ✅

