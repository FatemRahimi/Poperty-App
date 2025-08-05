import React from 'react';
import { useNavigate } from 'react-router-dom';

const DashboardTabs = ({ 
  activeTab, 
  setActiveTab, 
  setShowPropertiesDropdown, 
  refreshUserProfile 
}) => {
  const navigate = useNavigate();

  const handleTabChange = async (tabName) => {
    setActiveTab(tabName);
    setShowPropertiesDropdown(false);
    
    if (tabName === 'profile') {
      await refreshUserProfile();
    }
  };

  const handleAdvisorProfile = () => {
    navigate('/advisor-profile');
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
        <button 
          className="nav-tab-modern advisor-tab"
          onClick={handleAdvisorProfile}
        >
          <i className="fas fa-user-tie"></i>
          Advisor Profile
        </button>
      </div>
    </div>
  );
};

export default DashboardTabs; 