import React from 'react';
import SearchDropdown from '../SearchDropdown';

const SearchFilterHeader = ({ 
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
  bathroomOptions
}) => {

  const radiusOptions = [
    { value: '0.25', label: 'Within 1/4 mile' },
    { value: '0.5', label: 'Within 1/2 mile' },
    { value: '1', label: 'Within 1 mile' },
    { value: '2', label: 'Within 2 miles' },
    { value: '3', label: 'Within 3 miles' },
    { value: '5', label: 'Within 5 miles' },
    { value: '10', label: 'Within 10 miles' },
    { value: '15', label: 'Within 15 miles' },
    { value: '20', label: 'Within 20 miles' },
    { value: '25', label: 'Within 25 miles' },
    { value: '30', label: 'Within 30 miles' }
  ];

  return (
    <div className="professional-search-header">
      <div className="search-filter-container">
        {/* Location Search - Made wider */}
        <div className="filter-group location-group location-group-wide">
          <input
            type="text"
            placeholder="Enter postcode or address to find nearby properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="location-input location-input-wide"
          />
          <SearchDropdown
            value={searchFilters.radius}
            onChange={(value) => setSearchFilters({...searchFilters, radius: value})}
            options={radiusOptions}
            placeholder="Select radius"
            className="search-dropdown-radius"
            style={{minWidth: '150px'}}
            theme="dark"
          />
        </div>

        {/* Price Filters */}
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

        {/* Bedroom Filters */}
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

        {/* Property Type */}
        <div className="filter-group property-type-group">
          <SearchDropdown
            value={searchFilters.propertyBuildingType}
            onChange={(value) => setSearchFilters({...searchFilters, propertyBuildingType: value})}
            options={propertyBuildingTypeOptions}
            placeholder="Property Type"
            className="search-dropdown-property-building-type"
            style={{minWidth: '140px'}}
            theme="dark"
          />
        </div>

        {/* More Filters */}
        <div className="filter-group dashboard-more-filters-container">
          <div 
            className={`dashboard-more-filters-button ${showMoreFilters ? 'open' : ''}`}
            onClick={() => setShowMoreFilters(!showMoreFilters)}
          >
            <span className="dashboard-more-filters-text">More Filters</span>
            <i className={`fas fa-chevron-down dashboard-more-filters-arrow ${showMoreFilters ? 'open' : ''}`}></i>
          </div>

          {showMoreFilters && (
            <div className="dashboard-more-filters-dropdown">
              <div className="dashboard-more-filters-content">
                
                {/* Bathroom Section */}
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

                {/* Property Details Section */}
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

                {/* Type of Let Section */}
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

                {/* Property Features Section */}
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

                {/* Filter Actions */}
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
};

export default SearchFilterHeader; 