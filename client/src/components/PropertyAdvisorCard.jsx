import React, { useState, useEffect } from 'react';
import './PropertyAdvisorCard.css';

const PropertyAdvisorCard = ({ userId, fallbackContact, propertyConsultantData }) => {
  const [advisorData, setAdvisorData] = useState(null);
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

  // Fetch advisor profile data
  useEffect(() => {
    const fetchAdvisorProfile = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('🔍 PropertyAdvisorCard: Fetching advisor profile for userId:', userId);
        const response = await fetch(`/api/users/${userId}/advisor-profile/details`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('🔍 PropertyAdvisorCard: API Response:', data);
          
          if (data.success && data.advisorProfile) {
            console.log('🔍 PropertyAdvisorCard: Advisor profile data:', data.advisorProfile);
            console.log('🔍 PropertyAdvisorCard: Expert team:', data.advisorProfile.experts);
            console.log('🔍 PropertyAdvisorCard: Expert team type:', typeof data.advisorProfile.experts);
            console.log('🔍 PropertyAdvisorCard: Expert team length:', data.advisorProfile.experts ? data.advisorProfile.experts.length : 'N/A');
            console.log('🔍 PropertyAdvisorCard: Profile photo URL:', data.advisorProfile.profile_photo_url);
            console.log('🔍 PropertyAdvisorCard: Company logo URL:', data.advisorProfile.company_logo_url);
            console.log('🔍 PropertyAdvisorCard: Advisor type:', data.advisorProfile.advisor_type);
            console.log('🔍 PropertyAdvisorCard: Is advisor:', data.advisorProfile.is_advisor);
            setAdvisorData(data.advisorProfile);
          } else {
            console.log('🔍 PropertyAdvisorCard: No advisor profile found or success is false');
            setError('No advisor profile found');
          }
        } else {
          console.log('🔍 PropertyAdvisorCard: API request failed with status:', response.status);
          setError('Failed to fetch advisor profile');
        }
      } catch (err) {
        console.error('🔍 PropertyAdvisorCard: Error fetching advisor profile:', err);
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
      console.log('🔍 PropertyAdvisorCard: No experts array found:', experts);
      return null;
    }
    
    console.log('🔍 PropertyAdvisorCard: Searching through experts:', experts);
    
    // First, try to find someone with "property consultant" in their job title
    let propertyConsultant = experts.find(expert => {
      const jobTitle = (expert.job_title || expert.jobTitle || '').toLowerCase();
      console.log('🔍 PropertyAdvisorCard: Checking expert job title:', jobTitle);
      return jobTitle.includes('property consultant') || jobTitle.includes('property') || jobTitle.includes('consultant');
    });
    
    // If no property consultant found, use the first expert
    if (!propertyConsultant && experts.length > 0) {
      propertyConsultant = experts[0];
      console.log('🔍 PropertyAdvisorCard: No property consultant found, using first expert:', propertyConsultant);
    }
    
    console.log('🔍 PropertyAdvisorCard: Final property consultant:', propertyConsultant);
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
  
  console.log('🔍 PropertyAdvisorCard: Layout determination:');
  console.log('  - hasAdvisorProfile:', hasAdvisorProfile);
  console.log('  - isCompany:', isCompany);
  console.log('  - isPerson:', isPerson);
  console.log('  - hasOnlyAddRentData:', hasOnlyAddRentData);
  console.log('  - advisorData?.is_advisor:', advisorData?.is_advisor);
  console.log('  - advisorData?.advisor_type:', advisorData?.advisor_type);

  // SCENARIO 1: COMPANY ADVISOR (AdvisorProfile + AddRent forms)
  if (isCompany) {
    const propertyConsultant = findPropertyConsultant(advisorData.experts) || propertyConsultantData;
    
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-company-card pac-company-angled">
          {/* Company Header Section - Different background color and angled design */}
          <div className="pac-company-header pac-company-header-angled">
            <div className="pac-company-main">
              {(advisorData.company_logo_url || advisorData.companyLogoUrl) && (
                <div className="pac-company-logo">
                  {console.log('🔍 PropertyAdvisorCard: Rendering company logo:', advisorData.company_logo_url || advisorData.companyLogoUrl)}
                  <img 
                    src={advisorData.company_logo_url || advisorData.companyLogoUrl} 
                    alt={`${advisorData.company_name} logo`}
                    className="pac-logo-image"
                    onError={(e) => console.error('🔍 PropertyAdvisorCard: Company logo failed to load:', advisorData.company_logo_url || advisorData.companyLogoUrl, e)}
                    onLoad={() => console.log('🔍 PropertyAdvisorCard: Company logo loaded successfully:', advisorData.company_logo_url || advisorData.companyLogoUrl)}
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
                  <p className="pac-company-email">✉️ {advisorData.email || advisorData.company_email}</p>
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
                  {console.log('🔍 PropertyAdvisorCard: Property consultant data:', propertyConsultant)}
                  {console.log('🔍 PropertyAdvisorCard: Property consultant photo URL:', propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl)}
                  {(propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl) ? (
                    <img 
                      src={propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl} 
                      alt={propertyConsultant.full_name || propertyConsultant.fullName}
                      className="pac-consultant-image pac-consultant-image-rectangle"
                      onError={(e) => console.error('🔍 PropertyAdvisorCard: Property consultant photo failed to load:', propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl, e)}
                      onLoad={() => console.log('🔍 PropertyAdvisorCard: Property consultant photo loaded successfully:', propertyConsultant.profile_photo_url || propertyConsultant.profilePhotoUrl)}
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
                      📧 {propertyConsultant.email || propertyConsultant.contactEmail}
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
              {advisorData.company_website && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: '24px auto 0 auto',
                  gap: '12px'
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
                      padding: '12px 24px',
                      textDecoration: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '16px',
                      transition: 'all 0.3s ease',
                      border: '2px solid #3b82f6',
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
        <div className="pac-person-card">
          {/* Person Header Section */}
          <div className="pac-person-header">
            <div className="pac-person-photo">
              {console.log('🔍 PropertyAdvisorCard: Person advisor photo URL:', advisorData.profile_photo_url || advisorData.profilePhotoUrl)}
              {(advisorData.profile_photo_url || advisorData.profilePhotoUrl) ? (
                <img 
                  src={advisorData.profile_photo_url || advisorData.profilePhotoUrl} 
                  alt={advisorData.full_name}
                  className="pac-person-image"
                  onError={(e) => console.error('🔍 PropertyAdvisorCard: Person advisor photo failed to load:', advisorData.profile_photo_url || advisorData.profilePhotoUrl, e)}
                  onLoad={() => console.log('🔍 PropertyAdvisorCard: Person advisor photo loaded successfully:', advisorData.profile_photo_url || advisorData.profilePhotoUrl)}
                />
              ) : (
                <div className="pac-person-placeholder">
                  <i className="fas fa-user"></i>
                </div>
              )}
            </div>
            <div className="pac-person-info">
              <h2 className="pac-person-name">{advisorData.full_name}</h2>
              <p className="pac-person-role">{advisorData.job_title}</p>
            </div>
          </div>

          {/* Professional Bio Section */}
          {advisorData.professional_bio && (
            <div className="pac-bio-section">
              <h3 className="pac-section-title">About</h3>
              <p className="pac-bio-text">{advisorData.professional_bio}</p>
            </div>
          )}

          {/* Contact Information Section */}
          <div className="pac-contact-section">
            <h3 className="pac-section-title">Contact Information</h3>
            <div className="pac-contact-details">
              {advisorData.contact_phone && (
                <p className="pac-contact-phone">📞 {advisorData.contact_phone}</p>
              )}
              {(advisorData.email || advisorData.contact_email || advisorData.company_email || advisorData.account_email) && (
                <p className="pac-contact-email">
                  📧 {advisorData.email || advisorData.contact_email || advisorData.company_email || advisorData.account_email}
                </p>
              )}
            </div>
          </div>

          {/* Office Information Section */}
          <div className="pac-office-section">
            <h3 className="pac-section-title">Office Information</h3>
            <div className="pac-office-details">
              {advisorData.office_hours && (
                <div className="pac-office-item">
                  <span className="pac-office-label">Office Hours:</span>
                  <span className="pac-office-value">{advisorData.office_hours}</span>
                </div>
              )}
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

  // SCENARIO 3: NO ADVISOR PROFILE (Only AddRent form data)
  if (hasOnlyAddRentData) {
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-addrent-card">
          <div className="pac-addrent-header">
            <h3 className="pac-addrent-title">Property Contact</h3>
          </div>
          <div className="pac-addrent-content">
            <div className="pac-addrent-info">
              <h4 className="pac-addrent-name">
                {fallbackContact?.name || 
                 `${fallbackContact?.firstName || ''} ${fallbackContact?.lastName || ''}`.trim() ||
                 propertyConsultantData?.fullName ||
                 'Property Owner'}
              </h4>
              <p className="pac-addrent-role">
                {propertyConsultantData?.jobTitle || 'Property Owner'}
              </p>
              {(fallbackContact?.email || propertyConsultantData?.contactEmail) && (
                <p className="pac-addrent-email">
                  📧 {fallbackContact?.email || propertyConsultantData?.contactEmail}
                </p>
              )}
              {(fallbackContact?.phone || propertyConsultantData?.contactPhone) && (
                <p className="pac-addrent-phone">
                  📞 {fallbackContact?.phone || propertyConsultantData?.contactPhone}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data at all
  return null;
};

export default PropertyAdvisorCard; 