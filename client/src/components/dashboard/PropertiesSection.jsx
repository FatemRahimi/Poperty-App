import React from 'react';
import { useNavigate } from 'react-router-dom';
import PropertiesSidebar from './PropertiesSidebar';
import PropertyCard from '../PropertyCard';

const PropertiesSection = ({ 
  filteredProperties,
  searchFilters,
  setSearchFilters,
  propertyTypeOptions,
  statusOptions,
  handlePropertyDeleted,
  isRadiusFiltering
}) => {
  const navigate = useNavigate();

  return (
    <div className="properties-section-with-sidebar">
      {/* Left Sidebar with Filters */}
      <PropertiesSidebar
        searchFilters={searchFilters}
        setSearchFilters={setSearchFilters}
        propertyTypeOptions={propertyTypeOptions}
        statusOptions={statusOptions}
      />
      
      {/* Main Properties Content */}
      <div className="properties-main-content">
        <div className="properties-header-modern">
          <div className="properties-title">
            <h2>Result</h2>
            <span className={`property-count ${isRadiusFiltering ? 'loading' : ''}`}>
              {isRadiusFiltering ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.3rem' }}></i>
                  <span>Loading</span>
                </>
              ) : (
                filteredProperties.length
              )}
            </span>
          </div>
        </div>

        {filteredProperties.length === 0 ? (
          <div className="no-properties-modern">
            <i className="fas fa-home"></i>
            <h3>No Properties Found</h3>
            <p>
              {isRadiusFiltering ? (
                "Searching for properties in your area..."
              ) : (
                "You haven't submitted any properties yet, or no properties match your current filters."
              )}
            </p>
            {!isRadiusFiltering && (
              <button 
                className="btn-add-first"
                onClick={() => navigate('/addlist')}
              >
                <i className="fas fa-plus"></i>
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className="properties-grid-modern">
            {filteredProperties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onPropertyDeleted={handlePropertyDeleted}
                sourcePage="/dashboard?tab=properties"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesSection; 