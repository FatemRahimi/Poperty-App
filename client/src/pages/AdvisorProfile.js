import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import './AdvisorProfile.css';

// Job title options for Company advisors
const companyJobTitleOptions = [
  { value: "Property Consultant", label: "Property Consultant" },
  { value: "Estate Agent", label: "Estate Agent" },
  { value: "Sales Negotiator", label: "Sales Negotiator" },
  { value: "Lettings Negotiator", label: "Lettings Negotiator" },
  { value: "Valuer", label: "Valuer" },
  { value: "Branch Manager", label: "Branch Manager" },
  { value: "Area Manager", label: "Area Manager" },
  { value: "Viewing Assistant", label: "Viewing Assistant" },
  { value: "Property Manager", label: "Property Manager" },
  { value: "Assistant Property Manager", label: "Assistant Property Manager" },
  { value: "Block Manager", label: "Block Manager" },
  { value: "Tenancy Manager", label: "Tenancy Manager" },
  { value: "Maintenance Coordinator", label: "Maintenance Coordinator" },
  { value: "Real Estate Analyst", label: "Real Estate Analyst" },
  { value: "Property Development Manager", label: "Property Development Manager" },
  { value: "Land Acquisition Manager", label: "Land Acquisition Manager" },
  { value: "Asset Manager", label: "Asset Manager" },
  { value: "Project Manager", label: "Project Manager" },
  { value: "Property Administrator", label: "Property Administrator" },
  { value: "Sales Progressor", label: "Sales Progressor" },
  { value: "Receptionist", label: "Receptionist" },
  { value: "Compliance Officer", label: "Compliance Officer" },
  { value: "Marketing Executive", label: "Marketing Executive" },
  { value: "Property Photographer", label: "Property Photographer" },
  { value: "CRM Manager", label: "CRM Manager" },
  { value: "IT Support", label: "IT Support" },
  { value: "Conveyancing Assistant", label: "Conveyancing Assistant" },
  { value: "Licensed Conveyancer", label: "Licensed Conveyancer" },
  { value: "Paralegal", label: "Paralegal" },
  { value: "Surveyor", label: "Surveyor" },
  { value: "Valuation Surveyor", label: "Valuation Surveyor" },
  { value: "Mortgage Advisor", label: "Mortgage Advisor" },
  { value: "Accounts Assistant", label: "Accounts Assistant" }
];

// Job title options for Person advisors
const personJobTitleOptions = [
  { value: "Property Consultant", label: "Property Consultant" },
  { value: "Estate Agent", label: "Estate Agent" },
  { value: "Sales Negotiator", label: "Sales Negotiator" },
  { value: "Lettings Negotiator", label: "Lettings Negotiator" },
  { value: "Valuer", label: "Valuer" },
  { value: "Branch Manager", label: "Branch Manager" },
  { value: "Area Manager", label: "Area Manager" },
  { value: "Viewing Assistant", label: "Viewing Assistant" },
  { value: "Property Manager", label: "Property Manager" },
  { value: "Assistant Property Manager", label: "Assistant Property Manager" },
  { value: "Block Manager", label: "Block Manager" },
  { value: "Tenancy Manager", label: "Tenancy Manager" },
  { value: "Maintenance Coordinator", label: "Maintenance Coordinator" },
  { value: "Real Estate Analyst", label: "Real Estate Analyst" },
  { value: "Property Development Manager", label: "Property Development Manager" },
  { value: "Land Acquisition Manager", label: "Land Acquisition Manager" },
  { value: "Asset Manager", label: "Asset Manager" },
  { value: "Project Manager", label: "Project Manager" },
  { value: "Property Administrator", label: "Property Administrator" },
  { value: "Sales Progressor", label: "Sales Progressor" },
  { value: "Receptionist", label: "Receptionist" },
  { value: "Compliance Officer", label: "Compliance Officer" },
  { value: "Marketing Executive", label: "Marketing Executive" },
  { value: "Property Photographer", label: "Property Photographer" },
  { value: "CRM Manager", label: "CRM Manager" },
  { value: "IT Support", label: "IT Support" },
  { value: "Conveyancing Assistant", label: "Conveyancing Assistant" },
  { value: "Licensed Conveyancer", label: "Licensed Conveyancer" },
  { value: "Paralegal", label: "Paralegal" },
  { value: "Surveyor", label: "Surveyor" },
  { value: "Valuation Surveyor", label: "Valuation Surveyor" },
  { value: "Mortgage Advisor", label: "Mortgage Advisor" },
  { value: "Accounts Assistant", label: "Accounts Assistant" }
];

const AdvisorProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  
  // Debug logging
  console.log('🔍 AdvisorProfile: User data:', user);
  console.log('🔍 AdvisorProfile: Token exists:', !!token);
  console.log('🔍 AdvisorProfile: User ID:', user.id);

  const [formData, setFormData] = useState({
    // Company Information
    companyName: "",
    directorName: "",
    companyLogo: null,
    companyLogoUrl: "",
    companyWebsite: "",
    companyEmail: "",
    companyDescription: "",
    
    // Personal Information
    fullName: "",
    profilePhoto: null,
    profilePhotoUrl: "",
    jobTitle: "",
    professionalBio: "",
    contactPhone: "",
    contactEmail: "",
    
    // Office Information
    officeHours: "",
    officeAddress: "",
    officeCity: "",
    officePostcode: "",
    
    // Settings
    isAdvisor: false,
    advisorType: "",  // Empty by default - user must select
  });

  const [expertTeam, setExpertTeam] = useState([]);
  const [advisorType, setAdvisorType] = useState('');  // Controls which form displays
  const [showAdvisorSection, setShowAdvisorSection] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Detect if in edit mode
  const isEditMode = location.state && location.state.isEdit;

  // Fetch existing advisor profile if in edit mode
  useEffect(() => {
    const fetchAdvisorProfile = async () => {
      if (isEditMode && user.id) {
        try {
          const response = await fetch(`/api/users/${user.id}/advisor-profile/edit`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.advisorProfile) {
              const profile = data.advisorProfile;
              
              // Populate form data with existing profile
              setFormData(prev => ({
                ...prev,
                advisorType: profile.advisor_type || 'person',
                companyName: profile.company_name || '',
                directorName: profile.director_name || '',
                companyLogoUrl: profile.company_logo_url || '',
                companyWebsite: profile.company_website || '',
                companyEmail: profile.company_email || '',
                companyDescription: profile.company_description || '',
                fullName: profile.full_name || '',
                profilePhotoUrl: profile.profile_photo_url || '',
                jobTitle: profile.job_title || '',
                professionalBio: profile.professional_bio || '',
                contactPhone: profile.contact_phone || '',
                contactEmail: profile.contact_email || '',
                officeHours: profile.office_hours || '',
                officeAddress: profile.office_address || '',
                officeCity: profile.office_city || '',
                officePostcode: profile.office_postcode || '',
                isAdvisor: profile.is_advisor || false
              }));
              
              // Set expert team if exists
              if (profile.experts && profile.experts.length > 0) {
                console.log(` Found ${profile.experts.length} experts, mapping them...`);
                const mappedExperts = profile.experts.map((expert, index) => ({
                  id: expert.id || `temp-${Date.now()}-${index}`,
                  fullName: expert.full_name || '',
                  jobTitle: expert.job_title || '',
                  profilePhotoUrl: expert.profile_photo_url || '',
                  phone: expert.phone || '',
                  email: expert.email || ''
                }));
                console.log('👥 Mapped experts:', mappedExperts);
                setExpertTeam(mappedExperts);
              }
              
              // Set advisor type and show advisor section
              setAdvisorType(profile.advisor_type || 'person');
              setShowAdvisorSection(true);
            }
          } else {
            console.error('Failed to fetch advisor profile:', response.status);
            setError('Failed to load advisor profile. Please try again.');
          }
        } catch (err) {
          console.error('Network error fetching advisor profile:', err);
          setError('Network error. Failed to load advisor profile.');
        }
      }
    };

    fetchAdvisorProfile();
  }, [isEditMode, user.id, token]);

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Handle advisor type change
  const handleAdvisorTypeChange = (type) => {
    setAdvisorType(type);
    setFormData(prev => ({
      ...prev,
      advisorType: type
    }));
  };

  // Add expert
  const handleAddExpert = () => {
    const newExpert = {
      id: Date.now(),
      fullName: "",
      jobTitle: "Property Consultant", // Set Property Consultant as default
      profilePhotoUrl: "",
      phone: "",
      email: ""
    };
    setExpertTeam(prev => [...prev, newExpert]);
  };

  // Remove expert
  const handleRemoveExpert = (expertId) => {
    setExpertTeam(prev => prev.filter(expert => expert.id !== expertId));
  };

  // Update expert field
  const handleExpertChange = (expertId, field, value) => {
    setExpertTeam(prev => 
      prev.map(expert => 
        expert.id === expertId 
          ? { ...expert, [field]: value }
          : expert
      )
    );
  };

  // Handle file uploads
  const handleAdvisorLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({
          ...prev,
          companyLogo: file,
          companyLogoUrl: e.target.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdvisorPhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({
          ...prev,
          profilePhoto: file,
          profilePhotoUrl: e.target.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExpertPhotoUpload = (expertId, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setExpertTeam(prev => 
          prev.map(expert => 
            expert.id === expertId 
              ? { ...expert, profilePhotoUrl: e.target.result, profilePhotoFile: file }
              : expert
          )
        );
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle delete functions
  const handleCompanyLogoDelete = () => {
    setFormData(prev => ({
      ...prev,
      companyLogo: null,
      companyLogoUrl: ""
    }));
  };

  const handleProfilePhotoDelete = () => {
    setFormData(prev => ({
      ...prev,
      profilePhoto: null,
      profilePhotoUrl: ""
    }));
  };

  // Handle cancel - go back to previous page
  const handleCancel = () => {
    if (advisorType) {
      // If we're in the form, go back to advisor type selection
      setAdvisorType('');
      setExpertTeam([]);
      setFormData(prev => ({
        ...prev,
        advisorType: ""
      }));
    } else if (showAdvisorSection) {
      // If we're in advisor type selection, go back to initial benefits
      setShowAdvisorSection(false);
    } else {
      // If we're in initial benefits, go to find page
      navigate('/find');
    }
  };

  // Handle back - use browser history navigation
  const handleBack = () => {
    if (isEditMode) {
      // In edit mode, always go back to UserDashboard advisor tab
      navigate('/dashboard?tab=advisor-profile');
      return;
    }
    
    if (advisorType) {
      // If we're in the form (company/person), go back to advisor type selection
      setAdvisorType('');
      setExpertTeam([]);
      setFormData(prev => ({
        ...prev,
        advisorType: ""
      }));
    } else if (showAdvisorSection) {
      // If we're in advisor type selection, go back to initial benefits
      setShowAdvisorSection(false);
    } else {
      // If we're in initial benefits, use browser back navigation
      navigate(-1, { replace: true }); // Use replace to preserve browser history
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('🔴 Submit button clicked - starting submission');
    console.log('👤 User data:', user);
    console.log('🔑 Token exists:', !!token);
    console.log('📋 advisorType state:', advisorType);
    console.log('📋 formData.advisorType:', formData.advisorType);
    
    // Get the correct advisor type (use state variable, fallback to formData)
    const currentType = advisorType || formData.advisorType;
    console.log('📋 Using advisorType:', currentType);
    
    // Check if we have valid user data and token
    if (!user.id || !token) {
      console.log('❌ Missing user ID or token');
      setError('Authentication error. Please login again.');
      return;
    }

    // Validate advisor type is selected
    if (!currentType) {
      setError('Please select advisor type (Company or Person).');
      return;
    }

    // Validate required fields based on advisor type
    if (currentType === 'person') {
      console.log('👤 Validating person fields...');
      console.log('  - fullName:', formData.fullName);
      console.log('  - jobTitle:', formData.jobTitle);
      
      if (!formData.fullName || !formData.fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!formData.jobTitle || !formData.jobTitle.trim() || formData.jobTitle === 'Select Job Title') {
        setError('Please select your job title.');
        return;
      }
    } else if (currentType === 'company') {
      console.log('🏢 Validating company fields...');
      console.log('  - companyName:', formData.companyName);
      console.log('  - directorName:', formData.directorName);
      
      if (!formData.companyName || !formData.companyName.trim()) {
        setError('Please enter company name.');
        return;
      }
      if (!formData.directorName || !formData.directorName.trim()) {
        setError('Please enter director name.');
        return;
      }
      
      // Validate that at least one expert team member has "Property Consultant" job title
      if (expertTeam.length > 0) {
        const hasPropertyConsultant = expertTeam.some(expert => 
          expert.jobTitle === 'Property Consultant'
        );
        
        if (!hasPropertyConsultant) {
          setError('For having an advisor card, at least one expert team member must have "Property Consultant" job title.');
          return;
        }
      }
    }
    
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      console.log('📝 Form data:', formData);
      console.log('👥 Expert team:', expertTeam);
      
      // Create FormData for file uploads
      const submitData = new FormData();
      
      // Add form data - use currentType for advisorType field
      Object.keys(formData).forEach(key => {
        if (key !== 'companyLogo' && key !== 'profilePhoto') {
          const value = key === 'advisorType' ? currentType : formData[key];
          submitData.append(key, value);
          console.log(`📋 Added ${key}:`, value);
        }
      });

      // Add files
      if (formData.companyLogo) {
        submitData.append('companyLogo', formData.companyLogo);
        console.log('📁 Added company logo');
      }
      if (formData.profilePhoto) {
        submitData.append('profilePhoto', formData.profilePhoto);
        console.log('📁 Added profile photo');
      }

      // Add expert photo files
      expertTeam.forEach((expert, index) => {
        if (expert.profilePhotoFile) {
          submitData.append(`expertPhoto_${index}`, expert.profilePhotoFile);
          console.log(`📁 Added expert photo for ${expert.fullName || `expert ${index}`}`);
        }
      });

      // Add expert team data (without file objects, backend will add photo URLs)
      const expertTeamData = expertTeam.map(expert => ({
        id: expert.id,
        fullName: expert.fullName,
        jobTitle: expert.jobTitle,
        phone: expert.phone,
        email: expert.email,
        hasPhoto: !!expert.profilePhotoFile || !!expert.profilePhotoUrl
      }));
      submitData.append('expertTeam', JSON.stringify(expertTeamData));
      submitData.append('contactEmail', formData.contactEmail);

      console.log('📡 Making API call to save advisor profile...');
      const response = await fetch(`/api/users/${user.id}/advisor-profile`, {
        method: isEditMode ? 'PUT' : 'POST',
        body: submitData,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📡 Response status:', response.status);
      
      let data;
      try {
        data = await response.json();
        console.log('📡 Response data:', data);
      } catch (parseError) {
        console.log('❌ Failed to parse response as JSON');
        const textResponse = await response.text();
        console.log('📡 Text response:', textResponse);
        setError(`Server error: ${response.status} - ${textResponse}`);
        return;
      }

      if (response.ok) {
        console.log('✅ Advisor profile saved successfully');
        setSuccess(isEditMode ? 'Advisor profile updated successfully!' : 'Advisor profile created successfully!');
        setTimeout(() => {
          if (isEditMode) {
            // In edit mode, navigate back to UserDashboard advisor tab
            navigate('/dashboard?tab=advisor-profile');
          } else {
            // Normal flow, navigate to seller page
            navigate('/seller');
          }
        }, 2000);
      } else {
        console.log('❌ API error:', data);
        setError(data.message || 'Failed to update advisor profile');
      }
    } catch (err) {
      console.error('❌ Network error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle skip advisor profile
  const handleSkipAdvisorProfile = () => {
    console.log('🔴 Skip button clicked - setting up one-time skip');
    
    if (isEditMode) {
      // In edit mode, navigate back to UserDashboard advisor tab
      navigate('/dashboard?tab=advisor-profile');
      return;
    }
    
    // Store one-time skip token
    sessionStorage.setItem('oneTimeAdvisorSkip', 'true');
    console.log('✅ One-time skip token set in sessionStorage');
    
    // Add a small delay to ensure token is set before navigation
    setTimeout(() => {
      console.log('🚀 Navigating to /seller...');
      navigate('/seller');
    }, 100);
  };

  return (
    <div className="form-sale-container">
      {/* Title Section */}
      <div className="form-title">
        <div className="form-title-brand">
          <Logo />
        </div>
        <div className="form-title-add">
        build a dashboard profile 
        </div>
      </div>

      {/* Form Section */}
      <div className="form-wrapper">
        <form onSubmit={handleSubmit} className="property-form">
          {error && (
            <div className="alert alert-danger">
              <strong>Error:</strong> {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success">
              <strong>Success:</strong> {success}
            </div>
          )}

          <div className="form-section">
            <h3 className="section-title">
              {isEditMode 
                ? 'Edit Your Advisor Profile' 
                : 'Before listing your property, get benefit of having a private dashboard and advisor profile'
              }
            </h3>
            
            {/* Initial Benefits Section */}
            {!showAdvisorSection && !isEditMode && (
              <div className="advisor-card-section">
                <div className="advisor-card-info">
                  
               
                  
                  <div className="advisor-card-benefits">
                    <h4>Benefits of Having an Advisor Profile</h4>
                    <ul>
                      <li>✅ Professional branding on all your properties</li>
                      <li>✅ Display company activities, logo and contact information</li>
                      <li>✅ Show your expertise, team members and experience</li>
                      <li>✅ Build trust with potential clients</li>
                      <li>✅ Increase inquiries and viewings</li>
                      <li>✅ Stand out from competitors</li>
                    </ul>
                  </div>
                  
                  <div className="advisor-card-actions">
                    <button 
                      type="button" 
                      className="advisor-card-btn"
                      onClick={() => setShowAdvisorSection(true)}
                    >
                      Set Up Advisor Profile
                    </button>
                    
                    <div className="advisor-card-skip">
                      <span>I would not like to have an advisor profile already please </span>
                      <button 
                        type="button" 
                        className="advisor-skip-link"
                        onClick={handleSkipAdvisorProfile}
                      >
                        skip
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advisor Type Selection */}
            {showAdvisorSection && !advisorType && (
              <div className="advisor-type-selection">
                <h4 className="advisor-subsection-title">Choose Your Profile Type</h4>
                <div className="advisor-type-buttons">
                  <button
                    type="button"
                    className={`advisor-type-btn ${advisorType === 'company' ? 'active' : ''}`}
                    onClick={() => handleAdvisorTypeChange('company')}
                  >
                    <i className="fas fa-building"></i>
                    <span>Set as a Company</span>
                    <small>For companies with multiple experts</small>
                  </button>
                  <button
                    type="button"
                    className={`advisor-type-btn ${advisorType === 'person' ? 'active' : ''}`}
                    onClick={() => handleAdvisorTypeChange('person')}
                  >
                    <i className="fas fa-user-tie"></i>
                    <span>Set as a Person</span>
                    <small>For individual advisors</small>
                  </button>
                </div>
                <div className="advisor-form-buttons">
                  {/* Hide back button in edit mode */}
                  {!isEditMode && (
                    <button
                      type="button"
                      className="back-btn"
                      onClick={handleBack}
                      disabled={isLoading}
                    >
                      ← Back
                    </button>
                  )}

                  {/* Show cancel button in edit mode */}
                  {isEditMode && (
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => navigate('/dashboard?tab=advisor-profile')}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Company Section */}
            {advisorType === 'company' && (
              <>
                {/* Company Information */}
                <div className="advisor-form-section">
                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="companyName">Company Name*</label>
                      <input
                        type="text"
                        id="companyName"
                        name="companyName"
                        value={formData.companyName}
                        onChange={handleChange}
                        placeholder="e.g. Property Solutions Ltd"
                        required
                        className="advisor-field-input"
                      />
                    </div>
                    <div className="advisor-form-group">
                      <label htmlFor="directorName">Director Name*</label>
                      <input
                        type="text"
                        id="directorName"
                        name="directorName"
                        value={formData.directorName}
                        onChange={handleChange}
                        placeholder="e.g. John Smith"
                        required
                        className="advisor-field-input"
                      />
                    </div>
                  </div>
                  
                  <div className="advisor-form-group">
                    <label htmlFor="companyDescription">Company Description</label>
                    <textarea
                      id="companyDescription"
                      name="companyDescription"
                      value={formData.companyDescription}
                      onChange={handleChange}
                      rows="3"
                      placeholder="Tell potential clients about your company, services, and what makes you unique..."
                      className="form-textarea"
                    />
                    <small className="word-count-helper">
                      {(() => {
                        const wordCount = (formData.companyDescription || '').trim().split(/\s+/).filter(word => word.length > 0).length;
                        const isValid = wordCount <= 100;
                        return (
                          <span style={{ color: isValid ? '#10b981' : '#ef4444' }}>
                            {wordCount}/100 words maximum {isValid ? '✓' : ''}
                          </span>
                        );
                      })()}
                    </small>
                  </div>

                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="companyWebsite">Company Website</label>
                      <input
                        type="url"
                        id="companyWebsite"
                        name="companyWebsite"
                        value={formData.companyWebsite}
                        onChange={handleChange}
                        placeholder="https://www.yourcompany.com"
                        className="advisor-field-input"
                      />
                    </div>

                    <div className="advisor-form-group">
                      <label htmlFor="companyEmail">Company Email</label>
                      <input
                        type="email"
                        id="companyEmail"
                        name="companyEmail"
                        value={formData.companyEmail}
                        onChange={handleChange}
                        placeholder="info@yourcompany.com"
                        className="advisor-field-input"
                      />
                    </div>
                  </div>

                  <div className="advisor-form-group">
                    <label htmlFor="companyLogo">Company Logo</label>
                    <div className="logo-upload-area">
                      <input
                        type="file"
                        id="companyLogo"
                        accept="image/*"
                        onChange={handleAdvisorLogoUpload}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="companyLogo" className="logo-upload-label">
                        <div className="logo-upload-content">
                          {formData.companyLogoUrl ? (
                            <div className="logo-preview-container">
                              <img src={formData.companyLogoUrl} alt="Company Logo" className="logo-preview" />
                              <button 
                                type="button" 
                                className="remove-logo-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCompanyLogoDelete();
                                }}
                                title="Remove company logo"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <div className="logo-placeholder">
                              <i className="fas fa-building"></i>
                              <span>Upload Company Logo</span>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Company Contact Information */}
                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="officeHours">Office Hours</label>
                      <input
                        type="text"
                        id="officeHours"
                        name="officeHours"
                        value={formData.officeHours}
                        onChange={handleChange}
                        placeholder="e.g. Mon-Fri: 9:00 AM - 6:00 PM"
                        className="advisor-field-input"
                      />
                    </div>
                    <div className="advisor-form-group">
                      <label htmlFor="officeAddress">Office Address</label>
                      <textarea
                        id="officeAddress"
                        name="officeAddress"
                        value={formData.officeAddress}
                        onChange={handleChange}
                        rows="1"
                        placeholder="Enter your office address line1..."
                        className="office-field-textarea"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="officeCity">Office City</label>
                      <input
                        type="text"
                        id="officeCity"
                        name="officeCity"
                        value={formData.officeCity}
                        onChange={handleChange}
                        placeholder="e.g. London"
                        className="advisor-field-input"
                      />
                    </div>
                    <div className="advisor-form-group">
                      <label htmlFor="officePostcode">Office Postcode</label>
                      <input
                        type="text"
                        id="officePostcode"
                        name="officePostcode"
                        value={formData.officePostcode}
                        onChange={handleChange}
                        placeholder="e.g. SW1A 1AA"
                        className="advisor-field-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Expert Team Section */}
                <div className="advisor-form-section expert-team-section">
                  <h4 className="advisor-subsection-title">Expert Team</h4>
                  <p className="section-description">Add your team members who will be featured on property listings. <strong>At least one team member must have "Property Consultant" job title.</strong></p>
                  
                  {/* Property Consultant Status */}
                  {expertTeam.length > 0 && (
                    <div className="property-consultant-status">
                      <span className={`status-indicator ${expertTeam.some(expert => expert.jobTitle === 'Property Consultant') ? 'status-valid' : 'status-invalid'}`}>
                        {expertTeam.some(expert => expert.jobTitle === 'Property Consultant') 
                          ? `✅ ${expertTeam.filter(expert => expert.jobTitle === 'Property Consultant').length} Property Consultant(s) selected`
                          : '❌ No Property Consultant selected (required)'
                        }
                      </span>
                    </div>
                  )}

                  {expertTeam.map((expert, index) => (
                    <div key={expert.id} className="expert-member">
                      <div className="expert-header">
                        <h5>Expert {index + 1}</h5>
                        <button
                          type="button"
                          className="remove-expert-btn"
                          onClick={() => handleRemoveExpert(expert.id)}
                        >
                          ×
                        </button>
                      </div>
                      
                      <div className="form-row">
                        <div className="advisor-form-group">
                          <label>Full Name*</label>
                          <input
                            type="text"
                            value={expert.fullName}
                            onChange={(e) => handleExpertChange(expert.id, 'fullName', e.target.value)}
                            placeholder="e.g. John Smith"
                            required
                            className="advisor-field-input"
                          />
                        </div>
                        <div className="advisor-form-group">
                          <label>Job Title*</label>
                          <select
                            value={expert.jobTitle}
                            onChange={(e) => handleExpertChange(expert.id, 'jobTitle', e.target.value)}
                            required
                            className={`advisor-field-input ${expert.jobTitle === 'Property Consultant' ? 'property-consultant-selected' : ''}`}
                          >
                            <option value="">Select Job Title</option>
                            {companyJobTitleOptions.map(option => (
                              <option 
                                key={option.value} 
                                value={option.value}
                                className={option.value === 'Property Consultant' ? 'property-consultant-option' : ''}
                              >
                                {option.value === 'Property Consultant' ? '⭐ Property Consultant (Required)' : option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="advisor-form-group">
                        <label>Profile Photo</label>
                        <div className="photo-upload-area">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleExpertPhotoUpload(expert.id, e.target.files[0])}
                            style={{ display: 'none' }}
                            id={`expert-photo-${expert.id}`}
                          />
                          <label htmlFor={`expert-photo-${expert.id}`} className="photo-upload-label">
                            <div className="photo-upload-content">
                              {expert.profilePhotoUrl ? (
                                <div className="photo-preview-container">
                                  <img src={expert.profilePhotoUrl} alt="Expert Photo" className="photo-preview" />
                                </div>
                              ) : (
                                <div className="photo-placeholder">
                                  <i className="fas fa-user-tie"></i>
                                  <span>Upload Profile Photo</span>
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="advisor-form-group">
                          <label>Phone Number</label>
                          <input
                            type="tel"
                            value={expert.phone}
                            onChange={(e) => handleExpertChange(expert.id, 'phone', e.target.value)}
                            placeholder="+44 7xxx xxx xxx"
                            className="advisor-field-input"
                          />
                        </div>
                        <div className="advisor-form-group">
                          <label>Email Address</label>
                          <input
                            type="email"
                            value={expert.email}
                            onChange={(e) => handleExpertChange(expert.id, 'email', e.target.value)}
                            placeholder="expert@company.com"
                            className="advisor-field-input"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="add-expert-btn"
                    onClick={handleAddExpert}
                  >
                    <i className="fas fa-plus"></i>
                    Add Expert Team Member
                  </button>
                </div>

                {/* Enable Advisor Profile */}
                <div className="advisor-form-section">
                  <div className="advisor-form-group">
                    <label className="checkbox-label advisor-checkbox-label">
                      <input
                        type="checkbox"
                        name="isAdvisor"
                        checked={formData.isAdvisor}
                        onChange={handleChange}
                      />
                      <span>Enable Professional Advisor Profile</span>
                    </label>
                    <small className="advisor-help-text">When enabled, your advisor information will appear on all your property listings</small>
                  </div>
                </div>
              </>
            )}

            {/* Person Section */}
            {advisorType === 'person' && (
              <>
                {/* Personal Information */}
                <div className="advisor-form-section">
                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="fullName">Full Name*</label>
                      <input
                        type="text"
                        id="fullName"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="e.g. John Smith"
                        required
                        className="advisor-field-input"
                      />
                    </div>
                    
                    <div className="advisor-form-group">
                      <label htmlFor="jobTitle">Job Title*</label>
                      <select
                        id="jobTitle"
                        name="jobTitle"
                        value={formData.jobTitle}
                        onChange={handleChange}
                        required
                        className="advisor-field-input"
                      >
                        <option value="">Select Job Title</option>
                        {personJobTitleOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="advisor-form-group">
                    <label htmlFor="profilePhoto">Profile Photo</label>
                    <div className="photo-upload-area">
                      <input
                        type="file"
                        id="profilePhoto"
                        accept="image/*"
                        onChange={handleAdvisorPhotoUpload}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="profilePhoto" className="photo-upload-label">
                        <div className="photo-upload-content">
                          {formData.profilePhotoUrl ? (
                            <div className="photo-preview-container">
                              <img src={formData.profilePhotoUrl} alt="Profile Photo" className="photo-preview" />
                              <button 
                                type="button" 
                                className="remove-photo-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleProfilePhotoDelete();
                                }}
                                title="Remove profile photo"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <div className="photo-placeholder">
                              <i className="fas fa-user-tie"></i>
                              <span>Upload Profile Photo</span>
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                  
                  <div className="advisor-form-group">
                    <label htmlFor="professionalBio">Professional Bio</label>
                    <textarea
                      id="professionalBio"
                      name="professionalBio"
                      value={formData.professionalBio}
                      onChange={handleChange}
                      rows="4"
                      placeholder="Tell potential clients about your experience and expertise..."
                      className="form-textarea"
                    />
                    <small className="word-count-helper">
                      {(() => {
                        const wordCount = (formData.professionalBio || '').trim().split(/\s+/).filter(word => word.length > 0).length;
                        const isValid = wordCount <= 50;
                        return (
                          <span style={{ color: isValid ? '#10b981' : '#ef4444' }}>
                            {wordCount}/50 words maximum {isValid ? '✓' : ''}
                          </span>
                        );
                      })()}
                    </small>
                  </div>

                  <div className="form-row">
                    <div className="advisor-form-group">
                      <label htmlFor="contactPhone">Contact Number</label>
                      <input
                        type="tel"
                        id="contactPhone"
                        name="contactPhone"
                        value={formData.contactPhone}
                        onChange={handleChange}
                        placeholder="+44 7xxx xxx xxx"
                        className="advisor-field-input"
                      />
                    </div>
                    <div className="advisor-form-group">
                      <label htmlFor="contactEmail">Email Address</label>
                      <input
                        type="email"
                        id="contactEmail"
                        name="contactEmail"
                        value={formData.contactEmail}
                        onChange={handleChange}
                        placeholder="advisor@email.com"
                        className="advisor-field-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Enable Advisor Profile */}
                <div className="advisor-form-section">
                  <div className="advisor-form-group">
                    <label className="checkbox-label advisor-checkbox-label">
                      <input
                        type="checkbox"
                        name="isAdvisor"
                        checked={formData.isAdvisor}
                        onChange={handleChange}
                      />
                      <span>Enable Professional Advisor Profile</span>
                    </label>
                    <small className="advisor-help-text">When enabled, your advisor information will appear on all your property listings</small>
                  </div>
                </div>
              </>
            )}

            {/* Navigation Buttons */}
            {advisorType && (
              <div className="advisor-form-section">
                <div className="form-buttons">
                  {/* Hide back button in edit mode */}
                  {!isEditMode && (
                    <button 
                      type="button" 
                      className="back-btn"
                      onClick={handleBack}
                      disabled={isLoading}
                    >
                      ← Back
                    </button>
                  )}

                  {/* Show cancel button in edit mode */}
                  {isEditMode && (
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => navigate('/dashboard?tab=advisor-profile')}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className={`submit-btn ${success ? 'submit-success' : ''} ${error ? 'submit-error' : ''}`}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner"></span>
                        Saving...
                      </>
                    ) : success ? (
                      <>
                        <span className="success-icon">✓</span>
                        Successfully Saved!
                      </>
                    ) : (
                      isEditMode ? "Update Advisor Profile" : "Submit Advisor Profile"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdvisorProfile; 