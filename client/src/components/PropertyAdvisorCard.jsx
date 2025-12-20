import React, { useState, useEffect } from 'react';
import './PropertyAdvisorCard.css';

const PropertyAdvisorCard = ({ userId, fallbackContact, propertyConsultantData }) => {
  const [advisorData, setAdvisorData] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper function to extract domain from website URL
  const extractDomain = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      // If URL parsing fails, return the original string
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }
  };

  // Helper function to capitalize first character of each word
  const capitalizeWords = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Fetch user data when no advisor profile exists
  const fetchUserData = async (userId) => {
    try {
      const response = await fetch(`/api/users/${userId}?t=${Date.now()}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.user) {
          setUserData(data.user);
        }
      }
    } catch (err) {
      console.error('PropertyAdvisorCard: Error fetching user data:', err);
    }
  };

  // Fetch advisor profile data
  useEffect(() => {
    const fetchAdvisorProfile = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/users/${userId}/advisor-profile/details?t=${Date.now()}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.advisorProfile) {
            setAdvisorData(data.advisorProfile);
          } else {
            setError('No advisor profile found');
            // If no advisor profile, try to fetch user data for fallback
            if (userId) {
              await fetchUserData(userId);
            }
          }
        } else {
          setError('Failed to fetch advisor profile');
        }
      } catch (err) {
        console.error('PropertyAdvisorCard: Error fetching advisor profile:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchAdvisorProfile();
  }, [userId]);

  // Helper function to find property consultant from expert team
  const findPropertyConsultant = (experts) => {
    if (!experts || !Array.isArray(experts)) {
      return null;
    }
    
    // First, try to find someone with "property consultant" in their job title
    let propertyConsultant = experts.find(expert => {
      const jobTitle = (expert.job_title || expert.jobTitle || '').toLowerCase();
      return jobTitle.includes('property consultant') || jobTitle.includes('property') || jobTitle.includes('consultant');
    });
    
    // If no property consultant found, use the first expert
    if (!propertyConsultant && experts.length > 0) {
      propertyConsultant = experts[0];
    }
    
    return propertyConsultant;
  };

  // Loading state
  if (loading) {
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-loading">
          <div className="pac-spinner"></div>
          <p>Loading advisor information...</p>
        </div>
      </div>
    );
  }

  // Determine the layout type based on available data
  const hasAdvisorProfile = advisorData && advisorData.is_advisor;
  const isCompany = hasAdvisorProfile && advisorData.advisor_type === 'company';
  const isPerson = hasAdvisorProfile && advisorData.advisor_type === 'person';
  const hasOnlyAddRentData = !hasAdvisorProfile && (fallbackContact || propertyConsultantData);

  // SCENARIO 1: COMPANY ADVISOR (AdvisorProfile + AddRent forms)
  if (isCompany) {
    // For company advisors, prioritize the contact information from the AddRent form
    // This includes the selected expert from the company-contact-section
    let propertyConsultant = null;
    
    // First, check if we have contact information from the AddRent form (selected expert)
    if (fallbackContact && (fallbackContact.name || fallbackContact.email || fallbackContact.phone)) {
      // Try to find the matching expert from the advisor profile's expert team
      // This ensures we get the complete expert information including profile photo
      const selectedExpert = advisorData.experts?.find(expert => {
        const expertName = expert.full_name || expert.fullName || '';
        const expertEmail = expert.email || '';
        const expertPhone = expert.phone || '';
        
        const formName = fallbackContact.name || `${fallbackContact.firstName || ''} ${fallbackContact.lastName || ''}`.trim();
        const formEmail = fallbackContact.email || '';
        const formPhone = fallbackContact.phone || '';
        
        // Match by name, email, or phone
        return (expertName && formName && expertName.toLowerCase() === formName.toLowerCase()) ||
               (expertEmail && formEmail && expertEmail.toLowerCase() === formEmail.toLowerCase()) ||
               (expertPhone && formPhone && expertPhone === formPhone);
      });
      
      if (selectedExpert) {
        // Use the complete expert information from the advisor profile
        propertyConsultant = {
          ...selectedExpert,
          full_name: selectedExpert.full_name || selectedExpert.fullName,
          fullName: selectedExpert.full_name || selectedExpert.fullName,
          email: selectedExpert.email,
          contactEmail: selectedExpert.email,
          phone: selectedExpert.phone,
          contactPhone: selectedExpert.phone,
          profile_photo_url: selectedExpert.profile_photo_url || selectedExpert.profilePhotoUrl,
          profilePhotoUrl: selectedExpert.profile_photo_url || selectedExpert.profilePhotoUrl,
          job_title: selectedExpert.job_title || selectedExpert.jobTitle || 'Property Consultant',
          jobTitle: selectedExpert.job_title || selectedExpert.jobTitle || 'Property Consultant'
        };
      } else {
        // If no matching expert found, create basic consultant info from form data
        propertyConsultant = {
          full_name: fallbackContact.name || `${fallbackContact.firstName || ''} ${fallbackContact.lastName || ''}`.trim(),
          fullName: fallbackContact.name || `${fallbackContact.firstName || ''} ${fallbackContact.lastName || ''}`.trim(),
          email: fallbackContact.email,
          contactEmail: fallbackContact.email,
          phone: fallbackContact.phone,
          contactPhone: fallbackContact.phone,
          profile_photo_url: null,
          profilePhotoUrl: null,
          job_title: 'Property Consultant',
          jobTitle: 'Property Consultant'
        };
      }
    }
    // If no selected expert from form, fall back to advisor profile experts
    else {
      propertyConsultant = findPropertyConsultant(advisorData.experts);
    }
    
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-company-card pac-company-angled">
          {/* Company Header Section - Different background color and angled design */}
          <div className="pac-company-header pac-company-header-angled">
            <div className="pac-company-main">
              {(advisorData.company_logo_url || advisorData.companyLogoUrl) && (
                <div className="pac-company-logo">
                  <img 
                    src={advisorData.company_logo_url || advisorData.companyLogoUrl} 
                    alt={`${advisorData.company_name} logo`}
                    className="pac-logo-image"
                  />
                </div>
              )}
              <div className="pac-company-info">
                <h2 className="pac-company-name">
                  {advisorData.company_name}
                  {advisorData.company_name && !advisorData.company_name.toLowerCase().includes('ltd') && ' Ltd'}
                </h2>
                <p className="pac-company-tagline">Trust to our experts</p>
                {(advisorData.email || advisorData.company_email) && (
                  <p className="pac-company-email">
                    <i className="fas fa-envelope" style={{ marginRight: '8px', color: '#6b7280' }}></i>
                    {advisorData.email || advisorData.company_email}
                  </p>
                )}
                {advisorData.company_website && (
                  <a 
                    href={advisorData.company_website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="pac-company-address"
                  >
                    {advisorData.company_website}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Property Consultant Section - Rectangle photo */}
          {propertyConsultant && (
            <div className="pac-consultant-section">
              <h3 className="pac-section-title">Property Consultant</h3>
              <div className="pac-consultant-card">
                <div className="pac-consultant-photo pac-consultant-photo-rectangle">
                  {(propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl) ? (
                    <img 
                      src={propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl} 
                      alt={propertyConsultant.full_name || propertyConsultant.fullName}
                      className="pac-consultant-image pac-consultant-image-rectangle"
                    />
                  ) : (
                    <div className="pac-consultant-placeholder pac-consultant-placeholder-rectangle">
                      <i className="fas fa-user"></i>
                    </div>
                  )}
                </div>
                <div className="pac-consultant-details">
                  <h4 className="pac-consultant-name">
                    {propertyConsultant.full_name || propertyConsultant.fullName || 'Property Consultant'}
                  </h4>
                  <p className="pac-consultant-role">Property Consultant</p>
                  {(propertyConsultant.email || propertyConsultant.contactEmail) && (
                    <p className="pac-consultant-email">
                      <i className="fas fa-envelope" style={{ marginRight: '8px', color: '#6b7280' }}></i>
                      {propertyConsultant.email || propertyConsultant.contactEmail}
                    </p>
                  )}
                  {(propertyConsultant.phone || propertyConsultant.contactPhone) && (
                    <p className="pac-consultant-phone">
                      📞 {propertyConsultant.phone || propertyConsultant.contactPhone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Office Information Section */}
          <div className="pac-office-section">
            <h3 className="pac-section-title">Office Information</h3>
            <div className="pac-office-details">
              {advisorData.company_website && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '0 auto 24px auto',
                  gap: '12px',
                  paddingLeft: '20px',
                  paddingRight: '20px'
                }}>
                  <span style={{ 
                    display: 'inline-block',
                    animation: 'pointingHand 2s ease-in-out infinite',
                    fontSize: '20px'
                  }}>
                    👆
                  </span>
                  <a 
                    href={advisorData.company_website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="pac-company-website"
                    style={{ 
                      display: 'inline-block',
                      padding: '8px 16px',
                      textDecoration: 'none',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      transition: 'all 0.3s ease',
                      border: '1.5px solid #3b82f6',
                      cursor: 'pointer'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    🌐 Visit Company Dashboard
                  </a>
                </div>
              )}
              <div className="pac-office-item">
                <span className="pac-office-label">Office Hours:</span>
                <span className="pac-office-value">
                  {advisorData.office_hours || "Monday - Friday: 9:00 AM - 6:00 PM"}
                </span>
              </div>
              {(advisorData.office_address || advisorData.office_city || advisorData.office_postcode) && (
                <div className="pac-office-item">
                  <span className="pac-office-label">Address:</span>
                  <span className="pac-office-value">
                    {advisorData.office_address && advisorData.office_address}
                    {advisorData.office_address && (advisorData.office_city || advisorData.office_postcode) && ', '}
                    {advisorData.office_city && advisorData.office_city}
                    {advisorData.office_city && advisorData.office_postcode && ' '}
                    {advisorData.office_postcode && advisorData.office_postcode}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCENARIO 2: PERSON ADVISOR (AdvisorProfile + AddRent forms)
  if (isPerson) {
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-company-card pac-company-angled">
          {/* Person Header Section - Inspired by Company Layout */}
          <div className="pac-company-header pac-company-header-angled">
            <div className="pac-company-main">
                            <div className="pac-consultant-photo">
              {(advisorData.profile_photo_url || advisorData.profilePhotoUrl) ? (
                <img 
                  src={advisorData.profile_photo_url || advisorData.profilePhotoUrl} 
                  alt={advisorData.full_name}
                  className="pac-consultant-image"
                />
              ) : (
                  <div className="pac-consultant-placeholder">
                  <i className="fas fa-user"></i>
                </div>
              )}
            </div>
              <div className="pac-company-info">
                <h2 className="pac-company-name">{capitalizeWords(advisorData.full_name)}</h2>
                <p className="pac-consultant-role">{advisorData.job_title}</p>
                {/* Removed email display for person advisor type */}
              </div>
            </div>
          </div>

          {/* Professional Bio Section */}
          {advisorData.professional_bio && (
            <div className="pac-consultant-section">
              <h3 className="pac-section-title">Professional Bio</h3>
              <div className="pac-consultant-card">
                <div className="pac-consultant-details">
                  <p className="pac-consultant-email">{advisorData.professional_bio}</p>
                </div>
              </div>
            </div>
          )}

          {/* Contact Information Section */}
          <div className="pac-office-section">
            <h3 className="pac-section-title">Contact Information</h3>
            <div className="pac-office-details">
              {advisorData.contact_phone && (
                <div className="pac-office-item">
                  <span className="pac-office-label">Phone:</span>
                  <span className="pac-office-value">📞 {advisorData.contact_phone}</span>
                </div>
              )}
              {(advisorData.email || advisorData.contact_email || advisorData.contactEmail || advisorData.company_email || advisorData.account_email) && (
                <div className="pac-office-item">
                  <span className="pac-office-label">Email:</span>
                  <span className="pac-office-value">
                    <i className="fas fa-envelope" style={{ marginRight: '8px', color: '#6b7280' }}></i>
                    {advisorData.email || advisorData.contact_email || advisorData.contactEmail || advisorData.company_email || advisorData.account_email}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SCENARIO 3: NO ADVISOR PROFILE
  // If user hasn't submitted an advisor profile, don't show the card at all
  // Only show PropertyAdvisorCard if the user has completed their advisor profile
  if (!hasAdvisorProfile) {
    return null;
  }

  // No data at all
  return null;
};

export default PropertyAdvisorCard; 