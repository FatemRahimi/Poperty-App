import React from 'react';

const DashboardTabs = ({ 
  activeTab, 
  setActiveTab, 
  setShowPropertiesDropdown, 
  refreshUserProfile 
}) => {

  const handleTabChange = async (tabName) => {
    setActiveTab(tabName);
    setShowPropertiesDropdown(false);
    
    if (tabName === 'profile') {
      await refreshUserProfile();
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
        <button 
          className={`nav-tab-modern ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => handleTabChange('profile')}
        >
          <i className="fas fa-user"></i>
          Profile
        </button>
      </div>
    </div>
  );
};

export default DashboardTabs; 