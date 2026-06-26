import React, { useEffect, useRef, useState, memo } from 'react';
import SearchDropdown from '../SearchDropdown';
import LocationSearch from '../LocationSearch';

const SearchFilterHeaderLease = memo(({ 
  searchFilters, 
  setSearchFilters, 
  searchQuery, 
  setSearchQuery,
  moreFilters,
  setMoreFilters,
  showMoreFilters,
  setShowMoreFilters,
  priceOptions,
  squareFeetOptions,
  propertyBuildingTypeOptions,
  onProfessionalSearch,
  isSearching = false
}) => {
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [searchDebounceTimeout, setSearchDebounceTimeout] = useState(null);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isUserDeleting, setIsUserDeleting] = useState(false);
  const [lastInputLength, setLastInputLength] = useState(0);
  const searchInputRef = useRef(null);

  // Enhanced search triggering with intelligent debouncing
  const triggerProfessionalSearch = () => {
    // Don't search if query is empty or same as last search
    if (!searchQuery.trim() || searchQuery === lastSearchQuery) return;
    
    // Don't search while user is actively typing or deleting
    if (isUserTyping || isUserDeleting) {
      console.log('🔍 Delaying search - user is still typing/deleting');
      return;
    }
    
    console.log(`🔍 Professional Dashboard Search (Lease): "${searchQuery}"`);
    setLastSearchQuery(searchQuery);
    
    if (onProfessionalSearch) {
      onProfessionalSearch(searchQuery, searchFilters);
    }
  };

  // Smart typing detection and debouncing
  useEffect(() => {
    // Clear existing timeout
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    // Detect if user is typing or deleting
    const currentLength = searchQuery.length;
    const isTypingMore = currentLength > lastInputLength;
    const isDeletingMore = currentLength < lastInputLength;
    
    setIsUserTyping(isTypingMore && currentLength > 0);
    setIsUserDeleting(isDeletingMore);
    setLastInputLength(currentLength);

    // Smart delay based on action type and query characteristics
    const getSmartDelay = () => {
      // No delay for empty query (immediate clear)
      if (!searchQuery.trim()) return 0;
      
      // Longer delay if user is deleting to prevent premature searches
      if (isDeletingMore) return 2000; // 2 seconds for deleting
      
      // Analyze query type for appropriate delay
      const queryAnalysis = analyzeQueryType(searchQuery);
      
      switch (queryAnalysis.type) {
        case 'complete_postcode':
          return 800; // Shorter delay for complete postcodes
        case 'partial_postcode':
          return 1200; // Medium delay for partial postcodes
        case 'city_name':
          return 1000; // Medium delay for cities
        case 'partial_text':
          return 1500; // Longer delay for partial text
        default:
          return 1800; // Longest delay for general text
      }
    };

    const delay = getSmartDelay();
    
    // Set timeout for search
    if (searchQuery.trim() && searchQuery !== lastSearchQuery) {
      const timeout = setTimeout(() => {
        setIsUserTyping(false);
        setIsUserDeleting(false);
        triggerProfessionalSearch();
      }, delay);
      
      setSearchDebounceTimeout(timeout);
    } else if (!searchQuery.trim()) {
      // Clear search immediately for empty queries
      setIsUserTyping(false);
      setIsUserDeleting(false);
      if (lastSearchQuery) {
        setLastSearchQuery('');
        // Clear search results if needed
      }
    }

    return () => {
      if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout);
      }
    };
  }, [searchQuery]); // Only depend on searchQuery for proper debouncing

  // Analyze query type for smart debouncing
  const analyzeQueryType = (query) => {
    if (!query || !query.trim()) return { type: 'empty' };
    
    const cleaned = query.trim();
    
    // Complete UK postcode pattern
    if (/^[a-z]{1,2}[0-9][a-z0-9]?\s*[0-9][a-z]{2}$/i.test(cleaned)) {
      return { type: 'complete_postcode' };
    }
    
    // Partial postcode pattern
    if (/^[a-z]{1,2}[0-9][a-z0-9]?$/i.test(cleaned)) {
      return { type: 'partial_postcode' };
    }
    
    // Known UK cities (quick check for major cities)
    const majorCities = ['london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 'bristol', 'edinburgh', 'glasgow', 'cardiff', 'belfast', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford'];
    if (majorCities.includes(cleaned.toLowerCase())) {
      return { type: 'city_name' };
    }
    
    // Check if it looks like a partial city name (3+ characters, no numbers)
    if (cleaned.length >= 3 && !/\d/.test(cleaned) && /^[a-z\s-']+$/i.test(cleaned)) {
      return { type: 'potential_city' };
    }
    
    // Partial text (less than 3 characters or mixed content)
    if (cleaned.length < 3) {
      return { type: 'partial_text' };
    }
    
    return { type: 'general_text' };
  };

  // Enhanced key press handling
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Force immediate search on Enter
      if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout);
        setSearchDebounceTimeout(null);
      }
      setIsUserTyping(false);
      setIsUserDeleting(false);
      triggerProfessionalSearch();
    }
  };

  // Handle suggestion selection from LocationSearch
  const handleSuggestionSelect = (suggestion) => {
    console.log('📍 Suggestion selected in SearchFilterHeaderLease:', suggestion);
    
    // Auto-set appropriate radius based on suggestion type
    if (suggestion.radius && suggestion.radius !== searchFilters.radius) {
      setSearchFilters({
        ...searchFilters,
        radius: suggestion.radius.toString()
      });
    }
    
    // Clear typing states since user selected a suggestion
    setIsUserTyping(false);
    setIsUserDeleting(false);
    
    // Trigger search immediately for suggestion selections
    setTimeout(() => {
      triggerProfessionalSearch();
    }, 100);
  };

  return (
    <div className="professional-search-header">
      <div className="search-filter-container">
        <LocationSearch
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          radius={searchFilters.radius}
          onRadiusChange={(value) => setSearchFilters({...searchFilters, radius: value})}
          placeholder="Enter Location(e.g. 'M1 4DY',  'London', 'Ealing')"
          isSearching={isSearching}
          onKeyPress={handleKeyPress}
          onSuggestionSelect={handleSuggestionSelect}
          inputRef={searchInputRef}
        />

        <div className="filter-group price-group">
          <SearchDropdown
            value={searchFilters.minPrice}
            onChange={(value) => setSearchFilters({...searchFilters, minPrice: value})}
            options={priceOptions.min}
            placeholder="Min Rent"
            className="search-dropdown-price-min"
            style={{minWidth: '110px'}}
            theme="dark"
          />
          <span className="separator">to</span>
          <SearchDropdown
            value={searchFilters.maxPrice}
            onChange={(value) => setSearchFilters({...searchFilters, maxPrice: value})}
            options={priceOptions.max}
            placeholder="Max Rent"
            className="search-dropdown-price-max"
            style={{minWidth: '110px'}}
            theme="dark"
          />
        </div>

        <div className="filter-group sqft-group">
          <SearchDropdown
            value={searchFilters.minSqft || ''}
            onChange={(value) => setSearchFilters({...searchFilters, minSqft: value})}
            options={squareFeetOptions.min}
            placeholder="Min Sq Ft"
            className="search-dropdown-sqft-min"
            style={{minWidth: '120px'}}
            theme="dark"
          />
          <span className="separator">to</span>
          <SearchDropdown
            value={searchFilters.maxSqft || ''}
            onChange={(value) => setSearchFilters({...searchFilters, maxSqft: value})}
            options={squareFeetOptions.max}
            placeholder="Max Sq Ft"
            className="search-dropdown-sqft-max"
            style={{minWidth: '120px'}}
            theme="dark"
          />
        </div>

        <div className="filter-group dashboard-more-filters-container">
          <div 
            className={`dashboard-more-filters-button ${showMoreFilters ? 'open' : ''}`}
            onClick={() => setShowMoreFilters(!showMoreFilters)}
          >
            <span className="dashboard-more-filters-text">More Filters</span>
            <i className={`fas fa-chevron-down dashboard-more-filters-arrow ${showMoreFilters ? 'open' : ''}`}></i>
          </div>

          {showMoreFilters && (
            <div className="dashboard-more-filters-dropdown dashboard-more-filters-dropdown--expanded">
              <div className="dashboard-more-filters-content">
                <div className="dashboard-filter-section">
                  <h4 className="dashboard-filter-section-title">
                    <i className="fas fa-building"></i>
                    Space Type
                  </h4>
                  <div className="dashboard-filter-row">
                    <div className="filter-field">
                      <SearchDropdown
                        value={searchFilters.propertyBuildingType}
                        onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
                        options={propertyBuildingTypeOptions}
                        placeholder="Space Type"
                        className="dashboard-more-filter-dropdown"
                        style={{minWidth: '280px'}}
                        theme="light"
                      />
                    </div>
                  </div>
                </div>

                <div className="dashboard-filter-divider"></div>

                <div className="dashboard-filter-section">
                  <h4 className="dashboard-filter-section-title">
                    <i className="fas fa-briefcase"></i>
                    Lease Details
                  </h4>
                  <div className="dashboard-filter-row">
                    <div className="filter-field">
                      <label className="filter-field-label">Lease Length (years)</label>
                      <input
                        type="number"
                        className="date-input"
                        value={moreFilters.leaseTerm || ''}
                        onChange={(e) => setMoreFilters({...moreFilters, leaseTerm: e.target.value})}
                        placeholder="e.g., 5"
                      />
                    </div>
                    <div className="filter-field">
                      <label className="filter-field-label">Parking</label>
                      <label className="dashboard-filter-checkbox-option" style={{ marginLeft: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={moreFilters.hasParking || false}
                          onChange={(e) => setMoreFilters({...moreFilters, hasParking: e.target.checked})}
                        />
                        <span className="checkbox-custom"></span>
                        <span className="checkbox-label">Available</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="dashboard-filter-actions">
                  <button 
                    className="dashboard-filter-clear-btn"
                    onClick={() => setMoreFilters({ leaseTerm: '', hasParking: false })}
                  >
                    Clear
                  </button>
                  <button 
                    className="dashboard-filter-done-btn"
                    onClick={() => setShowMoreFilters(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

SearchFilterHeaderLease.displayName = 'SearchFilterHeaderLease';

export default SearchFilterHeaderLease;


