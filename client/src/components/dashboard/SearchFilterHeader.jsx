import React, { useState, useEffect, useRef, memo } from 'react';
import SearchDropdown from '../SearchDropdown';
import LocationSearch from '../LocationSearch';

const SearchFilterHeader = memo(({ 
  searchFilters, 
  setSearchFilters, 
  searchQuery, 
  setSearchQuery,
  moreFilters,
  setMoreFilters,
  showMoreFilters,
  setShowMoreFilters,
  priceOptions,
  bedroomOptions,
  propertyBuildingTypeOptions,
  bathroomOptions,
  onProfessionalSearch,
  isSearching = false,
  searchResults = [],
  searchAnalytics = null
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
    
    console.log(`🔍 Professional Dashboard Search: "${searchQuery}"`);
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
    console.log('📍 Suggestion selected in SearchFilterHeader:', suggestion);
    
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
            placeholder="Min Price"
            className="search-dropdown-price-min"
            style={{minWidth: '100px'}}
            theme="dark"
          />
          <span className="separator">to</span>
          <SearchDropdown
            value={searchFilters.maxPrice}
            onChange={(value) => setSearchFilters({...searchFilters, maxPrice: value})}
            options={priceOptions.max}
            placeholder="Max Price"
            className="search-dropdown-price-max"
            style={{minWidth: '100px'}}
            theme="dark"
          />
        </div>

        <div className="filter-group bedroom-group">
          <SearchDropdown
            value={searchFilters.minBeds}
            onChange={(value) => setSearchFilters({...searchFilters, minBeds: value})}
            options={bedroomOptions.min}
            placeholder="Min Beds"
            className="search-dropdown-beds-min"
            style={{minWidth: '95px'}}
            theme="dark"
          />
          <span className="separator">to</span>
          <SearchDropdown
            value={searchFilters.maxBeds}
            onChange={(value) => setSearchFilters({...searchFilters, maxBeds: value})}
            options={bedroomOptions.max}
            placeholder="Max Beds"
            className="search-dropdown-beds-max"
            style={{minWidth: '95px'}}
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
                    Property Type
                  </h4>
                  <div className="dashboard-filter-row">
                    <div className="filter-field">
                      <SearchDropdown
                        value={searchFilters.propertyBuildingType}
                        onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
                        options={propertyBuildingTypeOptions}
                        placeholder="Property Type"
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
                    <i className="fas fa-bath"></i>
                    Bathroom
                  </h4>
                  <div className="dashboard-filter-row">
                    <div className="filter-field">
                      <SearchDropdown
                        value={moreFilters.minBathrooms}
                        onChange={(value) => setMoreFilters({...moreFilters, minBathrooms: value})}
                        options={bathroomOptions.min}
                        placeholder="Min Bath"
                        className="dashboard-more-filter-dropdown"
                        style={{minWidth: '140px'}}
                        theme="light"
                      />
                    </div>
                    <div className="filter-field">
                      <SearchDropdown
                        value={moreFilters.maxBathrooms}
                        onChange={(value) => setMoreFilters({...moreFilters, maxBathrooms: value})}
                        options={bathroomOptions.max}
                        placeholder="Max Bath"
                        className="dashboard-more-filter-dropdown"
                        style={{minWidth: '140px'}}
                        theme="light"
                      />
                    </div>
                  </div>
                </div>

                <div className="dashboard-filter-divider"></div>

                <div className="dashboard-filter-section">
                  <h4 className="dashboard-filter-section-title">
                    <i className="fas fa-home"></i>
                    Property Details
                  </h4>
                  <div className="dashboard-filter-row">
                    <div className="filter-field">
                      <label className="filter-field-label">Date Added</label>
                      <SearchDropdown
                        value={moreFilters.dateAdded}
                        onChange={(value) => setMoreFilters({...moreFilters, dateAdded: value})}
                        options={[
                          { value: 'anytime', label: 'Anytime' },
                          { value: '3days', label: 'Last 3 days' },
                          { value: '7days', label: 'Last 7 days' },
                          { value: '14days', label: 'Last 14 days' }
                        ]}
                        placeholder="Anytime"
                        className="dashboard-more-filter-dropdown"
                        style={{minWidth: '280px'}}
                        theme="light"
                      />
                    </div>
                    <div className="filter-field">
                      <label className="filter-field-label">Move in by Date</label>
                      <div className="date-input-container">
                        <input
                          type="date"
                          className="date-input"
                          value={moreFilters.moveInDate}
                          onChange={(e) => setMoreFilters({...moreFilters, moveInDate: e.target.value})}
                          placeholder="dd/mm/yyyy"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="dashboard-filter-row">
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.letAgreed}
                        onChange={(e) => setMoreFilters({...moreFilters, letAgreed: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">Include Let Agreed</span>
                    </label>
                  </div>
                </div>

                <div className="dashboard-filter-divider"></div>

                <div className="dashboard-filter-section">
                  <h4 className="dashboard-filter-section-title">
                    <i className="fas fa-key"></i>
                    Type of Let
                  </h4>
                  <div className="dashboard-filter-list">
                    <label className="dashboard-filter-radio-option">
                      <input
                        type="radio"
                        name="typeOfLet"
                        value="any"
                        checked={moreFilters.typeOfLet === 'any'}
                        onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                      />
                      <span className="radio-custom"></span>
                      <span className="radio-label">Any</span>
                    </label>
                    <label className="dashboard-filter-radio-option">
                      <input
                        type="radio"
                        name="typeOfLet"
                        value="long-term"
                        checked={moreFilters.typeOfLet === 'long-term'}
                        onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                      />
                      <span className="radio-custom"></span>
                      <span className="radio-label">Long Term</span>
                    </label>
                    <label className="dashboard-filter-radio-option">
                      <input
                        type="radio"
                        name="typeOfLet"
                        value="short-term"
                        checked={moreFilters.typeOfLet === 'short-term'}
                        onChange={(e) => setMoreFilters({...moreFilters, typeOfLet: e.target.value})}
                      />
                      <span className="radio-custom"></span>
                      <span className="radio-label">Short Term</span>
                    </label>
                  </div>
                </div>

                <div className="dashboard-filter-section">
                  <div className="dashboard-filter-checkboxes-row">
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.hasGarden}
                        onChange={(e) => setMoreFilters({...moreFilters, hasGarden: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">Garden</span>
                    </label>
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.hasParking}
                        onChange={(e) => setMoreFilters({...moreFilters, hasParking: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">Parking</span>
                    </label>
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.houseShare}
                        onChange={(e) => setMoreFilters({...moreFilters, houseShare: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">House Share</span>
                    </label>
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.retirementHome}
                        onChange={(e) => setMoreFilters({...moreFilters, retirementHome: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">Retirement Home</span>
                    </label>
                    <label className="dashboard-filter-checkbox-option">
                      <input
                        type="checkbox"
                        checked={moreFilters.studentAccommodation}
                        onChange={(e) => setMoreFilters({...moreFilters, studentAccommodation: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-label">Student Accommodation</span>
                    </label>
                  </div>
                </div>

                <div className="dashboard-filter-actions">
                  <button 
                    className="dashboard-filter-clear-btn"
                    onClick={() => setMoreFilters({
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
                    })}
                  >
                    Clear
                  </button>
                  <button 
                    className="dashboard-filter-done-btn"
                    onClick={() => {
                      setShowMoreFilters(false);
                    }}
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

SearchFilterHeader.displayName = 'SearchFilterHeader';

export default SearchFilterHeader; 