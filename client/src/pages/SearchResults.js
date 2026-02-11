import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import './SearchResults.css';
import { FaMapMarkerAlt, FaBed, FaBath, FaRuler, FaHeart, FaRegHeart, FaArrowLeft } from 'react-icons/fa';
import LocationSearch from '../components/LocationSearch';
import SearchDropdown from '../components/SearchDropdown';
import PropertyCard from '../components/PropertyCard';
import '../pages/UserDashboard.css'; // Import UserDashboard styles for property cards

/**
 * SearchResults Page
 * Shows properties from ALL users based on FindProperty search
 * Similar to UserDashboard but for public property viewing
 */
const SearchResults = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Extract search params
  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || 'sale';
  const initialPropertyCategory = searchParams.get('propertyCategory') || 'residential';
  const initialRadius = searchParams.get('radius') || '3';
  const initialSearchType = searchParams.get('searchType') || 'buy';

  // State
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [radius, setRadius] = useState(initialRadius);
  const [category, setCategory] = useState(initialCategory);
  const [propertyCategory, setPropertyCategory] = useState(initialPropertyCategory);
  const [searchType, setSearchType] = useState(initialSearchType);
  const [properties, setProperties] = useState([]);
  const [filteredProperties, setFilteredProperties] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    minBeds: '',
    maxBeds: '',
    propertyType: 'all'
  });

  /**
   * Perform search using the public API
   */
  const performSearch = useCallback(async () => {
    if (!searchQuery || searchQuery.length < 3) {
      return;
    }

    setIsSearching(true);
    console.log('🔍 SearchResults: Performing public search', {
      searchQuery,
      category,
      radius,
      propertyCategory,
      filters
    });

    try {
      // Build search params - search ALL users' approved properties
      const params = new URLSearchParams({
        q: searchQuery,
        category: category, // rent, sale, or lease
        radius: radius,
        show_all_statuses: 'false' // Public search - only approved properties from ALL users
      });
      
      console.log('🔍 SearchParams:', {
        q: searchQuery,
        category: category,
        radius: radius,
        propertyCategory: propertyCategory // Will filter on frontend
      });

      // Add price filters
      if (filters.minPrice) params.append('min_price', filters.minPrice);
      if (filters.maxPrice) params.append('max_price', filters.maxPrice);

      // Add bedroom filters  
      if (filters.minBeds) params.append('min_bedrooms', filters.minBeds);
      if (filters.maxBeds) params.append('max_bedrooms', filters.maxBeds);

      // Add property type filter
      if (filters.propertyType && filters.propertyType !== 'all') {
        params.append('property_type', filters.propertyType);
      }

      console.log('📡 API Request:', `/api/properties/search?${params.toString()}`);

      const apiUrl = `/api/properties/search?${params.toString()}`;
      console.log('📡 Full API URL:', apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ API Response:', {
        success: data.success,
        propertiesCount: data.properties?.length || 0,
        total: data.total,
        hasProperties: !!data.properties
      });

      // Handle both response formats: {success: true, properties: []} or {properties: []}
      let results = data.properties || [];
      
      console.log(`📦 Raw API results: ${results.length} properties`);
      
      // Debug: Log property_category values in results
      if (results.length > 0) {
        const categoryCounts = {};
        const sampleProperties = results.slice(0, 5).map(prop => ({
          id: prop.id,
          title: prop.title,
          category: prop.category,
          property_category: prop.property_category,
          property_type: prop.property_type,
          city: prop.city,
          zip_code: prop.zip_code
        }));
        results.forEach(prop => {
          const cat = prop.property_category || 'null';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
        console.log('📊 Property categories in results:', categoryCounts);
        console.log('📋 Sample properties:', sampleProperties);
      } else {
        console.log('⚠️ No properties returned from API');
        console.log('🔍 API Response:', data);
        console.log('🔍 Full API Response:', JSON.stringify(data, null, 2));
      }
      
      // Filter by property_category on frontend (residential/commercial/land)
      // Make it case-insensitive and handle null/undefined values
      if (propertyCategory && propertyCategory !== 'all' && results.length > 0) {
        const beforeCount = results.length;
        const filteredResults = results.filter(property => {
          const propCategory = (property.property_category || '').toLowerCase().trim();
          const expectedCategory = propertyCategory.toLowerCase().trim();
          const matches = propCategory === expectedCategory;
          
          if (!matches && property.property_category) {
            console.log(`❌ Property ${property.id} "${property.title}" has category "${property.property_category}", expected "${propertyCategory}"`);
          } else if (!property.property_category) {
            console.log(`⚠️ Property ${property.id} "${property.title}" has no property_category set`);
          }
          return matches;
        });
        
        console.log(`🏘️ Filtered by property_category: ${propertyCategory}, ${beforeCount} → ${filteredResults.length} properties`);
        
        // Only apply filter if we have results, otherwise show all
        if (filteredResults.length > 0) {
          results = filteredResults;
        } else if (beforeCount > 0) {
          console.warn(`⚠️ No properties match property_category "${propertyCategory}". Showing all ${beforeCount} results instead.`);
          // Keep all results - don't filter
        }
      }
      
      setProperties(results);
      setFilteredProperties(results);
      setTotalCount(results.length);
      
      console.log(`📊 Final results: ${results.length} properties for "${searchQuery}" (${category}, ${propertyCategory})`);

    } catch (error) {
      console.error('❌ Search error:', error);
      alert('Search failed. Please try again.');
      setProperties([]);
      setFilteredProperties([]);
      setTotalCount(0);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, category, radius, propertyCategory, filters]);

  /**
   * Initial search on page load
   */
  useEffect(() => {
    if (searchQuery && searchQuery.length >= 3) {
      performSearch();
    }
  }, []); // Run only once on mount

  /**
   * Handle search button click
   */
  const handleSearch = () => {
    if (searchQuery.length < 3) {
      alert('Please enter at least 3 characters for location search');
      return;
    }
    performSearch();
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  /**
   * Apply filters
   */
  const handleApplyFilters = () => {
    performSearch();
  };

  /**
   * Reset filters
   */
  const handleResetFilters = () => {
    setFilters({
      minPrice: '',
      maxPrice: '',
      minBeds: '',
      maxBeds: '',
      propertyType: 'all'
    });
  };

  /**
   * Toggle favorite (if user is authenticated)
   */
  const handleFavoriteClick = (propertyId) => {
    setFavorites(prev =>
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  /**
   * Navigate to property details
   */
  const handlePropertyClick = (propertyId) => {
    navigate(`/property/${propertyId}`);
  };

  /**
   * Go back to FindProperty
   */
  const handleBackClick = () => {
    navigate('/');
  };

  return (
    <div className="search-results-page">
      <div className="search-results-container">
        
        {/* Header - Same style as UserDashboard */}
        <div className="properties-header-modern">
          <button className="back-button" onClick={handleBackClick} style={{ 
            marginBottom: '1rem', 
            padding: '0.5rem 1rem', 
            background: '#f1f5f9', 
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}>
            <FaArrowLeft /> Back to Search
          </button>
          <div className="properties-title">
            <h2>Search Results</h2>
            <span className={`property-count ${isSearching ? 'loading' : ''}`}>
              {isSearching ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.3rem' }}></i>
                  <span>{totalCount}</span>
                </>
              ) : (
                totalCount
              )}
            </span>
          </div>
          <p style={{ color: '#64748b', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Properties for "{searchQuery}" 
            {` • ${searchType.charAt(0).toUpperCase() + searchType.slice(1)}`}
            {` • ${propertyCategory.charAt(0).toUpperCase() + propertyCategory.slice(1)}`}
          </p>
        </div>

        {/* Search Bar */}
        <div className="search-results-search-bar">
          <LocationSearch
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            radius={radius}
            onRadiusChange={setRadius}
            placeholder="Enter location (e.g. 'London', 'B46 2PQ', 'Oxford Street')..."
            disabled={isSearching}
            isSearching={isSearching}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && searchQuery.length >= 3) {
                handleSearch();
              }
            }}
          />
          <button 
            className="search-button" 
            onClick={handleSearch}
            disabled={isSearching || searchQuery.length < 3}
          >
            {isSearching ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Searching...
              </>
            ) : (
              'Search'
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="search-results-filters">
          <div className="filter-row">
            <div className="filter-group">
              <label>Min Price</label>
              <input
                type="number"
                placeholder="Min"
                value={filters.minPrice}
                onChange={(e) => handleFilterChange('minPrice', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Max Price</label>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxPrice}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Min Bedrooms</label>
              <input
                type="number"
                placeholder="Min"
                value={filters.minBeds}
                onChange={(e) => handleFilterChange('minBeds', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Max Bedrooms</label>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxBeds}
                onChange={(e) => handleFilterChange('maxBeds', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Property Type</label>
              <select
                value={filters.propertyType}
                onChange={(e) => handleFilterChange('propertyType', e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="flat">Flat</option>
                <option value="house">House</option>
                <option value="bungalow">Bungalow</option>
                <option value="studio">Studio</option>
                <option value="office">Office</option>
                <option value="warehouse">Warehouse</option>
                <option value="retail">Retail</option>
                <option value="land">Land</option>
              </select>
            </div>

            <div className="filter-actions">
              <button className="apply-filters-btn" onClick={handleApplyFilters}>
                Apply Filters
              </button>
              <button className="reset-filters-btn" onClick={handleResetFilters}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Results Grid - Same as UserDashboard */}
        {isSearching ? (
          <div className="properties-grid-modern">
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <i className="fas fa-spinner fa-spin fa-3x" style={{ marginBottom: '1rem', color: '#667eea' }}></i>
              <p>Searching properties...</p>
            </div>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="properties-grid-modern">
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <h3 style={{ color: '#1e293b', marginBottom: '0.5rem' }}>No properties found</h3>
              <p>Try adjusting your search criteria or filters</p>
            </div>
          </div>
        ) : (
          <div className="properties-grid-modern">
            {filteredProperties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property}
                showActions={false}
                sourcePage="/search-results"
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

export default SearchResults;



