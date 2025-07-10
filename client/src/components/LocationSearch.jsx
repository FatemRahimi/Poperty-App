import React, { useState, useEffect, useRef } from 'react';
import SearchDropdown from './SearchDropdown';

/**
 * Simple Location Search Component
 * Just location input + radius dropdown - nothing more
 * Can be used in UserDashboard, property search, or anywhere else
 * Enhanced with backend suggestions API integration
 */
const LocationSearch = ({
  // Search values
  searchQuery = '',
  onSearchQueryChange,
  radius = '3',
  onRadiusChange,
  
  // UI options
  placeholder = "🔍 Enter location (e.g. 'M1 4DY', 'Stone Road Birmingham', 'London')...",
  disabled = false,
  isSearching = false,
  
  // Event handlers
  onKeyPress,
  onSearch, // Optional manual search function
  
  // Styling
  className = '',
  inputRef = null
}) => {

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const suggestionsRef = useRef(null);
  const wrapperRef = useRef(null);

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

  // Fetch suggestions from backend
  const fetchSuggestions = async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);
    
    try {
      const response = await fetch(`/api/properties/search/location-suggestions?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.suggestions && Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions);
        setShowSuggestions(data.suggestions.length > 0);
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error('Error fetching location suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Debounce suggestions API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Hide suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    if (onSearchQueryChange) {
      onSearchQueryChange(value);
    }
    
    // Enhanced: Log input analysis (for debugging)
    if (value.length >= 2) {
      console.log(`🔍 Location input analysis: "${value}"`);
    }
  };

  const handleRadiusChange = (newRadius) => {
    if (onRadiusChange) {
      onRadiusChange(newRadius);
    }
  };

  const handleKeyPress = (e) => {
    // Handle arrow keys for suggestion navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        return;
      }
      
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
      
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedIndex(-1);
        return;
      }
    }

    if (onKeyPress) {
      onKeyPress(e);
    }
    
    // Optional: trigger search on Enter if onSearch is provided
    if (e.key === 'Enter' && onSearch) {
      onSearch(searchQuery, radius);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    if (onSearchQueryChange) {
      onSearchQueryChange(suggestion.value);
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
    
    // Optional: trigger search immediately after selection
    if (onSearch) {
      setTimeout(() => {
        onSearch(suggestion.value, radius);
      }, 100);
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && searchQuery.length >= 2) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className={`filter-group location-group location-group-wide ${className}`} ref={wrapperRef} style={{ position: 'relative', overflow: 'visible' }}>
      
      {/* Location Input */}
      <div className="professional-search-input-wrapper" style={{ position: 'relative', overflow: 'visible' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onFocus={handleInputFocus}
          className={`location-input location-input-wide ${isSearching ? 'searching' : ''}`}
          disabled={disabled || isSearching}
          autoComplete="off"
          title="Enhanced location search supports postcodes (M1 4DY), cities (Birmingham), streets (Stone Road), and mixed formats (Stone Road Birmingham)"
        />
        
        {/* Loading indicator */}
        {(isSearching || loadingSuggestions) && (
          <div className="search-loading-indicator">
            <i className="fas fa-spinner fa-spin"></i>
            <span>{isSearching ? 'Searching...' : 'Loading...'}</span>
          </div>
        )}





        {/* Autocomplete Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div 
            ref={suggestionsRef}
            className="location-suggestions-dropdown"
            style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              right: '0',
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 9999,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              minHeight: '50px'
            }}
          >
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => selectSuggestion(suggestion)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: index < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                  backgroundColor: index === selectedIndex ? '#f3f4f6' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '14px',
                  transition: 'background-color 0.1s ease'
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={{ flex: 1, color: '#374151' }}>
                  {suggestion.display}
                </span>
                {suggestion.propertyCount && (
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#6b7280', 
                    backgroundColor: '#f3f4f6', 
                    padding: '2px 6px', 
                    borderRadius: '10px' 
                  }}>
                    {suggestion.propertyCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Radius Dropdown */}
      <SearchDropdown
        value={radius}
        onChange={handleRadiusChange}
        options={radiusOptions}
        placeholder="Select radius"
        className="search-dropdown-radius"
        disabled={disabled}
      />
    </div>
  );
};

export default LocationSearch; 