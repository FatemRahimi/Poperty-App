import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import './SearchResults.css';
import { FaMapMarkerAlt, FaBed, FaBath, FaRuler, FaHeart, FaRegHeart, FaArrowLeft } from 'react-icons/fa';
import LocationSearch from '../components/LocationSearch';
import SearchDropdown from '../components/SearchDropdown';
import PropertyCard from '../components/PropertyCard';
import SearchFilterHeader from '../components/dashboard/SearchFilterHeader';
import SearchFilterHeaderSale from '../components/dashboard/SearchFilterHeaderSale';
import SearchFilterHeaderLease from '../components/dashboard/SearchFilterHeaderLease';
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

  // Professional Search Filters (same as UserDashboard)
  const [searchFilters, setSearchFilters] = useState({
    propertyType: category, // rent, sale, or lease
    radius: radius,
    minPrice: 'any',
    maxPrice: 'any',
    minBeds: 'any',
    maxBeds: 'any',
    propertyBuildingType: 'all'
  });

  // More Filters (same as UserDashboard)
  const [moreFilters, setMoreFilters] = useState({
    minBathrooms: 'any',
    maxBathrooms: 'any',
    typeOfLet: 'any',
    dateAdded: 'anytime',
    moveInDate: '',
    letAgreed: false,
    hasGarden: false,
    hasParking: false,
    houseShare: false,
    retirementHome: false,
    studentAccommodation: false
  });

  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Filter options (same as UserDashboard)
  const priceOptions = {
    min: [
      { value: 'any', label: 'Min Price' },
      { value: '500', label: '£500' },
      { value: '1000', label: '£1,000' },
      { value: '1500', label: '£1,500' },
      { value: '2000', label: '£2,000' },
      { value: '2500', label: '£2,500' },
      { value: '3000', label: '£3,000' },
      { value: '4000', label: '£4,000' },
      { value: '5000', label: '£5,000' },
      { value: '7500', label: '£7,500' },
      { value: '10000', label: '£10,000' },
      { value: '15000', label: '£15,000' },
      { value: '20000', label: '£20,000' },
      { value: '25000', label: '£25,000' },
      { value: '30000', label: '£30,000' },
      { value: '40000', label: '£40,000' },
      { value: '50000', label: '£50,000' },
      { value: '75000', label: '£75,000' },
      { value: '100000', label: '£100,000' },
      { value: '150000', label: '£150,000' },
      { value: '200000', label: '£200,000' },
      { value: '250000', label: '£250,000' },
      { value: '300000', label: '£300,000' },
      { value: '400000', label: '£400,000' },
      { value: '500000', label: '£500,000' },
      { value: '750000', label: '£750,000' },
      { value: '1000000', label: '£1,000,000' },
      { value: '1500000', label: '£1,500,000' },
      { value: '2000000', label: '£2,000,000' },
      { value: '3000000', label: '£3,000,000' },
      { value: '5000000', label: '£5,000,000' }
    ],
    max: [
      { value: 'any', label: 'Max Price' },
      { value: '500', label: '£500' },
      { value: '1000', label: '£1,000' },
      { value: '1500', label: '£1,500' },
      { value: '2000', label: '£2,000' },
      { value: '2500', label: '£2,500' },
      { value: '3000', label: '£3,000' },
      { value: '4000', label: '£4,000' },
      { value: '5000', label: '£5,000' },
      { value: '7500', label: '£7,500' },
      { value: '10000', label: '£10,000' },
      { value: '15000', label: '£15,000' },
      { value: '20000', label: '£20,000' },
      { value: '25000', label: '£25,000' },
      { value: '30000', label: '£30,000' },
      { value: '40000', label: '£40,000' },
      { value: '50000', label: '£50,000' },
      { value: '75000', label: '£75,000' },
      { value: '100000', label: '£100,000' },
      { value: '150000', label: '£150,000' },
      { value: '200000', label: '£200,000' },
      { value: '250000', label: '£250,000' },
      { value: '300000', label: '£300,000' },
      { value: '400000', label: '£400,000' },
      { value: '500000', label: '£500,000' },
      { value: '750000', label: '£750,000' },
      { value: '1000000', label: '£1,000,000' },
      { value: '1500000', label: '£1,500,000' },
      { value: '2000000', label: '£2,000,000' },
      { value: '3000000', label: '£3,000,000' },
      { value: '5000000', label: '£5,000,000' }
    ]
  };

  const bedroomOptions = {
    min: [
      { value: 'any', label: 'Min Beds' },
      { value: '0', label: 'Studio' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '9' },
      { value: '10', label: '10' }
    ],
    max: [
      { value: 'any', label: 'Max Beds' },
      { value: '0', label: 'Studio' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' },
      { value: '6', label: '6' },
      { value: '7', label: '7' },
      { value: '8', label: '8' },
      { value: '9', label: '9' },
      { value: '10', label: '10' }
    ]
  };

  const propertyBuildingTypeOptions = [
    { value: 'all', label: 'Property Types' },
    { value: 'detached', label: 'Detached' },
    { value: 'semi-detached', label: 'Semi-Detached' },
    { value: 'terraced', label: 'Terraced' },
    { value: 'flat', label: 'Flat' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'studio', label: 'Studio' },
    { value: 'duplex', label: 'Duplex' },
    { value: 'maisonette', label: 'Maisonette' },
    { value: 'bungalow', label: 'Bungalow' },
    { value: 'cottage', label: 'Cottage' },
    { value: 'townhouse', label: 'Townhouse' },
    { value: 'penthouse', label: 'Penthouse' },
    { value: 'land', label: 'Land' },
    { value: 'commercial', label: 'Commercial Property' },
    { value: 'office', label: 'Office Space' },
    { value: 'retail', label: 'Retail Space' },
    { value: 'warehouse', label: 'Warehouse' }
  ];

  const bathroomOptions = {
    min: [
      { value: 'any', label: 'Min Bath' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' }
    ],
    max: [
      { value: 'any', label: 'Max Bath' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
      { value: '5', label: '5' }
    ]
  };

  // Professional search handler for ALL users (public search)
  const handleProfessionalSearch = useCallback(async (query, filters) => {
    if (!query || !query.trim()) {
      return;
    }

    setIsSearching(true);

    try {
      const searchParams = new URLSearchParams({
        q: query.trim(),
        category: category,
        radius: filters.radius || radius,
        show_all_statuses: 'false', // Public search - ALL users' approved properties (no user_id filter)
        limit: '100', // Increased limit to show more results
        page: '1'
      });

      // IMPORTANT: We do NOT pass user_id - this ensures we search ALL users' properties
      console.log('🌐 Public Search (FindProperty):', {
        query: query.trim(),
        category: category,
        radius: filters.radius || radius,
        show_all_statuses: 'false', // This means: show only approved properties from ALL users
        no_user_id: true, // No user_id = search all users
        limit: '100'
      });

      // Add filters
      if (filters.minPrice && filters.minPrice !== 'any') {
        searchParams.append('min_price', filters.minPrice);
      }
      if (filters.maxPrice && filters.maxPrice !== 'any') {
        searchParams.append('max_price', filters.maxPrice);
      }
      if (filters.minBeds && filters.minBeds !== 'any') {
        searchParams.append('bedrooms_min', filters.minBeds);
      }
      if (filters.maxBeds && filters.maxBeds !== 'any') {
        searchParams.append('bedrooms_max', filters.maxBeds);
      }
      if (filters.propertyBuildingType && filters.propertyBuildingType !== 'all') {
        searchParams.append('property_type', filters.propertyBuildingType);
      }

      const response = await fetch(`/api/properties/search?${searchParams.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      let results = data.properties || [];

      // Filter by property_category on frontend
      if (propertyCategory && propertyCategory !== 'all') {
        const beforeCount = results.length;
        const filteredResults = results.filter(property => {
          return (property.property_category || '').toLowerCase().trim() === propertyCategory.toLowerCase().trim();
        });
        
        if (filteredResults.length > 0) {
          results = filteredResults;
        } else if (beforeCount > 0) {
          console.warn(`⚠️ No properties match property_category "${propertyCategory}". Showing all ${beforeCount} results instead.`);
        }
      }

      setProperties(results);
      setFilteredProperties(results);
      setTotalCount(results.length);
      
      console.log(`📊 Final results: ${results.length} properties for "${query}" (${category}, ${propertyCategory})`);

    } catch (error) {
      console.error('Search error:', error);
      setProperties([]);
      setFilteredProperties([]);
      setTotalCount(0);
    } finally {
      setIsSearching(false);
    }
  }, [category, radius, propertyCategory]);

  // Update searchFilters when category or radius changes
  useEffect(() => {
    setSearchFilters(prev => ({
      ...prev,
      propertyType: category,
      radius: radius
    }));
  }, [category, radius]);

  // Auto-trigger search when filters change (but only if we have a search query)
  useEffect(() => {
    if (searchQuery.trim() && searchQuery.length >= 3 && !isSearching) {
      handleProfessionalSearch(searchQuery, searchFilters);
    }
  }, [searchFilters.minPrice, searchFilters.maxPrice, searchFilters.minBeds, searchFilters.maxBeds, searchFilters.propertyBuildingType, searchFilters.radius]);


  /**
   * Initial search on page load using professional search
   */
  useEffect(() => {
    if (searchQuery && searchQuery.length >= 3) {
      handleProfessionalSearch(searchQuery, searchFilters);
    }
  }, []); // Run only once on mount

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

        {/* Professional Search Bar - Same as UserDashboard */}
        {category === 'rent' && (
          <SearchFilterHeader
            searchFilters={searchFilters}
            setSearchFilters={setSearchFilters}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            moreFilters={moreFilters}
            setMoreFilters={setMoreFilters}
            showMoreFilters={showMoreFilters}
            setShowMoreFilters={setShowMoreFilters}
            priceOptions={priceOptions}
            bedroomOptions={bedroomOptions}
            propertyBuildingTypeOptions={propertyBuildingTypeOptions}
            bathroomOptions={bathroomOptions}
            onProfessionalSearch={handleProfessionalSearch}
            isSearching={isSearching}
            searchResults={properties}
            searchAnalytics={null}
          />
        )}

        {category === 'sale' && (
          <SearchFilterHeaderSale
            searchFilters={searchFilters}
            setSearchFilters={setSearchFilters}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            moreFilters={moreFilters}
            setMoreFilters={setMoreFilters}
            showMoreFilters={showMoreFilters}
            setShowMoreFilters={setShowMoreFilters}
            priceOptions={priceOptions}
            bedroomOptions={bedroomOptions}
            propertyBuildingTypeOptions={propertyBuildingTypeOptions}
            bathroomOptions={bathroomOptions}
            onProfessionalSearch={handleProfessionalSearch}
            isSearching={isSearching}
          />
        )}

        {category === 'lease' && (
          <SearchFilterHeaderLease
            searchFilters={searchFilters}
            setSearchFilters={setSearchFilters}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            moreFilters={moreFilters}
            setMoreFilters={setMoreFilters}
            showMoreFilters={showMoreFilters}
            setShowMoreFilters={setShowMoreFilters}
            priceOptions={priceOptions}
            squareFeetOptions={bedroomOptions} // Using bedroomOptions as squareFeetOptions
            propertyBuildingTypeOptions={propertyBuildingTypeOptions}
            onProfessionalSearch={handleProfessionalSearch}
            isSearching={isSearching}
          />
        )}

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



