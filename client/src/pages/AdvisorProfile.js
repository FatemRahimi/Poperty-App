import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdvisorProfile.css';

const AdvisorProfile = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  
  const [advisorData, setAdvisorData] = useState({
    companyName: '',
    companyLogo: null,
    companyLogoUrl: '',
    companyTagline: '',
    jobTitle: '',
    professionalBio: '',
    officeHours: '',
    officeAddress: '',
    isAdvisor: false
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchAdvisorProfile();
  }, [isAuthenticated, navigate]);

  const fetchAdvisorProfile = async () => {
    try {
      const response = await fetch(`/api/users/advisor-profile`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAdvisorData({
          companyName: data.company_name || '',
          companyLogoUrl: data.company_logo || '',
          companyTagline: data.company_tagline || '',
          jobTitle: data.job_title || '',
          professionalBio: data.professional_bio || '',
          officeHours: data.office_hours || '',
          officeAddress: data.office_address || '',
          isAdvisor: data.is_advisor || false
        });
      }
    } catch (err) {
      console.error('Error fetching advisor profile:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAdvisorData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAdvisorData(prev => ({
        ...prev,
        companyLogo: file
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      
      // Add all advisor data to form
      Object.keys(advisorData).forEach(key => {
        if (key !== 'companyLogo' && advisorData[key] !== null && advisorData[key] !== '') {
          formData.append(key, advisorData[key]);
        }
      });

      // Add logo file if selected
      if (advisorData.companyLogo) {
        formData.append('companyLogo', advisorData.companyLogo);
      }

      const response = await fetch('/api/users/advisor-profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        setSuccess('Advisor profile updated successfully!');
        fetchAdvisorProfile(); // Refresh data
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to update advisor profile');
      }
    } catch (err) {
      setError('Failed to update advisor profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="advisor-profile-container">
      <div className="advisor-profile-header">
        <h1>Professional Advisor Profile</h1>
        <p>Set up your professional information that will appear on all your property listings</p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit} className="advisor-profile-form">
        <div className="form-section">
          <h3>Company Information</h3>
          
          <div className="form-group">
            <label htmlFor="companyName">Company Name*</label>
            <input
              type="text"
              id="companyName"
              name="companyName"
              value={advisorData.companyName}
              onChange={handleChange}
              placeholder="e.g. Property Solutions Ltd"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="companyTagline">Company Tagline</label>
            <input
              type="text"
              id="companyTagline"
              name="companyTagline"
              value={advisorData.companyTagline}
              onChange={handleChange}
              placeholder="e.g. Your Trusted Property Partner"
            />
          </div>

          <div className="form-group">
            <label htmlFor="companyLogo">Company Logo</label>
            <div className="logo-upload-area">
              <input
                type="file"
                id="companyLogo"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="companyLogo" className="logo-upload-label">
                <div className="logo-upload-content">
                  {advisorData.companyLogoUrl ? (
                    <img src={advisorData.companyLogoUrl} alt="Company Logo" className="logo-preview" />
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
        </div>

        <div className="form-section">
          <h3>Personal Information</h3>
          
          <div className="form-group">
            <label htmlFor="jobTitle">Job Title*</label>
            <input
              type="text"
              id="jobTitle"
              name="jobTitle"
              value={advisorData.jobTitle}
              onChange={handleChange}
              placeholder="e.g. Senior Property Advisor"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="professionalBio">Professional Bio</label>
            <textarea
              id="professionalBio"
              name="professionalBio"
              value={advisorData.professionalBio}
              onChange={handleChange}
              rows="4"
              placeholder="Tell potential clients about your experience and expertise..."
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Contact Information</h3>
          
          <div className="form-group">
            <label htmlFor="officeHours">Office Hours</label>
            <input
              type="text"
              id="officeHours"
              name="officeHours"
              value={advisorData.officeHours}
              onChange={handleChange}
              placeholder="e.g. Mon-Fri: 9:00 AM - 6:00 PM"
            />
          </div>

          <div className="form-group">
            <label htmlFor="officeAddress">Office Address</label>
            <textarea
              id="officeAddress"
              name="officeAddress"
              value={advisorData.officeAddress}
              onChange={handleChange}
              rows="3"
              placeholder="Enter your office address..."
            />
          </div>
        </div>

        <div className="form-section">
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isAdvisor"
                checked={advisorData.isAdvisor}
                onChange={handleChange}
              />
              <span>Enable Professional Advisor Profile</span>
            </label>
            <small>When enabled, your advisor information will appear on all your property listings</small>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/dashboard')}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save Advisor Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdvisorProfile; 