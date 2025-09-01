import React from 'react';
import { useNavigate } from 'react-router-dom';

const DashboardTabs = ({ 
  activeTab, 
  setActiveTab, 
  setShowPropertiesDropdown, 
  refreshUserProfile,
  showProfileTab = false // Profile tab hidden for all users
}) => {
  const navigate = useNavigate();

  const handleTabChange = async (tabName) => {
    setActiveTab(tabName);
    setShowPropertiesDropdown(false);
    
    if (tabName === 'profile') {
      await refreshUserProfile();
    }
    
    if (tabName === 'advisor-profile') {
      // This will be handled by the parent component
    }
  };

  return (
    <div className="nav-container">
      <div className="nav-tabs-modern">
        <button 
          className={`nav-tab-modern ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          <i className="fas fa-chart-line"></i>
          Overview
        </button>
        <div className="properties-tab-container">
          <button 
            className={`nav-tab-modern properties-tab ${activeTab === 'properties' ? 'active' : ''}`}
            onClick={() => handleTabChange('properties')}
          >
            <i className="fas fa-building"></i>
            My Properties
          </button>
        </div>
        {showProfileTab && (
          <button 
            className={`nav-tab-modern ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleTabChange('profile')}
          >
            <i className="fas fa-user"></i>
            Profile
          </button>
        )}
        <button 
          className={`nav-tab-modern ${activeTab === 'advisor-profile' ? 'active' : ''}`}
          onClick={() => handleTabChange('advisor-profile')}
        >
          <i className="fas fa-user-tie"></i>
          Advisor Profile
        </button>
      </div>
    </div>
  );
};

export default DashboardTabs; 