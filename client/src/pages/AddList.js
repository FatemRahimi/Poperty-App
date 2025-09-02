import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import DateInput from "../components/inputs/DateInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import Logo from "../components/Logo";
import "../styles/AddList.css";
import useSessionStorage from "../Utils/useSessionStorage";
import "../styles/CrossBrowserReset.css";
import { useAuth } from "../context/AuthContext";

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

// EPC Rating Options
const epcOptions = ["A", "B", "C", "D", "E", "F", "G"].map((r) => ({ value: r, label: r }));
const councilTaxOptions = ["A", "B", "C", "D", "E", "F", "G", "H"].map((b) => ({ value: b, label: `Band ${b}` }));

const AddList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // Check if we're in edit mode and get return path
  const editMode = location.state?.editMode || false;
  const propertyData = location.state?.propertyData || null;
  const returnPath = location.state?.returnPath || '/seller';
  
  const [currentStep, setCurrentStep] = useState(1);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState([]);
  const [floorPlanFile, setFloorPlanFile] = useState(null);
  const [epcDocumentFile, setEpcDocumentFile] = useState(null);
  const [approvedPropertyNotification, setApprovedPropertyNotification] = useState("");
  
  const [formData, setFormData] = useState({
    // Step 1: Property Basics
    propertyTitle: "",
    propertyType: "",
    tenure: "",
    bedrooms: "",
    bathrooms: "",
    receptionRooms: "",
    floorArea: "",
    floorAreaUnit: "sq_m",
    epcRating: "",
    
    // Step 2: Location Info
    houseNumber: "",
    fullAddress: "",
    city: "",
    country: "United Kingdom",
    region: "",
    postcode: "",
    localAuthority: "",
    nearestTransportLinks: "",
    
    // Step 3: Financials
    askingPrice: "",
    priceType: "fixed_price",
    serviceCharges: "",
    groundRent: "",
    councilTaxBand: "",
    
    // Step 4: Property Description
    shortDescription: "",
    fullDescription: "",
    
    // Step 5: Key Features
    hasGarden: false,
    hasParking: false,
    hasBalconyTerrace: false,
    isNewBuild: false,
    isChainFree: false,
    isRecentlyRenovated: false,
    hasAccessibleAccess: false,
    isFurnished: false,
    
    // Step 6: Additional Info
    yearBuilt: "",
    heatingType: "",
    broadbandAvailability: "",
    accessibilityFeatures: "",
    apartmentSize: "",
    floorNumber: "",
    virtualTourLink: "",
  });

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
    if (editMode && propertyData?.status === 'approved') {
      setApprovedPropertyNotification(
        "⚠️ You are editing an approved property. After saving, it will require admin approval before being visible again."
      );
    }
  }, [editMode, propertyData]);

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
    switch(step) {
      case 1: // Property Basics
        if (!formData.propertyTitle.trim() || !formData.propertyType || !formData.bedrooms || !formData.bathrooms || !formData.epcRating) {
          alert("❌ Please fill in all required property basics fields.");
          return false;
        }
        break;
      case 2: // Location Info
        if (!formData.fullAddress.trim() || !formData.postcode.trim()) {
          alert("❌ Please fill in all required location fields.");
          return false;
        }
        break;
      case 3: // Financials
        if (!formData.askingPrice.trim() || !formData.councilTaxBand) {
          alert("❌ Please fill in all required financial fields.");
          return false;
        }
        break;
      case 4: // Property Description
        if (!formData.shortDescription.trim() || !formData.fullDescription.trim()) {
          alert("❌ Please fill in all required description fields.");
          return false;
        }
        break;
      case 5: // Key Features - no validation needed
        break;
      case 6: // Media Uploads - no validation needed
        break;
      case 7: // Additional Info - no validation needed
        break;
    }
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
    
    if (!validateStep(currentStep)) return;
    
    try {
      const formDataToSend = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (formData[key] !== undefined && formData[key] !== null && formData[key] !== '') {
          formDataToSend.append(key, formData[key]);
        }
      });
      
      // Add listing type
      formDataToSend.append('listingType', 'sale');
      
      // Handle status for approved properties being edited
      if (editMode && propertyData?.status === 'approved') {
        formDataToSend.append('status', 'pending');
      }
      
      // Add media files
      mediaFiles.forEach(file => {
        formDataToSend.append('photos', file);
      });
      
      // Add floor plan
      if (floorPlanFile) {
        formDataToSend.append('floorPlan', floorPlanFile);
      }
      
      // Add EPC document
      if (epcDocumentFile) {
        formDataToSend.append('epcDocument', epcDocumentFile);
      }
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/properties/submit`, {
        method: 'POST',
        body: formDataToSend,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('Property submitted successfully! You will receive a confirmation email shortly.');
        sessionStorage.removeItem("propertyListingForm");
        navigate('/dashboard');
      } else {
        throw new Error(data.message || 'Failed to submit property');
      }
    } catch (error) {
      console.error('Error submitting property:', error);
      alert(`Error submitting property: ${error.message}`);
    }
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
            required
          />
        </div>
        
        {/* Bedrooms, Bathrooms, and Reception Rooms */}
        <div className="form-row three-cols">
          <TextInput
            label="Bedrooms"
            name="bedrooms"
            type="number"
            value={formData.bedrooms}
            onChange={handleChange}
            required
            min="0"
          />
          
          <TextInput
            label="Bathrooms"
            name="bathrooms"
            type="number"
            value={formData.bathrooms}
            onChange={handleChange}
            required
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
        
        {/* Floor Area and Tenure */}
        <div className="form-row">
          <TextInput
            label="Floor Area"
            name="floorArea"
            type="number"
            value={formData.floorArea}
            onChange={handleChange}
            required
            placeholder="Enter floor area"
          />
          
          <SelectInput
            label="Floor Area Unit"
            name="floorAreaUnit"
            value={formData.floorAreaUnit}
            onChange={handleChange}
            options={[
              { value: "sq_m", label: "Square Meters" },
              { value: "sq_ft", label: "Square Feet" }
            ]}
          />
        </div>
        
        {/* Tenure and EPC Rating */}
        <div className="form-row">
          <SelectInput
            label="Tenure"
            name="tenure"
            value={formData.tenure}
            onChange={handleChange}
            options={tenureOptions}
            required
          />
          
          <SelectInput
            label="EPC Rating"
            name="epcRating"
            value={formData.epcRating}
            onChange={handleChange}
            options={epcOptions}
            required
          />
        </div>
      </>
    );
  };

  // Render Step 2: Location Info
  const renderStep2 = () => {
    return (
      <>
        <h3 className="section-title">Location Information</h3>
        
        {/* Address Line 1 */}
        <div className="form-row">
          <TextInput
            label="House Number"
            name="houseNumber"
            value={formData.houseNumber || ""}
            onChange={handleChange}
            placeholder="123, Flat 2A"
            required
          />
          
          <TextInput
            label="Address (Area, Address Line 1, Line 2, Separate with Comma)"
            name="fullAddress"
            value={formData.fullAddress}
            onChange={handleChange}
            placeholder="e.g. Westminster, Main Street, Oak Avenue"
            required
          />
        </div>
        
        {/* City, Country, Region Row */}
        <div className="form-row three-cols">
          <TextInput
            label="City/Town"
            name="city"
            value={formData.city || ""}
            onChange={handleChange}
            placeholder="London"
            required
            className="muted-placeholder"
          />
          
          <TextInput
            label="Country"
            name="country"
            value={formData.country || "United Kingdom"}
            onChange={handleChange}
            placeholder="United Kingdom"
            required
            className="muted-placeholder"
          />
          
          <TextInput
            label="Region"
            name="region"
            value={formData.region || ""}
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
        
        {/* Local Authority and Transport Links */}
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
        
        {/* Asking Price and Price Type */}
        <div className="form-row">
          <TextInput
            label="Asking Price"
            name="askingPrice"
            type="number"
            value={formData.askingPrice}
            onChange={handleChange}
            required
            placeholder="Enter asking price in £"
          />
          
          <SelectInput
            label="Price Type"
            name="priceType"
            value={formData.priceType}
            onChange={handleChange}
            options={priceTypeOptions}
            required
          />
        </div>
        
        {/* Service Charges and Ground Rent */}
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
        
        {/* Council Tax Band */}
        <div className="form-row single-col" style={{maxWidth: '300px'}}>
          <SelectInput
            label="Council Tax Band"
            name="councilTaxBand"
            value={formData.councilTaxBand}
            onChange={handleChange}
            options={councilTaxOptions}
            required
          />
        </div>
      </>
    );
  };

  // Render Step 4: Property Description
  const renderStep4 = () => {
    return (
      <>
        <h3 className="section-title">Property Description</h3>
        
        <div className="form-group">
          <TextInput
            label="Short Description"
            name="shortDescription"
            value={formData.shortDescription}
            onChange={handleChange}
            required
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
              placeholder="Provide a detailed description of your property. Highlight key features, renovations, unique selling points..."
              required
            ></textarea>
          </div>
        </div>
        
        <div className="form-tip">
          <i className="fas fa-lightbulb"></i>
          <span>Encourage sellers to highlight key features, renovations, unique selling points.</span>
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
            <label htmlFor="hasParking">Parking (Garage/Driveway/Permit)</label>
          </div>
          
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
              id="isFurnished" 
              name="isFurnished" 
              checked={formData.isFurnished}
              onChange={handleChange}
            />
            <label htmlFor="isFurnished">Furnished/Unfurnished (if applicable)</label>
          </div>
        </div>
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
                  <small>Photos & videos • Up to 20 files • Max 1GB each • Min 5 required</small>
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
        
        {/* Floor Plan Upload */}
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
            </div>
          </div>
          
          {/* Property Details */}
          <div className="form-row">
            <TextInput
              label="Approximate Area"
              name="apartmentSize"
              value={formData.apartmentSize || ""}
              onChange={handleChange}
              placeholder="e.g. 106.4 sq m"
              type="text"
              inputMode="text"
            />
            
            <TextInput
              label="Floor Number"
              name="floorNumber"
              value={formData.floorNumber || ""}
              onChange={handleChange}
              placeholder="e.g. 10"
            />
          </div>
        </div>
        
        {/* EPC Document Upload */}
        <h4 className="subsection-title">Upload EPC Document (Mandatory by Law)</h4>
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
            <div className="uploaded-file">
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
          )}
        </div>
        
        {/* Virtual Tour Link */}
        <h4 className="subsection-title">Virtual Tour/Video Link (Optional)</h4>
        <TextInput
          label="Virtual Tour Link"
          name="virtualTourLink"
          value={formData.virtualTourLink || ""}
          onChange={handleChange}
          placeholder="YouTube/Vimeo link or 360° tour URL"
        />
      </>
    );
  };

  // Render Step 7: Additional Info
  const renderStep7 = () => {
    return (
      <>
        <h3 className="section-title">Additional Information</h3>
        <div className="form-group">
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
          <SelectInput
            label="Heating Type"
            name="heatingType"
            value={formData.heatingType}
            onChange={handleChange}
            options={heatingTypeOptions}
          />
          <SelectInput
            label="Broadband Availability"
            name="broadbandAvailability"
            value={formData.broadbandAvailability}
            onChange={handleChange}
            options={broadbandOptions}
          />
          <TextInput
            label="Accessibility Features"
            name="accessibilityFeatures"
            value={formData.accessibilityFeatures}
            onChange={handleChange}
            placeholder="e.g., Wheelchair access, lifts, ramps"
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
          <li><Link to="/seller">BACK TO ADD LISTING</Link></li>
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
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            {approvedPropertyNotification}
          </div>
        )}
        <form onSubmit={handleSubmit} className="property-form">
          {renderCurrentStep()}

          {/* Navigation Buttons */}
          <div className="form-buttons">
            {currentStep > 1 ? (
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
                type="submit" 
                className="submit-btn"
              >
                Submit Listing
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddList;
