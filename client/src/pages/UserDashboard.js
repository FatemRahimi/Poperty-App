import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './UserDashboard.css';

const UserDashboard = () => {
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddListingDropdown, setShowAddListingDropdown] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all'
  });
  const [profileData, setProfileData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    created_at: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
  
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const profileFormRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    console.log('🏠 UserDashboard: Component loaded');
    console.log('🏠 UserDashboard: User data:', user);
    console.log('🏠 UserDashboard: User authenticated:', !!user);
    
    if (!user) {
      console.log('🏠 UserDashboard: No user found, redirecting to login');
      navigate('/login');
      return;
    }
    loadDashboardData();
    setProfileData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      created_at: user?.created_at || ''
    });
  }, [user, navigate]);

  // Refresh data when component gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadDashboardData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  // Handle click outside profile form to cancel editing
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Removed click-outside-to-cancel functionality for better UX
      // Users should explicitly choose to cancel or save
    };

    // Removed the problematic click-outside behavior
    // if (isEditing) {
    //   document.addEventListener('mousedown', handleClickOutside);
    //   return () => document.removeEventListener('mousedown', handleClickOutside);
    // }
  }, [isEditing, user]);

  // Handle click outside add listing dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showAddListingDropdown && !event.target.closest('.add-listing-dropdown-container')) {
        setShowAddListingDropdown(false);
      }
    };

    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showAddListingDropdown) {
        setShowAddListingDropdown(false);
      }
    };

    if (showAddListingDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [showAddListingDropdown]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const propertiesResponse = await fetch('/api/properties/my-properties', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json();
        setProperties(propertiesData.properties || []);
        
        const userStats = calculateStats(propertiesData.properties || []);
        setStats(userStats);
      } else {
        console.error('Failed to load dashboard data:', propertiesResponse.status);
        if (propertiesResponse.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
        }
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (properties) => {
    return {
      total: properties.length,
      pending: properties.filter(p => p.status === 'pending').length,
      approved: properties.filter(p => p.status === 'approved').length,
      rejected: properties.filter(p => p.status === 'rejected').length,
    };
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCancelEdit = () => {
    // Check if there are unsaved changes
    const hasChanges = 
      profileData.first_name !== (user?.first_name || '') ||
      profileData.last_name !== (user?.last_name || '') ||
      profileData.phone !== (user?.phone || '');

    if (hasChanges) {
      const confirmCancel = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel? Your changes will be lost.'
      );
      if (!confirmCancel) {
        return; // User chose to continue editing
      }
    }

    // Reset form data to original user data
    setProfileData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      created_at: user?.created_at || ''
    });
    
    // Exit editing mode
    setIsEditing(false);
    
    // Clear any save messages
    setSaveMessage({ type: '', text: '' });
  };

  const handleProfileSave = async () => {
    console.log('🔥 SAVE BUTTON CLICKED - Function started!');
    
    try {
      console.log('🔍 Starting profile save...');
      console.log('Profile data to save:', {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        phone: profileData.phone
      });
      
      // Check if user is authenticated
      const token = localStorage.getItem('token');
      console.log('🔑 JWT Token exists:', !!token);
      
      if (!token) {
        console.log('❌ No authentication token found!');
        setSaveMessage({ 
          type: 'error', 
          text: 'Authentication error. Please log in again.' 
        });
        return;
      }
      
      setIsSaving(true);
      setSaveMessage({ type: '', text: '' });
      
      const requestBody = {
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        phone: profileData.phone
      };
      
      console.log('📤 Sending request with data:', requestBody);
      
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📥 Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Success response:', result);
        
        // Update local profile data with the server response
        const updatedProfileData = {
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          email: result.user.email,
          phone: result.user.phone || '',
          created_at: profileData.created_at
        };
        
        console.log('🔄 Updating local profile data:', updatedProfileData);
        setProfileData(updatedProfileData);
        
        // Update the user context with the new data
        console.log('🔄 Updating user context...');
        const userUpdateSuccess = updateUser({
          first_name: result.user.first_name,
          last_name: result.user.last_name,
          phone: result.user.phone
        });
        
        if (userUpdateSuccess) {
          console.log('✅ User context updated successfully');
        } else {
          console.log('❌ Failed to update user context');
        }
        
        // Exit editing mode
        setIsEditing(false);
        
        // Show success message
        setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
        
        // Clear success message after 4 seconds
        setTimeout(() => {
          setSaveMessage({ type: '', text: '' });
        }, 4000);
        
      } else {
        const errorData = await response.json().catch(() => null);
        console.log('❌ Error response status:', response.status);
        console.log('❌ Error response data:', errorData);
        
        let errorMessage = 'Failed to update profile. Please try again.';
        
        if (response.status === 401) {
          errorMessage = 'Session expired. Please log in again.';
          setTimeout(() => {
            localStorage.removeItem('token');
            navigate('/login');
          }, 2000);
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Please log in again.';
        } else if (errorData && errorData.message) {
          errorMessage = errorData.message;
        }
        
        setSaveMessage({ type: 'error', text: errorMessage });
      }
    } catch (error) {
      console.error('❌ Network/JavaScript error:', error);
      console.error('❌ Error stack:', error.stack);
      setSaveMessage({ 
        type: 'error', 
        text: 'Network error. Please check your connection and try again.' 
      });
    } finally {
      console.log('🏁 Finally block - setting isSaving to false');
      setIsSaving(false);
    }
  };

  const formatPrice = (property) => {
    if (property.property_type === 'sale' && property.price) {
      return `$${Number(property.price).toLocaleString()}`;
    } else if (property.monthly_rent) {
      return `$${Number(property.monthly_rent).toLocaleString()}/month`;
    }
    return 'Price not set';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const filteredProperties = properties.filter(property => {
    const statusMatch = filters.status === 'all' || property.status === filters.status;
    const typeMatch = filters.type === 'all' || property.property_type === filters.type;
    return statusMatch && typeMatch;
  });

  // Image Carousel Component
  const ImageCarousel = ({ images, title }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    if (!images || images.length === 0) {
      return (
        <div className="property-images">
          <div className="no-image-modern">
            <i className="fas fa-home"></i>
            <span>No Images Available</span>
          </div>
        </div>
      );
    }

    const nextImage = () => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
      <div className="property-images">
        <div className="image-carousel">
          {images.map((image, index) => (
            <img
              key={index}
              src={image.url}
              alt={`${title} - Image ${index + 1}`}
              className={`carousel-image ${index === currentImageIndex ? 'active' : ''}`}
            />
          ))}
          
          {images.length > 1 && (
            <>
              <button className="carousel-controls carousel-prev" onClick={prevImage}>
                <i className="fas fa-chevron-left"></i>
              </button>
              <button className="carousel-controls carousel-next" onClick={nextImage}>
                <i className="fas fa-chevron-right"></i>
              </button>
              
              <div className="carousel-indicators">
                {images.map((_, index) => (
                  <div
                    key={index}
                    className={`carousel-dot ${index === currentImageIndex ? 'active' : ''}`}
                    onClick={() => goToImage(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Professional Property Card
  const PropertyCard = ({ property }) => (
    <div className="property-card-modern fade-in">
      <ImageCarousel images={property.images} title={property.title} />
      
      <div className={`property-status-badge status-${property.status}`}>
        {property.status}
      </div>
      
      <div className="property-details-modern">
        <h3 className="property-title-modern">{property.title}</h3>
        
        <p className="property-address-modern">
          <i className="fas fa-map-marker-alt"></i>
          {property.address_line1}, {property.city}, {property.state}
        </p>
        
        <div className="property-price-modern">{formatPrice(property)}</div>
        
        <div className="property-features">
          {property.bedrooms && (
            <div className="feature-item">
              <div className="feature-icon">
                <i className="fas fa-bed"></i>
              </div>
              <span>{property.bedrooms} Bedrooms</span>
            </div>
          )}
          {property.bathrooms && (
            <div className="feature-item">
              <div className="feature-icon">
                <i className="fas fa-bath"></i>
              </div>
              <span>{property.bathrooms} Bathrooms</span>
            </div>
          )}
          {property.square_feet && (
            <div className="feature-item">
              <div className="feature-icon">
                <i className="fas fa-ruler-combined"></i>
              </div>
              <span>{Number(property.square_feet).toLocaleString()} sqft</span>
            </div>
          )}
          {property.parking_spots && (
            <div className="feature-item">
              <div className="feature-icon">
                <i className="fas fa-car"></i>
              </div>
              <span>{property.parking_spots} Parking</span>
            </div>
          )}
          {property.student_housing && (
            <div className="feature-item">
              <div className="feature-icon">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <span>Student-Friendly</span>
            </div>
          )}
        </div>
        
        <div className="property-meta-modern">
          <span className="property-type-badge">
            {property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}
          </span>
          <small>Submitted: {formatDate(property.created_at)}</small>
        </div>
        
        <div className="property-actions-modern">
          <button 
            className="action-btn-modern btn-edit"
            onClick={() => navigate(`/edit-property/${property.id}`)}
          >
            <i className="fas fa-edit"></i> Edit
          </button>
          {property.status === 'approved' && (
            <button 
              className="action-btn-modern btn-view"
              onClick={() => window.open(`/property/${property.slug}`, '_blank')}
            >
              <i className="fas fa-eye"></i> View
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Professional Stats Card
  const StatCard = ({ title, value, icon, color, trend }) => (
    <div className={`stat-card-modern ${color} fade-in`}>
      <div className="stat-header">
        <div className="stat-content-modern">
          <h3>{value}</h3>
          <p>{title}</p>
          {trend && (
            <div className="stat-trend">
              <i className="fas fa-arrow-up"></i>
              <span>{trend}</span>
            </div>
          )}
        </div>
        <div className="stat-icon-modern">
          <i className={`fas ${icon}`}></i>
        </div>
      </div>
    </div>
  );

  // Function to refresh user profile data from server
  const refreshUserProfile = async () => {
    try {
      const response = await fetch('/api/auth/verify-token', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Fresh user data received:', result.user);
        
        // Update the user context with fresh data
        updateUser(result.user);
        
        // Update local profile state with fresh data
        setProfileData({
          first_name: result.user.first_name || '',
          last_name: result.user.last_name || '',
          email: result.user.email || '',
          phone: result.user.phone || '',
          created_at: result.user.created_at || ''
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error refreshing user profile:', error);
      return false;
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading-modern">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="user-dashboard">
      {/* Professional Header */}
      <div className="dashboard-header">
        <div className="header-container">
          <div className="header-top">
            <div className="user-greeting">
              <div className="user-avatar-large">
                <i className="fas fa-user"></i>
              </div>
              <div className="greeting-text">
                <h1>Welcome back, {user?.first_name}!</h1>
                <p>Manage your property listings and track your success</p>
              </div>
            </div>
            
            <div className="header-actions">
              <div className="add-listing-dropdown-container">
                <button 
                  className="add-listing-btn-modern"
                  onClick={() => setShowAddListingDropdown(!showAddListingDropdown)}
                >
                  <span>Add New Listing</span>
                  <i className={`fas fa-chevron-down ${showAddListingDropdown ? 'rotated' : ''}`}></i>
                </button>
                
                {showAddListingDropdown && (
                  <div className="add-listing-dropdown-menu">
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => {navigate('/addlist'); setShowAddListingDropdown(false);}}
                    >
                      <i className="fas fa-home" style={{marginRight: '0.5rem'}}></i>
                      For Sale
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => {navigate('/addrent'); setShowAddListingDropdown(false);}}
                    >
                      <i className="fas fa-key" style={{marginRight: '0.5rem'}}></i>
                      For Rent
                    </button>
                    <button 
                      className="dropdown-item-btn"
                      onClick={() => {navigate('/addlease'); setShowAddListingDropdown(false);}}
                    >
                      <i className="fas fa-file-contract" style={{marginRight: '0.5rem'}}></i>
                      For Lease
                    </button>
                  </div>
                )}
              </div>
              
              <button 
                className="profile-menu-btn"
                onClick={handleLogout}
                title="Sign Out"
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Navigation */}
      <div className="dashboard-nav-modern">
        <span 
          className="home-link-simple"
          onClick={() => navigate('/find')}
          title="Go to Property Search"
        >
          Home <i className="fas fa-chevron-right"></i>
        </span>
        <span className="dashboard-text">Dashboard</span>
        <div className="nav-container">
          <div className="nav-tabs-modern">
            <button 
              className={`nav-tab-modern ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <i className="fas fa-chart-line"></i>
              Overview
            </button>
            <button 
              className={`nav-tab-modern ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('properties')}
            >
              <i className="fas fa-building"></i>
              My Properties
            </button>
            <button 
              className={`nav-tab-modern ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={async () => {
                setActiveTab('profile');
                // Auto-refresh profile data when switching to profile tab
                if (activeTab !== 'profile') {
                  await refreshUserProfile();
                }
              }}
            >
              <i className="fas fa-user"></i>
              Profile
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        {activeTab === 'overview' && (
          <>
            <div className="stats-section">
              <div className="stats-header">
                <h2>Property Statistics</h2>
              </div>
              <div className="stats-grid-modern">
                <StatCard 
                  title="Total Properties" 
                  value={stats.total || 0} 
                  icon="fa-home" 
                  color="primary"
                />
                <StatCard 
                  title="Approved Listings" 
                  value={stats.approved || 0} 
                  icon="fa-check-circle" 
                  color="success"
                />
                <StatCard 
                  title="Pending Review" 
                  value={stats.pending || 0} 
                  icon="fa-clock" 
                  color="warning"
                />
                <StatCard 
                  title="Need Updates" 
                  value={stats.rejected || 0} 
                  icon="fa-edit" 
                  color="danger"
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'properties' && (
          <div className="properties-section">
            <div className="properties-header-modern">
              <div className="properties-title">
                <h2>My Properties</h2>
                <span className="property-count">{filteredProperties.length}</span>
              </div>
              <div className="properties-filters-modern">
                <select 
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                  className="filter-select"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Needs Updates</option>
                </select>
                <select 
                  value={filters.type}
                  onChange={(e) => setFilters({...filters, type: e.target.value})}
                  className="filter-select"
                >
                  <option value="all">All Types</option>
                  <option value="sale">For Sale</option>
                  <option value="rent">For Rent</option>
                  <option value="lease">For Lease</option>
                </select>
              </div>
            </div>

            {filteredProperties.length === 0 ? (
              <div className="no-properties-modern">
                <i className="fas fa-home"></i>
                <h3>No Properties Found</h3>
                <p>You haven't submitted any properties yet, or no properties match your current filters.</p>
                <button 
                  className="btn-add-first"
                  onClick={() => navigate('/addlist')}
                >
                  <i className="fas fa-plus"></i>
                  Add Your First Property
                </button>
              </div>
            ) : (
              <div className="properties-grid-modern">
                {filteredProperties.map(property => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className={`profile-section ${isEditing ? 'editing' : ''}`}>
            <div className="profile-header">
              <h2>
                <i className="fas fa-user"></i>
                Profile Information
              </h2>
              {isEditing && (
                <small style={{color: '#64748b', fontStyle: 'italic'}}>
                  Make your changes and click Save or Cancel
                </small>
              )}
            </div>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                console.log('🚫 Form submission prevented');
                if (isEditing) {
                  handleProfileSave();
                }
              }}
            >
              <div className="profile-form" ref={profileFormRef}>
                <div className="form-group-modern">
                  <label className="form-label-modern">First Name</label>
                  <input
                    type="text"
                    className="form-input-modern"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({...profileData, first_name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Last Name</label>
                  <input
                    type="text"
                    className="form-input-modern"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({...profileData, last_name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Email Address</label>
                  <input
                    type="email"
                    className="form-input-modern"
                    value={profileData.email}
                    disabled
                    title="Email cannot be changed for security reasons"
                  />
                </div>
                
                <div className="form-group-modern">
                  <label className="form-label-modern">Phone Number</label>
                  <input
                    type="tel"
                    className="form-input-modern"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                    disabled={!isEditing}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
            </form>
            
            <div className="profile-actions">
              {saveMessage.text && (
                <div className={`save-message ${saveMessage.type}`}>
                  <i className={`fas ${saveMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                  {saveMessage.text}
                </div>
              )}
              
              {!isEditing ? (
                <button 
                  className="btn-save"
                  onClick={async () => {
                    // Refresh profile data before editing to ensure latest values
                    await refreshUserProfile();
                    setIsEditing(true);
                  }}
                >
                  <i className="fas fa-edit"></i>
                  Edit Profile
                </button>
              ) : (
                <div className="edit-buttons-container">
                  <button 
                    type="button"
                    className="btn-cancel"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <i className="fas fa-times"></i>
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="btn-save"
                    onClick={handleProfileSave}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save"></i>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard; 