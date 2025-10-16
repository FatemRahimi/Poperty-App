import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import Logo from "../components/Logo";
import "../styles/AddList.css";
import useSessionStorage from "../Utils/useSessionStorage";
import "../styles/CrossBrowserReset.css";
import ContactInformationSection from "../components/ContactInformationSection";
import CustomFeaturesInput from "../components/CustomFeaturesInput";

// Property Type Options
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
  { value: "commercial", label: "Commercial Property" },
  { value: "office", label: "Office Space" },
  { value: "retail", label: "Retail Space" },
  { value: "warehouse", label: "Warehouse" }
];

// Tenure Options
const tenureOptions = [
  { value: "freehold", label: "Freehold" },
  { value: "leasehold", label: "Leasehold" },
  { value: "commonhold", label: "Commonhold" },
  { value: "share_of_freehold", label: "Share of Freehold" }
];

// Price Type Options
const priceTypeOptions = [
  { value: "fixed_price", label: "Fixed Price" },
  { value: "guide_price", label: "Guide Price" },
  { value: "offers_over", label: "Offers Over" },
  { value: "offers_in_region", label: "Offers in Region" },
  { value: "auction", label: "Auction" },
  { value: "shared_ownership", label: "Shared Ownership" }
];

// Heating Type Options
const heatingTypeOptions = [
  { value: "gas", label: "Gas" },
  { value: "electric", label: "Electric" },
  { value: "oil", label: "Oil" },
  { value: "underfloor", label: "Underfloor Heating" },
  { value: "air_source_heat_pump", label: "Air Source Heat Pump" },
  { value: "ground_source_heat_pump", label: "Ground Source Heat Pump" },
  { value: "biomass", label: "Biomass" },
  { value: "solar", label: "Solar" },
  { value: "other", label: "Other" }
];

// Broadband Options
const broadbandOptions = [
  { value: "superfast", label: "Superfast (24-100 Mbps)" },
  { value: "ultrafast", label: "Ultrafast (100+ Mbps)" },
  { value: "fibre", label: "Fibre Optic" },
  { value: "cable", label: "Cable" },
  { value: "adsl", label: "ADSL" },
  { value: "unknown", label: "Unknown" }
];

// Floor Area Unit Options (for normalization)
const floorAreaUnitOptions = [
  { value: "sq_m", label: "Square Meters" },
  { value: "sq_ft", label: "Square Feet" }
];

// EPC Rating Options
const epcOptions = ["A", "B", "C", "D", "E", "F", "G"].map((r) => ({ value: r, label: r }));
const councilTaxOptions = ["A", "B", "C", "D", "E", "F", "G", "H"].map((b) => ({ value: b, label: `Band ${b}` }));
// Helper function to format numbers - remove decimal places for integers
const formatNumberForInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (isNaN(num)) return value.toString();
  // If it's an integer, remove decimal places
  return Number.isInteger(num) ? num.toString() : num.toString();
};

const AddList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're in edit mode and get return path
  const editMode = location.state?.editMode || false;
  const propertyData = location.state?.propertyData || null;
  const propertyId = location.state?.propertyId || propertyData?.id || null;
  const returnPath = location.state?.returnPath || '/dashboard';
 
  // Resolve complete property details for edit mode (fallback fetch if needed)
  const [resolvedPropertyData, setResolvedPropertyData] = useState(propertyData);
  const effectiveProperty = resolvedPropertyData || propertyData;
  
  const [currentStep, setCurrentStep] = useState(1);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState([]);
  const [floorPlanFile, setFloorPlanFile] = useState(null);
  const [epcDocumentFile, setEpcDocumentFile] = useState(null);
  const [approvedPropertyNotification, setApprovedPropertyNotification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle | loading | success | error
  

  // Helper to handle null strings from database
  const nullSafe = (value) => {
    if (value === null || value === undefined || value === 'null' || value === '') {
      return '';
    }
    return value;
  };
  // Helpers
    const toBool = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === 't' || normalized === 'yes' || 
             normalized === 'on' || normalized === 'y' || normalized === 'available' ||
             normalized === 'included' || normalized === 'present';
    }
    return !!value;
  };

  // Normalize a raw string to one of the provided Select options' value
  const normalizeToOptionValue = (options, raw) => {
    if (!raw) return "";
    const rawStr = String(raw).trim();
    const rawLower = rawStr.toLowerCase();
    const rawAlnum = rawLower.replace(/[^a-z0-9]/g, '');
    // Try direct value match
    const directVal = options.find(o => String(o.value).toLowerCase() === rawLower);
    if (directVal) return directVal.value;
    // Try label match
    const labelVal = options.find(o => String(o.label).toLowerCase() === rawLower);
    if (labelVal) return labelVal.value;
    // Try relaxed match ignoring punctuation/spaces
    const relaxedVal = options.find(o => String(o.value).toLowerCase().replace(/[^a-z0-9]/g, '') === rawAlnum);
    if (relaxedVal) return relaxedVal.value;
    const relaxedLabel = options.find(o => String(o.label).toLowerCase().replace(/[^a-z0-9]/g, '') === rawAlnum);
    if (relaxedLabel) return relaxedLabel.value;
    return "";
  };

  // Normalize council tax band to letter A-H
    const normalizeCouncilBand = (raw) => {
    if (!raw) return "";
    const str = String(raw).toUpperCase();
    
    // Handle "Band D" format
    const bandMatch = str.match(/BAND\s*([A-H])/);
    if (bandMatch) return bandMatch[1];
    
    // Handle just the letter
    const letterMatch = str.match(/[A-H]/);
    if (letterMatch) return letterMatch[0];
    
    // Handle numeric (1-8) and convert to letter
    const numMatch = str.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1]);
      if (num >= 1 && num <= 8) {
        return String.fromCharCode(64 + num); // A=1, B=2, etc.
      }
    }
    
    return "";
  };
 
  // Existing files (edit mode)
  const [existingLayoutUrl, setExistingLayoutUrl] = useState("");
  const [existingLayoutName, setExistingLayoutName] = useState("");
  const [existingEpcUrl, setExistingEpcUrl] = useState("");
  const [existingEpcName, setExistingEpcName] = useState("");
 
  // Helpers to prefill edit mode like AddRent
  const parseAddress = (addressLine1) => {
    if (!addressLine1) return { houseNumber: "", streetName: "" };
    const parts = addressLine1.trim().split(' ');
    if (parts.length === 0) return { houseNumber: "", streetName: "" };
    const firstPart = parts[0];
    if (/^\d+[A-Za-z]*$/.test(firstPart)) {
      return { houseNumber: firstPart, streetName: parts.slice(1).join(' ') };
    }
    return { houseNumber: "", streetName: addressLine1 };
  };
 
  const getInitialFormData = () => {
    if (editMode && effectiveProperty) {
      const src = effectiveProperty;
      const addr = parseAddress(src.address_line1 || src.streetAddress);

      return {
        // Step 1: Basics
        propertyTitle: src.title || src.propertyTitle || "",
        propertyType: normalizeToOptionValue(propertyTypeOptions, src.property_type || src.propertyType) || "",
        tenure: normalizeToOptionValue(tenureOptions, src.tenure || src.tenure_type || src.tenureType) || "",
        bedrooms: formatNumberForInput(src.bedrooms),
        bathrooms: formatNumberForInput(src.bathrooms),
        receptionRooms: (src.reception_rooms ?? src.receptions ?? "").toString(),
        floorArea: (src.floor_area ?? src.square_feet ?? "").toString(),
        floorAreaUnit: normalizeToOptionValue(
          floorAreaUnitOptions,
          src.floor_area_unit || (src.square_feet ? "sq_ft" : src.floorAreaUnit)
        ) || (src.square_feet ? "sq_ft" : "sq_m"),
        epcRating: src.epc_rating ? String(src.epc_rating).toUpperCase() : "",

        // Step 2: Location
        houseNumber: addr.houseNumber,
        fullAddress: addr.streetName,
        city: src.city || "",
        country: src.country || "United Kingdom",
        region: src.region || src.state || "",
        postcode: src.postcode || src.zip_code || "",
        localAuthority: src.local_authority || src.localAuthority || "",
        nearestTransportLinks: src.nearest_transport_links || src.nearestTransportLinks || "",

        // Step 3: Financials
        askingPrice: formatNumberForInput(src.price),
        priceType: normalizeToOptionValue(priceTypeOptions, src.price_type || src.priceType) || "fixed_price",
        serviceCharges: formatNumberForInput(src.service_charges ?? src.serviceCharges),
        groundRent: formatNumberForInput(src.ground_rent ?? src.groundRent),
        councilTaxBand: normalizeCouncilBand(src.council_tax_band || src.councilTaxBand),

        // Step 4: Descriptions
        shortDescription: src.short_description || src.shortDescription || (src.description ? String(src.description).slice(0, 160) : ""),
        fullDescription: src.description || "",

        // Step 5: Features
        hasGarden: toBool(src.has_garden || src.garden),
        hasParking: toBool((src.parking_spaces || 0) > 0) || toBool(src.has_parking || src.parking),
        hasBalconyTerrace: toBool(src.has_balcony_terrace || src.balcony),
        isNewBuild: toBool(src.is_new_build || src.new_build),
        isChainFree: toBool(src.is_chain_free || src.chain_free),
        isRecentlyRenovated: toBool(src.is_recently_renovated || src.recentlyRenovated),
        hasAccessibleAccess: toBool(src.has_accessible_access || src.accessibility),

        // Step 6: Media / Layout
        apartmentSize: src.apartment_size || src.apartmentSize || "",
        floorNumber: src.floor_number || src.floorNumber || "",
        virtualTourLink: src.virtual_tour_link || src.virtualTourLink || src.tour_link || "",

        // Step 7: Additional Info
        yearBuilt: (src.year_built || src.yearBuilt || "").toString(),
        heatingType: normalizeToOptionValue(heatingTypeOptions, src.heating_type || src.heatingType) || "",
        broadbandAvailability: normalizeToOptionValue(
          broadbandOptions,
          src.broadband_availability || src.broadbandAvailability || src.broadband
        ) || "",
        accessibilityFeatures: src.accessibility_features || src.accessibilityFeatures || "",
        hasResidentialAccommodation: src.has_residential_accommodation || src.hasResidentialAccommodation || false,
        
        // Custom Features
        customFeatures: Array.isArray(src.custom_features) 
          ? src.custom_features 
          : (src.custom_features ? JSON.parse(src.custom_features) : []),
      };
    }

    // Defaults (new listing)
    return {
      propertyTitle: "",
      propertyType: "",
      tenure: "",
      bedrooms: "",
      bathrooms: "",
      receptionRooms: "",
      floorArea: "",
      floorAreaUnit: "sq_m",
      epcRating: "",
      houseNumber: "",
      fullAddress: "",
      city: "",
      country: "United Kingdom",
      region: "",
      postcode: "",
      localAuthority: "",
      nearestTransportLinks: "",
      askingPrice: "",
      priceType: "fixed_price",
      serviceCharges: "",
      groundRent: "",
      councilTaxBand: "",
      shortDescription: "",
      fullDescription: "",
      hasGarden: false,
      hasParking: false,
      hasBalconyTerrace: false,
      isNewBuild: false,
      isChainFree: false,
      isRecentlyRenovated: false,
      hasAccessibleAccess: false,
      yearBuilt: "",
      heatingType: "",
      broadbandAvailability: "",
      accessibilityFeatures: "",
      apartmentSize: "",
      floorNumber: "",
      virtualTourLink: "",
      
      // Commercial/Warehouse specific
      hasResidentialAccommodation: false,
      
      // Custom Features
      customFeatures: [],
    };
  };
  // Use session-backed state like AddRent
  const storageKey = editMode ? `editSaleForm_${propertyId}` : 'addListForm';
  const [formData, setFormData] = useSessionStorage(storageKey, getInitialFormData());

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("token");
    if (!isLoggedIn) {
      alert("❌ Please log in to submit a property.");
      navigate("/login");
      return;
    }
  }, [navigate]);

  // Set notification for approved property edits
  useEffect(() => {
    if (editMode && effectiveProperty?.status === 'approved') {
      setApprovedPropertyNotification(
        "⚠️ You are editing an approved property. After saving, it will require admin approval before being visible again."
      );
    }
  }, [editMode, effectiveProperty]);

  useEffect(() => {
    if (editMode && effectiveProperty) {
      // Re-hydrate from latest property source on open or when it changes
      const initial = getInitialFormData();
      setFormData(initial);
      // Existing layout/EPC URLs if backend provides them
      if (effectiveProperty.layout_url || effectiveProperty.layoutFileUrl || effectiveProperty.layout_file_url) {
        setExistingLayoutUrl(
          effectiveProperty.layout_url || effectiveProperty.layoutFileUrl || effectiveProperty.layout_file_url
        );
        if (effectiveProperty.layout_file_name || effectiveProperty.layoutFileName) {
          setExistingLayoutName(effectiveProperty.layout_file_name || effectiveProperty.layoutFileName);
        }
      }
      if (effectiveProperty.epc_url || effectiveProperty.epcDocumentUrl || effectiveProperty.epc_document_url) {
        setExistingEpcUrl(
          effectiveProperty.epc_url || effectiveProperty.epcDocumentUrl || effectiveProperty.epc_document_url
        );
        if (effectiveProperty.epc_document_name || effectiveProperty.epcDocumentName) {
          setExistingEpcName(effectiveProperty.epc_document_name || effectiveProperty.epcDocumentName);
        }
      }
    }
  }, [editMode, effectiveProperty]);

  // Track initial load to avoid resetting on edit mode load
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  useEffect(() => {
    if (isInitialLoad && formData.propertyType) {
      setIsInitialLoad(false);
    }
  }, [formData.propertyType, isInitialLoad]);

  // Reset hasResidentialAccommodation when switching property types (but not on initial load)
  useEffect(() => {
    // Skip on initial load (edit mode needs to preserve the value)
    if (isInitialLoad) return;
    
    // When property type changes to/from commercial, handle the residential toggle
    if (formData.propertyType) {
      const isCommercial = isCommercialProperty(formData.propertyType);
      const isLand = isLandProperty(formData.propertyType);
      
      // If switching to non-commercial, reset the toggle
      if (!isCommercial && formData.hasResidentialAccommodation) {
        setFormData(prev => ({
          ...prev,
          hasResidentialAccommodation: false
        }));
      }
      
      // If switching to land, clear fields that shouldn't exist for land
      if (isLand) {
        setFormData(prev => ({
          ...prev,
          hasResidentialAccommodation: false,
          bedrooms: '',
          bathrooms: '',
          receptionRooms: ''
        }));
      }
    }
  }, [formData.propertyType, isInitialLoad]);

  useEffect(() => {
    if (editMode && effectiveProperty && effectiveProperty.images) {
      const imageUrls = effectiveProperty.images.map((img) => {
        const imageUrl = img.url || img.image_url;
        const filename = imageUrl?.split('/')?.pop() || 'image.jpg';
        return {
          url: imageUrl,
          type: (img.type || 'image/jpeg'),
          name: filename,
          size: 0,
          isExisting: true
        };
      });
      setMediaPreviewUrls(imageUrls);
    }
  }, [editMode, effectiveProperty]);

  // Clear form data when creating a new property (not in edit mode)
  useEffect(() => {
    if (!editMode) {
      // Clear any existing form data from previous sessions
      const emptyFormData = getInitialFormData();
      setFormData(emptyFormData);
      setMediaFiles([]);
      setMediaPreviewUrls([]);
      setFloorPlanFile(null);
      setEpcDocumentFile(null);
      setExistingLayoutUrl("");
      setExistingLayoutName("");
      setExistingEpcUrl("");
      setExistingEpcName("");
      console.log('🆕 NEW PROPERTY MODE - Form cleared');
    }
  }, [editMode]);

  // Fetch full property details if needed in edit mode
  useEffect(() => {
    const loadPropertyIfNeeded = async () => {
      if (!editMode) return;
      if (resolvedPropertyData) return;
      if (!propertyId) return;
      try {
        const resp = await fetch('/api/properties/my-properties', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const list = data?.properties || [];
        const found = list.find(p => String(p.id) === String(propertyId));
        if (found) {
          setResolvedPropertyData(found);
        }
      } catch (e) {
        console.error('Failed to resolve property for edit:', e);
      }
    };
    loadPropertyIfNeeded();
  }, [editMode, propertyId, resolvedPropertyData]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Media handling functions
  const handleMediaChange = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length > 0) {
      const maxFileSize = 1024 * 1024 * 1024; // 1GB
      const oversizedFiles = files.filter(file => file.size > maxFileSize);
      
      if (oversizedFiles.length > 0) {
        alert(`Some files are too large. Maximum file size is 1GB per file.\nOversized files: ${oversizedFiles.map(f => f.name).join(', ')}`);
        return;
      }
      
      if (mediaFiles.length + files.length > 20) {
        alert("You can upload a maximum of 20 files");
        return;
      }
      
      const newMediaFiles = [...mediaFiles, ...files];
      setMediaFiles(newMediaFiles);
      
      const newPreviewUrls = files.map(file => ({
        url: URL.createObjectURL(file),
        type: file.type,
        name: file.name,
        size: file.size
      }));
      setMediaPreviewUrls(prev => [...prev, ...newPreviewUrls]);
    }
  };

  const removeMedia = (index) => {
    const newMediaFiles = mediaFiles.filter((_, i) => i !== index);
    const newPreviewUrls = mediaPreviewUrls.filter((_, i) => i !== index);
    
    URL.revokeObjectURL(mediaPreviewUrls[index].url);
    
    setMediaFiles(newMediaFiles);
    setMediaPreviewUrls(newPreviewUrls);
  };

  // Floor plan handling
  const handleFloorPlanChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 512 * 1024 * 1024) { // 512MB limit
        alert("Floor plan file size must be under 512MB");
        return;
      }
      setFloorPlanFile(file);
    }
  };

  // EPC document handling
  const handleEpcDocumentChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 512 * 1024 * 1024) { // 512MB limit
        alert("EPC document file size must be under 512MB");
        return;
      }
      setEpcDocumentFile(file);
    }
  };

  const validateStep = (step) => {
    // All fields are now optional - no validation needed
    return true;
  };

  const goToNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const goToPrevStep = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('🚀 ADDLIST SUBMIT DEBUG: Starting submission process');
    console.log('📊 Current step:', currentStep);
    console.log('🔒 Is submitting:', isSubmitting);
    console.log('📝 Form data:', formData);
    
    // Block any accidental double submissions
    if (isSubmitting) {
      console.log('⚠️ Submission already in progress; ignoring.');
      return;
    }
    
    // Only allow submit on final step
    if (currentStep !== 7) {
      alert(`Please complete all steps before submitting. You are on step ${currentStep} of 7.`);
      return;
    }
    
    if (!validateStep(currentStep)) return;
    
    try {
      setIsSubmitting(true);
      setSubmitStatus('loading');
      console.log('✅ Starting form data preparation...');
      
      const formDataToSend = new FormData();
      // Map  backend fields for sale listings
      formDataToSend.append('category', 'sale');
      if (formData.propertyTitle) formDataToSend.append('title', formData.propertyTitle);
      if (formData.fullDescription) formDataToSend.append('description', formData.fullDescription);
      if (formData.propertyType) formDataToSend.append('property_type', formData.propertyType);
      if (formData.shortDescription) formDataToSend.append('short_description', formData.shortDescription);
      // Address mappings
      if (formData.fullAddress || formData.houseNumber) {
        const addr1 = `${formData.houseNumber || ''} ${formData.fullAddress || ''}`.trim();
        formDataToSend.append('address_line1', addr1);
        formDataToSend.append('streetAddress', addr1);
      }
      if (formData.postcode) formDataToSend.append('zip_code', formData.postcode);
      if (formData.region) formDataToSend.append('state', formData.region);
      if (formData.country) formDataToSend.append('country', formData.country);
      // Price mapping for sale
      if (formData.askingPrice) formDataToSend.append('price', formData.askingPrice);
      
      // Check if this is commercial without residential accommodation
      const isCommercialNoResidential = isCommercialProperty(formData.propertyType) && !formData.hasResidentialAccommodation;
      const isLand = isLandProperty(formData.propertyType);
      
      // Add all form fields (exclude duplicates we explicitly mapped)
      const skipKeys = new Set(['category','title','propertyTitle','description','short_description','shortDescription','property_type','propertyType','address_line1','streetAddress','zip_code','postcode','state','region','country','price','askingPrice','hasGarden','hasParking','hasBalconyTerrace','isNewBuild','isChainFree','isRecentlyRenovated','hasAccessibleAccess','customFeatures','bedrooms','bathrooms','receptionRooms']);
      Object.keys(formData).forEach(key => {
        if (!skipKeys.has(key) && formData[key] !== undefined && formData[key] !== null && formData[key] !== '') {
          formDataToSend.append(key, formData[key]);
        }
      });
      
      // Handle bedrooms/bathrooms/receptionRooms conditionally
      // Only send if NOT (commercial without residential OR land)
      if (!isCommercialNoResidential && !isLand) {
        if (formData.bedrooms) formDataToSend.append('bedrooms', formData.bedrooms);
        if (formData.bathrooms) formDataToSend.append('bathrooms', formData.bathrooms);
        if (formData.receptionRooms) formDataToSend.append('receptionRooms', formData.receptionRooms);
      } else {
        // Explicitly send empty/null for commercial without residential or land
        formDataToSend.append('bedrooms', '');
        formDataToSend.append('bathrooms', '');
        formDataToSend.append('receptionRooms', '');
      }
      
      // Map property features to backend field names
      formDataToSend.append('has_garden', formData.hasGarden ? 'true' : 'false');
      formDataToSend.append('has_parking', formData.hasParking ? 'true' : 'false');
      formDataToSend.append('has_balcony_terrace', formData.hasBalconyTerrace ? 'true' : 'false');
      formDataToSend.append('is_new_build', formData.isNewBuild ? 'true' : 'false');
      formDataToSend.append('is_chain_free', formData.isChainFree ? 'true' : 'false');
      formDataToSend.append('is_recently_renovated', formData.isRecentlyRenovated ? 'true' : 'false');
      formDataToSend.append('has_accessible_access', formData.hasAccessibleAccess ? 'true' : 'false');
      formDataToSend.append('has_residential_accommodation', formData.hasResidentialAccommodation ? 'true' : 'false');
      
      // Map other fields to backend field names
      formDataToSend.append('local_authority', formData.localAuthority || '');
      formDataToSend.append('nearest_transport_links', formData.nearestTransportLinks || '');
      formDataToSend.append('service_charges', formData.serviceCharges || '');
      formDataToSend.append('ground_rent', formData.groundRent || '');
      formDataToSend.append('heating_type', formData.heatingType || '');
      formDataToSend.append('broadband_availability', formData.broadbandAvailability || '');
      formDataToSend.append('accessibility_features', formData.accessibilityFeatures || '');
      formDataToSend.append('custom_features', JSON.stringify(formData.customFeatures || []));
      formDataToSend.append('apartment_size', formData.apartmentSize || '');
      formDataToSend.append('floor_number', formData.floorNumber || '');
      formDataToSend.append('virtual_tour_link', formData.virtualTourLink || '');
      
      // Ensure category & type mapping for backend (single source of truth)
      formDataToSend.append('category', 'sale');
      formDataToSend.append('property_type', formData.propertyType || 'house');
      // Title/description fallbacks
      if (!formData.propertyTitle) formDataToSend.append('propertyTitle', 'Property for Sale');
      if (!formData.fullDescription) formDataToSend.append('description', formData.shortDescription || 'Property for sale');
      
      // Handle status for approved properties being edited
      if (editMode && effectiveProperty?.status === 'approved') {
        formDataToSend.append('status', 'pending');
      }
      
      // Add media files
      mediaFiles.forEach(file => {
        formDataToSend.append('photos', file);
      });
      
      // Add floor plan (backend expects 'layoutFile')
      if (floorPlanFile) {
        formDataToSend.append('layoutFile', floorPlanFile);
      }
      
      // Add EPC document file
      if (epcDocumentFile) {
        formDataToSend.append('epcDocument', epcDocumentFile);
      }
      
      const baseUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050';
      const endpoint = editMode && propertyId 
        ? `${baseUrl}/api/properties/sale/update/${propertyId}`
        : `${baseUrl}/api/properties/sale/submit`;
      const method = editMode && propertyId ? 'PUT' : 'POST';

      console.log('🌐 Endpoint:', endpoint);
      console.log('📡 Method:', method);
      console.log('🔑 Token exists:', !!localStorage.getItem('token'));
      console.log('📎 Media files count:', mediaFiles.length);
      console.log('📋 Floor plan file:', !!floorPlanFile);
      console.log('📄 EPC document file:', !!epcDocumentFile);

      const response = await fetch(endpoint, {
        method,
        body: formDataToSend,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Response error data:', errorData);
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Response data:', data);
      
      if (data.success) {
        setSubmitStatus('success');
        sessionStorage.removeItem("propertyListingForm");
        setTimeout(() => navigate('/dashboard'), 800);
      } else {
        throw new Error(data.message || 'Failed to submit property');
      }
    } catch (error) {
      console.error('❌ Error submitting property:', error);
      console.error('❌ Error stack:', error.stack);
      setSubmitStatus('error');
      alert(`Error submitting property: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions for conditional field visibility
  const isCommercialProperty = (propertyType) => {
    return ['warehouse', 'commercial', 'office', 'retail'].includes(propertyType);
  };

  const isLandProperty = (propertyType) => {
    return propertyType === 'land';
  };

  const shouldShowResidentialFields = () => {
    // Never show for land
    if (isLandProperty(formData.propertyType)) return false;
    
    // For commercial properties, show only if residential accommodation checkbox is checked
    if (isCommercialProperty(formData.propertyType)) {
      return formData.hasResidentialAccommodation === true;
    }
    
    // For all other residential properties, always show
    return true;
  };

  const shouldShowField = (fieldName) => {
    const propertyType = formData.propertyType;
    
    // Fields that should NEVER show for LAND
    const landExclusions = [
      'bedrooms', 'bathrooms', 'receptionRooms', 'epcRating', 
      'heatingType', 'broadbandAvailability', 'floorNumber', 
      'yearBuilt', 'hasBalconyTerrace', 'isRecentlyRenovated', 
      'hasAccessibleAccess', 'floorPlan',
      // Financial fields not applicable to land
      'serviceCharges', 'groundRent', 'councilTaxBand',
      // Other land exclusions
      'epcDocument', 'apartmentSize', 'chainFree'
    ];
    
    // Fields to hide for COMMERCIAL (when NO residential accommodation)
    const commercialExclusionsNoResidential = [
      'bedrooms', 'bathrooms', 'receptionRooms',
      'councilTaxBand', 'hasGarden', 'hasBalconyTerrace', 'chainFree'
    ];
    
    // Apply land exclusions
    if (isLandProperty(propertyType)) {
      return !landExclusions.includes(fieldName);
    }
    
    // Apply commercial exclusions (only when residential toggle is OFF)
    if (isCommercialProperty(propertyType) && !formData.hasResidentialAccommodation) {
      return !commercialExclusionsNoResidential.includes(fieldName);
    }
    
    return true; // Show everything else
  };

  // Render Step 1: Property Basics
  const renderStep1 = () => {
    return (
      <>
        {/* Basic Property Details */}
        <h3 className="section-title">Property Details</h3>
        
        {/* Title and Type Row */}
        <div className="form-row">
          <TextInput
            label="Property Title"
            name="propertyTitle"
            value={formData.propertyTitle}
            onChange={handleChange}
            placeholder="e.g. Modern 3-Bed Semi-Detached House"
          />
          
          <SelectInput
            label="Property Type"
            name="propertyType"
            value={formData.propertyType}
            onChange={handleChange}
            options={propertyTypeOptions}
            
          />
        </div>
        
        {/* Commercial/Warehouse Residential Toggle */}
        {isCommercialProperty(formData.propertyType) && (
          <div style={{ 
            marginBottom: '1rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.5rem'
            }}>
              <input 
                type="checkbox" 
                id="hasResidentialAccommodation" 
                name="hasResidentialAccommodation" 
                checked={formData.hasResidentialAccommodation}
                onChange={handleChange}
              />
              <label htmlFor="hasResidentialAccommodation" style={{ 
                cursor: 'pointer', 
                fontWeight: '600',
                color: '#0369a1',
                fontSize: '0.95rem',
                userSelect: 'none'
              }}>
                Includes Residential/Living Accommodation (e.g., caretaker flat, living quarters)
              </label>
            </div>
          </div>
        )}
        
        {/* Info message for land */}
        {isLandProperty(formData.propertyType) && (
          <div className="form-tip" style={{ 
            background: '#fef3c7', 
            borderColor: '#fbbf24',
            marginBottom: '1rem' 
          }}>
            <i className="fas fa-info-circle"></i>
            <span>Land properties: Only relevant fields are shown.</span>
          </div>
        )}
        
        {/* Bedrooms, Bathrooms, and Reception Rooms - Conditional */}
        {shouldShowResidentialFields() && (
          <div className="form-row three-cols">
            <TextInput
              label="Bedrooms"
              name="bedrooms"
              type="number"
              value={formData.bedrooms}
              onChange={handleChange}
              
              min="0"
            />
            
            <TextInput
              label="Bathrooms"
              name="bathrooms"
              type="number"
              value={formData.bathrooms}
              onChange={handleChange}
              
              min="0"
            />
            
            <TextInput
              label="Reception Rooms"
              name="receptionRooms"
              type="number"
              value={formData.receptionRooms}
              onChange={handleChange}
              min="0"
              placeholder="Optional"
            />
          </div>
        )}
        
        {/* Tenure and EPC Rating */}
        <div className="form-row">
          <SelectInput
            label="Tenure"
            name="tenure"
            value={formData.tenure}
            onChange={handleChange}
            options={tenureOptions}
            
          />
          
          {shouldShowField('epcRating') && (
            <SelectInput
              label="EPC Rating"
              name="epcRating"
              value={formData.epcRating}
              onChange={handleChange}
              options={epcOptions}
              
            />
          )}
        </div>
      </>
    );
  };

  // Render Step 2: Location Info
  const renderStep2 = () => {
    return (
      <>
        <h3 className="section-title">Location Information</h3>
        
        {/* Row 1: House Number & Address */}
        <div className="form-row">
          <TextInput
            label="House Number"
            name="houseNumber"
            value={formData.houseNumber || ""}
            onChange={handleChange}
            placeholder="123, Flat 2A"
          />
          
          <TextInput
            label="Address (Area, Address Line 1, Line 2, Separate with Comma)"
            name="fullAddress"
            value={formData.fullAddress}
            onChange={handleChange}
            placeholder="e.g. Westminster, Main Street, Oak Avenue"
          />
        </div>
        
        {/* Row 2: City/Town & Country */}
        <div className="form-row">
          <TextInput
            label="City/Town"
            name="city"
            value={formData.city || ""}
            onChange={handleChange}
            placeholder="London"
            className="muted-placeholder"
          />
          
          <TextInput
            label="Country"
            name="country"
            value={formData.country || "United Kingdom"}
            onChange={handleChange}
            placeholder="United Kingdom"
            className="muted-placeholder"
          />
        </div>
        
        {/* Row 3: Region & Postcode */}
        <div className="form-row">
          <TextInput
            label="Region"
            name="region"
            value={formData.region || ""}
            onChange={handleChange}
            placeholder="Greater London"
            className="muted-placeholder"
          />
          
          <TextInput
            label="Postcode"
            name="postcode"
            value={formData.postcode}
            onChange={handleChange}
            placeholder="SW1A 1AA"
          />
        </div>
        
        {/* Row 4: Local Authority & Transport Links */}
        <div className="form-row">
          <TextInput
            label="Local Authority"
            name="localAuthority"
            value={formData.localAuthority}
            onChange={handleChange}
            placeholder="e.g., Manchester City Council"
          />
          
          <TextInput
            label="Nearest Transport Links"
            name="nearestTransportLinks"
            value={formData.nearestTransportLinks}
            onChange={handleChange}
            placeholder="e.g., Piccadilly Station, Bus routes 1, 2, 3"
          />
        </div>
      </>
    );
  };

  // Render Step 3: Financials
  const renderStep3 = () => {
    return (
      <>
        <h3 className="section-title">Financial Information</h3>
        
        {/* Info message for land pricing */}
        {isLandProperty(formData.propertyType) && (
          <div className="form-tip" style={{ 
            background: '#f0f9ff', 
            borderColor: '#3b82f6',
            marginBottom: '1rem' 
          }}>
            <i className="fas fa-info-circle"></i>
            <span>Land pricing: Only basic pricing fields are shown. Additional fees don't typically apply to undeveloped land.</span>
          </div>
        )}
        
        {/* Asking Price and Price Type */}
        <div className="form-row">
          <TextInput
            label="Asking Price"
            name="askingPrice"
            type="number"
            value={formData.askingPrice}
            onChange={handleChange}
            
            placeholder="Enter asking price in £"
          />
          
          <SelectInput
            label="Price Type"
            name="priceType"
            value={formData.priceType}
            onChange={handleChange}
            options={priceTypeOptions}
            
          />
        </div>
        
        {/* Service Charges and Ground Rent - Not for land */}
        {shouldShowField('serviceCharges') && shouldShowField('groundRent') && (
          <div className="form-row">
            <TextInput
              label="Service Charges (if applicable)"
              name="serviceCharges"
              type="number"
              value={formData.serviceCharges}
              onChange={handleChange}
              placeholder="Monthly service charges in £"
            />
            
            <TextInput
              label="Ground Rent (if leasehold)"
              name="groundRent"
              type="number"
              value={formData.groundRent}
              onChange={handleChange}
              placeholder="Annual ground rent in £"
            />
          </div>
        )}
        
        {/* Council Tax Band / Business Rates - Context-aware label */}
        {shouldShowField('councilTaxBand') && (
          <div className="form-row">
            <SelectInput
              label={
                isCommercialProperty(formData.propertyType) 
                  ? "Council Tax Band (if residential included)" 
                  : "Council Tax Band"
              }
              name="councilTaxBand"
              value={formData.councilTaxBand}
              onChange={handleChange}
              options={councilTaxOptions}
              
            />
          </div>
        )}
      </>
    );
  };

  // Render Step 4: Property Description
  const renderStep4 = () => {
    // Dynamic placeholder based on property type
    const getDescriptionPlaceholder = () => {
      if (isLandProperty(formData.propertyType)) {
        return "Describe the land: size, location benefits, planning permission status, access, utilities, potential uses...";
      } else if (isCommercialProperty(formData.propertyType)) {
        return "Describe the commercial space: size, layout, facilities, parking, transport links, business potential, previous use...";
      } else {
        return "Provide a detailed description of your property. Highlight key features, renovations, unique selling points...";
      }
    };

    const getDescriptionTip = () => {
      if (isLandProperty(formData.propertyType)) {
        return "For land: Mention planning permission, utilities, access roads, nearby amenities, and development potential.";
      } else if (isCommercialProperty(formData.propertyType)) {
        return "For commercial: Highlight business advantages, foot traffic, parking, loading facilities, and zoning details.";
      } else {
        return "Encourage sellers to highlight key features, renovations, unique selling points.";
      }
    };

    return (
      <>
        <h3 className="section-title">Property Description</h3>
        
        <div className="form-group">
          <TextInput
            label="Short Description"
            name="shortDescription"
            value={formData.shortDescription}
            onChange={handleChange}
            
            placeholder="Brief summary for search results (max 200 characters)"
            maxLength="200"
          />
          
          <div className="form-group">
            <label htmlFor="fullDescription">Full Description</label>
            <textarea
              id="fullDescription"
              name="fullDescription"
              value={formData.fullDescription}
            onChange={handleChange}
              className="form-textarea"
              rows="8"
              placeholder={getDescriptionPlaceholder()}
            
            ></textarea>
        </div>
        </div>

        <div className="form-tip">
          <i className="fas fa-lightbulb"></i>
          <span>{getDescriptionTip()}</span>
        </div>
      </>
    );
  };

  // Render Step 5: Key Features
  const renderStep5 = () => {
    return (
      <>
        <h3 className="section-title">Property Features</h3>
        <div className="property-features" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {shouldShowField('hasGarden') && (
            <div className="feature-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <input 
                type="checkbox" 
                id="hasGarden" 
                name="hasGarden" 
                checked={formData.hasGarden}
                onChange={handleChange}
              />
              <label htmlFor="hasGarden">Garden</label>
            </div>
          )}
          
          <div className="feature-item" style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            backgroundColor: '#ffffff'
          }}>
            <input 
              type="checkbox" 
              id="hasParking" 
              name="hasParking" 
              checked={formData.hasParking}
              onChange={handleChange}
            />
            <label htmlFor="hasParking">
              {isLandProperty(formData.propertyType) ? "Parking/Access Road" : "Parking (Garage/Driveway/Permit)"}
            </label>
          </div>
          
          {shouldShowField('hasBalconyTerrace') && (
            <div className="feature-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <input 
                type="checkbox" 
                id="hasBalconyTerrace" 
                name="hasBalconyTerrace" 
                checked={formData.hasBalconyTerrace}
                onChange={handleChange}
              />
              <label htmlFor="hasBalconyTerrace">Balcony/Terrace</label>
            </div>
          )}
          
          <div className="feature-item" style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            backgroundColor: '#ffffff'
          }}>
            <input 
              type="checkbox" 
              id="isNewBuild" 
              name="isNewBuild" 
              checked={formData.isNewBuild}
              onChange={handleChange}
            />
            <label htmlFor="isNewBuild">New Build</label>
          </div>

          {shouldShowField('chainFree') && (
            <div className="feature-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <input 
                type="checkbox" 
                id="isChainFree" 
                name="isChainFree" 
                checked={formData.isChainFree}
                onChange={handleChange}
              />
              <label htmlFor="isChainFree">Chain Free</label>
            </div>
          )}

          {shouldShowField('isRecentlyRenovated') && (
            <div className="feature-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <input 
                type="checkbox" 
                id="isRecentlyRenovated" 
                name="isRecentlyRenovated" 
                checked={formData.isRecentlyRenovated}
                onChange={handleChange}
              />
              <label htmlFor="isRecentlyRenovated">Recently Renovated</label>
            </div>
          )}

          {shouldShowField('hasAccessibleAccess') && (
            <div className="feature-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#ffffff'
            }}>
              <input 
                type="checkbox" 
                id="hasAccessibleAccess" 
                name="hasAccessibleAccess" 
                checked={formData.hasAccessibleAccess}
                onChange={handleChange}
              />
              <label htmlFor="hasAccessibleAccess">Accessible/Step-Free Access</label>
            </div>
          )}

        </div>
        
        {/* Custom Features Section */}
        <CustomFeaturesInput
          customFeatures={formData.customFeatures}
          setCustomFeatures={(features) => setFormData({...formData, customFeatures: features})}
          label="Add Your Extra Features"
          placeholder="Type additional features (e.g., Sea view, Wine cellar, Smart home system)"
          maxFeatures={12}
        />
      </>
    );
  };

  // Render Step 6: Media Uploads
  const renderStep6 = () => {
    return (
      <>
        <h3 className="section-title">Property Description & Media</h3>
        
        <h4 className="subsection-title">Upload Photos & Videos</h4>
        
        <div className="media-upload-section">
          <div className="upload-area">
            <label htmlFor="media-upload" className="upload-label">
              <div className="upload-content">
                <div className="upload-icon">📷🎥</div>
                <div className="upload-text">
                  <span>Drag & drop or click to upload</span>
                  <small>Photos & videos • Up to 20 files • Max 1GB each • Min 5 </small>
                </div>
              </div>
            </label>
            <input
              id="media-upload"
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleMediaChange}
              style={{ display: 'none' }}
            />
          </div>

          {mediaPreviewUrls.length > 0 && (
            <>
              <div className="media-grid">
                {mediaPreviewUrls.map((media, index) => (
                  <div key={index} className="media-item">
                    <div className="media-content">
                      {media.type.startsWith('video/') ? (
                        <div className="video-container">
                          <video 
                            src={media.url} 
                            controls
                            muted
                            preload="metadata"
                          >
                            Your browser does not support the video tag.
                          </video>
                          <div className="media-type-badge">Video</div>
                        </div>
                      ) : (
                        <div className="image-container">
                          <img src={media.url} alt={`Preview ${index + 1}`} />
                          <div className="media-type-badge">Photo</div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="remove-media-btn"
                      onClick={() => removeMedia(index)}
                      title="Remove file"
                    >
                      <span>×</span>
                    </button>
                    <div className="media-info">
                      <span className="media-name">{media.name}</span>
                      <span className="media-size">{(media.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="media-summary">
                <span className="file-count">{mediaFiles.length} file(s) selected</span>
                <span className="total-size">
                  Total: {(mediaFiles.reduce((total, file) => total + (file?.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </>
          )}
        </div>
        
        {/* Layout of Property */}
        {shouldShowField('floorPlan') && (
          <>
            <h4 className="subsection-title">Layout of Property</h4>
            
            <div className="layout-section">
              <div className="form-group">
                <label htmlFor="layoutFile">Floor Plan (PDF, JPG, PNG)</label>
                <p className="section-description">Upload floor plan and provide property details</p>
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
            <div style={{ marginTop: '1rem' }}>
              {floorPlanFile && (
                <div className="uploaded-file">
                  {floorPlanFile.type.startsWith('image/') && (
                    <div className="layout-preview-container">
                      <img 
                        src={URL.createObjectURL(floorPlanFile)} 
                        alt="Layout Preview" 
                        className="layout-preview-image"
                      />
                    </div>
                  )}
                  <div className="file-info">
                    <span className="file-name">{floorPlanFile.name}</span>
                    <button 
                      type="button" 
                      className="remove-file-btn"
                      onClick={() => setFloorPlanFile(null)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              {!floorPlanFile && existingLayoutUrl && (
                <div className="uploaded-file">
                  {/* If existing file is an image, show preview; otherwise show link */}
                  {/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(existingLayoutUrl) ? (
                    <div className="layout-preview-container">
                      <img 
                        src={existingLayoutUrl} 
                        alt="Existing Layout" 
                        className="layout-preview-image"
                      />
            </div>
                  ) : (
                    <div className="layout-preview-container" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 0'
                    }}>
                      <a href={existingLayoutUrl} target="_blank" rel="noreferrer" className="file-name">
                        {existingLayoutName || 'View existing floor plan'}
                      </a>
                    </div>
                  )}
                  <div className="file-info">
                    <span className="file-name">{existingLayoutName || 'Existing floor plan'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
              {/* Property Details */}
              {(shouldShowField('apartmentSize') || shouldShowField('floorNumber')) && (
                <div className="form-row">
                  {shouldShowField('apartmentSize') && (
                    <TextInput
                      label="Approximate Area"
                      name="apartmentSize"
                      value={formData.apartmentSize || ""}
                      onChange={handleChange}
                      placeholder="e.g. 106.4 sq m"
                      type="text"
                      inputMode="text"
                    />
                  )}
                  
                  {shouldShowField('floorNumber') && (
                    <TextInput
                      label="Floor Number"
                      name="floorNumber"
                      value={formData.floorNumber || ""}
                      onChange={handleChange}
                      placeholder="e.g. 10"
                    />
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* EPC Document Upload - Not for land */}
        {shouldShowField('epcDocument') && (
          <>
            <h4 className="subsection-title">
              Upload EPC Document {isCommercialProperty(formData.propertyType) ? "(if applicable)" : "(Mandatory by Law)"}
            </h4>
            
            {/* Info message for commercial EPC */}
            {isCommercialProperty(formData.propertyType) && (
              <div className="form-tip" style={{ 
                background: '#fef3c7', 
                borderColor: '#f59e0b',
                marginBottom: '0.75rem',
                fontSize: '0.9rem'
              }}>
                <i className="fas fa-lightbulb"></i>
                <span>Commercial properties have different EPC requirements. Upload if available.</span>
              </div>
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
                    <small>PDF, JPG, PNG • Max 512MB • {isCommercialProperty(formData.propertyType) ? "Optional for commercial" : "Required by law"}</small>
                  </div>
                </div>
              </label>
              {epcDocumentFile && (
                <div className="uploaded-file">
              {/* Show preview if the uploaded EPC is an image; otherwise just show file name */}
              {epcDocumentFile.type.startsWith('image/') && (
                <div className="layout-preview-container">
                  <img 
                    src={URL.createObjectURL(epcDocumentFile)} 
                    alt="EPC Preview" 
                    className="layout-preview-image"
                  />
                </div>
              )}
                  <div className="file-info">
                    <span className="file-name">{epcDocumentFile.name}</span>
                    <button 
                      type="button" 
                      className="remove-file-btn"
                      onClick={() => setEpcDocumentFile(null)}
                  title="Remove EPC document"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
          {!epcDocumentFile && existingEpcUrl && (
            <div className="uploaded-file">
              {/* If existing EPC is an image, show preview; otherwise link */}
              {/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(existingEpcUrl) ? (
                <div className="layout-preview-container">
                  <img 
                    src={existingEpcUrl} 
                    alt="Existing EPC" 
                    className="layout-preview-image"
                  />
            </div>
              ) : (
                <div className="layout-preview-container" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 0'
                }}>
                  <a href={existingEpcUrl} target="_blank" rel="noreferrer" className="file-name">
                    {existingEpcName || 'View existing EPC'}
                  </a>
          </div>
              )}
              <div className="file-info">
                <span className="file-name">{existingEpcName || 'Existing EPC'}</span>
        </div>
            </div>
          )}
            </div>
          </>
        )}
        
        {/* Virtual Tour Link */}
        <h4 className="subsection-title">Virtual Tour/Video Link (Optional)</h4>
        <TextInput
          label="Virtual Tour Link"
          name="virtualTourLink"
          value={formData.virtualTourLink || ""}
          onChange={handleChange}
          placeholder={isLandProperty(formData.propertyType) ? "Virtual tour URL (optional for land)" : "YouTube/Vimeo link or 360° tour URL"}
        />
      </>
    );
  };

  // Render Step 7: Additional Info
  const renderStep7 = () => {
    return (
      <>
        {/* Expert Team Contact (shared component) */}
        <ContactInformationSection formData={formData} setFormData={setFormData} handleChange={handleChange} />
        
        <h3 className="section-title">Additional Information</h3>
        <div className="form-group">
          {shouldShowField('yearBuilt') && (
            <TextInput
              label="Year Built (Approximate)"
              name="yearBuilt"
              type="number"
              value={formData.yearBuilt}
              onChange={handleChange}
              placeholder="e.g., 1995"
              min="1500"
              max={new Date().getFullYear()}
            />
          )}
          {shouldShowField('heatingType') && (
            <SelectInput
              label="Heating Type"
              name="heatingType"
              value={formData.heatingType}
              onChange={handleChange}
              options={heatingTypeOptions}
            />
          )}
          {shouldShowField('broadbandAvailability') && (
            <SelectInput
              label="Broadband Availability"
              name="broadbandAvailability"
              value={formData.broadbandAvailability}
              onChange={handleChange}
              options={broadbandOptions}
            />
          )}
          <TextInput
            label="Accessibility Features"
            name="accessibilityFeatures"
            value={formData.accessibilityFeatures}
            onChange={handleChange}
            placeholder={isLandProperty(formData.propertyType) ? "e.g., Level access, wide pathways" : "e.g., Wheelchair access, lifts, ramps"}
          />
        </div>
      </>
    );
  };

  const renderCurrentStep = () => {
    switch(currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      case 6:
        return renderStep6();
      case 7:
        return renderStep7();
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
        <div className="form-title-add">ADD LISTING FOR SALE</div>
        <ul className="form-title-find-link">
          {!editMode && (
          <li><Link to="/seller">BACK TO ADD LISTING</Link></li>
          )}
        </ul>
      </div>

      {/* Progress Bar */}
      <div className="form-progress">
        {[1, 2, 3, 4, 5, 6, 7].map((step) => (
          <React.Fragment key={step}>
            <div className={`progress-step ${currentStep >= step ? 'active' : ''}`}>{step}</div>
            {step < 7 && <div className={`progress-line ${currentStep > step ? 'active' : ''}`}></div>}
          </React.Fragment>
        ))}
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
        {approvedPropertyNotification && (
          <div className="alert alert-warning" style={{ marginBottom: '0.5rem', marginTop: '0' }}>
            {approvedPropertyNotification}
          </div>
        )}
        <form onSubmit={(e) => e.preventDefault()} className="property-form">
          {renderCurrentStep()}

          {/* Navigation Buttons */}
          <div className="form-buttons">
            <div className="left-buttons">
              {currentStep > 1 && (
              <button 
                type="button" 
                className="back-btn"
                onClick={goToPrevStep}
              >
                Back
              </button>
              )}
              <button 
                type="button" 
                className="back-btn"
                onClick={() => navigate(returnPath)}
                style={{ marginLeft: currentStep > 1 ? '8px' : 0 }}
              >
                Cancel
              </button>
            </div>
            
            {currentStep < 7 ? (
              <button 
                type="button" 
                className="next-btn"
                onClick={goToNextStep}
              >
                Continue
              </button>
            ) : (
              <button 
                type="button" 
                className={`submit-btn ${submitStatus === 'success' ? 'success' : ''}`}
                disabled={isSubmitting || submitStatus === 'success'}
                onClick={handleSubmit}
              >
                {submitStatus === 'loading' && 'Submitting...'}
                {submitStatus === 'success' && 'Submitted ✔'}
                {submitStatus === 'idle' || submitStatus === 'error' ? 'Submit Listing' : ''}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddList;
