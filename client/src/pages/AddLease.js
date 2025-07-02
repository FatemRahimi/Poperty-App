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

const leaseTypeOptions = [
  { value: "full-service", label: "Full-Service" },
  { value: "net-lease", label: "Net Lease" },
  { value: "modified-gross", label: "Modified Gross" },
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
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "E", label: "E" },
];

const AddLease = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentSection, setCurrentSection] = useState(1);
  
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
        
        // Space Features
        parking: propertyData.parking_spaces > 0 || propertyData.has_garage || false,
        loadingDock: false, // This data might not be in existing properties
        securitySystem: false, // This data might not be in existing properties
        airConditioning: false, // This data might not be in existing properties
        furnished: propertyData.furnished || false,
        utilityAccess: false, // This data might not be in existing properties
        
        // Media
        photos: [],
        contactPhone: propertyData.contact_phone || ""
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
      country: "",
      monthlyRent: "",
      depositAmount: "",
      availableFrom: "",
      leaseTerm: "",
      parking: false,
      loadingDock: false,
      securitySystem: false,
      airConditioning: false,
      furnished: false,
      utilityAccess: false,
      photos: [],
      contactPhone: user?.phone || "" // Auto-populate with user's profile phone
    };
  };

  // Use different storage keys for new vs edit mode
  const storageKey = editMode ? `editLeaseForm_${propertyId}` : "addLeaseForm";
  const [formData, setFormData] = useSessionStorage(storageKey, getInitialFormData());
  
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);

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
      setFormData((prev) => ({
        ...prev,
        utilities: { ...prev.utilities, [name]: checked },
      }));
    } else if (isSecurity) {
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

  // Validation functions for each step
  const validateStep1 = () => {
    const requiredFields = ["spaceType", "spaceName", "city", "postcode", "totalArea"];
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      alert(`❌ Please complete the following required fields: ${missingFields.join(', ')}`);
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
    if (!formData.description.trim()) {
      alert("❌ Please provide a property description");
      return false;
    }
    if (!formData.contactPhone.trim()) {
      alert("❌ Please provide a contact phone number");
      return false;
    }
    
    // Check photos/videos (mandatory for new properties, optional for edits if existing photos)
    const hasExistingPhotos = editMode && photoPreviewUrls.some(url => url.isExisting);
    const hasNewPhotos = photoFiles.length > 0;
    
    if (!hasExistingPhotos && !hasNewPhotos) {
      alert("❌ Please upload at least one photo or video");
      return false;
    }
    
    return true;
  };

  // Navigation functions
  const goToNextStep = () => {
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
      setCurrentSection(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const goToPrevStep = () => {
    setCurrentSection(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  // Final form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
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
        lot_size: formData.leaseTerm,
        parking_spaces: formData.parking ? 1 : 0,
        
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
        security: JSON.stringify(formData.security)
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
      
      // Add photos if any
      photoFiles.forEach((file, index) => {
        submitFormData.append('photos', file);
      });
      
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
        <TextInput label="Space Subtypes*" name="spaceSubtypes" value={formData.spaceSubtypes} onChange={handleChange} />
      </div>

      <TextInput label="Space Name*" name="spaceName" value={formData.spaceName} onChange={handleChange} />

      <CheckboxInput label="Multiple Tenancy" name="isMultipleTenancy" checked={formData.isMultipleTenancy} onChange={handleChange} />

      <button type="button" className="form-sale-address" onClick={() => setShowAddress(!showAddress)}>
        {showAddress ? "Hide Address" : "Add Address"}
      </button>

      {showAddress && (
        <>
          <div className="form-row">
            <TextInput 
              label="House Number / Unit" 
              name="houseNumber" 
              value={formData.houseNumber} 
              onChange={handleChange} 
              placeholder="123 or Unit 2A, 67" 
              required 
            />
            <TextInput 
              label="Street Name" 
              name="streetName" 
              value={formData.streetName} 
              onChange={handleChange} 
              placeholder="Industrial Estate" 
              required 
            />
          </div>
          
          <div className="address-help-text" style={{ 
            fontSize: '0.85em', 
            color: '#666', 
            marginTop: '-10px', 
            marginBottom: '15px',
            fontStyle: 'italic'
          }}>
            <strong>Tip:</strong> For units, enter the full unit reference (e.g., "Unit 2A, 67") in the first field and just the street name in the second field.
          </div>
          
          <div className="form-row">
            <TextInput label="City" name="city" value={formData.city} onChange={handleChange} />
            <TextInput label="Postal Code" name="postcode" value={formData.postcode} onChange={handleChange} />
          </div>
          <div className="form-row">
            <TextInput label="Country" name="country" value={formData.country} onChange={handleChange} disabled />
          </div>
        </>
      )}

      <h3 className="section-title">Building Details</h3>
      <div className="form-row">
        <TextInput label="Building Size (sqft)*" name="totalArea" value={formData.totalArea} onChange={handleChange} type="number" />
        <TextInput label="Min Divisible (sqft)" name="minDivisible" value={formData.minDivisible} onChange={handleChange} type="number" />
        <TextInput label="Vacant SQFT*" name="vacantSQFT" value={formData.vacantSQFT} onChange={handleChange} type="number" />
      </div>

      <div className="form-row">
        <TextInput label="Land Acres" name="landAcres" value={formData.landAcres} onChange={handleChange} type="number" />
        <TextInput label="Lot Size" name="leaseTerm" value={formData.leaseTerm} onChange={handleChange} type="number" />
        <SelectInput label="Lot Size Unit" name="lotSizeUnit" value={formData.lotSizeUnit} onChange={handleChange} options={lotSizeUnitOptions} />
      </div>

      <h3 className="section-title">Building Specs</h3>
      <div className="form-row">
        <TextInput label="Taxes (per sqft)" name="taxesPerSQFT" value={formData.taxesPerSQFT} onChange={handleChange} type="number" />
        <TextInput label="Parking Spaces" name="parkingSpaces" value={formData.parkingSpaces} onChange={handleChange} type="number" />
        <TextInput label="Power" name="power" value={formData.power} onChange={handleChange} />
      </div>

      <h3 className="section-title">Location Info</h3>
      <div className="form-row">
        <TextInput label="Zoning (Use Class)" name="zoning" value={formData.zoning} onChange={handleChange} />
      </div>

      <SelectInput label="Lease Type*" name="leaseType" value={formData.leaseType} onChange={handleChange} options={leaseTypeOptions} />
    </>
  );

  const renderStep2 = () => (
    <>
      <h3 className="section-title">Lease Terms</h3>

      <div className="form-row">
        <TextInput type="number" label="Lease Length (years)*" name="leaseTerm" value={formData.leaseTerm} onChange={handleChange} />
        <TextInput type="number" label="Rent per Month (£)*" name="monthlyRent" value={formData.monthlyRent} onChange={handleChange} />
        <TextInput type="number" label="Service Charge (£)" name="serviceCharge" value={formData.serviceCharge} onChange={handleChange} />
      </div>

      <div className="form-row">
        <CheckboxInput label="Break Clause" name="breakClause" checked={formData.breakClause} onChange={handleChange} />
        <CheckboxInput label="Deposit Required" name="depositRequired" checked={formData.depositRequired} onChange={handleChange} />
      </div>

      {formData.depositRequired && (
        <TextInput type="number" label="Deposit Amount (£)" name="depositAmount" value={formData.depositAmount} onChange={handleChange} />
      )}

      <div className="form-row">
        <TextInput type="number" label="Business Rates (£)" name="businessRates" value={formData.businessRates} onChange={handleChange} />
        <TextInput type="number" label="Floor Loading Capacity" name="floorLoadCapacity" value={formData.floorLoadCapacity} onChange={handleChange} />
      </div>

      <h3 className="section-title">Features & Utilities</h3>
      <div className="checkbox-group">
        {Object.keys(formData.utilities).map((util) => (
          <CheckboxInput
            key={util}
            label={`Includes ${util.charAt(0).toUpperCase() + util.slice(1)}`}
            name={util}
            checked={formData.utilities[util]}
            onChange={handleChange}
          />
        ))}
      </div>

      <div className="form-row">
        <SelectInput label="Heating/Cooling" name="heatingCooling" value={formData.heatingCooling} onChange={handleChange} options={heatingCoolingOptions} />
        <SelectInput label="Toilets/Kitchen" name="toiletKitchen" value={formData.toiletKitchen} onChange={handleChange} options={toiletKitchenOptions} />
      </div>

      <h3 className="section-title">Security & Access</h3>
      <div className="checkbox-group">
        {Object.keys(formData.security).map((sec) => (
          <CheckboxInput
            key={sec}
            label={sec === "keyFob" ? "Key Fob Access" : sec.charAt(0).toUpperCase() + sec.slice(1)}
            name={sec}
            checked={formData.security[sec]}
            onChange={handleChange}
          />
        ))}
        <CheckboxInput label="Parking Available" name="parking" checked={formData.parking} onChange={handleChange} />
        <CheckboxInput label="Disability Access" name="disabilityAccess" checked={formData.disabilityAccess} onChange={handleChange} />
      </div>

      <h3 className="section-title">Use and Regulations</h3>
      <SelectInput label="Permitted Use (Use Class)*" name="useClass" value={formData.useClass} onChange={handleChange} options={useClassOptions} />
      <TextInput label="Opening Hours Allowed" name="openingHours" value={formData.openingHours} onChange={handleChange} />
      <CheckboxInput label="Signage Allowed" name="signageAllowed" checked={formData.signageAllowed} onChange={handleChange} />
    </>
  );

  const renderStep3 = () => (
    <>
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
        <small>
          Potential tenants will use this number to contact you about lease inquiries. 
          {user?.phone && formData.contactPhone === user.phone && (
            <span style={{color: '#666', fontStyle: 'italic'}}> (Using your profile phone - you can change this for this property if needed)</span>
          )}
        </small>
      </div>
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
        
        <form onSubmit={handleSubmit} className="property-form">
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
