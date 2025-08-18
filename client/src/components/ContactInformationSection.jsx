import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const ContactInformationSection = ({ 
  formData, 
  setFormData, 
  handleChange,
  className = ""
}) => {
  const { user } = useAuth();
  const [advisorProfile, setAdvisorProfile] = useState(null);
  const [advisorProfileStatus, setAdvisorProfileStatus] = useState('loading');
  const [expertTeam, setExpertTeam] = useState([]);
  const [selectedExpertForContact, setSelectedExpertForContact] = useState('');

  // Fetch advisor profile to determine contact info display
  useEffect(() => {
    const fetchAdvisorProfile = async () => {
      if (!user?.id) {
        setAdvisorProfileStatus('loading');
        return;
      }

      try {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/users/${user.id}/advisor-profile`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('🔍 Advisor profile response:', data);
          
          if (data.hasCompletedAdvisorProfile) {
            // User has completed advisor profile, need to get details
            const detailsResponse = await fetch(
              `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5050'}/api/users/${user.id}/advisor-profile/details`,
              {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
              }
            );
            
            if (detailsResponse.ok) {
              const detailsData = await detailsResponse.json();
              console.log('🔍 Advisor profile details:', detailsData);
              
              if (detailsData.success && detailsData.advisorProfile) {
                const profile = detailsData.advisorProfile;
                setAdvisorProfile(profile);
                setExpertTeam(profile.experts || []);
                setAdvisorProfileStatus(profile.advisor_type || 'person');
                
                // Auto-fill contact info based on advisor profile
                if (profile.advisor_type === 'person') {
                  setFormData(prev => ({
                    ...prev,
                    contactPhone: profile.contact_phone || prev.contactPhone,
                    contactEmail: profile.contact_email || prev.contactEmail,
                    contactName: profile.full_name || prev.contactName
                  }));
                }
              } else {
                setAdvisorProfileStatus('none');
              }
            } else {
              setAdvisorProfileStatus('none');
            }
          } else if (data.hasSkippedAdvisorProfile) {
            setAdvisorProfileStatus('skipped');
          } else {
            setAdvisorProfileStatus('none');
          }
        } else {
          setAdvisorProfileStatus('none');
        }
      } catch (error) {
        console.error('Error fetching advisor profile:', error);
        setAdvisorProfileStatus('none');
      }
    };

    if (user?.id) {
      fetchAdvisorProfile();
    }
  }, [user?.id, setFormData]);

  const handleExpertSelection = (expertId, expert) => {
    setSelectedExpertForContact(expertId);
    setFormData(prev => ({
      ...prev,
      contactPhone: expert.phone || '',
      contactEmail: expert.email || '',
      contactName: expert.full_name || expert.fullName || ''
    }));
  };

  console.log('🔍 ContactInformationSection render - status:', advisorProfileStatus, 'advisorProfile:', advisorProfile, 'expertTeam:', expertTeam, 'selectedExpertForContact:', selectedExpertForContact);
  
  return (
    <div className={className}>
      {/* Dynamic Contact Information Section */}
      {advisorProfileStatus === 'loading' && (
        <div className="loading-section">
          <h3 className="section-title">Contact Information</h3>
          <p>Loading contact information...</p>
        </div>
      )}

            {advisorProfileStatus === 'skipped' && (
        <div>
          <h3 className="section-title">Contact Information</h3>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
            <div className="form-group">
              <label htmlFor="contactPhone">Contact Phone Number*</label>
              <input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                value={formData.contactPhone || ''}
                onChange={handleChange}
                placeholder="+44 7xxx xxx xxx"
                required
              />
 
            </div>
            
            <div className="form-group">
              <label htmlFor="propertyConsultant">Property Consultant Name*</label>
              <input
                type="text"
                id="propertyConsultant"
                name="propertyConsultant"
                value={formData.propertyConsultant || ''}
                onChange={handleChange}
                placeholder="Enter property consultant name"
                required
              />
            </div>
          </div>
        </div>
      )}

      {advisorProfileStatus === 'person' && advisorProfile && (
        <div>
          <h3 className="section-title">Contact Information</h3>
          <div className="advisor-contact-info" style={{
            background: '#f0fdf4',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #bbf7d0'
          }}>
            <h4 style={{margin: '0 0 1rem 0', color: '#166534', fontSize: '1.1rem'}}>
              ✅ Your Advisor Profile Information
            </h4>
            <div style={{display: 'grid', gap: '0.75rem'}}>
              <div style={{display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#166534', fontWeight: '600', minWidth: '60px'}}>👤 Name:</span>
                <span style={{color: '#374151'}}>{advisorProfile.full_name}</span>
              </div>
              <div style={{display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#166534', fontWeight: '600', minWidth: '60px'}}>✉️ Email:</span>
                <span style={{color: '#374151'}}>{advisorProfile.contact_email || user.email}</span>
              </div>
              <div style={{display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#166534', fontWeight: '600', minWidth: '60px'}}>📞 Phone:</span>
                <span style={{color: '#374151'}}>{advisorProfile.contact_phone}</span>
              </div>
            </div>
                      {/* Note about contact information */}
          <div style={{background: '#f0fdf4', padding: '0.75rem', borderRadius: '6px', marginTop: '1rem', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.875rem'}}>
            <strong>Note:</strong> To update your contact information, please visit your User Dashboard → Advisor Profile tab.
          </div>
        </div>
        </div>
      )}

      {advisorProfileStatus === 'company' && advisorProfile && (
        console.log('🔍 Rendering company section - expertTeam:', expertTeam, 'selectedExpertForContact:', selectedExpertForContact),
        <div>
          <h3 className="section-title">Expert Team Contact</h3>
          <div className="company-contact-section" style={{
            background: '#ffffff',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #e5e7eb'
          }}>
            <p style={{color: 'rgb(16, 185, 129)', marginBottom: '1.5rem', fontSize: '0.95rem'}}>
              All expert team members are shown in your company dashboard, but we can only show one Property Consultant's contact information in your advisor card.
            </p>
            
            {expertTeam && expertTeam.length > 0 ? (
              <div>
                <h4 style={{margin: '0 0 1rem 0', color: '#111827', fontSize: '1.1rem'}}>Select Property Consultant for Contact:</h4>
                {expertTeam
                  .filter(expert => expert.job_title === 'Property Consultant' || expert.jobTitle === 'Property Consultant')
                  .map((expert) => (
                    <div key={expert.id} className="expert-option" style={{
                      padding: '1rem',
                      border: selectedExpertForContact === expert.id ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      background: selectedExpertForContact === expert.id ? '#eff6ff' : '#ffffff',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                    onClick={() => handleExpertSelection(expert.id, expert)}
                    >
                      {selectedExpertForContact === expert.id && (
                        <div style={{
                          position: 'absolute',
                          top: '0.5rem',
                          right: '0.5rem',
                          width: '20px',
                          height: '20px',
                          backgroundColor: '#3b82f6',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}>
                          ✓
                        </div>
                      )}
                      <label style={{display: 'flex', alignItems: 'flex-start', cursor: 'pointer', margin: 0}}>
                        <input
                          type="radio"
                          name="selectedExpert"
                          value={expert.id}
                          checked={selectedExpertForContact === expert.id}
                          onChange={() => handleExpertSelection(expert.id, expert)}
                          style={{
                            marginRight: '0.75rem',
                            marginTop: '0.25rem',
                            width: '20px',
                            height: '20px',
                            accentColor: '#3b82f6',
                            cursor: 'pointer',
                            border: '2px solid #3b82f6',
                            borderRadius: '50%',
                            backgroundColor: selectedExpertForContact === expert.id ? '#3b82f6' : 'white'
                          }}
                        />
                        <div style={{flex: 1}}>
                          <div style={{
                            fontWeight: '600',
                            color: '#111827',
                            fontSize: '1rem',
                            marginBottom: '0.25rem'
                          }}>
                            {expert.full_name || expert.fullName}
                          </div>
                          <div style={{
                            color: '#6b7280',
                            fontSize: '0.875rem',
                            lineHeight: '1.4'
                          }}>
                            <div>📞 {expert.phone}</div>
                            <div>✉️ {expert.email}</div>
                          </div>
                        </div>
                      </label>
                    </div>
                  ))}
                
                {expertTeam.filter(expert => expert.job_title === 'Property Consultant' || expert.jobTitle === 'Property Consultant').length === 0 && (
                  <div style={{
                    padding: '1rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    color: '#dc2626'
                  }}>
                    <p style={{margin: 0, fontStyle: 'italic'}}>
                      ⚠️ No Property Consultants found in your expert team. Please add a Property Consultant to your team in the Advisor Profile section.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: '1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626'
              }}>
                <p style={{margin: 0, fontStyle: 'italic'}}>
                  ⚠️ No expert team members found. Please add team members in your Advisor Profile section.
                </p>
              </div>
            )}
          </div>
          
          {/* Note about contact information */}
          <div style={{background: '#fef3c7', padding: '0.75rem', borderRadius: '6px', marginTop: '1rem', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.875rem'}}>
            <strong>Note:</strong> To update your contact information, please visit your User Dashboard → Advisor Profile tab.
          </div>
        </div>
      )}

      {advisorProfileStatus === 'none' && (
        <div>
          <h3 className="section-title">Contact Information</h3>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
            <div className="form-group">
              <label htmlFor="contactPhone">Contact Phone Number*</label>
              <input
                type="tel"
                id="contactPhone"
                name="contactPhone"
                value={formData.contactPhone || ''}
                onChange={handleChange}
                placeholder="+44 7xxx xxx xxx"
                required
              />
 
            </div>
            
            <div className="form-group">
              <label htmlFor="propertyConsultant">Property Consultant Name*</label>
              <input
                type="text"
                id="propertyConsultant"
                name="propertyConsultant"
                value={formData.propertyConsultant || ''}
                onChange={handleChange}
                placeholder="Enter property consultant name"
                required
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactInformationSection; 