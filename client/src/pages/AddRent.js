import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import DateInput from "../components/inputs/DateInput";
import Logo from "../components/Logo";
import "../styles/CrossBrowserReset.css"; // Cross-browser consistency
import "../styles/AddList.css"; // reusing the AddList CSS
import "./AddRent.css"; // AddRent specific styles
import useSessionStorage from "../Utils/useSessionStorage";
import { useAuth } from "../context/AuthContext";

// Property type options
const propertyTypeOptions = [
  { value: "detached", label: "Detached" },
  { value: "semi-detached", label: "Semi-Detached" },
  { value: "terraced", label: "Terraced" },
  { value: "flat", label: "Flat" },
  { value: "apartment", label: "Apartment" },
  { value: "studio", label: "Studio" },
  { value: "duplex", label: "Duplex" },
  { value: "maisonette", label: "Maisonette" },
  { value: "bungalow", label: "Bungalow" },
  { value: "cottage", label: "Cottage" },
  { value: "townhouse", label: "Townhouse" },
  { value: "penthouse", label: "Penthouse" },
  { value: "land", label: "Land" },
  { value: "park-home", label: "Park Home" },
  { value: "mobile-home", label: "Mobile Home" },
  { value: "student-halls", label: "Student Halls" },
  { value: "house-share", label: "House Share" },
  { value: "retirement-home", label: "Retirement Home" }
];

// Bedroom options
const bedroomOptions = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "10+", label: "10+" }
];

// Bathroom options
const bathroomOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6", label: "6" },
  { value: "7", label: "7" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "10+", label: "10+" }
];

// Enhanced furnished status options with more detail
const furnishedOptions = [
  { value: "furnished", label: "Furnished" },
  { value: "partFurnished", label: "Part-Furnished" },
  { value: "unfurnished", label: "Unfurnished" }
];

// Enhanced tenancy length options with exact months
const tenancyLengthOptions = [
  { value: "6", label: "6 months minimum" },
  { value: "12", label: "12 months minimum" },
  { value: "18", label: "18 months minimum" },
  { value: "24", label: "24 months minimum" },
  { value: "flexible", label: "Flexible" }
];

// Council tax band options
const councilTaxOptions = [
  { value: "A", label: "Band A" },
  { value: "B", label: "Band B" },
  { value: "C", label: "Band C" },
  { value: "D", label: "Band D" },
  { value: "E", label: "Band E" },
  { value: "F", label: "Band F" },
  { value: "G", label: "Band G" },
  { value: "H", label: "Band H" }
];

// EPC rating options
const epcRatingOptions = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
  { value: "F", label: "F" },
  { value: "G", label: "G" }
];

// Council tax status options (Rightmove requirement)
const councilTaxStatusOptions = [
  { value: "tenant", label: "Tenant Responsible" },
  { value: "included", label: "Included in Rent" },
  { value: "exempt", label: "Exempt (e.g., Student Property)" }
];

// Essential utilities options only
const billsOptions = [
  { value: "none", label: "Bills Not Included" },
  { value: "some", label: "Some Bills Included" },
  { value: "all", label: "All Bills Included" }
];

const AddRent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false); // Track successful submission
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentSection, setCurrentSection] = useState(1);
  const [isIntentionalSubmit, setIsIntentionalSubmit] = useState(false); // Add this to track intentional submissions
  const [isRemoving, setIsRemoving] = useState(false); // Prevent multiple simultaneous removals
  
  // Check if we're in edit mode
  const editMode = location.state?.editMode || false;
  const propertyData = location.state?.propertyData || null;
  const propertyId = propertyData?.id || null;
  const returnPath = location.state?.returnPath || '/seller';
  
  // Helper function to format date for input field
  const formatDateForInput = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
  };

  // Helper function to extract house number and street name from address
  const parseAddress = (address) => {
    if (!address) return { houseNumber: "", streetName: "" };
    
    // Try to split address into house number and street name
    const parts = address.trim().split(' ');
    if (parts.length === 0) return { houseNumber: "", streetName: "" };
    
    // If first part looks like a number or number+letter (e.g., "123", "45A"), treat it as house number
    const firstPart = parts[0];
    if (/^\d+[A-Za-z]*$/.test(firstPart)) {
      return {
        houseNumber: firstPart,
        streetName: parts.slice(1).join(' ')
      };
    }
    
    // Otherwise, put everything in street name
    return {
      houseNumber: "",
      streetName: address
    };
  };

  // Set initial form data based on edit mode
  const getInitialFormData = () => {
    if (editMode && propertyData) {
      const addressParts = parseAddress(propertyData.address_line1);
      
      return {
        // Property Details
        propertyTitle: propertyData.title || "",
        propertyType: propertyData.property_type || "",
        bedrooms: propertyData.bedrooms?.toString() || "",
        bathrooms: propertyData.bathrooms?.toString() || "",
        furnishedStatus: propertyData.furnished ? "furnished" : "unfurnished",
        weeklyRent: propertyData.weekly_rent ? propertyData.weekly_rent.toString() : "",
        monthlyRent: propertyData.monthly_rent ? propertyData.monthly_rent.toString() : "",
        depositAmount: propertyData.deposit_amount ? propertyData.deposit_amount.toString() : "",
        availableFrom: formatDateForInput(propertyData.availability_date),
        tenancyLength: propertyData.lease_term?.toString() || "",
        councilTaxBand: "", // This data might not be in the existing properties
        councilTaxStatus: "",
        
        // Location Information
        postcode: propertyData.zip_code || "",
        houseNumber: addressParts.houseNumber,
        streetName: addressParts.streetName,
        city: propertyData.city || "",
        region: propertyData.state || "",
        country: propertyData.country || "United Kingdom",
        
        // Property Features
        garden: propertyData.has_garden || false,
        parking: propertyData.parking_spaces > 0 || propertyData.has_garage || false,
        balconyTerrace: false, // This data might not be in existing properties
        billsIncluded: "none", // Default value
        petsAllowed: propertyData.pets_allowed || false,
        studentHousing: propertyData.student_housing || false,
        epcRating: "", // This data might not be in existing properties
        
        // Description & Media
        description: propertyData.description || "",
        photos: [],
        contactPhone: propertyData.contact_phone || ""
      };
    }
    
    // Default empty form data for new properties
    return {
      propertyTitle: "",
      propertyType: "",
      bedrooms: "",
      bathrooms: "",
      furnishedStatus: "",
      weeklyRent: "",
      monthlyRent: "",
      depositAmount: "",
      availableFrom: "",
      tenancyLength: "",
      councilTaxBand: "",
      councilTaxStatus: "",
      postcode: "",
      houseNumber: "",
      streetName: "",
      city: "",
      region: "",
      country: "",
      garden: false,
      parking: false,
      balconyTerrace: false,
      billsIncluded: "",
      petsAllowed: false,
      studentHousing: false,
      epcRating: "",
      description: "",
      photos: [],
      contactPhone: ""
    };
  };

  // Use different storage keys for new vs edit mode
  const storageKey = editMode ? `editRentForm_${propertyId}` : "addRentForm";
  const [formData, setFormData] = useSessionStorage(storageKey, getInitialFormData());
  
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [deletedExistingPhotos, setDeletedExistingPhotos] = useState([]); // Track deleted existing photos

  // Load existing property images if in edit mode
  useEffect(() => {
    if (editMode && propertyData && propertyData.images) {
      const imageUrls = propertyData.images.map((img, index) => {
        // Extract filename from URL for deletion matching
        const imageUrl = img.url || img.image_url;
        const filename = imageUrl.split('/').pop(); // Get the actual filename
        
        return {
          url: imageUrl,
          type: img.type || 'image/jpeg',
          name: filename, // Use actual filename instead of generic name
          originalUrl: imageUrl, // Keep original URL for backend matching
          size: 0,
          isExisting: true // Flag to identify existing images
        };
      });
      setPhotoPreviewUrls(imageUrls);
      console.log('📷 Loaded existing photos:', imageUrls);
    }
  }, [editMode, propertyData]);

  // Update form data when in edit mode
  useEffect(() => {
    if (editMode && propertyData) {
      setFormData(getInitialFormData());
    }
  }, [editMode, propertyData]);

  // Clear form data when creating a new property (not in edit mode)
  useEffect(() => {
    if (!editMode) {
      // Clear any existing form data from previous sessions
      const emptyFormData = getInitialFormData();
      setFormData(emptyFormData);
      setPhotoFiles([]);
      setPhotoPreviewUrls([]);
      setDeletedExistingPhotos([]); // Clear deleted photos list
      console.log('🆕 NEW PROPERTY MODE - Form cleared');
    }
  }, [editMode]);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      sessionStorage.setItem('redirectAfterLogin', '/addrent');
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  // Cleanup effect to remove edit session data when component unmounts
  useEffect(() => {
    return () => {
      // Only cleanup edit session data, not new property drafts
      if (editMode && propertyId) {
        const editStorageKey = `editRentForm_${propertyId}`;
        sessionStorage.removeItem(editStorageKey);
        console.log('🧹 CLEANUP - Removed edit session data');
      }
    };
  }, [editMode, propertyId]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    
    // Handle numeric inputs (weekly rent, monthly rent, deposit)
    if (name === "weeklyRent" || name === "monthlyRent" || name === "depositAmount") {
      // Allow only numbers and decimal points
      const numericValue = value.replace(/[^0-9.]/g, '');
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const removePhoto = (index) => {
    // Prevent multiple simultaneous removals
    if (isRemoving) {
      console.log('⚠️ Photo removal already in progress, ignoring duplicate call');
      return;
    }
    
    setIsRemoving(true);
    
    console.log('🗑️ REMOVE PHOTO CALLED - Index:', index, 'Total photos:', photoPreviewUrls.length);
    console.log('📸 Current photos before removal:', photoPreviewUrls.map((p, i) => `${i}: ${p.name} (${p.isExisting ? 'existing' : 'new'})`));
    
    const photoToRemove = photoPreviewUrls[index];
    console.log('📷 Photo to remove:', photoToRemove);
    
    if (!photoToRemove) {
      console.error('❌ Photo not found at index:', index);
      setIsRemoving(false);
      return;
    }
    
    if (photoToRemove.isExisting) {
      // Removing an existing photo - add to deleted list and remove from preview
      console.log('🗑️ Removing existing photo:', photoToRemove.name);
      
      // Check if photo is already in deleted list to prevent duplicates
      const isAlreadyDeleted = deletedExistingPhotos.some(p => p.name === photoToRemove.name);
      if (isAlreadyDeleted) {
        console.log('⚠️ Photo already in deleted list, skipping');
        setIsRemoving(false);
        return;
      }
      
      setDeletedExistingPhotos(prev => {
        const updated = [...prev, photoToRemove];
        console.log('✅ Added to deleted list. Total deleted:', updated.length);
        return updated;
      });
      
      // Remove from preview array
      setPhotoPreviewUrls(prev => {
        const newArray = prev.filter((photo, idx) => idx !== index);
        console.log('✅ Existing photo removed from preview. New length:', newArray.length);
        console.log('📸 Remaining photos:', newArray.map((p, i) => `${i}: ${p.name} (${p.isExisting ? 'existing' : 'new'})`));
        return newArray;
      });
    } else {
      // Removing a new upload - need to find the corresponding file in photoFiles
      console.log('🗑️ Removing new upload at index:', index);
      
      // Find all new photos before this index to calculate the correct photoFiles index
      let newPhotoIndex = -1;
      let newPhotoCount = 0;
      
      for (let i = 0; i <= index; i++) {
        if (photoPreviewUrls[i] && !photoPreviewUrls[i].isExisting) {
          if (i === index) {
            newPhotoIndex = newPhotoCount;
            break;
          }
          newPhotoCount++;
        }
      }
      
      console.log('📊 Photo removal calculation:', {
        targetIndex: index,
        newPhotoIndex: newPhotoIndex,
        totalPreviewUrls: photoPreviewUrls.length,
        totalPhotoFiles: photoFiles.length
      });
      
      // Revoke the object URL to avoid memory leaks
      if (photoToRemove.url && photoToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(photoToRemove.url);
      }
      
      // Remove from photoFiles array using the calculated index
      if (newPhotoIndex >= 0 && newPhotoIndex < photoFiles.length) {
        setPhotoFiles(prev => {
          const newArray = [...prev];
          newArray.splice(newPhotoIndex, 1);
          console.log('✅ New photo file removed from files array. New length:', newArray.length);
          return newArray;
        });
      }
      
      // Remove from preview array
      setPhotoPreviewUrls(prev => {
        const newArray = prev.filter((photo, idx) => idx !== index);
        console.log('✅ New photo removed from preview. New length:', newArray.length);
        console.log('📸 Remaining photos:', newArray.map((p, i) => `${i}: ${p.name} (${p.isExisting ? 'existing' : 'new'})`));
        return newArray;
      });
    }
    
    // Reset the removal flag
    console.log('🏁 Photo removal completed');
    setTimeout(() => setIsRemoving(false), 100);
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Check individual file sizes (1GB = 1024 * 1024 * 1024 bytes)
    const maxFileSize = 1024 * 1024 * 1024; // 1GB
    const oversizedFiles = files.filter(file => file.size > maxFileSize);
    
    if (oversizedFiles.length > 0) {
      alert(`Some files are too large. Maximum file size is 1GB per file.\nOversized files: ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }
    
    // Calculate current total (existing + new)
    const currentTotal = photoPreviewUrls.length;
    
    // Limit to 15 photos total
    if (currentTotal + files.length > 15) {
      alert(`You can upload a maximum of 15 photos total. You currently have ${currentTotal} photos.`);
      return;
    }
    
    // Check total size limit for new files only
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 15 * 1024 * 1024 * 1024; // 15GB total (15 files x 1GB each)
    
    if (totalSize > maxTotalSize) {
      alert(`Total file size too large. Maximum total size is 15GB for all files combined.`);
      return;
    }
    
    console.log('📷 Adding new photos:', files.length, 'Current total:', currentTotal);
    
    // Add new files to photoFiles array
    setPhotoFiles((prevFiles) => [...prevFiles, ...files]);
    
    // Create preview URLs for new files and add to preview array
    const newPreviewUrls = files.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type,
      name: file.name,
      size: file.size,
      isExisting: false // Flag to identify new uploads
    }));
    
    setPhotoPreviewUrls((prevUrls) => [...prevUrls, ...newPreviewUrls]);
  };

  const nextSection = () => {
    // Validate current section
    if (currentSection === 1) {
      const missingFields = [];
      
      // Check required fields (property title is NOT required, both weekly and monthly rent ARE required)
      if (!formData.propertyType) missingFields.push("Property Type");
      if (!formData.bedrooms) missingFields.push("Bedrooms");
      if (!formData.bathrooms) missingFields.push("Bathrooms");
      if (!formData.furnishedStatus) missingFields.push("Furnished Status");
      if (!formData.weeklyRent) missingFields.push("Weekly Rent");
      if (!formData.monthlyRent) missingFields.push("Monthly Rent");
      if (!formData.depositAmount) missingFields.push("Deposit Amount");
      if (!formData.availableFrom) missingFields.push("Available From");
      if (!formData.tenancyLength) missingFields.push("Tenancy Length");
      
      // These fields are required for new properties but optional for edits
      if (!editMode) {
        if (!formData.councilTaxBand) missingFields.push("Council Tax Band");
        if (!formData.councilTaxStatus) missingFields.push("Council Tax Status");
      }
      
      if (missingFields.length > 0) {
        alert(`Please fill in the following required fields: ${missingFields.join(", ")}`);
        return;
      }
    } else if (currentSection === 2) {
      const missingFields = [];
      
      if (!formData.postcode) missingFields.push("Postcode");
      if (!formData.houseNumber) missingFields.push("House Number");
      if (!formData.streetName) missingFields.push("Street Name");
      if (!formData.city) missingFields.push("City/Town");
      if (!formData.country) missingFields.push("Country");
      
      if (missingFields.length > 0) {
        alert(`Please fill in the following required fields: ${missingFields.join(", ")}`);
        return;
      }
    } else if (currentSection === 3) {
      const missingFields = [];
      
      // These fields are required for new properties but optional for edits
      if (!editMode) {
        if (!formData.billsIncluded) missingFields.push("Bills Included");
        if (!formData.epcRating) missingFields.push("EPC Rating");
      }
      
      if (missingFields.length > 0) {
        alert(`Please fill in the following required fields: ${missingFields.join(", ")}`);
        return;
      }
    }
    
    // For section 4, don't auto-advance - user needs to submit
    if (currentSection < 4) {
      setCurrentSection(prev => prev + 1);
    }
  };

  const prevSection = () => {
    setCurrentSection(prev => prev - 1);
  };

  // Handle intentional submit button click
  const handleIntentionalSubmit = () => {
    setIsIntentionalSubmit(true);
    // Trigger form submission programmatically
    setTimeout(() => {
      const form = document.querySelector('.property-form');
      if (form) {
        form.requestSubmit(); // This will trigger the handleSubmit function
      }
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent accidental submissions - only proceed if it's an intentional submit
    if (!isIntentionalSubmit) {
      console.log('⚠️ ACCIDENTAL FORM SUBMISSION PREVENTED - User was not ready to submit');
      return;
    }
    
    console.log('🚀 FORM SUBMISSION STARTED');
    console.log('📝 Edit Mode:', editMode);
    console.log('📝 Property ID:', propertyId);
    console.log('📝 Current Section:', currentSection);
    
    // Add a simple alert to confirm the function is being called
    if (editMode) {
      console.log('🔄 EDIT MODE DETECTED - Property ID:', propertyId);
      if (!propertyId) {
        console.error('❌ NO PROPERTY ID FOUND IN EDIT MODE');
        alert('Error: No property ID found for editing');
        return;
      }
    } else {
      console.log('➕ CREATE MODE DETECTED - New property submission');
    }
    
    // Check all required fields with relaxed validation for edit mode
    const missingFields = [];
    
    // Basic required fields for all modes
    if (!formData.propertyType) missingFields.push("Property Type");
    if (!formData.bedrooms) missingFields.push("Bedrooms");
    if (!formData.bathrooms) missingFields.push("Bathrooms");
    if (!formData.furnishedStatus) missingFields.push("Furnished Status");
    if (!formData.weeklyRent) missingFields.push("Weekly Rent");
    if (!formData.monthlyRent) missingFields.push("Monthly Rent");
    if (!formData.depositAmount) missingFields.push("Deposit Amount");
    if (!formData.availableFrom) missingFields.push("Available From");
    if (!formData.tenancyLength) missingFields.push("Tenancy Length");
    if (!formData.postcode) missingFields.push("Postcode");
    if (!formData.houseNumber) missingFields.push("House Number");
    if (!formData.streetName) missingFields.push("Street Name");
    if (!formData.city) missingFields.push("City/Town");
    if (!formData.country) missingFields.push("Country");
    if (!formData.description?.trim()) missingFields.push("Property Description");
    if (!formData.contactPhone?.trim()) missingFields.push("Contact Phone Number");
    
    // These fields are required for new properties but optional for edits (older properties might not have them)
    if (!editMode) {
      if (!formData.councilTaxBand) missingFields.push("Council Tax Band");
      if (!formData.councilTaxStatus) missingFields.push("Council Tax Status");
      if (!formData.billsIncluded) missingFields.push("Bills Included");
      if (!formData.epcRating) missingFields.push("EPC Rating");
    }
    
    // Check if photos/videos are uploaded (mandatory for new properties, optional for edits)
    const hasExistingPhotos = editMode && photoPreviewUrls.some(photoItem => photoItem.isExisting);
    const hasNewPhotos = photoFiles.length > 0;
    
    console.log('📷 Photo validation:', {
      editMode,
      hasExistingPhotos,
      hasNewPhotos,
      photoPreviewUrls: photoPreviewUrls.length,
      photoFiles: photoFiles.length,
      photoPreviewUrlsDetails: photoPreviewUrls.map(p => ({ name: p.name, isExisting: p.isExisting }))
    });
    
    if (!hasExistingPhotos && !hasNewPhotos) {
      missingFields.push("Photos or Videos");
    }
    
    console.log('✅ Validation check - Missing fields:', missingFields);
    
    if (missingFields.length > 0) {
      alert(`Please fill in the following required fields: ${missingFields.join(", ")}`);
      console.log('❌ FORM SUBMISSION STOPPED - Missing fields');
      return;
    }
    
    console.log('✅ All validations passed - Proceeding with submission');
    setError("");
    
    // Prevent double submissions
    if (isLoading) {
      console.log('⚠️ Already submitting, ignoring duplicate submission');
      return;
    }
    
    setIsLoading(true);

    try {
      // Create FormData to handle file uploads
      const submitFormData = new FormData();
      
      // Debug logging for rental prices
      console.log('🏠 AddRent Debug - Form Data Values:');
      console.log('Raw weeklyRent:', formData.weeklyRent, typeof formData.weeklyRent);
      console.log('Raw monthlyRent:', formData.monthlyRent, typeof formData.monthlyRent);
      
      // Map AddRent form fields to backend expected fields
      const fieldMapping = {
        // Basic property info
        title: formData.propertyTitle || `Property for Rent - ${formData.propertyType || 'Property'}`,
        propertyTitle: formData.propertyTitle || `Property for Rent - ${formData.propertyType || 'Property'}`,
        description: formData.description,
        category: 'rent', // Property category (rent/sale/lease)
        property_type: formData.propertyType, // Building type (flat/house/detached/etc)
        propertyType: formData.propertyType,
        
        // Address fields
        address_line1: `${formData.houseNumber} ${formData.streetName}`.trim(),
        streetAddress: `${formData.houseNumber} ${formData.streetName}`.trim(),
        house_number: formData.houseNumber,
        street_name: formData.streetName,
        city: formData.city,
        state: formData.region, // Map region to state
        region: formData.region, 
        zip_code: formData.postcode,
        postcode: formData.postcode,
        country: formData.country,
        
        // Property details
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        furnished: formData.furnishedStatus === 'furnished',
        furnishedStatus: formData.furnishedStatus,
        
        // Rental-specific fields
        weekly_rent: formData.weeklyRent ? parseFloat(formData.weeklyRent).toFixed(2) : null,
        weeklyRent: formData.weeklyRent ? parseFloat(formData.weeklyRent).toFixed(2) : null,
        monthly_rent: formData.monthlyRent ? parseFloat(formData.monthlyRent).toFixed(2) : null,
        monthlyRent: formData.monthlyRent ? parseFloat(formData.monthlyRent).toFixed(2) : null,
        deposit_amount: formData.depositAmount,
        depositAmount: formData.depositAmount,
        availability_date: formData.availableFrom,
        availableFrom: formData.availableFrom,
        lease_term: formData.tenancyLength,
        tenancyLength: formData.tenancyLength,
        
        // Contact information
        contact_phone: formData.contactPhone,
        contactPhone: formData.contactPhone,
        contact_email: user.email,
        contactEmail: user.email,
        contact_name: `${user.first_name} ${user.last_name}`,
        contactName: `${user.first_name} ${user.last_name}`,
        
        // Property features
        has_garden: formData.garden,
        garden: formData.garden,
        parking_spaces: formData.parking ? 1 : 0,
        parkingAvailable: formData.parking,
        pets_allowed: formData.petsAllowed,
        petsAllowed: formData.petsAllowed,
        
        // Additional rental fields
        councilTaxBand: formData.councilTaxBand,
        balconyTerrace: formData.balconyTerrace,
        billsIncluded: formData.billsIncluded,
        studentHousing: formData.studentHousing,
        epcRating: formData.epcRating
      };
      
      // Add all mapped fields to FormData
      Object.keys(fieldMapping).forEach(key => {
        if (fieldMapping[key] !== undefined && fieldMapping[key] !== null && fieldMapping[key] !== '') {
          // Convert numeric values to strings when adding to FormData
          if (typeof fieldMapping[key] === 'number') {
            submitFormData.append(key, fieldMapping[key].toString());
          } else {
            submitFormData.append(key, fieldMapping[key]);
          }
          
          // Debug log for rental prices
          if (key.includes('rent')) {
            console.log(`📝 Adding to FormData - ${key}:`, fieldMapping[key], typeof fieldMapping[key]);
          }
        }
      });
      
      // Add user information
      submitFormData.append('userEmail', user.email);
      submitFormData.append('userId', user.id);
      submitFormData.append('listingType', 'rent');
      
      // Add photos if any
      photoFiles.forEach((file, index) => {
        submitFormData.append('photos', file);
      });
      
      // In edit mode, handle existing photos (both deleted and kept)
      if (editMode) {
        // Send information about deleted existing photos
        if (deletedExistingPhotos.length > 0) {
          console.log('🗑️ DETAILED DELETION DEBUG:');
          console.log('🗑️ Total deletedExistingPhotos:', deletedExistingPhotos.length);
          deletedExistingPhotos.forEach((deletedPhoto, index) => {
            console.log(`🗑️ Deleted photo ${index}:`, {
              name: deletedPhoto.name,
              originalUrl: deletedPhoto.originalUrl,
              url: deletedPhoto.url,
              isExisting: deletedPhoto.isExisting
            });
            
            // Send the original URL or filename for better backend matching
            const photoIdentifier = deletedPhoto.originalUrl || deletedPhoto.url || deletedPhoto.name;
            submitFormData.append('deletedPhotos', photoIdentifier);
            console.log(`🗑️ Sending to backend: "${photoIdentifier}"`);
          });
          console.log('🗑️ All deleted photos to remove:', deletedExistingPhotos.map(p => p.originalUrl || p.url || p.name));
        }
        
        // CRITICAL: Send information about existing photos to KEEP
        const existingPhotosToKeep = photoPreviewUrls
          .filter(p => p.isExisting && !deletedExistingPhotos.some(d => d.name === p.name))
          .map(p => p.originalUrl || p.url);
        
        console.log('✅ PHOTOS TO KEEP DEBUG:');
        console.log('✅ Total existing photos in preview:', photoPreviewUrls.filter(p => p.isExisting).length);
        console.log('✅ Photos to delete:', deletedExistingPhotos.length);
        console.log('✅ Photos to keep:', existingPhotosToKeep.length);
        console.log('✅ Keep list:', existingPhotosToKeep);
        
        existingPhotosToKeep.forEach((url) => {
          submitFormData.append("keptPhotos", url);
          console.log(`✅ Keeping photo: "${url}"`);
        });
      }
      
      console.log('📷 Photo status for submission:', {
        editMode,
        totalPhotosToUpload: photoFiles.length,
        existingPhotosKept: photoPreviewUrls.filter(p => p.isExisting).length,
        newPhotosToAdd: photoFiles.length,
        photosToDelete: deletedExistingPhotos.length
      });
      
      console.log('Submitting rent property data...');
      
      // Debug logging
      console.log('FormData contents:');
      for (let [key, value] of submitFormData.entries()) {
        if (value instanceof File) {
          console.log(`${key}:`, `File - ${value.name} (${value.size} bytes)`);
        } else {
          console.log(`${key}:`, value);
        }
      }
      
      // Determine API endpoint and method based on edit mode
      const apiEndpoint = editMode 
        ? `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/properties/update/${propertyId}`
        : `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/properties/submit`;
      
      const httpMethod = editMode ? 'PUT' : 'POST';
      
      console.log(`🌐 API Call Details:`);
      console.log(`  - Endpoint: ${apiEndpoint}`);
      console.log(`  - Method: ${httpMethod}`);
      console.log(`  - Property ID: ${propertyId}`);
      console.log(`  - Edit Mode: ${editMode}`);
      
      console.log(`${editMode ? 'Updating' : 'Creating'} property...`);
      
      // Make API call to submit or update property
      const response = await fetch(apiEndpoint, {
        method: httpMethod,
        body: submitFormData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log(`📡 Response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server response error:', errorData);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Rent Property ${editMode ? 'Updated' : 'Submitted'} Successfully:`, result);
      
      if (editMode) {
        // For updates, show brief success state then redirect
        console.log('✅ UPDATE SUCCESS - Property updated, showing success animation...');
        setIsSubmitSuccess(true);
        setError("");
        
                  // Show success animation for 1.5 seconds then redirect
          setTimeout(() => {
            setIsLoading(false); // Stop loading state
            setSuccess("🎉 Property updated successfully! Redirecting...");
            
            // Wait another 1 second for user to see success message, then redirect
            setTimeout(() => {
              sessionStorage.removeItem(storageKey);
              // Add a flag to show the success message on dashboard (only if returning to dashboard)
              if (returnPath === '/dashboard') {
                sessionStorage.setItem('propertyUpdateSuccess', 'true');
                sessionStorage.setItem('updatedPropertyId', propertyId);
              }
              navigate(returnPath);
            }, 1000);
          }, 1500);
      } else {
        // For new submissions, show longer message
        setSuccess("🎉 Property submitted successfully! You will receive a confirmation email shortly. Redirecting to dashboard...");
        setError("");
        
        setTimeout(() => {
          sessionStorage.removeItem(storageKey);
          navigate("/dashboard");
        }, 4000); // Longer delay for new submissions
      }
      
    } catch (err) {
      console.error('❌ FORM SUBMISSION ERROR:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      setError(err.message || "Failed to submit property. Please try again.");
    } finally {
      console.log('🏁 FORM SUBMISSION FINISHED - Setting loading to false');
      // Don't set loading to false immediately for updates - wait for success animation
      if (!editMode) {
        setIsLoading(false);
      }
      setIsIntentionalSubmit(false); // Reset the intentional submit flag
    }
  };

  // Display UI based on current section
  const renderSection = () => {
    switch(currentSection) {
      case 1:
        return (
          <div className="form-section">
            <h3 className="section-title">Property Details</h3>
            
            {/* Title and Type Row */}
            <div className="form-row">
              <TextInput
                label="Property Title"
                name="propertyTitle"
                value={formData.propertyTitle}
                onChange={handleChange}
                placeholder="e.g. Modern 2-Bed Flat in Central London"
              />
              
              <SelectInput
                label="Property Type"
                name="propertyType"
                value={formData.propertyType}
                onChange={handleChange}
                options={propertyTypeOptions}
                required
              />
            </div>
            
            {/* Bedrooms, Bathrooms, and Furnished Status */}
            <div className="form-row three-cols">
              <SelectInput
                label="Bedrooms"
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleChange}
                options={bedroomOptions}
                required
              />
              
              <SelectInput
                label="Bathrooms"
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleChange}
                options={bathroomOptions}
                required
              />
              
              <SelectInput
                label="Furnished Status"
                name="furnishedStatus"
                value={formData.furnishedStatus}
                onChange={handleChange}
                options={furnishedOptions}
                required
              />
            </div>
            
            {/* Rent and Deposit Row */}
            <div className="form-row three-cols">
              <TextInput
                label="Weekly Rent (£)"
                name="weeklyRent"
                value={formData.weeklyRent}
                onChange={handleChange}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="450"
                className="muted-placeholder"
                required
              />
              
              <TextInput
                label="Monthly Rent (£)"
                name="monthlyRent"
                value={formData.monthlyRent}
                onChange={handleChange}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="1950"
                className="muted-placeholder"
                required
              />
              
              <TextInput
                label="Deposit Amount (£)"
                name="depositAmount"
                value={formData.depositAmount}
                onChange={handleChange}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="2000"
                required
                className="muted-placeholder"
              />
            </div>
            
            {/* Availability and Tenancy Row */}
            <div className="form-row">
              <DateInput
                label="Available From"
                name="availableFrom"
                value={formData.availableFrom}
                onChange={handleChange}
                placeholder="DD/MM/YYYY"
                required
              />
              
              <SelectInput
                label="Tenancy Length"
                name="tenancyLength"
                value={formData.tenancyLength}
                onChange={handleChange}
                options={tenancyLengthOptions}
                required
              />
            </div>
            
            {/* Council Tax Row */}
            <div className="form-row">
              <SelectInput
                label="Council Tax Band"
                name="councilTaxBand"
                value={formData.councilTaxBand}
                onChange={handleChange}
                options={councilTaxOptions}
                required
              />
              
              <SelectInput
                label="Council Tax Status"
                name="councilTaxStatus"
                value={formData.councilTaxStatus}
                onChange={handleChange}
                options={councilTaxStatusOptions}
                required
              />
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="form-section">
            <h3 className="section-title">Location Information</h3>
            
            {/* Address Line 1 */}
            <div className="form-row">
              <TextInput
                label="House Number"
                name="houseNumber"
                value={formData.houseNumber}
                onChange={handleChange}
                placeholder="123, Flat 2A"
                required
              />
              
              <TextInput
                label="Street Name"
                name="streetName"
                value={formData.streetName}
                onChange={handleChange}
                placeholder="Main Street, Oak Avenue"
                required
              />
            </div>
            
            {/* City, Country, Region Row */}
            <div className="form-row three-cols">
              <TextInput
                label="City/Town"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="London"
                required
                className="muted-placeholder"
              />
              
              <TextInput
                label="Country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="United Kingdom"
                required
                className="muted-placeholder"
              />
              
              <TextInput
                label="Region"
                name="region"
                value={formData.region}
                onChange={handleChange}
                placeholder="Greater London"
                className="muted-placeholder"
              />
            </div>
            
            {/* Postcode Row */}
            <div className="form-row single-col" style={{maxWidth: '300px'}}>
              <TextInput
                label="Postcode"
                name="postcode"
                value={formData.postcode}
                onChange={handleChange}
                placeholder="SW1A 1AA"
                required
              />
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="form-section">
            <h3 className="section-title">Property Features</h3>
            
            <div className="property-features">
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="garden" 
                  name="garden" 
                  checked={formData.garden}
                  onChange={handleChange}
                  className="checkbox-base"
                />
                <label htmlFor="garden">Garden</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="parking" 
                  name="parking" 
                  checked={formData.parking}
                  onChange={handleChange}
                  className="checkbox-base"
                />
                <label htmlFor="parking">Parking</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="balconyTerrace" 
                  name="balconyTerrace" 
                  checked={formData.balconyTerrace}
                  onChange={handleChange}
                  className="checkbox-base"
                />
                <label htmlFor="balconyTerrace">Balcony/Terrace</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="petsAllowed" 
                  name="petsAllowed" 
                  checked={formData.petsAllowed}
                  onChange={handleChange}
                  className="checkbox-base"
                />
                <label htmlFor="petsAllowed">Pets Allowed</label>
              </div>

              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="studentHousing" 
                  name="studentHousing" 
                  checked={formData.studentHousing}
                  onChange={handleChange}
                  className="checkbox-base"
                />
                <label htmlFor="studentHousing">Suitable for Students</label>
              </div>
            </div>
            
            <SelectInput
              label="Bills Included"
              name="billsIncluded"
              value={formData.billsIncluded}
              onChange={handleChange}
              options={billsOptions}
              required
            />
            
            <SelectInput 
              label="EPC Rating"
              name="epcRating"
              value={formData.epcRating}
              onChange={handleChange}
              options={epcRatingOptions}
              required
            />
          </div>
        );
      
      case 4:
        return (
          <div className="form-section">
            <h3 className="section-title">Property Description & Media</h3>
            
           <div className="form-group">
              <label htmlFor="description">Property Description*</label>
              <textarea
                id="description"
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                className="form-textarea"
                rows="6"
                placeholder="Provide a detailed description of your property..."
                required
              ></textarea>
            </div>
            

            
            <h4 className="subsection-title">Upload Photos & Videos*</h4>
            
            <div className="media-upload-section">
              <div className="upload-area">
                <label htmlFor="photoUpload" className="upload-label">
                  <div className="upload-content">
                    <div className="upload-icon">📷🎥</div>
                    <div className="upload-text">
                      <span>Drag & drop or click to upload</span>
                      <small>Photos & videos • Up to 15 files • Max 1GB each • REQUIRED</small>
                    </div>
                  </div>
                </label>
                <input
                  type="file"
                  id="photoUpload"
                  accept="image/*,video/*"
                  multiple
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </div>
              
              {photoPreviewUrls.length > 0 && (
                <>
                  <div className="media-grid">
                    {photoPreviewUrls.map((photoItem, index) => (
                      <div key={index} className="media-item">
                        <div className="media-content">
                          {/* Handle both existing images and new file uploads */}
                          {photoItem.isExisting ? (
                            <div className="image-container">
                              <img src={photoItem.url} alt={`Existing ${index + 1}`} />
                              <div className="media-type-badge">Existing Photo</div>
                            </div>
                          ) : photoItem.type?.startsWith('video/') ? (
                            <div className="video-container">
                              <video src={photoItem.url} controls>
                                Your browser does not support the video tag.
                              </video>
                              <div className="media-type-badge">Video</div>
                            </div>
                          ) : (
                            <div className="image-container">
                              <img src={photoItem.url} alt={`New ${index + 1}`} />
                              <div className="media-type-badge">New Photo</div>
                            </div>
                          )}
                        </div>
                        <button 
                          type="button" 
                          className="remove-media-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('🗑️ Remove button clicked for index:', index);
                            console.log('🗑️ Photo details:', photoItem);
                            removePhoto(index);
                            return false; // Extra prevention
                          }}
                          title="Remove file"
                        >
                          <span>×</span>
                        </button>
                        <div className="media-info">
                          <span className="media-name">
                            {photoItem.name}
                          </span>
                          <span className="media-size">
                            {photoItem.isExisting ? 'Existing' : `${(photoItem.size / 1024 / 1024).toFixed(2)} MB`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="media-summary">
                    <span className="file-count">{photoPreviewUrls.length} file(s) total</span>
                    <span className="total-size">
                      Existing: {photoPreviewUrls.filter(p => p.isExisting).length} | 
                      New: {photoPreviewUrls.filter(p => !p.isExisting).length} | 
                      New files size: {(photoFiles.reduce((total, file) => total + (file?.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </>
              )}
            </div>
            
            <h3 className="section-title">Contact Information</h3>
            <div className="form-group">
              <label htmlFor="contactPhone">Contact Phone Number*</label>
              <input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                value={formData.contactPhone}
                onChange={handleChange}
                placeholder="+44 7xxx xxx xxx"
                required
              />
              <small>Potential tenants will use this number to contact you about viewings</small>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="form-sale-container">
      {/* Title Section */}
      <div className="form-title">
        <div className="form-title-brand">
          <Logo />
        </div>
        <div className="form-title-add">
          {editMode ? 'EDIT RENTAL PROPERTY' : 'ADD PROPERTY FOR RENT'}
        </div>
        <ul className="form-title-find-link">
          <li><Link to="/seller">Back to Add Listing</Link></li>
        </ul>
      </div>

      {/* Progress Bar */}
      <div className="form-progress">
        <div className={`progress-step ${currentSection >= 1 ? 'active' : ''}`}>1</div>
        <div className={`progress-line ${currentSection >= 2 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentSection >= 2 ? 'active' : ''}`}>2</div>
        <div className={`progress-line ${currentSection >= 3 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentSection >= 3 ? 'active' : ''}`}>3</div>
        <div className={`progress-line ${currentSection >= 4 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentSection >= 4 ? 'active' : ''}`}>4</div>
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
        <form 
          onSubmit={handleSubmit} 
          className="property-form"
          onKeyDown={(e) => {
            // Prevent Enter key from submitting the form unless on the submit button
            if (e.key === 'Enter' && e.target.tagName !== 'BUTTON' && e.target.type !== 'submit') {
              e.preventDefault();
            }
          }}
        >
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          
          {renderSection()}

          {/* Navigation Buttons */}
          <div className="form-buttons">
            {currentSection > 1 ? (
              <button 
                type="button" 
                className="back-btn"
                onClick={prevSection}
                disabled={isLoading}
              >
                Back
              </button>
            ) : (
              <button 
                type="button" 
                className="back-btn"
                onClick={() => navigate(returnPath)}
                disabled={isLoading}
              >
                Cancel
              </button>
            )}
            
            {currentSection < 4 ? (
              <button 
                type="button" 
                className="next-btn"
                onClick={nextSection}
                disabled={isLoading}
              >
                Continue
              </button>
            ) : (
              <button 
                type="button" 
                className={`submit-btn ${isSubmitSuccess ? 'success-state' : ''}`}
                onClick={handleIntentionalSubmit}
                disabled={isLoading || isSubmitSuccess}
              >
                {isSubmitSuccess ? (
                  <span className="success-text">
                    ✅ Updated Successfully!
                  </span>
                ) : isLoading ? (
                  <span className="loading-text">
                    {editMode ? "Processing Update..." : "Submitting..."}
                  </span>
                ) : (
                  editMode ? "Submit Update" : "Submit Listing"
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRent; 