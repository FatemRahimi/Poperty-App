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

        <div className="filter-group property-type-group">
          <SearchDropdown
            value={searchFilters.propertyBuildingType}
            onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
            options={propertyBuildingTypeOptions}
            placeholder="Space Type"
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


