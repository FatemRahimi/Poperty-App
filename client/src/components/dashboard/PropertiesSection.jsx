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
          <div className="properties-grid-modern">
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <p>No properties found matching your current filters.</p>
            </div>
          </div>
        ) : (
          <div className="properties-grid-modern">
            {filteredProperties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onPropertyDeleted={handlePropertyDeleted}
                sourcePage="/dashboard?tab=properties"
                userId={property.user_id}
                fallbackContact={{
                  name: property.contact_name,
                  firstName: property.first_name,
                  lastName: property.last_name,
                  email: property.contact_email,
                  phone: property.contact_phone
                }}
                propertyConsultantData={property.property_consultant ? {
                  fullName: property.property_consultant,
                  jobTitle: 'Property Consultant',
                  contactEmail: property.contact_email,
                  contactPhone: property.contact_phone
                } : null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertiesSection; 