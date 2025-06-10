import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import Logo from "../components/Logo";
import "../styles/AddList.css"; // reusing the AddList CSS
import useSessionStorage from "../Utils/useSessionStorage";
import { useAuth } from "../context/AuthContext";

// Property type options
const propertyTypeOptions = [
  { value: "flat", label: "Flat" },
  { value: "house", label: "House" },
  { value: "studio", label: "Studio" },
  { value: "bungalow", label: "Bungalow" },
  { value: "maisonette", label: "Maisonette" },
  { value: "duplex", label: "Duplex" },
  { value: "other", label: "Other" }
];

// Bedroom options
const bedroomOptions = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
  { value: "6+", label: "6+" }
];

// Bathroom options
const bathroomOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4+", label: "4+" }
];

// Furnished status options
const furnishedOptions = [
  { value: "furnished", label: "Furnished" },
  { value: "partFurnished", label: "Part-Furnished" },
  { value: "unfurnished", label: "Unfurnished" }
];

// Tenancy length options
const tenancyLengthOptions = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
  { value: "18", label: "18 months" },
  { value: "24", label: "24 months" },
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

const AddRent = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentSection, setCurrentSection] = useState(1);
  const [formData, setFormData] = useSessionStorage("addRentForm", {
    // Property Details
    propertyTitle: "",
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
    furnishedStatus: "",
    rentalPrice: "",
    depositAmount: "",
    availableFrom: "",
    tenancyLength: "",
    councilTaxBand: "",
    
    // Location Information
    postcode: "",
    streetAddress: "",
    city: "",
    region: "",
    
    // Property Features
    garden: false,
    parking: false,
    balconyTerrace: false,
    billsIncluded: false,
    petsAllowed: false,
    ensuiteBathroom: false,
    liftAccess: false,
    studentHousing: false,
    epcRating: "",
    
    // Description & Media
    description: "",
    photos: [],
    contactPhone: ""
  });
  
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState([]);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      // Store the current path to redirect back after login
      sessionStorage.setItem('redirectAfterLogin', '/addrent');
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Limit to 10 photos
    if (photoFiles.length + files.length > 10) {
      alert("You can upload a maximum of 10 photos");
      return;
    }
    
    setPhotoFiles((prevFiles) => [...prevFiles, ...files]);
    
    // Create preview URLs
    const newPreviewUrls = files.map(file => URL.createObjectURL(file));
    setPhotoPreviewUrls((prevUrls) => [...prevUrls, ...newPreviewUrls]);
  };

  const removePhoto = (index) => {
    const newPhotoFiles = [...photoFiles];
    const newPhotoPreviewUrls = [...photoPreviewUrls];
    
    // Revoke the object URL to avoid memory leaks
    URL.revokeObjectURL(photoPreviewUrls[index]);
    
    newPhotoFiles.splice(index, 1);
    newPhotoPreviewUrls.splice(index, 1);
    
    setPhotoFiles(newPhotoFiles);
    setPhotoPreviewUrls(newPhotoPreviewUrls);
  };

  const nextSection = () => {
    // Validate current section
    if (currentSection === 1) {
      if (!formData.propertyTitle || !formData.propertyType || !formData.bedrooms || 
          !formData.bathrooms || !formData.furnishedStatus || !formData.rentalPrice || 
          !formData.depositAmount || !formData.availableFrom || !formData.tenancyLength || 
          !formData.councilTaxBand) {
        alert("Please fill in all required fields before continuing.");
        return;
      }
    } else if (currentSection === 2) {
      if (!formData.postcode || !formData.streetAddress || !formData.city) {
        alert("Please fill in all required location fields before continuing.");
        return;
      }
    }
    
    setCurrentSection(prev => prev + 1);
  };

  const prevSection = () => {
    setCurrentSection(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Final validation
    if (!formData.propertyTitle || !formData.propertyType || !formData.bedrooms || 
        !formData.bathrooms || !formData.furnishedStatus || !formData.rentalPrice || 
        !formData.depositAmount || !formData.availableFrom || !formData.tenancyLength || 
        !formData.councilTaxBand || !formData.postcode || !formData.streetAddress || 
        !formData.city || !formData.description?.trim() || !formData.contactPhone?.trim()) {
      alert("Please fill in all required fields before submitting.");
      return;
    }
    
    setError("");
    setIsLoading(true);

    try {
      // Create FormData to handle file uploads
      const submitFormData = new FormData();
      
      // Map AddRent form fields to backend expected fields
      const fieldMapping = {
        // Basic property info
        title: formData.propertyTitle, // Map propertyTitle to title for backend
        propertyTitle: formData.propertyTitle, // Alternative field name
        description: formData.description,
        property_type: 'rent', // Set type as rent
        propertyType: 'rent',
        
        // Address fields
        address_line1: formData.streetAddress,
        streetAddress: formData.streetAddress,
        city: formData.city,
        state: formData.region, // Map region to state
        region: formData.region, 
        zip_code: formData.postcode,
        postcode: formData.postcode,
        country: 'UK', // Default for UK properties
        
        // Property details
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        furnished: formData.furnishedStatus === 'furnished',
        furnishedStatus: formData.furnishedStatus,
        
        // Rental-specific fields
        monthly_rent: formData.rentalPrice,
        rentalPrice: formData.rentalPrice,
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
        ensuiteBathroom: formData.ensuiteBathroom,
        liftAccess: formData.liftAccess,
        studentHousing: formData.studentHousing,
        epcRating: formData.epcRating
      };
      
      // Add all mapped fields to FormData
      Object.keys(fieldMapping).forEach(key => {
        if (fieldMapping[key] !== undefined && fieldMapping[key] !== null && fieldMapping[key] !== '') {
          submitFormData.append(key, fieldMapping[key]);
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
      
      console.log('Submitting rent property data...');
      
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
      console.log('✅ Rent Property Submitted Successfully:', result);
      
      setSuccess("Property submitted successfully! You will receive a confirmation email shortly.");
      
      // Clear form data and redirect to dashboard after short delay
      setTimeout(() => {
        sessionStorage.removeItem("addRentForm");
        navigate("/dashboard");
      }, 2000);
      
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || "Failed to submit property. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Display UI based on current section
  const renderSection = () => {
    switch(currentSection) {
      case 1:
        return (
          <div className="form-section">
            <h3 className="section-title">Property Details</h3>
            
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
            
            <div className="form-row">
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
            </div>
            
            <SelectInput
              label="Furnished Status"
              name="furnishedStatus"
              value={formData.furnishedStatus}
              onChange={handleChange}
              options={furnishedOptions}
              required
            />
            
            <div className="form-row">
              <TextInput
                label="Rental Price per Month (£)"
                name="rentalPrice"
                value={formData.rentalPrice}
                onChange={handleChange}
                type="number"
                required
              />
              
              <TextInput
                label="Deposit Amount (£)"
                name="depositAmount"
                value={formData.depositAmount}
                onChange={handleChange}
                type="number"
                required
              />
            </div>
            
            <div className="form-row">
              <TextInput
                label="Available From"
                name="availableFrom"
                value={formData.availableFrom}
                onChange={handleChange}
                type="date"
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
            
            <SelectInput
              label="Council Tax Band"
              name="councilTaxBand"
              value={formData.councilTaxBand}
              onChange={handleChange}
              options={councilTaxOptions}
              required
            />
          </div>
        );
      
      case 2:
        return (
          <div className="form-section">
            <h3 className="section-title">Location Information</h3>
            
            <TextInput
              label="Street Address"
              name="streetAddress"
              value={formData.streetAddress}
              onChange={handleChange}
              required
            />
            
            <div className="form-row">
              <TextInput
                label="City/Town"
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
              />
              
              <TextInput
                label="Region (Optional)"
                name="region"
                value={formData.region}
                onChange={handleChange}
              />
            </div>
            
            <TextInput
              label="Postcode"
              name="postcode"
              value={formData.postcode}
              onChange={handleChange}
              required
            />
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
                />
                <label htmlFor="balconyTerrace">Balcony/Terrace</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="billsIncluded" 
                  name="billsIncluded" 
                  checked={formData.billsIncluded}
                  onChange={handleChange}
                />
                <label htmlFor="billsIncluded">Bills Included</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="petsAllowed" 
                  name="petsAllowed" 
                  checked={formData.petsAllowed}
                  onChange={handleChange}
                />
                <label htmlFor="petsAllowed">Pets Allowed</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="ensuiteBathroom" 
                  name="ensuiteBathroom" 
                  checked={formData.ensuiteBathroom}
                  onChange={handleChange}
                />
                <label htmlFor="ensuiteBathroom">Ensuite Bathroom</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="liftAccess" 
                  name="liftAccess" 
                  checked={formData.liftAccess}
                  onChange={handleChange}
                />
                <label htmlFor="liftAccess">Lift Access</label>
              </div>
              
              <div className="feature-item">
                <input 
                  type="checkbox" 
                  id="studentHousing" 
                  name="studentHousing" 
                  checked={formData.studentHousing}
                  onChange={handleChange}
                />
                <label htmlFor="studentHousing">Suitable for Students</label>
              </div>
            </div>
            
            <SelectInput
              label="EPC Rating"
              name="epcRating"
              value={formData.epcRating}
              onChange={handleChange}
              options={epcRatingOptions}
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
            
            <h4 className="subsection-title">Upload Photos & Videos</h4>
            
            <div className="media-upload-section">
              <div className="upload-area">
                <label htmlFor="photoUpload" className="upload-label">
                  <div className="upload-content">
                    <div className="upload-icon">📷🎥</div>
                    <div className="upload-text">
                      <span>Drag & drop or click to upload</span>
                      <small>Photos & videos • Up to 10 files • Max 50MB each</small>
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
        <div className="form-title-add">ADD PROPERTY FOR RENT</div>
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
        <form onSubmit={handleSubmit} className="property-form">
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
                onClick={() => navigate('/seller')}
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
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? "Saving..." : "Submit Listing"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRent; 