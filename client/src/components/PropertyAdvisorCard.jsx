import React from 'react';
import './PropertyAdvisorCard.css';

const PropertyAdvisorCard = ({ advisor, fallbackContact }) => {
  // Helper function to get first defined value from multiple possible field names
  const getFirstDefined = (obj, ...fieldNames) => {
    for (const fieldName of fieldNames) {
      if (obj && obj[fieldName] && obj[fieldName].trim() !== '') {
        return obj[fieldName];
      }
    }
    return null;
  };

  // Helper function to convert to title case
  const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };

  // Helper function to convert to sentence case
  const toSentenceCase = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Helper function to limit words
  const limitWords = (text, limit = 20) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= limit) return text;
    return words.slice(0, limit).join(' ') + '...';
  };

  // If no advisor data, create a minimal card using fallback contact
  if (!advisor && fallbackContact) {
    const minimalAdvisor = {
      advisor_type: 'person',
      full_name: fallbackContact.name || `${fallbackContact.firstName || ''} ${fallbackContact.lastName || ''}`.trim(),
      contact_email: fallbackContact.email,
      contact_phone: fallbackContact.phone,
      job_title: 'Property Owner'
    };
    advisor = minimalAdvisor;
  }

  // If still no advisor data, don't render anything
  if (!advisor) {
    return null;
  }

  const isCompany = advisor.advisor_type === 'company';

  // Get contact information with fallbacks
  const email = getFirstDefined(advisor, 'contact_email', 'email', 'contactEmail') || 
                getFirstDefined(advisor, 'account_email') || 
                (fallbackContact && fallbackContact.email);
  
  const phone = getFirstDefined(advisor, 'contact_phone', 'phone', 'contactPhone') || 
                getFirstDefined(advisor, 'account_phone') || 
                (fallbackContact && fallbackContact.phone);

  // Get company information
  const companyName = getFirstDefined(advisor, 'company_name', 'companyName');
  const companyLogo = getFirstDefined(advisor, 'company_logo_url', 'companyLogoUrl');
  const companyWebsite = getFirstDefined(advisor, 'company_website', 'companyWebsite');
  const companyDescription = getFirstDefined(advisor, 'company_description', 'companyDescription');
  
  // Get office information
  const officeAddress = getFirstDefined(advisor, 'office_address', 'officeAddress');
  const officeHours = getFirstDefined(advisor, 'office_hours', 'officeHours');
  const officeCity = getFirstDefined(advisor, 'office_city', 'officeCity');
  const officePostcode = getFirstDefined(advisor, 'office_postcode', 'officePostcode');

  // Get personal information
  const fullName = getFirstDefined(advisor, 'full_name', 'fullName');
  const jobTitle = getFirstDefined(advisor, 'job_title', 'jobTitle');
  const profilePhoto = getFirstDefined(advisor, 'profile_photo_url', 'profilePhotoUrl');
  const professionalBio = getFirstDefined(advisor, 'professional_bio', 'professionalBio');

  // Get expert team information
  const experts = advisor.experts || advisor.expert_team || [];

  return (
    <div className="property-advisor-card">
      {isCompany ? (
        // Company Layout
        <div className="advisor-card-company">
          <div className="advisor-header">
            <div className="company-info">
              {companyLogo && (
                <div className="company-logo">
                  <img src={companyLogo} alt={`${companyName} logo`} />
                </div>
              )}
              <div className="company-details">
                <h3 className="company-name">{toTitleCase(companyName)}</h3>
                <p className="company-tagline">Trust to this company</p>
                {companyWebsite && (
                  <a href={companyWebsite} target="_blank" rel="noopener noreferrer" className="company-website">
                    Visit Website
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="advisor-content">
            <div className="advisor-section">
              <h4 className="section-title">Our Property Team</h4>
              <div className="advisor-profile">
                {profilePhoto ? (
                  <img src={profilePhoto} alt={fullName} className="advisor-photo" />
                ) : (
                  <div className="advisor-photo-placeholder">
                    <i className="fas fa-user"></i>
                  </div>
                )}
                <div className="advisor-info">
                  <h5 className="advisor-name">{toTitleCase(fullName)}</h5>
                  <p className="advisor-role">{toSentenceCase(jobTitle)}</p>
                  {email && <p className="advisor-email">{email}</p>}
                  {phone && <p className="advisor-phone">{phone}</p>}
                </div>
              </div>
            </div>

            <div className="office-section">
              <h4 className="section-title">Contact Information</h4>
              <div className="office-details">
                {officeAddress && <p className="office-address">{officeAddress}</p>}
                {officeHours && <p className="office-hours">{officeHours}</p>}
                {(officeCity || officePostcode) && (
                  <p className="office-location">
                    {officeCity && officeCity}
                    {officeCity && officePostcode && ', '}
                    {officePostcode && officePostcode}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Person Layout
        <div className="advisor-card-person">
          <div className="advisor-header">
            <div className="advisor-profile">
              {profilePhoto ? (
                <img src={profilePhoto} alt={fullName} className="advisor-photo" />
              ) : (
                <div className="advisor-photo-placeholder">
                  <i className="fas fa-user"></i>
                </div>
              )}
              <div className="advisor-info">
                <h3 className="advisor-name">{toTitleCase(fullName)}</h3>
                <p className="advisor-role">{toSentenceCase(jobTitle)}</p>
              </div>
            </div>
          </div>

          <div className="advisor-content">
            {professionalBio && (
              <div className="advisor-section">
                <p className="advisor-bio">{limitWords(professionalBio, 30)}</p>
              </div>
            )}

            <div className="contact-section">
              <h4 className="section-title">Contact Information</h4>
              <div className="contact-details">
                {email && <p className="contact-email">{email}</p>}
                {phone && <p className="contact-phone">{phone}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyAdvisorCard; 