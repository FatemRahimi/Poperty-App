import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import EarnestDepositSection from "../components/formSections/EarnestDepositSection";
import CheckboxInput from "../components/inputs/CheckboxInput";
import "../styles/AddList.css"; // your custom CSS file
import useSessionStorage from "../Utils/useSessionStorage";

// Property Type Options
const propertyTypeOptions = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "land", label: "Land" },
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
    // Add any fields from AdditionalListing component
    description: "",
    features: [],
    photos: []
  });

  useEffect(() => {
    const isLoggedIn = sessionStorage.getItem("token");
    if (!isLoggedIn) {
      navigate("/login"); // Redirect to login if not authenticated
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validateStep1 = () => {
    const isAddressRequired = showAddressForm;
  
    const isFormIncomplete =
      !formData.propertyType ||
      !formData.propertySubtype ||
      !formData.propertyName ||
      (!formData.unpriced && !formData.askingPrice) ||
      (isAddressRequired &&
        (!formData.streetAddress || !formData.city || !formData.postalCode)) ||
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
    // Add validation for step 3 fields
    if (!formData.description) {
      alert("❌ Please provide a property description before submitting.");
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateStep3()) {
      // Submit all data to backend
      console.log("✅ Complete Form Submitted:", formData);
      
      // Here you would make your API call to submit the data
      // Example: axios.post('/api/properties', formData)
      
      alert("Property listing submitted successfully!");
      
      // Clear form data and redirect to dashboard
      sessionStorage.removeItem("propertyListingForm");
      navigate("/dashboard");
    }
  };

  // Render Step 1: Basic Property Information
  const renderStep1 = () => {
    return (
      <>
        {/* Property Type */}
        <SelectInput
          label="Property Type"
          name="propertyType"
          value={formData.propertyType}
          onChange={handleChange}
          options={propertyTypeOptions}
          required
        />

        {/* Property Subtype */}
        <SelectInput
          label="Property Subtype"
          name="propertySubtype"
          value={formData.propertySubtype}
          onChange={handleChange}
          options={propertySubtypeOptions}
          required
        />

        {/* Property Name */}
        <TextInput
          label="Property Name"
          name="propertyName"
          value={formData.propertyName}
          onChange={handleChange}
        />

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
            <TextInput
              label="Street Address"
              name="streetAddress"
              value={formData.streetAddress}
              onChange={handleChange}
            />
            <div className="form-row">
              <TextInput
                label="City"
                name="city"
                value={formData.city}
                onChange={handleChange}
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

        {/* Asking Price and Earnest Money */}
        <h3 className="section-title">Asking Price and Terms</h3>

        <div className="form-row">
          {/* Asking Price */}
          <div className="form-group">
            <label className="field-title">Asking Price</label>
            <div className="input-with-addon">
              <input
                type="text"
                name="askingPrice"
                value={formData.askingPrice}
                onChange={handleChange}
                placeholder="$"
                disabled={formData.unpriced}
              />
              <div className="addon-box">
                <input
                  type="checkbox"
                  name="unpriced"
                  checked={formData.unpriced}
                  onChange={handleChange}
                  id="unpricedCheckbox"
                  className="big-checkbox"
                />
                <label htmlFor="unpricedCheckbox" className="addon-label">Unpriced</label>
              </div>
            </div>
          </div>

          {/* Earnest Deposit Section */}
          <div className="form-group">
            <EarnestDepositSection
              formData={formData}
              handleChange={handleChange}
            />
          </div>
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
      </>
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
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="form-textarea"
            rows="6"
            placeholder="Provide a detailed description of your property..."
          ></textarea>
        </div>

        <h3 className="section-title">Upload Photos</h3>
        <div className="upload-section">
          <label htmlFor="photosUpload" className="drop-zone">
            Click or drag photos here to upload
            <input
              type="file"
              id="photosUpload"
              multiple
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                // Handle photo uploads
                console.log("Photos selected:", e.target.files);
                // In a real implementation, you would process and upload these files
              }}
            />
          </label>
        </div>

        {/* You can add more fields specific to the AdditionalListing component here */}
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
        <div className="form-title-brand">Sh.R.Property</div>
        <div className="form-title-add">ADD LISTING FOR SALE</div>
        <ul className="form-title-find-link">
          <li><Link to="/seller">Add for Lease</Link></li>
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
