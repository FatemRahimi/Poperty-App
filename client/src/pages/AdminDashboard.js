import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AdminDashboard.css';
import "../styles/CrossBrowserReset.css"; // Cross-browser consistency

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    totalProperties: 0,
    pendingApproval: 0,
    recentActivity: []
  });
  const [adminUsers, setAdminUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [propertyFilters, setPropertyFilters] = useState({
    status: 'all',
    type: 'all'
  });
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState({ show: false, property: null });
  const [reviewData, setReviewData] = useState({
    status: '',
    admin_notes: '',
    rejection_reason: ''
  });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect if not admin
  useEffect(() => {
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      navigate('/admin-sh');
      return;
    }
    loadDashboardData();
  }, [user, navigate]);

  // Filter properties when filters change
  useEffect(() => {
    let filtered = [...properties];
    
    if (propertyFilters.status !== 'all') {
      filtered = filtered.filter(p => p.status === propertyFilters.status);
    }
    
    if (propertyFilters.type !== 'all') {
      filtered = filtered.filter(p => p.property_type === propertyFilters.type);
    }
    
    setFilteredProperties(filtered);
  }, [properties, propertyFilters]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load dashboard stats
      const statsResponse = await fetch('/api/properties/admin/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats || {});
      }

      // Load all properties for admin review
      const propertiesResponse = await fetch('/api/properties/admin/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (propertiesResponse.ok) {
        const propertiesData = await propertiesResponse.json();
        setProperties(propertiesData.properties || []);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePropertyAction = async (propertyId, action) => {
    if (action === 'review') {
      const property = properties.find(p => p.id === propertyId);
      setReviewModal({ show: true, property });
      setReviewData({ status: '', admin_notes: '', rejection_reason: '' });
      return;
    }

    try {
      const response = await fetch(`/api/properties/admin/${propertyId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: action })
      });

      if (response.ok) {
        alert(`Property ${action} successfully!`);
        loadDashboardData(); // Refresh data
      } else {
        throw new Error(`Failed to ${action} property`);
      }
    } catch (error) {
      console.error(`Error ${action} property:`, error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleReviewSubmit = async () => {
    if (!reviewData.status) {
      alert('Please select a status');
      return;
    }

    if (reviewData.status === 'rejected' && !reviewData.rejection_reason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      const response = await fetch(`/api/properties/admin/${reviewModal.property.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(reviewData)
      });

      if (response.ok) {
        alert(`Property ${reviewData.status} successfully!`);
        setReviewModal({ show: false, property: null });
        
        // Update the property status in the local state immediately
        setProperties(prevProperties => 
          prevProperties.map(prop => 
            prop.id === reviewModal.property.id 
              ? { ...prop, status: reviewData.status }
              : prop
          )
        );
        
        // Also refresh the stats
        loadDashboardData();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update property status');
      }
    } catch (error) {
      console.error('Error updating property:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (property) => {
    if (property.category === 'sale' && property.price) {
      return `$${Number(property.price).toLocaleString()}`;
    } else if (property.monthly_rent) {
      return `$${Number(property.monthly_rent).toLocaleString()}/month`;
    }
    return 'Price not set';
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

  const StatCard = ({ title, value, icon, color = 'primary' }) => (
    <div className={`stat-card stat-card-${color}`}>
      <div className="stat-icon">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="stat-content">
        <h3>{value || 0}</h3>
        <p>{title}</p>
      </div>
    </div>
  );

  const AdminCard = ({ admin }) => (
    <div className="admin-card">
      <div className="admin-avatar">
        <i className="fas fa-user-shield"></i>
      </div>
      <div className="admin-info">
        <h6>{admin.first_name} {admin.last_name}</h6>
        <p>{admin.email}</p>
        <span className="admin-role">{admin.role}</span>
      </div>
    </div>
  );

  const PropertyCard = ({ property }) => (
    <div className="admin-property-card">
      <div className="property-header">
        <h5>{property.title}</h5>
        <span className={`status-badge status-${property.status}`}>
          <i className={`fas ${getStatusIcon(property.status)}`}></i>
          {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
        </span>
      </div>
      
      <div className="property-info">
        <p><strong>Category:</strong> {property.category} - {property.property_type}</p>
        <p><strong>Price:</strong> {formatPrice(property)}</p>
        <p><strong>Address:</strong> {property.address_line1}, {property.city}</p>
        <p><strong>Submitted:</strong> {formatDate(property.created_at)}</p>
        <p><strong>Submitted by:</strong> {property.user_email}</p>
        {property.bedrooms && <p><strong>Bed/Bath:</strong> {property.bedrooms} bed, {property.bathrooms} bath</p>}
      </div>

      <div className="property-actions">
        <button 
          className="btn btn-sm btn-info"
          onClick={() => handlePropertyAction(property.id, 'review')}
          title="Review & Action"
        >
          <i className="fas fa-eye"></i> Review
        </button>
        
        {property.status === 'pending' && (
          <>
            <button 
              className="btn btn-sm btn-success"
              onClick={() => handlePropertyAction(property.id, 'approved')}
              title="Quick Approve"
            >
              <i className="fas fa-check"></i> Approve
            </button>
            <button 
              className="btn btn-sm btn-danger"
              onClick={() => handlePropertyAction(property.id, 'rejected')}
              title="Quick Reject"
            >
              <i className="fas fa-times"></i> Reject
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p>Loading Admin Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          {/* Breadcrumb Navigation */}
          <nav className="breadcrumb-nav">
            <a href="/" className="breadcrumb-link">
              <i className="fas fa-home"></i>
              <span>Home</span>
            </a>
            <i className="fas fa-chevron-right breadcrumb-separator"></i>
            <span className="breadcrumb-current">Admin Dashboard</span>
          </nav>
          
          <div className="admin-title">
            <h1>
              <i className="fas fa-tachometer-alt me-3"></i>
              Admin Dashboard
            </h1>
            <p>Property Management System</p>
          </div>
        </div>
        
        <div className="admin-header-right">
          {/* Admin Profile Dropdown */}
          <div className="admin-profile-dropdown">
            <button className="btn btn-link admin-profile-btn dropdown-toggle" type="button" data-bs-toggle="dropdown">
              <div className="admin-avatar">
                <i className="fas fa-user-shield"></i>
              </div>
              <div className="admin-info">
                <span className="admin-name">{user?.first_name}</span>
                <span className="admin-role">
                  {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </span>
              </div>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li>
                <div className="dropdown-header">
                  <strong>{user?.first_name} {user?.last_name}</strong>
                  <small className="text-muted d-block">{user?.email}</small>
                  <span className="admin-role-badge">
                    {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </span>
                </div>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li>
                <a className="dropdown-item" href="#" onClick={(e) => {e.preventDefault(); setActiveTab('settings');}}>
                  <i className="fas fa-cogs me-2"></i>
                  Settings
                </a>
              </li>
              <li>
                <a className="dropdown-item" href="/" onClick={(e) => {e.preventDefault(); window.open('/', '_blank');}}>
                  <i className="fas fa-globe me-2"></i>
                  View Site
                </a>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li>
                <a className="dropdown-item text-danger" href="#" onClick={(e) => {e.preventDefault(); handleLogout();}}>
                  <i className="fas fa-sign-out-alt me-2"></i>
                  Sign Out
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="admin-nav">
        <div className="nav nav-tabs">
          <button 
            className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <i className="fas fa-chart-line me-2"></i>
            Overview
          </button>
          <button 
            className={`nav-link ${activeTab === 'admins' ? 'active' : ''}`}
            onClick={() => setActiveTab('admins')}
          >
            <i className="fas fa-users-cog me-2"></i>
            Admin Management
          </button>
          <button 
            className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <i className="fas fa-users me-2"></i>
            User Management
          </button>
          <button 
            className={`nav-link ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => setActiveTab('properties')}
          >
            <i className="fas fa-building me-2"></i>
            Properties
          </button>
          <button 
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <i className="fas fa-cogs me-2"></i>
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="admin-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <StatCard 
                title="Total Users" 
                value={stats.totalUsers} 
                icon="fa-users" 
                color="primary" 
              />
              <StatCard 
                title="Admin Users" 
                value={stats.totalAdmins} 
                icon="fa-user-shield" 
                color="success" 
              />
              <StatCard 
                title="Properties" 
                value={stats.totalProperties} 
                icon="fa-building" 
                color="info" 
              />
              <StatCard 
                title="Active Today" 
                value="12" 
                icon="fa-chart-line" 
                color="warning" 
              />
            </div>

            <div className="dashboard-sections">
              <div className="section">
                <h4><i className="fas fa-clock me-2"></i>Recent Activity</h4>
                <div className="activity-list">
                  <div className="activity-item">
                    <i className="fas fa-user-plus text-success"></i>
                    <span>New user registered: john.doe@example.com</span>
                    <small>2 hours ago</small>
                  </div>
                  <div className="activity-item">
                    <i className="fas fa-building text-info"></i>
                    <span>New property listing added</span>
                    <small>4 hours ago</small>
                  </div>
                  <div className="activity-item">
                    <i className="fas fa-sign-in-alt text-primary"></i>
                    <span>Admin login: support@property.com</span>
                    <small>6 hours ago</small>
                  </div>
                </div>
              </div>

              <div className="section">
                <h4><i className="fas fa-chart-bar me-2"></i>Quick Stats</h4>
                <div className="quick-stats">
                  <div className="quick-stat">
                    <span className="stat-label">Today's Signups</span>
                    <span className="stat-value">3</span>
                  </div>
                  <div className="quick-stat">
                    <span className="stat-label">Active Sessions</span>
                    <span className="stat-value">27</span>
                  </div>
                  <div className="quick-stat">
                    <span className="stat-label">Properties Views</span>
                    <span className="stat-value">156</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admins' && (
          <div className="admins-tab">
            <div className="section-header">
              <h4><i className="fas fa-users-cog me-2"></i>Admin Management</h4>
              <button className="button-base btn-primary">
                <i className="fas fa-plus me-2"></i>
                Add Admin
              </button>
            </div>

            <div className="admins-grid">
              {adminUsers.map((admin) => (
                <AdminCard key={admin.id} admin={admin} />
              ))}
            </div>

            <div className="admin-info-section">
              <h5>Current Admin Accounts</h5>
              <div className="admin-credentials">
                <div className="credential-item">
                  <strong>Main Admin:</strong> admin@property.com
                </div>
                <div className="credential-item">
                  <strong>Property Manager:</strong> manager@property.com
                </div>
                <div className="credential-item">
                  <strong>Sales Director:</strong> sales@property.com
                </div>
                <div className="credential-item">
                  <strong>Support Lead:</strong> support@property.com
                </div>
                <div className="credential-item">
                  <strong>System Admin:</strong> sysadmin@property.com
                </div>
                <div className="credential-note">
                  <i className="fas fa-info-circle me-2"></i>
                  All admin accounts use the password: <code>SecureAdminPass2024!</code>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-tab">
            <div className="section-header">
              <h4><i className="fas fa-users me-2"></i>User Management</h4>
              <div className="section-actions">
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  className="form-input-base focus-ring search-input"
                />
                <button className="button-base btn-primary">
                  <i className="fas fa-search"></i>
                </button>
              </div>
            </div>
            <div className="coming-soon">
              <i className="fas fa-tools mb-3"></i>
              <h5>User Management Coming Soon</h5>
              <p>This section will allow you to manage all registered users.</p>
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="properties-tab">
            <div className="section-header">
              <h4><i className="fas fa-building me-2"></i>Property Management ({filteredProperties.length})</h4>
              <div className="properties-filters">
                <select 
                  value={propertyFilters.status}
                  onChange={(e) => setPropertyFilters({...propertyFilters, status: e.target.value})}
                  className="form-select"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select 
                  value={propertyFilters.type}
                  onChange={(e) => setPropertyFilters({...propertyFilters, type: e.target.value})}
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
              <div className="coming-soon">
                <i className="fas fa-home mb-3"></i>
                <h5>No Properties Found</h5>
                <p>No properties match your current filters, or no properties have been submitted yet.</p>
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

        {activeTab === 'settings' && (
          <div className="settings-tab">
            <div className="section-header">
              <h4><i className="fas fa-cogs me-2"></i>System Settings</h4>
            </div>
            <div className="coming-soon">
              <i className="fas fa-tools mb-3"></i>
              <h5>Settings Panel Coming Soon</h5>
              <p>This section will allow you to configure system settings.</p>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewModal.show && (
        <div className="modal-overlay" onClick={() => setReviewModal({ show: false, property: null })}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Review Property: {reviewModal.property?.title}</h4>
              <button 
                className="close-btn"
                onClick={() => setReviewModal({ show: false, property: null })}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="property-details-review">
                <div className="detail-row">
                  <strong>Type:</strong> {reviewModal.property?.property_type} - {reviewModal.property?.property_category}
                </div>
                <div className="detail-row">
                  <strong>Price:</strong> {reviewModal.property && formatPrice(reviewModal.property)}
                </div>
                <div className="detail-row">
                  <strong>Address:</strong> {reviewModal.property?.address_line1}, {reviewModal.property?.city}
                </div>
                <div className="detail-row">
                  <strong>Submitted by:</strong> {reviewModal.property?.user_email}
                </div>
                <div className="detail-row">
                  <strong>Submitted:</strong> {reviewModal.property && formatDate(reviewModal.property.created_at)}
                </div>
                {reviewModal.property?.description && (
                  <div className="detail-row">
                    <strong>Description:</strong>
                    <p className="description-text">{reviewModal.property.description}</p>
                  </div>
                )}
              </div>

              <div className="review-form">
                <div className="form-group">
                  <label>Action:</label>
                  <select 
                    value={reviewData.status}
                    onChange={(e) => setReviewData({...reviewData, status: e.target.value})}
                    className="form-input-base focus-ring"
                  >
                    <option value="">Select Action</option>
                    <option value="approved">Approve Property</option>
                    <option value="rejected">Reject Property</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Admin Notes (Optional):</label>
                  <textarea
                    value={reviewData.admin_notes}
                    onChange={(e) => setReviewData({...reviewData, admin_notes: e.target.value})}
                    className="form-input-base focus-ring"
                    rows="3"
                    placeholder="Add any internal notes about this property..."
                  />
                </div>

                {reviewData.status === 'rejected' && (
                  <div className="form-group">
                    <label>Rejection Reason (Required):</label>
                    <textarea
                      value={reviewData.rejection_reason}
                      onChange={(e) => setReviewData({...reviewData, rejection_reason: e.target.value})}
                      className="form-input-base focus-ring"
                      rows="3"
                      placeholder="Explain why this property is being rejected. This will be sent to the user."
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="button-base btn-secondary"
                onClick={() => setReviewModal({ show: false, property: null })}
              >
                Cancel
              </button>
              <button 
                className="button-base btn-primary"
                onClick={handleReviewSubmit}
                disabled={!reviewData.status}
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 