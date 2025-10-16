import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import Logo from "../components/Logo";
import "../styles/CrossBrowserReset.css";
import "../styles/AddLease.css";
import useSessionStorage from "../Utils/useSessionStorage";
import { useAuth } from "../context/AuthContext";
import ContactInformationSection from "../components/ContactInformationSection";
import CustomFeaturesInput from "../components/CustomFeaturesInput";

const leaseTypeOptions = [
  { value: "FRI", label: "FRI (Full Repairing & Insuring)" },
  { value: "IRL", label: "IRL (Internal Repairing Lease)" },
  { value: "Inclusive", label: "Inclusive (All costs included)" },
];

const spaceTypeOptions = [
  { value: "retail", label: "Retail" },
  { value: "office", label: "Office" },
  { value: "industrial", label: "Industrial" },
  { value: "land", label: "Land" },
  { value: "restaurant", label: "Restaurant" },
  { value: "special-purpose", label: "Special Purpose" },
];

const lotSizeUnitOptions = [
  { value: "acres", label: "Acres" },
  { value: "sqft", label: "Square Feet" },
  { value: "sqm", label: "Square Meters" },
];

const heatingCoolingOptions = [
  { value: "central", label: "Central HVAC" },
  { value: "individual", label: "Individual Units" },
  { value: "none", label: "None" },
];

const toiletKitchenOptions = [
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
  { value: "none", label: "None" },
];

const useClassOptions = [
  { value: "E", label: "Class E (Commercial / Business / Service)" },
  { value: "B2", label: "Class B2 (Industrial Processes)" },
  { value: "B8", label: "Class B8 (Storage / Distribution)" },
  { value: "Sui Generis", label: "Sui Generis (Unique Use – e.g., Pub, Takeaway, Gym)" },
];

const AddLease = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentSection, setCurrentSection] = useState(1);
  const [approvedPropertyNotification, setApprovedPropertyNotification] = useState(""); // Notification for approved property edits
  
  // Check if we're in edit mode
  const editMode = location.state?.editMode || false;
  const propertyData = location.state?.propertyData || null;
  const propertyId = propertyData?.id || null;
  const returnPath = location.state?.returnPath || '/seller';
  
  // Set notification for approved property edits
  useEffect(() => {
    if (editMode && propertyData?.status === 'approved') {
      setApprovedPropertyNotification(
        "⚠️ You are editing an approved property. After saving, it will require admin approval before being visible again."
      );
    }
  }, [editMode, propertyData]);

  // Helper function to format date for input field
  const formatDateForInput = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
  };

  // Helper function to combine house number and street name into full address
  const combineAddress = (houseNumber, streetName) => {
    const parts = [];
    
    if (houseNumber && houseNumber.trim()) {
      parts.push(houseNumber.trim());
    }
    
    if (streetName && streetName.trim()) {
      parts.push(streetName.trim());
    }
    
    return parts.join(' ');
  };

  // Helper function to extract house number and street name from address
  const parseAddress = (address) => {
    if (!address) return { houseNumber: "", streetName: "" };
    
    // Clean and trim the address
    const cleanAddress = address.trim();
    if (!cleanAddress) return { houseNumber: "", streetName: "" };
    
    // Try to extract house number and street name more intelligently
    // Handle various formats like:
    // "123 Main Street" -> house: "123", street: "Main Street"
    // "45A Oak Avenue" -> house: "45A", street: "Oak Avenue"
    // "Flat 2, 67 High Street" -> house: "Flat 2, 67", street: "High Street"
    // "Apartment 5B, Building 10, Park Road" -> house: "Apartment 5B, Building 10", street: "Park Road"
    
    // Pattern 1: Look for flat/apartment/unit designations followed by numbers and building numbers
    const flatPattern = /^((?:Flat|Apartment|Unit|Suite)\s+\d+[A-Za-z]*(?:,\s*\d+[A-Za-z]*)?)\s*,?\s*(.+)$/i;
    const flatMatch = cleanAddress.match(flatPattern);
    if (flatMatch) {
      return {
        houseNumber: flatMatch[1].trim(),
        streetName: flatMatch[2].trim()
      };
    }
    
    // Pattern 2: Look for simple number + letter combinations at the start
    const simplePattern = /^(\d+[A-Za-z]*)\s+(.+)$/;
    const simpleMatch = cleanAddress.match(simplePattern);
    if (simpleMatch) {
      return {
        houseNumber: simpleMatch[1],
        streetName: simpleMatch[2]
      };
    }
    
    // Pattern 3: Look for complex flat designations (e.g., "Flat 2A, 123 Main St")
    const complexFlatPattern = /^(Flat\s+\d+[A-Za-z]*),?\s*(\d+[A-Za-z]*)\s+(.+)$/i;
    const complexFlatMatch = cleanAddress.match(complexFlatPattern);
    if (complexFlatMatch) {
      return {
        houseNumber: `${complexFlatMatch[1]}, ${complexFlatMatch[2]}`,
        streetName: complexFlatMatch[3]
      };
    }
    
    // If no patterns match, put everything in street name
    return {
      houseNumber: "",
      streetName: cleanAddress
    };
  };

  // Set initial form data based on edit mode
  const getInitialFormData = () => {
    if (editMode && propertyData) {
      const addressParts = parseAddress(propertyData.address_line1);
      
      // Debug individual checkbox fields
      console.log('🔍 DEBUG - is_multiple_tenancy raw:', propertyData.is_multiple_tenancy, typeof propertyData.is_multiple_tenancy);
      console.log('🔍 DEBUG - break_clause raw:', propertyData.break_clause, typeof propertyData.break_clause);
      console.log('🔍 DEBUG - deposit_required raw:', propertyData.deposit_required, typeof propertyData.deposit_required);
      console.log('🔍 DEBUG - signage_allowed raw:', propertyData.signage_allowed, typeof propertyData.signage_allowed);
      console.log('🔍 DEBUG - disability_access raw:', propertyData.disability_access, typeof propertyData.disability_access);
      
      return {
        // Space Details
        spaceName: propertyData.title || "",
        spaceType: propertyData.property_type || "",
        totalArea: propertyData.square_feet?.toString() || "",
        description: propertyData.description || "",
        
        // Location Information
        postcode: propertyData.zip_code || "",
        houseNumber: addressParts.houseNumber,
        streetName: addressParts.streetName,
        city: propertyData.city || "",
        region: propertyData.state || "",
        country: propertyData.country || "United Kingdom",
        
        // Lease Details
        monthlyRent: propertyData.monthly_rent ? propertyData.monthly_rent.toString() : "",
        depositAmount: propertyData.deposit_amount ? propertyData.deposit_amount.toString() : "",
        availableFrom: formatDateForInput(propertyData.availability_date),
        leaseTerm: propertyData.lease_term?.toString() || "",
        breakClause: (() => {
          const result = propertyData.break_clause === true || propertyData.break_clause === 'true' || false;
          console.log('🔍 DEBUG - breakClause final value:', result);
          return result;
        })(),
        depositRequired: (() => {
          const result = propertyData.deposit_required === true || propertyData.deposit_required === 'true' || false;
          console.log('🔍 DEBUG - depositRequired final value:', result);
          return result;
        })(),
        leaseType: propertyData.lease_type || "",
        useClass: propertyData.use_class || "",
        
        // Building Details
        spaceSubtypes: propertyData.space_subtypes || "",
        minDivisible: propertyData.min_divisible || "",
        vacantSQFT: propertyData.vacant_sqft || "",
        landAcres: propertyData.land_acres || "",
        lotSizeUnit: propertyData.lot_size_unit || "",
        taxesPerSQFT: propertyData.taxes_per_sqft || "",
        parkingSpaces: propertyData.parking_spaces || "",
        power: propertyData.power || "",
        zoning: propertyData.zoning || "",
        serviceCharge: propertyData.service_charge || "",
        businessRates: propertyData.business_rates || "",
        floorLoadCapacity: propertyData.floor_load_capacity || "",
        heatingCooling: propertyData.heating_cooling || "",
        toiletKitchen: propertyData.toilet_kitchen || "",
        openingHours: propertyData.opening_hours || "",
        isMultipleTenancy: (() => {
          const result = propertyData.is_multiple_tenancy === true || propertyData.is_multiple_tenancy === 'true' || false;
          console.log('🔍 DEBUG - isMultipleTenancy final value:', result);
          return result;
        })(),
        signageAllowed: (() => {
          const result = propertyData.signage_allowed === true || propertyData.signage_allowed === 'true' || false;
          console.log('🔍 DEBUG - signageAllowed final value:', result);
          return result;
        })(),
        disabilityAccess: (() => {
          const result = propertyData.disability_access === true || propertyData.disability_access === 'true' || false;
          console.log('🔍 DEBUG - disabilityAccess final value:', result);
          return result;
        })(),
        
        // Space Features
        parking: propertyData.parking_spaces > 0 || propertyData.has_garage || false,
        loadingDock: propertyData.loading_dock || false,
        securitySystem: propertyData.security_system || false,
        airConditioning: propertyData.air_conditioning || false,
        furnished: propertyData.furnished || false,
        utilityAccess: propertyData.utility_access || false,
        
        // Media
        photos: [],
        contactPhone: propertyData.contact_phone || "",
        propertyConsultant: propertyData.property_consultant || "",
        
        // UK-specific fields
        epcRating: propertyData.epc_rating || "",
        vatOnRent: propertyData.vat_on_rent || "",
        repairingObligation: propertyData.repairing_obligation || "",
        insuranceResponsibility: propertyData.insurance_responsibility || "",
        rentReviewFrequency: propertyData.rent_review_frequency || "",
        
        // Parse utilities and security from JSON if they exist
        utilities: propertyData.utilities ? (() => {
          try {
            console.log('🔍 DEBUG - Raw utilities data:', propertyData.utilities, typeof propertyData.utilities);
            if (typeof propertyData.utilities === 'string') {
              const parsed = JSON.parse(propertyData.utilities);
              console.log('🔍 DEBUG - Parsed utilities:', parsed);
              return parsed;
            } else if (typeof propertyData.utilities === 'object') {
              console.log('🔍 DEBUG - Utilities already object:', propertyData.utilities);
              return propertyData.utilities;
            }
            return { water: false, gas: false, internet: false, electricity: false };
          } catch (e) {
            console.warn('Failed to parse utilities:', e);
            return { water: false, gas: false, internet: false, electricity: false };
          }
        })() : { water: false, gas: false, internet: false, electricity: false },
        
        security: propertyData.security ? (() => {
          try {
            console.log('🔍 DEBUG - Raw security data:', propertyData.security, typeof propertyData.security);
            if (typeof propertyData.security === 'string') {
              const parsed = JSON.parse(propertyData.security);
              console.log('🔍 DEBUG - Parsed security:', parsed);
              return parsed;
            } else if (typeof propertyData.security === 'object') {
              console.log('🔍 DEBUG - Security already object:', propertyData.security);
              return propertyData.security;
            }
            return { cctv: false, keyFob: false, secureAccess: false };
          } catch (e) {
            console.warn('Failed to parse security:', e);
            return { cctv: false, keyFob: false, secureAccess: false };
          }
        })() : { cctv: false, keyFob: false, secureAccess: false },
        
        // Custom Features
        customFeatures: propertyData.custom_features ? (() => {
          try {
            if (typeof propertyData.custom_features === 'string') {
              return JSON.parse(propertyData.custom_features);
            } else if (Array.isArray(propertyData.custom_features)) {
              return propertyData.custom_features;
            }
            return [];
          } catch (e) {
            console.warn('Failed to parse custom features:', e);
            return [];
          }
        })() : []
      };
    }
    
    // Default empty form data for new leases
    return {
      spaceName: "",
      spaceType: "",
      totalArea: "",
      description: "",
      postcode: "",
      houseNumber: "",
      streetName: "",
      city: "",
      region: "",
      country: "United Kingdom",
      monthlyRent: "",
      depositAmount: "",
      availableFrom: "",
      leaseTerm: "",
      breakClause: false,
      depositRequired: false,
      leaseType: "",
      useClass: "",
      
      // Building Details
      spaceSubtypes: "",
      minDivisible: "",
      vacantSQFT: "",
      landAcres: "",
      lotSizeUnit: "",
      taxesPerSQFT: "",
      parkingSpaces: "",
      power: "",
      zoning: "",
      serviceCharge: "",
      businessRates: "",
      floorLoadCapacity: "",
      heatingCooling: "",
      toiletKitchen: "",
      openingHours: "",
      isMultipleTenancy: false,
      signageAllowed: false,
      disabilityAccess: false,
      
      // Space Features
      parking: false,
      loadingDock: false,
      securitySystem: false,
      airConditioning: false,
      furnished: false,
      utilityAccess: false,
      photos: [],
      contactPhone: user?.phone || "", // Auto-populate with user's profile phone
      propertyConsultant: "",
      
      // UK-specific fields
      epcRating: "",
      vatOnRent: "",
      repairingObligation: "",
      insuranceResponsibility: "",
      rentReviewFrequency: "",
      
      utilities: {
        water: false,
        gas: false,
        internet: false,
        electricity: false
      },
      security: {
        cctv: false,
        keyFob: false,
        secureAccess: false
      },
      
      // Custom Features
      customFeatures: []
    };
  };

  // Use different storage keys for new vs edit mode
  const storageKey = editMode ? `editLeaseForm_${propertyId}` : "addLeaseForm";
  const [formData, setFormData] = useSessionStorage(storageKey, getInitialFormData());
  
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [floorPlanFile, setFloorPlanFile] = useState(null);
  const [epcDocumentFile, setEpcDocumentFile] = useState(null);

  // Load existing property images if in edit mode
  useEffect(() => {
    if (editMode && propertyData && propertyData.images) {
      const imageUrls = propertyData.images.map((img, index) => ({
        url: img.url || img.image_url,
        type: img.type || 'image/jpeg',
        name: `existing-image-${index}`,
        size: 0,
        isExisting: true // Flag to identify existing images
      }));
      setPhotoPreviewUrls(imageUrls);
    }
  }, [editMode, propertyData]);

  // Load existing layout and EPC document files if in edit mode
  useEffect(() => {
    if (editMode && propertyData) {
      // Load existing layout file if it exists
      if (propertyData.layout_file_name && propertyData.layout_file_url) {
        // Create a mock file object for existing layout file
        const existingLayoutFile = {
          name: propertyData.layout_file_name,
          url: propertyData.layout_file_url,
          type: propertyData.layout_file_name.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg',
          isExisting: true
        };
        setFloorPlanFile(existingLayoutFile);
      }

      // Load existing EPC document if it exists
      if (propertyData.epc_document_name && propertyData.epc_document_url) {
        // Create a mock file object for existing EPC document
        const existingEpcFile = {
          name: propertyData.epc_document_name,
          url: propertyData.epc_document_url,
          type: propertyData.epc_document_name.toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg',
          isExisting: true
        };
        setEpcDocumentFile(existingEpcFile);
      }
    }
  }, [editMode, propertyData]);

  // Update form data when in edit mode
  useEffect(() => {
    if (editMode && propertyData) {
      const initialData = getInitialFormData();
      console.log('🔍 DEBUG - Initial form data utilities:', initialData.utilities);
      console.log('🔍 DEBUG - Initial form data security:', initialData.security);
      setFormData(initialData);
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
      console.log('🆕 NEW LEASE MODE - Form cleared');
    }
  }, [editMode]);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      sessionStorage.setItem('redirectAfterLogin', '/addlease');
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  // Cleanup effect to remove edit session data when component unmounts
  useEffect(() => {
    return () => {
      // Only cleanup edit session data, not new property drafts
      if (editMode && propertyId) {
        const editStorageKey = `editLeaseForm_${propertyId}`;
        sessionStorage.removeItem(editStorageKey);
        console.log('🧹 CLEANUP - Removed lease edit session data');
      }
    };
  }, [editMode, propertyId]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    const isUtility = ["water", "gas", "internet", "electricity"].includes(name);
    const isSecurity = ["cctv", "keyFob", "secureAccess"].includes(name);

    if (isUtility) {
      console.log('🔍 DEBUG - Utility checkbox changed:', name, checked);
      setFormData((prev) => ({
        ...prev,
        utilities: { ...prev.utilities, [name]: checked },
      }));
    } else if (isSecurity) {
      console.log('🔍 DEBUG - Security checkbox changed:', name, checked);
      setFormData((prev) => ({
        ...prev,
        security: { ...prev.security, [name]: checked },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
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
    
    if (photoFiles.length + files.length > 15) {
      alert("You can upload a maximum of 15 files");
      return;
    }
    
    // Check total size limit
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 15 * 1024 * 1024 * 1024; // 15GB total (15 files x 1GB each)
    
    if (totalSize > maxTotalSize) {
      alert(`Total file size too large. Maximum total size is 15GB for all files combined.`);
      return;
    }
    
    setPhotoFiles(prevFiles => [...prevFiles, ...files]);
    
    const newPreviewUrls = files.map(file => URL.createObjectURL(file));
    setPhotoPreviewUrls(prevUrls => [...prevUrls, ...newPreviewUrls]);
  };

  const removePhoto = (index) => {
    const newPhotoFiles = [...photoFiles];
    const newPhotoPreviewUrls = [...photoPreviewUrls];
    
    URL.revokeObjectURL(photoPreviewUrls[index]);
    
    newPhotoFiles.splice(index, 1);
    newPhotoPreviewUrls.splice(index, 1);
    
    setPhotoFiles(newPhotoFiles);
    setPhotoPreviewUrls(newPhotoPreviewUrls);
  };

  // Floor plan handler
  const handleFloorPlanChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const maxSize = 512 * 1024 * 1024; // 512MB
      if (file.size > maxSize) {
        alert('File is too large. Maximum size is 512MB.');
        return;
      }
      setFloorPlanFile(file);
    }
  };

  // EPC document handler
  const handleEpcDocumentChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const maxSize = 512 * 1024 * 1024; // 512MB
      if (file.size > maxSize) {
        alert('File is too large. Maximum size is 512MB.');
        return;
      }
      setEpcDocumentFile(file);
    }
  };

  // Validation functions for each step
  const validateStep1 = () => {
    const requiredFields = ["spaceType", "spaceName", "city", "postcode", "houseNumber", "streetName", "country", "totalArea"];
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field].toString().trim() === '');
    
    if (missingFields.length > 0) {
      const fieldNames = missingFields.map(f => {
        switch(f) {
          case 'spaceType': return 'Space Type';
          case 'spaceName': return 'Space Name';
          case 'city': return 'City';
          case 'postcode': return 'Postal Code';
          case 'houseNumber': return 'House Number / Unit';
          case 'streetName': return 'Street Name';
          case 'country': return 'Country';
          case 'totalArea': return 'Building Size';
          default: return f;
        }
      });
      alert(`❌ Please complete the following required fields:\n${fieldNames.join('\n')}`);
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const requiredFields = ["leaseTerm", "monthlyRent"];
    // Only require useClass for new properties, not edits
    if (!editMode) {
      requiredFields.push("useClass");
    }
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      alert(`❌ Please complete the following required fields: ${missingFields.join(', ')}`);
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.description || !formData.description.trim()) {
      alert("❌ Please provide a property description");
      return false;
    }
    
    // Check photos/videos (mandatory for new properties, optional for edits if existing photos)
    const hasExistingPhotos = editMode && photoPreviewUrls && photoPreviewUrls.some(url => url.isExisting);
    const hasNewPhotos = photoFiles && photoFiles.length > 0;
    
    if (!editMode && !hasNewPhotos) {
      alert("❌ Please upload at least one photo or video");
      return false;
    }
    
    // In edit mode, allow submission even without new photos if existing photos exist
    if (editMode && !hasExistingPhotos && !hasNewPhotos) {
      alert("❌ Please upload at least one photo or video");
      return false;
    }
    
    return true;
  };

  // Navigation functions
  const goToNextStep = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('📍 goToNextStep called from section:', currentSection);
    
    let isValid = false;
    
    switch(currentSection) {
      case 1:
        isValid = validateStep1();
        break;
      case 2:
        isValid = validateStep2();
        break;
      case 3:
        isValid = validateStep3();
        break;
      default:
        isValid = true;
    }
    
    if (isValid) {
      const nextSection = currentSection + 1;
      console.log('✅ Validation passed, moving to section:', nextSection);
      setCurrentSection(nextSection);
      window.scrollTo(0, 0);
    } else {
      console.log('❌ Validation failed, staying on section:', currentSection);
    }
    
    return false; // Prevent any form submission
  };

  const goToPrevStep = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('◀️ Going back from section:', currentSection);
    setCurrentSection(prev => prev - 1);
    window.scrollTo(0, 0);
    
    return false; // Prevent any form submission
  };

  // Final form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // CRITICAL: Prevent premature submission - only allow on Step 3
    if (currentSection < 3) {
      console.error('❌ SUBMISSION BLOCKED - Current section:', currentSection, '(Must be on section 3)');
      alert('⚠️ Please complete all steps before submitting.\n\nCurrent Step: ' + currentSection + '\nRequired Step: 3');
      return false;
    }
    
    console.log('✅ Submission allowed - on Step 3');
    
    if (!validateStep3()) {
      return;
    }
    
    setError("");
    setIsLoading(true);

    try {
      // Create FormData to handle file uploads
      const submitFormData = new FormData();
      
      // Map AddLease form fields to backend expected fields
      const fieldMapping = {
        // Basic property info
        title: formData.spaceName, // Map spaceName to title for backend
        propertyTitle: formData.spaceName, // Alternative field name
        description: formData.description,
        category: 'lease', // Property category (rent/sale/lease)
        property_type: formData.spaceType, // Building/space type
        propertyType: formData.spaceType,
        
        // Address fields
        address_line1: combineAddress(formData.houseNumber, formData.streetName),
        streetAddress: combineAddress(formData.houseNumber, formData.streetName),
        house_number: formData.houseNumber,
        street_name: formData.streetName,
        city: formData.city,
        state: '', // Not collected in lease form
        region: '', 
        zip_code: formData.postcode,
        postcode: formData.postcode,
        country: formData.country,
        
        // Lease-specific fields
        monthly_rent: formData.monthlyRent,
        rentalPrice: formData.monthlyRent,
        lease_term: formData.leaseTerm,
        tenancyLength: formData.leaseTerm,
        deposit_amount: formData.depositAmount,
        depositAmount: formData.depositAmount,
        
        // Building details
        square_feet: formData.totalArea,
        lot_size: '', // Not used for commercial lease properties
        parking_spaces: formData.parkingSpaces || (formData.parking ? 1 : 0),
        
        // Contact information
        contact_phone: formData.contactPhone,
        contactPhone: formData.contactPhone,
        contact_email: user.email,
        contactEmail: user.email,
        contact_name: `${user.first_name} ${user.last_name}`,
        contactName: `${user.first_name} ${user.last_name}`,
        
        // Additional lease fields
        spaceType: formData.spaceType,
        spaceSubtypes: formData.spaceSubtypes,
        leaseType: formData.leaseType,
        useClass: formData.useClass,
        minDivisible: formData.minDivisible,
        vacantSQFT: formData.vacantSQFT,
        landAcres: formData.landAcres,
        lotSizeUnit: formData.lotSizeUnit,
        taxesPerSQFT: formData.taxesPerSQFT,
        power: formData.power,
        zoning: formData.zoning,
        serviceCharge: formData.serviceCharge,
        businessRates: formData.businessRates,
        floorLoadCapacity: formData.floorLoadCapacity,
        heatingCooling: formData.heatingCooling,
        toiletKitchen: formData.toiletKitchen,
        openingHours: formData.openingHours,
        
        // Boolean fields
        isMultipleTenancy: formData.isMultipleTenancy,
        breakClause: formData.breakClause,
        depositRequired: formData.depositRequired,
        parkingAvailable: formData.parking,
        disabilityAccess: formData.disabilityAccess,
        signageAllowed: formData.signageAllowed,
        
        // JSON fields
        utilities: JSON.stringify(formData.utilities),
        security: JSON.stringify(formData.security),
        custom_features: JSON.stringify(formData.customFeatures),
        customFeatures: JSON.stringify(formData.customFeatures),
        
        // UK-specific fields
        epc_rating: formData.epcRating,
        epcRating: formData.epcRating,
        vat_on_rent: formData.vatOnRent,
        vatOnRent: formData.vatOnRent,
        repairing_obligation: formData.repairingObligation,
        repairingObligation: formData.repairingObligation,
        insurance_responsibility: formData.insuranceResponsibility,
        insuranceResponsibility: formData.insuranceResponsibility,
        rent_review_frequency: formData.rentReviewFrequency,
        rentReviewFrequency: formData.rentReviewFrequency
      };
      
      // Debug logging
      console.log('🔍 Form Data before mapping:', {
        spaceName: formData.spaceName,
        description: formData.description,
        contactPhone: formData.contactPhone
      });
      console.log('🔍 Field mapping title value:', fieldMapping.title);
      console.log('🔍 Is title value truthy?', !!fieldMapping.title);
      
      // Add all mapped fields to FormData
      Object.keys(fieldMapping).forEach(key => {
        if (fieldMapping[key] !== undefined && fieldMapping[key] !== null && fieldMapping[key] !== '') {
          submitFormData.append(key, fieldMapping[key]);
        }
      });
      
      // Add user information
      submitFormData.append('userEmail', user.email);
      submitFormData.append('userId', user.id);
      submitFormData.append('listingType', 'lease');
      
      // Handle status for approved properties being edited
      if (editMode && propertyData?.status === 'approved') {
        // Change status to pending for admin review
        submitFormData.append('status', 'pending');
        console.log('🔄 Approved property being edited - Status changed to pending for admin review');
      }
      
      // Add photos if any (NEW photos only)
      if (photoFiles && photoFiles.length > 0) {
        photoFiles.forEach((file, index) => {
          submitFormData.append('photos', file);
        });
      }
      
      // In edit mode, also send list of existing photos to keep
      if (editMode) {
        const existingPhotos = photoPreviewUrls.filter(p => p.isExisting).map(p => p.url);
        if (existingPhotos.length > 0) {
          submitFormData.append('keptPhotos', JSON.stringify(existingPhotos));
        }
      }
      
      // Add floor plan if any
      if (floorPlanFile) {
        submitFormData.append('floorPlan', floorPlanFile);
      }
      
      // Add EPC document if any
      if (epcDocumentFile) {
        submitFormData.append('epcDocument', epcDocumentFile);
      }
      
      // Debug utilities and security data
      console.log('🔍 DEBUG - Utilities data:', formData.utilities);
      console.log('🔍 DEBUG - Security data:', formData.security);
      console.log('🔍 DEBUG - Utilities JSON:', JSON.stringify(formData.utilities));
      console.log('🔍 DEBUG - Security JSON:', JSON.stringify(formData.security));
      
      console.log('Submitting lease property data...');
      
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
      
      console.log(`${editMode ? 'Updating' : 'Creating'} lease property...`);
      
      // Make API call to submit or update property
      const response = await fetch(apiEndpoint, {
        method: httpMethod,
        body: submitFormData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server response error:', errorData);
        console.error('Response status:', response.status);
        console.error('Response statusText:', response.statusText);
        throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`✅ Lease Property ${editMode ? 'Updated' : 'Submitted'} Successfully:`, result);
      
      const successMessage = editMode 
        ? "Property updated successfully!" 
        : "Property submitted successfully! You will receive a confirmation email shortly.";
      
      setSuccess(successMessage);
      
      // Set success flags for dashboard if updating and returning to dashboard
      if (editMode && returnPath === '/dashboard') {
        sessionStorage.setItem('propertyUpdateSuccess', 'true');
        sessionStorage.setItem('updatedPropertyId', propertyData.id);
      }
      
      // Clear form data and redirect after short delay
      setTimeout(() => {
        sessionStorage.removeItem(storageKey);
        navigate(editMode ? returnPath : "/dashboard");
      }, 2000);
      
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || "Failed to submit property. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Render functions for each step
  const renderStep1 = () => (
    <>
      <h3 className="section-title">Basic Space Info</h3>

      <div className="form-row">
        <SelectInput label="Space Type*" name="spaceType" value={formData.spaceType} onChange={handleChange} options={spaceTypeOptions} />
        <TextInput label="Space Subtypes" name="spaceSubtypes" value={formData.spaceSubtypes} onChange={handleChange} placeholder="e.g., Warehouse, Showroom" />
        <TextInput label="Space Name*" name="spaceName" value={formData.spaceName} onChange={handleChange} placeholder="e.g., Unit 5A Business Park" />
      </div>

      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '10px 12px',
        backgroundColor: '#f3f4f6',
        borderRadius: '6px',
        width: 'fit-content'
      }}>
        <CheckboxInput 
          label="Multiple Tenancy" 
          name="isMultipleTenancy" 
          checked={(() => {
            console.log('🔍 DEBUG - Rendering Multiple Tenancy:', formData.isMultipleTenancy);
            return formData.isMultipleTenancy;
          })()} 
          onChange={handleChange} 
        />
      </div>

      {/* City and Postcode are REQUIRED - always visible */}
      <div className="form-row">
        <TextInput label="City*" name="city" value={formData.city} onChange={handleChange} placeholder="e.g., London" />
        <TextInput label="Postal Code*" name="postcode" value={formData.postcode} onChange={handleChange} placeholder="e.g., SW1A 1AA" />
      </div>

      <div className="form-row">
        <TextInput 
          label="House Number / Unit*" 
          name="houseNumber" 
          value={formData.houseNumber} 
          onChange={handleChange} 
          placeholder="123 or Unit 2A, 67" 
        />
        <TextInput 
          label="Street Name*" 
          name="streetName" 
          value={formData.streetName} 
          onChange={handleChange} 
          placeholder="Industrial Estate" 
        />
      </div>
      
      <div className="form-row">
        <TextInput label="Country*" name="country" value={formData.country} onChange={handleChange} placeholder="e.g., United Kingdom" />
      </div>

      <h3 className="section-title">Building Details</h3>
      <div className="form-row">
        <TextInput label="Building Size (sqft)*" name="totalArea" value={formData.totalArea} onChange={handleChange} type="number" placeholder="e.g., 5000" />
        <TextInput label="Min Divisible (sqft)" name="minDivisible" value={formData.minDivisible} onChange={handleChange} type="number" placeholder="e.g., 1000" />
        <TextInput label="Vacant SQFT*" name="vacantSQFT" value={formData.vacantSQFT} onChange={handleChange} type="number" placeholder="e.g., 3000" />
      </div>

      <div className="form-row">
        <TextInput label="Land Acres" name="landAcres" value={formData.landAcres} onChange={handleChange} type="number" placeholder="e.g., 2.5" />
        <TextInput label="Lot Size" name="leaseTerm" value={formData.leaseTerm} onChange={handleChange} type="number" placeholder="e.g., 10000" />
        <SelectInput label="Lot Size Unit" name="lotSizeUnit" value={formData.lotSizeUnit} onChange={handleChange} options={lotSizeUnitOptions} />
      </div>

      <h3 className="section-title">Building Specs</h3>
      <div className="form-row">
        <TextInput label="Taxes (per sqft)" name="taxesPerSQFT" value={formData.taxesPerSQFT} onChange={handleChange} type="number" placeholder="e.g., 2.50" />
        <TextInput label="Parking Spaces" name="parkingSpaces" value={formData.parkingSpaces} onChange={handleChange} type="number" placeholder="e.g., 10" />
        <TextInput label="Power" name="power" value={formData.power} onChange={handleChange} placeholder="e.g., 3-phase, 100 amp" />
      </div>

      <h3 className="section-title">Location Info</h3>
      <div className="form-row">
        <TextInput label="Zoning (Use Class)" name="zoning" value={formData.zoning} onChange={handleChange} placeholder="e.g., B2, B8, Class E" />
        <SelectInput label="Lease Type*" name="leaseType" value={formData.leaseType} onChange={handleChange} options={leaseTypeOptions} />
      </div>
    </>
  );

  const renderStep2 = () => (
    <>
      <h3 className="section-title">Lease Terms</h3>

      <div className="form-row">
        <TextInput
          type="number"
          label="Lease Length (years)*"
          name="leaseTerm"
          value={formData.leaseTerm}
          onChange={handleChange}
          placeholder="e.g., 5"
        />
        <TextInput
          type="number"
          label="Rent per Month (£)*"
          name="monthlyRent"
          value={formData.monthlyRent}
          onChange={handleChange}
          placeholder="e.g., 2500"
        />
        <TextInput
          type="number"
          label="Service Charge (£)"
          name="serviceCharge"
          value={formData.serviceCharge}
          onChange={handleChange}
          placeholder="e.g., 150"
        />
      </div>

      <div className="form-row" style={{ marginTop: '12px' }}>
        <CheckboxInput
          label="Break Clause"
          name="breakClause"
          checked={(() => {
            console.log('🔍 DEBUG - Rendering Break Clause:', formData.breakClause);
            return formData.breakClause;
          })()}
          onChange={handleChange}
        />
        <CheckboxInput
          label="Deposit Required"
          name="depositRequired"
          checked={(() => {
            console.log('🔍 DEBUG - Rendering Deposit Required:', formData.depositRequired);
            return formData.depositRequired;
          })()}
          onChange={handleChange}
        />
      </div>

      {formData.depositRequired && (
        <TextInput
          type="number"
          label="Deposit Amount (£)"
          name="depositAmount"
          value={formData.depositAmount}
          onChange={handleChange}
        />
      )}

      <div className="form-row">
        <TextInput
          type="number"
          label="Business Rates (£)"
          name="businessRates"
          value={formData.businessRates}
          onChange={handleChange}
        />
        <TextInput
          type="number"
          label="Floor Loading Capacity"
          name="floorLoadCapacity"
          value={formData.floorLoadCapacity}
          onChange={handleChange}
        />
      </div>

      {/* ---------- NEW UK FIELDS BELOW ---------- */}

      <h3 className="section-title">Financial Details</h3>
      <div className="form-row">
        <SelectInput
          label="VAT on Rent"
          name="vatOnRent"
          value={formData.vatOnRent}
          onChange={handleChange}
          options={[
            { value: "included", label: "Included in Rent" },
            { value: "excluded", label: "Excludes VAT" },
            { value: "not-applicable", label: "Not Applicable" },
          ]}
        />

        <TextInput
          label="Rent Review Frequency (Years)"
          name="rentReviewFrequency"
          value={formData.rentReviewFrequency}
          onChange={handleChange}
          type="number"
        />
      </div>

      <div className="form-row">
        <SelectInput
          label="Repairing Obligations"
          name="repairingObligation"
          value={formData.repairingObligation}
          onChange={handleChange}
          options={[
            { value: "full-repairing", label: "Full Repairing (Tenant Responsible)" },
            { value: "internal-only", label: "Internal Repairs Only" },
            { value: "landlord", label: "Landlord Responsible" },
          ]}
        />

        <SelectInput
          label="Insurance Responsibility"
          name="insuranceResponsibility"
          value={formData.insuranceResponsibility}
          onChange={handleChange}
          options={[
            { value: "landlord", label: "Landlord Insures Building" },
            { value: "tenant", label: "Tenant Insures" },
            { value: "shared", label: "Shared Responsibility" },
          ]}
        />
      </div>

      <h3 className="section-title">Compliance & Certification</h3>
      <div className="form-row">
        <SelectInput
          label="EPC Rating*"
          name="epcRating"
          value={formData.epcRating}
          onChange={handleChange}
          options={[
            { value: "A", label: "A (Most Efficient)" },
            { value: "B", label: "B" },
            { value: "C", label: "C" },
            { value: "D", label: "D" },
            { value: "E", label: "E" },
            { value: "F", label: "F" },
            { value: "G", label: "G (Least Efficient)" },
          ]}
        />
      </div>

      <h3 className="section-title">Features & Utilities</h3>
      <div className="checkbox-group">
        {Object.keys(formData.utilities).map((util) => {
          console.log(`🔍 DEBUG - Rendering utility ${util}:`, formData.utilities[util]);
          return (
            <CheckboxInput
              key={util}
              label={`Includes ${util.charAt(0).toUpperCase() + util.slice(1)}`}
              name={util}
              checked={formData.utilities[util]}
              onChange={handleChange}
            />
          );
        })}
      </div>

      <div className="form-row">
        <SelectInput
          label="Heating/Cooling"
          name="heatingCooling"
          value={formData.heatingCooling}
          onChange={handleChange}
          options={heatingCoolingOptions}
        />
        <SelectInput
          label="Toilets/Kitchen"
          name="toiletKitchen"
          value={formData.toiletKitchen}
          onChange={handleChange}
          options={toiletKitchenOptions}
        />
      </div>

      <h3 className="section-title">Security & Access</h3>
      <div className="checkbox-group">
        {Object.keys(formData.security).map((sec) => {
          console.log(`🔍 DEBUG - Rendering security ${sec}:`, formData.security[sec]);
          return (
            <CheckboxInput
              key={sec}
              label={sec === "keyFob" ? "Key Fob Access" : sec.charAt(0).toUpperCase() + sec.slice(1)}
              name={sec}
              checked={formData.security[sec]}
              onChange={handleChange}
            />
          );
        })}
        <CheckboxInput
          label="Parking Available"
          name="parking"
          checked={formData.parking}
          onChange={handleChange}
        />
        <CheckboxInput
          label="Disability Access"
          name="disabilityAccess"
          checked={(() => {
            console.log('🔍 DEBUG - Rendering Disability Access:', formData.disabilityAccess);
            return formData.disabilityAccess;
          })()}
          onChange={handleChange}
        />
      </div>

      <h3 className="section-title" style={{ marginTop: '12px' }}>Use and Regulations</h3>
      <div className="form-row">
        <SelectInput
          label="Permitted Use (Use Class)*"
          name="useClass"
          value={formData.useClass}
          onChange={handleChange}
          options={useClassOptions}
        />
        <TextInput
          label="Opening Hours Allowed"
          name="openingHours"
          value={formData.openingHours}
          onChange={handleChange}
        />
      </div>
      <p className="help-text" style={{ fontSize: "12px", color: "#10b981", marginTop: "4px", marginBottom: "8px" }}>
        <em>Use Class defines permitted business activity — e.g., Class E for offices/shops, B2 for manufacturing, B8 for warehousing.</em>
      </p>

      <CheckboxInput
        label="Signage Allowed"
        name="signageAllowed"
        checked={(() => {
          console.log('🔍 DEBUG - Rendering Signage Allowed:', formData.signageAllowed);
          return formData.signageAllowed;
        })()}
        onChange={handleChange}
      />
    </>
  );

  const renderStep3 = () => (
    <>
      {/* Custom Features Section */}
      <CustomFeaturesInput
        customFeatures={formData.customFeatures}
        setCustomFeatures={(features) => setFormData({...formData, customFeatures: features})}
        label="Add Your Extra Features"
        placeholder="Type additional features (e.g., High ceilings, Loading bay, Security system, etc.)"
        maxFeatures={12}
      />
      
      <h3 className="section-title">Property Description</h3>
      <div className="form-group">
        <label htmlFor="description" className="form-label">Property Description*</label>
        <textarea
          id="description"
          className="form-textarea"
          rows="5"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter detailed description of the property"
          required
        />
      </div>
      
      <h4 className="subsection-title">Upload Photos & Videos</h4>
      
      <div className="media-upload-section">
        <div className="upload-area">
          <label htmlFor="photo-upload" className="upload-label">
            <div className="upload-content">
              <div className="upload-icon">📷🎥</div>
              <div className="upload-text">
                <span>Drag & drop or click to upload</span>
                <small>Photos & videos • Up to 15 files • Max 1GB each</small>
              </div>
            </div>
          </label>
          <input
            id="photo-upload"
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handlePhotoChange}
            style={{ display: 'none' }}
          />
        </div>

        {photoPreviewUrls.length > 0 && (
          <>
            <div className="media-grid">
              {photoPreviewUrls.map((url, index) => (
                <div key={index} className="media-item">
                  <div className="media-content">
                    {photoFiles[index]?.type?.startsWith('video/') ? (
                      <div className="video-container">
                        <video 
                          src={url} 
                          controls
                          muted
                          preload="metadata"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            background: 'transparent'
                          }}
                        >
                          Your browser does not support the video tag.
                        </video>
                        <div className="media-type-badge">Video</div>
                      </div>
                    ) : (
                      <div className="image-container">
                        <img src={url} alt={`Preview ${index + 1}`} />
                        <div className="media-type-badge">Photo</div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-media-btn"
                    onClick={() => removePhoto(index)}
                    title="Remove file"
                  >
                    <span>×</span>
                  </button>
                  <div className="media-info">
                    <span className="media-name">{photoFiles[index]?.name}</span>
                    <span className="media-size">{(photoFiles[index]?.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="media-summary">
              <span className="file-count">{photoFiles.length} file(s) selected</span>
              <span className="total-size">
                Total: {(photoFiles.reduce((total, file) => total + (file?.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          </>
        )}
      </div>

      {/* Layout of Property Section */}
      <h4 className="subsection-title">Layout of Property</h4>
      
      <div className="layout-section">
        <div className="form-group">
          <label htmlFor="layoutFile">Floor Plan (PDF, JPG, PNG)</label>
          <p style={{ fontSize: "12px", color: "#10b981", marginTop: "4px", marginBottom: "8px" }}>
            <em>Upload floor plan to help tenants visualize the space</em>
          </p>
          {floorPlanFile && floorPlanFile.type.startsWith('image/') && (
            <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginBottom: "8px" }}>
              <em>💡 Click on the preview below to view full size</em>
            </p>
          )}
          <div className="file-upload-area">
            <label htmlFor="layoutFileUpload" className="file-upload-label">
              <div className="file-upload-content">
                <div className="file-upload-icon">📄</div>
                <div className="file-upload-text">
                  <span>Click to upload floor plan</span>
                  <small>PDF, JPG, PNG • Max 512MB</small>
                </div>
              </div>
            </label>
            <input
              type="file"
              id="layoutFileUpload"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFloorPlanChange}
              style={{ display: 'none' }}
            />
          </div>
          
          {/* File Display Section */}
          {floorPlanFile && (
            <div className="uploaded-file" style={{ marginTop: '1rem' }}>
              {floorPlanFile.type.startsWith('image/') && (
                <div className="layout-preview-container" style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  padding: '0.5rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  border: '2px solid #e5e7eb'
                }}>
                  <img 
                    src={floorPlanFile.isExisting ? floorPlanFile.url : URL.createObjectURL(floorPlanFile)} 
                    alt="Layout Preview" 
                    className="layout-preview-image"
                    style={{ 
                      maxWidth: '250px',
                      maxHeight: '200px',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      // Open image in new tab for full view
                      window.open(floorPlanFile.isExisting ? floorPlanFile.url : URL.createObjectURL(floorPlanFile), '_blank');
                    }}
                    title="Click to view full size"
                  />
                </div>
              )}
              <div className="file-info" style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px'
              }}>
                <span className="file-name" style={{ flex: 1 }}>
                  {floorPlanFile.name}
                  {floorPlanFile.isExisting && <span style={{ color: '#6c757d', fontSize: '0.8em', marginLeft: '8px' }}>(existing)</span>}
                </span>
                <button 
                  type="button" 
                  className="remove-file-btn"
                  onClick={() => setFloorPlanFile(null)}
                  style={{ 
                    marginLeft: '10px',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EPC Document Section */}
      <h4 className="subsection-title">Upload EPC Document</h4>
      
      <p style={{ fontSize: "12px", color: "#10b981", marginTop: "4px", marginBottom: "8px" }}>
        <em>EPC (Energy Performance Certificate) is required by law for commercial leases</em>
      </p>
      {epcDocumentFile && epcDocumentFile.type.startsWith('image/') && (
        <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginBottom: "8px" }}>
          <em>💡 Click on the preview below to view full size</em>
        </p>
      )}
      
      <div className="file-upload-section">
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleEpcDocumentChange}
          style={{ display: 'none' }}
          id="epc-document-upload"
        />
        <label htmlFor="epc-document-upload" className="file-upload-label">
          <div className="file-upload-content">
            <div className="file-upload-icon">📋</div>
            <div className="file-upload-text">
              <span>Click to upload EPC document</span>
              <small>PDF, JPG, PNG • Max 512MB • Required by law</small>
            </div>
          </div>
        </label>
        
        {epcDocumentFile && (
          <div className="uploaded-file" style={{ marginTop: '1rem' }}>
            {epcDocumentFile.type.startsWith('image/') && (
              <div className="layout-preview-container" style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                padding: '0.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                marginBottom: '0.5rem',
                border: '2px solid #e5e7eb'
              }}>
                <img 
                  src={epcDocumentFile.isExisting ? epcDocumentFile.url : URL.createObjectURL(epcDocumentFile)} 
                  alt="EPC Preview" 
                  className="layout-preview-image"
                  style={{ 
                    maxWidth: '250px',
                    maxHeight: '200px',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    // Open image in new tab for full view
                    window.open(epcDocumentFile.isExisting ? epcDocumentFile.url : URL.createObjectURL(epcDocumentFile), '_blank');
                  }}
                  title="Click to view full size"
                />
              </div>
            )}
            <div className="file-info" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px'
            }}>
              <span className="file-name" style={{ flex: 1 }}>
                {epcDocumentFile.name}
                {epcDocumentFile.isExisting && <span style={{ color: '#6c757d', fontSize: '0.8em', marginLeft: '8px' }}>(existing)</span>}
              </span>
              <button 
                type="button" 
                className="remove-file-btn"
                onClick={() => setEpcDocumentFile(null)}
                title="Remove EPC document"
                style={{ 
                  marginLeft: '10px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      <ContactInformationSection 
        formData={formData}
        setFormData={setFormData}
        handleChange={handleChange}
      />
    </>
  );

  const renderCurrentStep = () => {
    switch(currentSection) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      default:
        return renderStep1();
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
          {editMode ? 'EDIT LEASE PROPERTY' : 'ADD PROPERTY FOR LEASE'}
        </div>
        <ul className="form-title-find-link">
          <li><Link to="/seller">BACK TO ADD LISTING</Link></li>
        </ul>
      </div>

      {/* Progress Bar */}
      <div className="form-progress">
        <div className={`progress-step ${currentSection >= 1 ? 'active' : ''}`}>1</div>
        <div className={`progress-line ${currentSection >= 2 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentSection >= 2 ? 'active' : ''}`}>2</div>
        <div className={`progress-line ${currentSection >= 3 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentSection >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        {approvedPropertyNotification && <div className="alert alert-warning">{approvedPropertyNotification}</div>}
        
        <form 
          onSubmit={handleSubmit} 
          className="property-form" 
          autoComplete="off"
          onKeyPress={(e) => {
            // Prevent Enter key from submitting form on Steps 1 and 2
            if (e.key === 'Enter' && currentSection < 3 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
              console.log('⚠️ Enter key prevented on step', currentSection);
              return false;
            }
          }}
          onKeyDown={(e) => {
            // Additional Enter key prevention
            if (e.key === 'Enter' && currentSection < 3 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
              e.stopPropagation();
              console.log('⚠️ Enter key blocked - use Continue button');
              return false;
            }
          }}
        >
          {renderCurrentStep()}

          {/* Navigation Buttons */}
          <div className="form-buttons">
            {currentSection > 1 ? (
              <button 
                type="button" 
                className="back-btn"
                onClick={goToPrevStep}
              >
                Back
              </button>
            ) : (
              <button 
                type="button" 
                className="back-btn"
                onClick={() => navigate(returnPath)}
              >
                Cancel
              </button>
            )}
            
            {currentSection < 3 ? (
              <button 
                type="button" 
                className="next-btn"
                onClick={goToNextStep}
              >
                Continue
              </button>
            ) : (
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? "Saving..." : (editMode ? "Update Property" : "Submit Listing")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLease;
