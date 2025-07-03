import React from 'react';

const PropertiesSidebar = ({ 
  searchFilters, 
  setSearchFilters,
  propertyTypeOptions, 
  statusOptions
}) => {

  return (
    <div className="properties-sidebar">
      <div className="sidebar-section">
        <h4>
          <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 7h-9"/>
            <path d="M14 17H5"/>
            <circle cx="17" cy="17" r="3"/>
            <circle cx="7" cy="7" r="3"/>
          </svg>
          Categories
        </h4>
        <div className="sidebar-filter-options">
          {propertyTypeOptions.map(option => (
            <label key={option.value} className="sidebar-option">
              <input
                type="radio"
                name="propertyType"
                value={option.value}
                checked={searchFilters.propertyType === option.value}
                onChange={(e) => {
                  setSearchFilters('propertyType', e.target.value);
                }}
                className="category-radio"
              />
              <span className="option-text">{option.label}</span>
            </label>
          ))}
        </div>
      </div>


      
      <div className="sidebar-section">
        <h4>
          <svg className="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
          Status
        </h4>
        <div className="sidebar-filter-options">
          {statusOptions.map(option => (
            <label key={option.value} className="sidebar-option">
              <input
                type="radio"
                name="status"
                value={option.value}
                checked={searchFilters.status === option.value}
                onChange={(e) => {
                  setSearchFilters('status', e.target.value);
                }}
                className="status-radio"
              />
              <span className="option-text">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PropertiesSidebar; 