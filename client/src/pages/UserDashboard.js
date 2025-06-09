import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './UserDashboard.css';

const UserDashboard = () => {
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all'
  });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadDashboardData();
  }, [user, navigate]);

  // Refresh data when component gains focus (user returns from another page)
  useEffect(() => {
    const handleFocus = () => {
      if (user) {
        loadDashboardData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load user's properties
      const propertiesResponse = await fetch('/api/properties/my-properties', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json();
        console.log('Dashboard data loaded:', propertiesData); // Debug log
        setProperties(propertiesData.properties || []);
        
        // Calculate stats from properties
        const userStats = calculateStats(propertiesData.properties || []);
        setStats(userStats);
      } else {
        console.error('Failed to load dashboard data:', propertiesResponse.status);
        // Optionally show error message to user
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
      forSale: properties.filter(p => p.property_type === 'sale').length,
      forRent: properties.filter(p => p.property_type === 'rent').length,
      forLease: properties.filter(p => p.property_type === 'lease').length
    };
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'rejected': return 'danger';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return 'fa-check-circle';
      case 'pending': return 'fa-clock';
      case 'rejected': return 'fa-times-circle';
      default: return 'fa-question-circle';
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
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredProperties = properties.filter(property => {
    const statusMatch = filters.status === 'all' || property.status === filters.status;
    const typeMatch = filters.type === 'all' || property.property_type === filters.type;
    return statusMatch && typeMatch;
  });

  const StatCard = ({ title, value, icon, color = 'primary' }) => (
    <div className={`stat-card stat-card-${color}`}>
      <div className="stat-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="stat-content">
        <h3>{value}</h3>
        <p>{title}</p>
      </div>
    </div>
  );

  const PropertyCard = ({ property }) => (
    <div className="property-card">
      <div className="property-image">
        {property.images && property.images.length > 0 ? (
          <img src={property.images[0].url} alt={property.title} />
        ) : (
          <div className="no-image">
            <i className="fas fa-home"></i>
            <span>No Image</span>
          </div>
        )}
      </div>
      <div className="property-details">
        <h4>{property.title}</h4>
        <p className="property-address">
          <i className="fas fa-map-marker-alt"></i>
          {property.address_line1}, {property.city}, {property.state}
        </p>
        <p className="property-price">{formatPrice(property)}</p>
        <div className="property-meta">
          <span className="property-type">
            <i className="fas fa-tag"></i>
            {property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}
          </span>
          <span className={`property-status status-${property.status}`}>
            <i className={`fas ${getStatusIcon(property.status)}`}></i>
            {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
          </span>
        </div>
        <div className="property-stats">
          {property.bedrooms && (
            <span><i className="fas fa-bed"></i> {property.bedrooms} bed</span>
          )}
          {property.bathrooms && (
            <span><i className="fas fa-bath"></i> {property.bathrooms} bath</span>
          )}
          {property.square_feet && (
            <span><i className="fas fa-ruler-combined"></i> {Number(property.square_feet).toLocaleString()} sqft</span>
          )}
        </div>
        <div className="property-dates">
          <small>Submitted: {formatDate(property.created_at)}</small>
          {property.approved_at && (
            <small>Approved: {formatDate(property.approved_at)}</small>
          )}
        </div>
      </div>
      <div className="property-actions">
        <button 
          className="btn btn-sm btn-outline-primary"
          onClick={() => navigate(`/edit-property/${property.id}`)}
        >
          <i className="fas fa-edit"></i> Edit
        </button>
        {property.status === 'approved' && (
          <button 
            className="btn btn-sm btn-success"
            onClick={() => window.open(`/property/${property.slug}`, '_blank')}
          >
            <i className="fas fa-eye"></i> View
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="user-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <div className="site-navigation">
            <button 
              className="btn btn-link site-nav-btn"
              onClick={() => navigate('/')}
              title="Go to Home"
            >
              <i className="fas fa-home me-2"></i>
              Home
            </button>
            <span className="nav-separator">|</span>
            <button 
              className="btn btn-link site-nav-btn"
              onClick={() => navigate('/find')}
              title="Find Properties"
            >
              <i className="fas fa-search me-2"></i>
              Find Properties
            </button>
          </div>
          <h1>
            <i className="fas fa-tachometer-alt me-3"></i>
            My Dashboard
          </h1>
          <p>Welcome back, {user?.first_name} {user?.last_name}</p>
        </div>
        <div className="header-right">
          <button 
            className="btn btn-primary me-2"
            onClick={() => navigate('/addlist')}
          >
            <i className="fas fa-plus me-2"></i>
            Add Property
          </button>
          <button className="btn btn-outline-secondary" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt me-2"></i>
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="dashboard-nav">
        <div className="nav nav-tabs">
          <button 
            className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <i className="fas fa-chart-pie me-2"></i>
            Overview
          </button>
          <button 
            className={`nav-link ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            <i className="fas fa-building me-2"></i>
            My Properties
          </button>
          <button 
            className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <i className="fas fa-user me-2"></i>
            Profile
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <StatCard 
                title="Total Properties" 
                value={stats.total || 0} 
                icon="fa-home" 
                color="primary" 
              />
              <StatCard 
                title="Approved" 
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

            <div className="quick-actions">
              <h4><i className="fas fa-bolt me-2"></i>Quick Actions</h4>
              <div className="action-buttons">
                <button 
                  className="action-btn"
                  onClick={() => navigate('/addlist')}
                >
                  <i className="fas fa-plus-circle"></i>
                  <span>List Property for Sale</span>
                </button>
                <button 
                  className="action-btn"
                  onClick={() => navigate('/addrent')}
                >
                  <i className="fas fa-key"></i>
                  <span>List Property for Rent</span>
                </button>
                <button 
                  className="action-btn"
                  onClick={() => navigate('/addlease')}
                >
                  <i className="fas fa-file-contract"></i>
                  <span>List Property for Lease</span>
                </button>
              </div>
            </div>

            {stats.total > 0 && (
              <div className="recent-activity">
                <h4><i className="fas fa-clock me-2"></i>Recent Properties</h4>
                <div className="recent-properties">
                  {properties.slice(0, 3).map(property => (
                    <div key={property.id} className="recent-property">
                      <div className="recent-property-info">
                        <h6>{property.title}</h6>
                        <p>{formatPrice(property)}</p>
                      </div>
                      <span className={`badge bg-${getStatusColor(property.status)}`}>
                        {property.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="properties-tab">
            <div className="properties-header">
              <h4><i className="fas fa-building me-2"></i>My Properties ({filteredProperties.length})</h4>
              <div className="properties-filters">
                <select 
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                  className="form-select"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Needs Updates</option>
                </select>
                <select 
                  value={filters.type}
                  onChange={(e) => setFilters({...filters, type: e.target.value})}
                  className="form-select"
                >
                  <option value="all">All Types</option>
                  <option value="sale">For Sale</option>
                  <option value="rent">For Rent</option>
                  <option value="lease">For Lease</option>
                </select>
              </div>
            </div>

            {filteredProperties.length === 0 ? (
              <div className="no-properties">
                <i className="fas fa-home mb-3"></i>
                <h5>No Properties Found</h5>
                <p>You haven't submitted any properties yet, or no properties match your filters.</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/addlist')}
                >
                  <i className="fas fa-plus me-2"></i>
                  Add Your First Property
                </button>
              </div>
            ) : (
              <div className="properties-grid">
                {filteredProperties.map(property => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-tab">
            <h4><i className="fas fa-user me-2"></i>Profile Information</h4>
            <div className="profile-info">
              <div className="profile-field">
                <label>Name</label>
                <p>{user?.first_name} {user?.last_name}</p>
              </div>
              <div className="profile-field">
                <label>Email</label>
                <p>{user?.email}</p>
              </div>
              <div className="profile-field">
                <label>Member Since</label>
                <p>{user?.created_at ? formatDate(user.created_at) : 'N/A'}</p>
              </div>
            </div>
            <button className="btn btn-outline-primary">
              <i className="fas fa-edit me-2"></i>
              Edit Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard; 