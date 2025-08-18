import React, { useState, useEffect } from 'react';
import './PropertyAdvisorCard.css';

const PropertyAdvisorCard = ({ userId, fallbackContact }) => {
  const [advisorData, setAdvisorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch advisor profile data
  useEffect(() => {
    const fetchAdvisorProfile = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/users/${userId}/advisor-profile/details`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.advisorProfile) {
            setAdvisorData(data.advisorProfile);
          } else {
            setError('No advisor profile found');
          }
        } else {
          setError('Failed to fetch advisor profile');
        }
      } catch (err) {
        console.error('Error fetching advisor profile:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchAdvisorProfile();
  }, [userId]);

  // Helper function to find property consultant from expert team
  const findPropertyConsultant = (experts) => {
    if (!experts || !Array.isArray(experts)) return null;
    
    return experts.find(expert => 
      expert.job_title && 
      expert.job_title.toLowerCase().includes('property consultant')
    ) || experts[0]; // Fallback to first expert if no property consultant found
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

  // No advisor data - show fallback if available
  if (!advisorData && fallbackContact) {
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-fallback-card">
          <div className="pac-fallback-header">
            <h3 className="pac-fallback-title">Property Contact</h3>
          </div>
          <div className="pac-fallback-content">
            <div className="pac-fallback-info">
              <h4 className="pac-fallback-name">
                {fallbackContact.name || `${fallbackContact.firstName || ''} ${fallbackContact.lastName || ''}`.trim()}
              </h4>
              <p className="pac-fallback-role">Property Owner</p>
              {fallbackContact.email && (
                <p className="pac-fallback-email">📧 {fallbackContact.email}</p>
              )}
              {fallbackContact.phone && (
                <p className="pac-fallback-phone">📞 {fallbackContact.phone}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data at all
  if (!advisorData) {
    return null;
  }

  const isCompany = advisorData.advisor_type === 'company';
  
  if (isCompany) {
    // COMPANY LAYOUT
    const propertyConsultant = findPropertyConsultant(advisorData.experts);
    
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-company-card">
          {/* Company Header Section */}
          <div className="pac-company-header">
            <div className="pac-company-main">
              {advisorData.company_logo_url && (
                <div className="pac-company-logo">
                  <img 
                    src={advisorData.company_logo_url} 
                    alt={`${advisorData.company_name} logo`}
                    className="pac-logo-image"
                  />
                </div>
              )}
              <div className="pac-company-info">
                <h2 className="pac-company-name">{advisorData.company_name}</h2>
                <p className="pac-company-tagline">Trust to our experts</p>
                {advisorData.company_website && (
                  <a 
                    href={advisorData.company_website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="pac-company-website"
                  >
                    🌐 Visit Website
                  </a>
                )}
                {advisorData.company_email && (
                  <p className="pac-company-email">📧 {advisorData.company_email}</p>
                )}
              </div>
            </div>
          </div>

          {/* Property Consultant Section */}
          {propertyConsultant && (
            <div className="pac-consultant-section">
              <h3 className="pac-section-title">Property Consultant</h3>
              <div className="pac-consultant-card">
                <div className="pac-consultant-photo">
                  {propertyConsultant.profile_photo_url ? (
                    <img 
                      src={propertyConsultant.profile_photo_url} 
                      alt={propertyConsultant.full_name}
                      className="pac-consultant-image"
                    />
                  ) : (
                    <div className="pac-consultant-placeholder">
                      <i className="fas fa-user"></i>
                    </div>
                  )}
                </div>
                <div className="pac-consultant-details">
                  <h4 className="pac-consultant-name">{propertyConsultant.full_name}</h4>
                  <p className="pac-consultant-role">Property Consultant</p>
                  {propertyConsultant.email && (
                    <p className="pac-consultant-email">📧 {propertyConsultant.email}</p>
                  )}
                  {propertyConsultant.phone && (
                    <p className="pac-consultant-phone">📞 {propertyConsultant.phone}</p>
                  )}
                </div>
              </div>
            </div>
          )}

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
  } else {
    // PERSON LAYOUT
    return (
      <div className="property-advisor-card-wrapper">
        <div className="pac-person-card">
          {/* Person Header Section */}
          <div className="pac-person-header">
            <div className="pac-person-photo">
              {advisorData.profile_photo_url ? (
                <img 
                  src={advisorData.profile_photo_url} 
                  alt={advisorData.full_name}
                  className="pac-person-image"
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
              {(advisorData.contact_email || advisorData.account_email) && (
                <p className="pac-contact-email">
                  📧 {advisorData.contact_email || advisorData.account_email}
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
};

export default PropertyAdvisorCard; 