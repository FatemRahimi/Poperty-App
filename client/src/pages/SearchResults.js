import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import './SearchResults.css';
import { FaMapMarkerAlt, FaBed, FaBath, FaRuler, FaHeart, FaRegHeart, FaArrowLeft } from 'react-icons/fa';
import LocationSearch from '../components/LocationSearch';
import SearchDropdown from '../components/SearchDropdown';

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
      // Build search params
      const params = new URLSearchParams({
        q: searchQuery,
        category: category,
        radius: radius,
        show_all_statuses: 'false' // Public search - only approved properties
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

      const response = await fetch(`/api/properties/search?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Search results:', data);

      setProperties(data.properties || []);
      setFilteredProperties(data.properties || []);
      setTotalCount(data.totalCount || 0);

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
        
        {/* Header */}
        <div className="search-results-header">
          <button className="back-button" onClick={handleBackClick}>
            <FaArrowLeft /> Back to Search
          </button>
          <h1 className="search-results-title">
            Search Results
          </h1>
          <p className="search-results-subtitle">
            Showing {isSearching ? '...' : totalCount} properties for "{searchQuery}" 
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

        {/* Results Grid */}
        <div className="search-results-grid">
          {isSearching ? (
            <div className="loading-state">
              <i className="fas fa-spinner fa-spin fa-3x"></i>
              <p>Searching properties...</p>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="no-results-state">
              <h3>No properties found</h3>
              <p>Try adjusting your search criteria or filters</p>
            </div>
          ) : (
            filteredProperties.map((property) => (
              <div
                key={property.id}
                className="property-card"
                onClick={() => handlePropertyClick(property.id)}
              >
                {/* Property Image */}
                <div className="property-image-container">
                  <img
                    src={property.images?.[0] || '/assets/placeholder-property.jpg'}
                    alt={property.title}
                    className="property-image"
                  />
                  <button
                    className="favorite-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFavoriteClick(property.id);
                    }}
                  >
                    {favorites.includes(property.id) ? (
                      <FaHeart className="favorite-icon filled" />
                    ) : (
                      <FaRegHeart className="favorite-icon" />
                    )}
                  </button>
                  <span className="property-category-badge">{category}</span>
                </div>

                {/* Property Details */}
                <div className="property-details">
                  <h3 className="property-title">{property.title}</h3>
                  <p className="property-location">
                    <FaMapMarkerAlt /> {property.city}, {property.zip_code}
                  </p>
                  <p className="property-price">
                    £{property.price?.toLocaleString() || 'POA'}
                    {category === 'rent' && ' pcm'}
                  </p>

                  {/* Property Features */}
                  <div className="property-features">
                    {property.bedrooms && (
                      <span>
                        <FaBed /> {property.bedrooms} bed
                      </span>
                    )}
                    {property.bathrooms && (
                      <span>
                        <FaBath /> {property.bathrooms} bath
                      </span>
                    )}
                    {property.floor_area && (
                      <span>
                        <FaRuler /> {property.floor_area} sqft
                      </span>
                    )}
                  </div>

                  {/* Property Type */}
                  <p className="property-type">{property.property_building_type || property.property_type}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchResults;



