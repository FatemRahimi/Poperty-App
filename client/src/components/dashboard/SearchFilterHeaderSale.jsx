import React, { useEffect, useRef, useState, memo } from 'react';
import SearchDropdown from '../SearchDropdown';
import LocationSearch from '../LocationSearch';

const SearchFilterHeaderSale = memo(({ 
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
  const isInitialRadiusChange = useRef(true);

  const triggerSearch = () => {
    if (!searchQuery.trim() || searchQuery === lastSearchQuery) return;
    if (isUserTyping || isUserDeleting) return;
    setLastSearchQuery(searchQuery);
    if (onProfessionalSearch) onProfessionalSearch(searchQuery, searchFilters);
  };

  useEffect(() => {
    if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
    const currentLength = searchQuery.length;
    const typing = currentLength > lastInputLength;
    const deleting = currentLength < lastInputLength;
    setIsUserTyping(typing && currentLength > 0);
    setIsUserDeleting(deleting);
    setLastInputLength(currentLength);

    const getDelay = () => {
      if (!searchQuery.trim()) return 0;
      if (deleting) return 1200;
      return 800;
    };

    const delay = getDelay();
    if (searchQuery.trim() && searchQuery !== lastSearchQuery) {
      const t = setTimeout(() => {
        setIsUserTyping(false);
        setIsUserDeleting(false);
        triggerSearch();
      }, delay);
      setSearchDebounceTimeout(t);
    } else if (!searchQuery.trim()) {
      setIsUserTyping(false);
      setIsUserDeleting(false);
      if (lastSearchQuery) setLastSearchQuery('');
    }

    return () => {
      if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (isInitialRadiusChange.current) {
      isInitialRadiusChange.current = false;
      return;
    }

    if (!searchQuery.trim()) return;
    if (onProfessionalSearch) {
      onProfessionalSearch(searchQuery, { ...searchFilters });
      setLastSearchQuery(searchQuery);
    }
  }, [searchFilters.radius, searchQuery, onProfessionalSearch]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
      setIsUserTyping(false);
      setIsUserDeleting(false);
      triggerSearch();
    }
  };

  const handleSuggestionSelect = () => {
    setIsUserTyping(false);
    setIsUserDeleting(false);
    setTimeout(() => triggerSearch(), 100);
  };

  return (
    <div className="professional-search-header">
      <div className="search-filter-container">
        <LocationSearch
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          radius={searchFilters.radius}
          onRadiusChange={(value) => setSearchFilters({...searchFilters, radius: value})}
          placeholder="Enter Location (postcode or city)"
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
            style={{minWidth: '110px'}}
            theme="dark"
          />
          <span className="separator">to</span>
          <SearchDropdown
            value={searchFilters.maxPrice}
            onChange={(value) => setSearchFilters({...searchFilters, maxPrice: value})}
            options={priceOptions.max}
            placeholder="Max Price"
            className="search-dropdown-price-max"
            style={{minWidth: '110px'}}
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

        <div className="filter-group property-type-group">
          <SearchDropdown
            value={searchFilters.propertyBuildingType}
            onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
            options={propertyBuildingTypeOptions}
            placeholder="Property Type"
            className="search-dropdown-property-building-type"
            style={{minWidth: '150px'}}
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
                  </div>
                </div>

                <div className="dashboard-filter-actions">
                  <button 
                    className="dashboard-filter-clear-btn"
                    onClick={() => setMoreFilters({
                      minBathrooms: 'any',
                      maxBathrooms: 'any',
                      dateAdded: 'anytime',
                      moveInDate: '',
                      hasGarden: false,
                      hasParking: false
                    })}
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

SearchFilterHeaderSale.displayName = 'SearchFilterHeaderSale';

export default SearchFilterHeaderSale;


