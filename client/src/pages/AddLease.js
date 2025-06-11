import React, { useState, useEffect } from "react";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import Logo from "../components/Logo";
import "../styles/AddList.css";
import { useNavigate, Link } from "react-router-dom";
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
  const { user, isAuthenticated, loading } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddress, setShowAddress] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useSessionStorage("addLeaseCompleteForm", {
    // Step 1: Basic Space Info
    spaceType: "",
    spaceSubtypes: "",
    spaceName: "",
    country: "UK",
    city: "",
    postalCode: "",
    address: "",
    buildingSize: "",
    minDivisible: "",
    vacantSQFT: "",
    landAcres: "",
    lotSize: "",
    lotSizeUnit: "acres",
    taxesPerSQFT: "",
    parkingSpaces: "",
    power: "",
    zoning: "",
    leaseType: "",
    isMultipleTenancy: false,
    
    // Step 2: Lease Terms & Features
    leaseLength: "",
    breakClause: false,
    rentPerMonth: "",
    serviceCharge: "",
    depositRequired: false,
    depositAmount: "",
    businessRates: "",
    utilities: {
      water: false,
      gas: false,
      internet: false,
      electricity: false,
    },
    heatingCooling: "",
    toiletKitchen: "",
    security: {
      cctv: false,
      keyFob: false,
      secureAccess: false,
    },
    parkingAvailable: false,
    disabilityAccess: false,
    floorLoadCapacity: "",
    useClass: "",
    openingHours: "",
    signageAllowed: false,
    
    // Step 3: Description & Photos
    description: "",
    files: [],
    contactPhone: ""
  });

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      // Store the current path to redirect back after login
      sessionStorage.setItem('redirectAfterLogin', '/addlease');
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

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
    
    if (photoFiles.length + files.length > 10) {
      alert("You can upload a maximum of 10 files");
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
    const requiredFields = [
      "spaceType",
      "spaceSubtypes", 
      "spaceName",
      "buildingSize",
      "vacantSQFT",
      "leaseType",
    ];
    
    if (showAddress) {
      requiredFields.push("address");
    }
    
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      alert(`❌ Please complete the following required fields: ${missingFields.join(', ')}`);
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const requiredFields = ["leaseLength", "rentPerMonth", "useClass"];
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
    return true;
  };

  // Navigation functions
  const goToNextStep = () => {
    let isValid = false;
    
    switch(currentStep) {
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
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const goToPrevStep = () => {
    setCurrentStep(prev => prev - 1);
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
        property_type: 'lease', // Set type as lease
        propertyType: 'lease',
        
        // Address fields
        address_line1: formData.address,
        streetAddress: formData.address,
        city: formData.city,
        state: '', // Not collected in lease form
        region: '', 
        zip_code: formData.postalCode,
        postcode: formData.postalCode,
        country: formData.country,
        
        // Lease-specific fields
        monthly_rent: formData.rentPerMonth,
        rentalPrice: formData.rentPerMonth,
        lease_term: formData.leaseLength,
        tenancyLength: formData.leaseLength,
        deposit_amount: formData.depositAmount,
        depositAmount: formData.depositAmount,
        
        // Building details
        square_feet: formData.buildingSize,
        lot_size: formData.lotSize,
        parking_spaces: formData.parkingSpaces,
        
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
        parkingAvailable: formData.parkingAvailable,
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
      
      // Make API call to submit property
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/properties/submit`, {
        method: 'POST',
        body: submitFormData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit property');
      }
      
      const result = await response.json();
      console.log("✅ Lease Property Submitted Successfully:", result);
      
      setSuccess("Property submitted successfully! You will receive a confirmation email shortly.");
      
      // Clear form data and redirect to dashboard after short delay
      setTimeout(() => {
        sessionStorage.removeItem("addLeaseCompleteForm");
        navigate("/dashboard");
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
            <TextInput label="Address*" name="address" value={formData.address} onChange={handleChange} />
            <TextInput label="Postal Code" name="postalCode" value={formData.postalCode} onChange={handleChange} />
          </div>
          <div className="form-row">
            <TextInput label="City" name="city" value={formData.city} onChange={handleChange} />
            <TextInput label="Country" name="country" value={formData.country} onChange={handleChange} disabled />
          </div>
        </>
      )}

      <h3 className="section-title">Building Details</h3>
      <div className="form-row">
        <TextInput label="Building Size (sqft)*" name="buildingSize" value={formData.buildingSize} onChange={handleChange} type="number" />
        <TextInput label="Min Divisible (sqft)" name="minDivisible" value={formData.minDivisible} onChange={handleChange} type="number" />
        <TextInput label="Vacant SQFT*" name="vacantSQFT" value={formData.vacantSQFT} onChange={handleChange} type="number" />
      </div>

      <div className="form-row">
        <TextInput label="Land Acres" name="landAcres" value={formData.landAcres} onChange={handleChange} type="number" />
        <TextInput label="Lot Size" name="lotSize" value={formData.lotSize} onChange={handleChange} type="number" />
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
        <TextInput type="number" label="Lease Length (years)*" name="leaseLength" value={formData.leaseLength} onChange={handleChange} />
        <TextInput type="number" label="Rent per Month (£)*" name="rentPerMonth" value={formData.rentPerMonth} onChange={handleChange} />
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
        <CheckboxInput label="Parking Available" name="parkingAvailable" checked={formData.parkingAvailable} onChange={handleChange} />
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
                <small>Photos & videos • Up to 10 files • Max 1GB each</small>
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
                        <video src={url} controls>
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
        <small>Potential tenants will use this number to contact you about lease inquiries</small>
      </div>
    </>
  );

  const renderCurrentStep = () => {
    switch(currentStep) {
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
        <div className="form-title-add">ADD LISTING FOR LEASE</div>
        <ul className="form-title-find-link">
          <li><Link to="/seller">BACK TO ADD LISTING</Link></li>
        </ul>
      </div>

      {/* Progress Bar */}
      <div className="form-progress">
        <div className={`progress-step ${currentStep >= 1 ? 'active' : ''}`}>1</div>
        <div className={`progress-line ${currentStep >= 2 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentStep >= 2 ? 'active' : ''}`}>2</div>
        <div className={`progress-line ${currentStep >= 3 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentStep >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        
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
                onClick={() => navigate('/seller')}
              >
                Cancel
              </button>
            )}
            
            {currentStep < 3 ? (
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
                disabled={isLoading}
              >
                {isLoading ? 'Submitting...' : 'Submit Listing'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLease;
