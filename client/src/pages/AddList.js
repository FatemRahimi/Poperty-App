import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import EarnestDepositSection from "../components/formSections/EarnestDepositSection";
import CheckboxInput from "../components/inputs/CheckboxInput";
import Logo from "../components/Logo";
import "../styles/AddList.css"; // your custom CSS file
import useSessionStorage from "../Utils/useSessionStorage";

// Property Type Options
const propertyTypeOptions = [
  { value: "detached", label: "Detached" },
  { value: "semi-detached", label: "Semi-Detached" },
  { value: "terraced", label: "Terraced" },
  { value: "flat", label: "Flat" },
  { value: "bungalow", label: "Bungalow" },
  { value: "land", label: "Land" },
  { value: "park_home", label: "Park Home" },
  { value: "student_hall", label: "Student Hall" }
];

const propertySubtypeOptions = [
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
];

// Options for step 2
const parkingOptions = [
  { value: "garage", label: "Garage" },
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "Street Parking" },
  { value: "none", label: "None" },
];

const furnishedOptions = [
  { value: "furnished", label: "Furnished" },
  { value: "unfurnished", label: "Unfurnished" },
];

const epcOptions = ["A", "B", "C", "D", "E", "F", "G"].map((r) => ({ value: r, label: r }));
const councilTaxOptions = ["A", "B", "C", "D", "E", "F", "G", "H"].map((b) => ({ value: b, label: `Band ${b}` }));

const AddList = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviewUrls, setMediaPreviewUrls] = useState([]);
  
  const [formData, setFormData] = useSessionStorage("propertyListingForm", {
    // Step 1: Basic Property Information
    propertyType: "",
    propertySubtype: "",
    propertyName: "",
    isPrivate: false,
    askingPrice: "",
    unpriced: false,
    streetAddress: "",
    city: "",
    postalCode: "",
    earnestDepositAmount: "",
    earnestDepositType: "$",
    dueDiligencePeriod: "",
    closingPeriod: "",
    loiRequired: false,
    expirationDate: "",
    reminderDays: "",
    
    // Step 2: Property Details
    bedrooms: "",
    bathrooms: "",
    receptionRooms: "",
    floorArea: "",
    tenure: "",
    chainFree: false,
    garden: false,
    parking: "",
    furnished: "",
    epcRating: "",
    councilTaxBand: "",
    builtYear: "",
    nearestStation: "",
    primarySchoolNearby: "",
    secondarySchoolNearby: "",
    interestRate: "",
    mortgageEstimate: "",
    
    // Step 3: Additional Information
    description: "",
    shortDescription: "",
    features: [],
    mediaFiles: [],
    contactPhone: "",
    houseNumber: "",
    streetName: "",
    country: "",
  });

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("token");
    if (!isLoggedIn) {
      alert("❌ Please log in to submit a property.");
      navigate("/login");
      return;
    }
  }, [navigate]);

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
      // Check individual file sizes (1GB = 1024 * 1024 * 1024 bytes)
      const maxFileSize = 1024 * 1024 * 1024; // 1GB
      const oversizedFiles = files.filter(file => file.size > maxFileSize);
      
      if (oversizedFiles.length > 0) {
        alert(`Some files are too large. Maximum file size is 1GB per file.\nOversized files: ${oversizedFiles.map(f => f.name).join(', ')}`);
        return;
      }
      
      // Limit to 15 files
      if (mediaFiles.length + files.length > 15) {
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
      
      const newMediaFiles = [...mediaFiles, ...files];
      setMediaFiles(newMediaFiles);
      
      // Generate preview URLs
      const newPreviewUrls = files.map(file => ({
        url: URL.createObjectURL(file),
        type: file.type,
        name: file.name,
        size: file.size
      }));
      setMediaPreviewUrls(prev => [...prev, ...newPreviewUrls]);
      
      // Update form data
      setFormData(prev => ({
        ...prev,
        mediaFiles: newMediaFiles
      }));
    }
  };

  const removeMedia = (index) => {
    const newMediaFiles = mediaFiles.filter((_, i) => i !== index);
    const newPreviewUrls = mediaPreviewUrls.filter((_, i) => i !== index);
    
    // Revoke the URL to free memory
    URL.revokeObjectURL(mediaPreviewUrls[index].url);
    
    setMediaFiles(newMediaFiles);
    setMediaPreviewUrls(newPreviewUrls);
    setFormData(prev => ({
      ...prev,
      mediaFiles: newMediaFiles
    }));
  };

  const validateStep1 = () => {
    const isAddressRequired = showAddressForm;
  
    // Check if at least one price field is filled
    const hasPrice = formData.askingPrice;
  
    const isFormIncomplete =
      !formData.propertyType ||
      !formData.propertySubtype ||
      !formData.propertyName ||
      (!formData.unpriced && !hasPrice) ||
      (isAddressRequired &&
        (!formData.houseNumber || !formData.streetName || !formData.city || !formData.country || !formData.postalCode)) ||
      !formData.earnestDepositAmount || 
      !formData.dueDiligencePeriod ||
      !formData.closingPeriod ||
      !formData.expirationDate ||
      !formData.reminderDays;
  
    if (isFormIncomplete) {
      alert("❌ Please fill in all required fields before continuing.");
      return false;
    }
    
    return true;
  };

  const validateStep2 = () => {
    const requiredFields = [
      "bedrooms",
      "bathrooms",
      "receptionRooms",
      "floorArea",
      "tenure",
      "parking",
      "furnished",
      "epcRating",
      "councilTaxBand",
      "builtYear",
      "nearestStation",
      "interestRate",
      "mortgageEstimate",
    ];
  
    const missingFields = requiredFields.filter((field) => {
      return formData[field] === "" || formData[field] === null;
    });
  
    if (missingFields.length > 0) {
      alert("❌ Please fill in all required fields before continuing.");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.description.trim()) {
      alert("❌ Please provide a property description before submitting.");
      return false;
    }
    if (!formData.shortDescription?.trim()) {
      alert("❌ Please provide a short description for property cards before submitting.");
      return false;
    }
    if (!formData.contactPhone.trim()) {
      alert("❌ Please provide a contact phone number before submitting.");
      return false;
    }
    return true;
  };

  const goToNextStep = () => {
    // Validate current step fields
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
      window.scrollTo(0, 0); // Scroll to top for better UX
    }
  };

  const goToPrevStep = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo(0, 0); // Scroll to top for better UX
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const formDataToSend = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (key !== 'mediaFiles') {
          formDataToSend.append(key, formData[key]);
        }
      });
      
      // Add media files
      mediaFiles.forEach(file => {
        formDataToSend.append('images', file);
      });
      
      const response = await fetch('/api/properties', {
        method: 'POST',
        body: formDataToSend,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit property');
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('Property submitted successfully!');
        navigate('/dashboard');
      } else {
        throw new Error(data.message || 'Failed to submit property');
      }
    } catch (error) {
      console.error('Error submitting property:', error);
      alert(`Error submitting property: ${error.message}`);
    }
  };

  // Render Step 1: Basic Property Information
  const renderStep1 = () => {
    return (
      <div className="step-container">
        <h2>Basic Property Information</h2>
        <div className="form-group">
          <SelectInput
            label="Property Type"
            name="propertyType"
            value={formData.propertyType}
            onChange={handleChange}
            options={propertyTypeOptions}
            required
          />
          <SelectInput
            label="Property Subtype"
            name="propertySubtype"
            value={formData.propertySubtype}
            onChange={handleChange}
            options={propertySubtypeOptions}
            required
          />
          <TextInput
            label="Property Name"
            name="propertyName"
            value={formData.propertyName}
            onChange={handleChange}
            required
          />
          <div className="price-section">
            <TextInput
              label="Asking Price"
              name="askingPrice"
              type="number"
              value={formData.askingPrice}
              onChange={handleChange}
              required={!formData.unpriced}
              disabled={formData.unpriced}
            />
          </div>
        </div>

        {/* Address Toggle */}
        <button
          type="button"
          className="form-sale-address"
          onClick={() => setShowAddressForm(!showAddressForm)}
        >
          {showAddressForm ? "Hide Address Form" : "Add Address"}
        </button>

        {/* Address Form */}
        {showAddressForm && (
          <div className="address-form">
            <div className="form-row">
              <TextInput
                label="House Number"
                name="houseNumber"
                value={formData.houseNumber}
                onChange={handleChange}
                placeholder="e.g., 123, 45A, Flat 2"
              />
              <TextInput
                label="Street Name"
                name="streetName"
                value={formData.streetName}
                onChange={handleChange}
                placeholder="e.g., Main Street, Oak Avenue"
              />
            </div>
            <div className="form-row">
              <TextInput
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
              />
              <TextInput
                label="Country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="e.g., United Kingdom"
              />
              <TextInput
                label="Postal Code"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
              />
            </div>
          </div>
        )}

        {/* Earnest Deposit Section */}
        <div className="form-group">
          <EarnestDepositSection
            formData={formData}
            handleChange={handleChange}
          />
        </div>

        {/* Due Diligence and Closing Period */}
        <div className="form-row">
          <TextInput
            label="Due Diligence Period (Days)"
            name="dueDiligencePeriod"
            value={formData.dueDiligencePeriod}
            onChange={handleChange}
            type="number"
          />
          <TextInput
            label="Closing Period (Days)"
            name="closingPeriod"
            value={formData.closingPeriod}
            onChange={handleChange}
            type="number"
          />
        </div>

        <h3 className="section-title">Expiration and Reminder</h3>
        {/* Expiration and Reminder */}
        <div className="form-row">
          <TextInput
            label="Listing Expiration Date"
            name="expirationDate"
            value={formData.expirationDate}
            onChange={handleChange}
            type="date"
          />
          <TextInput
            label="Send Reminder (Days before expiration)"
            name="reminderDays"
            value={formData.reminderDays}
            onChange={handleChange}
            type="number"
          />
        </div>
      </div>
    );
  };

  // Render Step 2: Property Details
  const renderStep2 = () => {
    return (
      <>
        {/* Basic Property Details */}
        <h3 className="section-title">Basic Property Details</h3>
        <div className="form-row">
          <TextInput label="Bedrooms" name="bedrooms" value={formData.bedrooms} onChange={handleChange} type="number" />
          <TextInput label="Bathrooms" name="bathrooms" value={formData.bathrooms} onChange={handleChange} type="number" />
          <TextInput label="Reception Rooms" name="receptionRooms" value={formData.receptionRooms} onChange={handleChange} type="number" />
          <TextInput label="Floor Area (m² or ft²)" name="floorArea" value={formData.floorArea} onChange={handleChange} type="number" />
        </div>

        {/* Ownership and Selling Info */}
        <h3 className="section-title">Ownership and Selling Info</h3>
        <SelectInput
          label="Tenure"
          name="tenure"
          value={formData.tenure}
          onChange={handleChange}
          options={[
            { value: "freehold", label: "Freehold" },
            { value: "leasehold", label: "Leasehold" },
            { value: "share_of_freehold", label: "Share of Freehold" },
          ]}
        />
        <div className="checkbox-row">
          <CheckboxInput label="Chain Free" name="chainFree" checked={formData.chainFree} onChange={handleChange} />
        </div>

        {/* Features */}
        <h3 className="section-title">Features</h3>
        <div className="checkbox-row">
          <CheckboxInput label="Garden" name="garden" checked={formData.garden} onChange={handleChange} />
        </div>

        <div className="form-row">
          <SelectInput label="Parking" name="parking" value={formData.parking} onChange={handleChange} options={parkingOptions} />
          <SelectInput label="Furnished" name="furnished" value={formData.furnished} onChange={handleChange} options={furnishedOptions} />
        </div>

        <div className="form-row">
          <SelectInput label="EPC Rating" name="epcRating" value={formData.epcRating} onChange={handleChange} options={epcOptions} />
          <SelectInput label="Council Tax Band" name="councilTaxBand" value={formData.councilTaxBand} onChange={handleChange} options={councilTaxOptions} />
        </div>

        <TextInput label="Built Year" name="builtYear" value={formData.builtYear} onChange={handleChange} type="number" />

        {/* Transport Info */}
        <h3 className="section-title">Transport Info</h3>
        <TextInput label="Nearest Train/Tube Station" name="nearestStation" value={formData.nearestStation} onChange={handleChange} />

        {/* Schools */}
        <h3 className="section-title">Schools (Optional)</h3>
        <TextInput label="Primary School Nearby" name="primarySchoolNearby" value={formData.primarySchoolNearby} onChange={handleChange} />
        <TextInput label="Secondary School Nearby" name="secondarySchoolNearby" value={formData.secondarySchoolNearby} onChange={handleChange} />

        {/* Mortgage Estimation */}
        <h3 className="section-title">Mortgage Estimation (If it is mortgaged)</h3>
        <div className="form-row">
          <TextInput label="Interest Rate (%)" name="interestRate" value={formData.interestRate} onChange={handleChange} type="number" />
          <TextInput label="Monthly Mortgage Estimate (£)" name="mortgageEstimate" value={formData.mortgageEstimate} onChange={handleChange} type="number" />
        </div>
      </>
    );
  };

  // Render Step 3: Additional Information
  const renderStep3 = () => {
    return (
      <>
        <h3 className="section-title">Property Description</h3>
        <div className="form-group">
          <label htmlFor="description">Description*</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="form-textarea"
            rows="6"
            placeholder="Provide a detailed description of your property..."
            required
          ></textarea>
        </div>
        
        <div className="form-group">
          <label htmlFor="shortDescription">Short Description (2 lines for property cards)*</label>
          <textarea
            id="shortDescription"
            name="shortDescription"
            value={formData.shortDescription || ''}
            onChange={handleChange}
            className="form-textarea"
            rows="2"
            maxLength="120"
            placeholder="Brief description for property cards (max 120 characters)..."
            required
          ></textarea>
          <small>{formData.shortDescription?.length || 0}/120 characters</small>
        </div>

        <h4 className="subsection-title">Upload Photos & Videos</h4>
        
        <div className="media-upload-section">
          <div className="upload-area">
            <label htmlFor="media-upload" className="upload-label">
              <div className="upload-content">
                <div className="upload-icon">📷🎥</div>
                <div className="upload-text">
                  <span>Drag & drop or click to upload</span>
                  <small>Photos & videos • Up to 15 files • Max 1GB each</small>
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
                      ) : media.type.startsWith('image/') ? (
                        <div className="image-container">
                          <img src={media.url} alt={`Preview ${index + 1}`} />
                          <div className="media-type-badge">Photo</div>
                        </div>
                      ) : (
                        <div className="file-container">
                          <div className="file-icon">📄</div>
                          <div className="file-name">{media.name}</div>
                          <div className="media-type-badge">File</div>
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

        <h3 className="section-title">Additional Features</h3>
        <div className="form-group">
          <label>Property Highlights (Optional)</label>
          <div className="checkbox-group">
            <CheckboxInput 
              label="New Build" 
              name="newBuild" 
              checked={formData.newBuild || false} 
              onChange={handleChange} 
            />
            <CheckboxInput 
              label="Recently Renovated" 
              name="renovated" 
              checked={formData.renovated || false} 
              onChange={handleChange} 
            />
            <CheckboxInput 
              label="Historic Property" 
              name="historic" 
              checked={formData.historic || false} 
              onChange={handleChange} 
            />
            <CheckboxInput 
              label="Investment Opportunity" 
              name="investment" 
              checked={formData.investment || false} 
              onChange={handleChange} 
            />
          </div>
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
          <small>Potential buyers will use this number to contact you about viewings</small>
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
        <div className={`progress-step ${currentStep >= 1 ? 'active' : ''}`}>1</div>
        <div className={`progress-line ${currentStep >= 2 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentStep >= 2 ? 'active' : ''}`}>2</div>
        <div className={`progress-line ${currentStep >= 3 ? 'active' : ''}`}></div>
        <div className={`progress-step ${currentStep >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
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
