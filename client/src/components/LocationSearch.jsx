import React, { useState, useEffect, useRef, useCallback } from 'react';
import SearchDropdown from './SearchDropdown';

/**
 * Professional Location Search Component with Smart Suggestions
 * ✅ 3-character trigger for suggestions
 * ✅ Smart city/postcode/street detection 
 * ✅ Database integration for cities (no geocoding)
 * ✅ Intelligent debouncing (no search while typing/deleting)
 * ✅ Professional radius handling
 * ✅ Clean UI without icons
 */
const LocationSearch = ({
  // Search values
  searchQuery = '',
  onSearchQueryChange,
  radius = '3', // Default to 3 miles as requested
  onRadiusChange,
  
  // UI options
  placeholder = "Enter location (e.g. 'London', 'B46 2PQ', 'Stone Road')...",
  disabled = false,
  isSearching = false,
  
  // Event handlers
  onKeyPress,
  onSearch,
  onSuggestionSelect,
  
  // Styling
  className = '',
  inputRef = null
}) => {
  // Component state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  
  // Refs
  const suggestionsRef = useRef(null);
  const inputContainerRef = useRef(null);
  const internalInputRef = useRef(null);
  const actualInputRef = inputRef || internalInputRef;

  // Radius options
  const radiusOptions = [
    { value: '0.25', label: 'Within 1/4 mile' },
    { value: '0.5', label: 'Within 1/2 mile' },
    { value: '1', label: 'Within 1 mile' },
    { value: '2', label: 'Within 2 miles' },
    { value: '3', label: 'Within 3 miles' }, // Default
    { value: '5', label: 'Within 5 miles' },
    { value: '10', label: 'Within 10 miles' },
    { value: '15', label: 'Within 15 miles' },
    { value: '20', label: 'Within 20 miles' },
    { value: '25', label: 'Within 25 miles' },
    { value: '30', label: 'Within 30 miles' }
  ];

  // UK Postcode areas for quick suggestions
  const ukPostcodeAreas = {
    'B': 'Birmingham', 'M': 'Manchester', 'L': 'Liverpool', 'S': 'Sheffield',
    'LS': 'Leeds', 'SW': 'South West London', 'SE': 'South East London',
    'N': 'North London', 'E': 'East London', 'W': 'West London',
    'NW': 'North West London', 'EC': 'City of London', 'WC': 'West Central London',
    'BS': 'Bristol', 'GL': 'Gloucester', 'OX': 'Oxford', 'RG': 'Reading',
    'GU': 'Guildford', 'KT': 'Kingston upon Thames', 'CR': 'Croydon'
  };

  // UK Cities for recognition
  const ukCities = [
    'London', 'Birmingham', 'Manchester', 'Liverpool', 'Leeds', 'Sheffield',
    'Bristol', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast', 'Newcastle',
    'Nottingham', 'Leicester', 'Coventry', 'Bradford', 'Stoke-on-Trent',
    'Wolverhampton', 'Plymouth', 'Derby', 'Southampton', 'Portsmouth',
    'Brighton', 'Reading', 'Oxford', 'Cambridge', 'York', 'Bath'
  ];

  /**
   * Analyze input to determine type (city, postcode, street, area)
   */
  const analyzeInput = (input) => {
    if (!input || input.length < 3) return { type: 'too_short' };
    
    const cleaned = input.trim().toLowerCase();
    const original = input.trim();
    
    // Full UK postcode pattern
    if (/^[a-z]{1,2}[0-9][a-z0-9]?\s*[0-9][a-z]{2}$/i.test(cleaned)) {
      return {
        type: 'full_postcode',
        value: original.toUpperCase(),
        searchStrategy: 'geocoding_with_radius',
        defaultRadius: 1
      };
    }
    
    // Partial postcode pattern (B46, M1, SW1, etc.)
    if (/^[a-z]{1,2}[0-9][a-z0-9]?$/i.test(cleaned)) {
      return {
        type: 'partial_postcode',
        value: original.toUpperCase(),
        searchStrategy: 'geocoding_with_radius',
        defaultRadius: 3
      };
    }
    
    // Area code (B, M, SW, etc.)
    if (/^[a-z]{1,2}$/i.test(cleaned) && ukPostcodeAreas[original.toUpperCase()]) {
      return {
        type: 'area_code',
        value: original.toUpperCase(),
        searchStrategy: 'geocoding_with_radius',
        defaultRadius: 8
      };
    }
    
    // City name detection
    const cityMatch = ukCities.find(city => 
      city.toLowerCase() === cleaned || 
      city.toLowerCase().includes(cleaned) ||
      cleaned.includes(city.toLowerCase())
    );
    
    if (cityMatch) {
      return {
        type: 'city',
        value: cityMatch,
        searchStrategy: 'database_direct', // No geocoding for cities
        defaultRadius: null
      };
    }
    
    // Street indicators
    const streetIndicators = ['road', 'street', 'st', 'avenue', 'ave', 'lane', 'ln', 'drive', 'dr', 'close', 'cl', 'way', 'court', 'ct', 'place', 'pl', 'crescent', 'grove', 'gardens', 'park', 'square', 'terrace'];
    const isStreet = streetIndicators.some(indicator => cleaned.includes(indicator));
    
    if (isStreet) {
      return {
        type: 'street',
        value: original,
        searchStrategy: 'geocoding_with_radius',
        defaultRadius: 1
      };
    }
    
    // Default to area search
    return {
      type: 'area',
      value: original,
      searchStrategy: 'geocoding_with_radius',
      defaultRadius: 2
    };
  };

  /**
   * Generate suggestions based on input analysis
   */
  const generateSuggestions = (query, apiSuggestions = []) => {
    const suggestions = [];
    const analysis = analyzeInput(query);
    const cleanedQuery = query.toLowerCase().trim();
    
    console.log('🔍 DEBUG: generateSuggestions called with query:', query);
    console.log('🔍 DEBUG: Input analysis:', analysis);
    
    if (analysis.type === 'too_short') {
      return []; // No suggestions for inputs < 3 characters
    }
    
    // 1. Full postcode suggestions
    if (analysis.type === 'full_postcode') {
      suggestions.push({
        type: 'full_postcode',
        display: `${analysis.value} - Exact Postcode`,
        value: analysis.value,
        radius: analysis.defaultRadius,
        confidence: 0.98
      });
    }
    
    // 2. Partial postcode suggestions
    else if (analysis.type === 'partial_postcode') {
      const area = ukPostcodeAreas[analysis.value.substring(0, analysis.value.length - (analysis.value.match(/\d/) ? analysis.value.match(/\d/).index : 0))];
      suggestions.push({
        type: 'partial_postcode',
        display: `${analysis.value} - ${area || 'District'}`,
        value: analysis.value,
        radius: analysis.defaultRadius,
        confidence: 0.95
      });
    }
    
    // 3. Area code suggestions
    else if (analysis.type === 'area_code') {
      const area = ukPostcodeAreas[analysis.value];
      suggestions.push({
        type: 'area_code',
        display: `${analysis.value} - ${area} Area`,
        value: analysis.value,
        radius: analysis.defaultRadius,
        confidence: 0.9
      });
    }
    
    // 4. City suggestions (NO GEOCODING)
    else if (analysis.type === 'city') {
      suggestions.push({
        type: 'city',
        display: `${analysis.value} - City (Full Coverage)`,
        value: analysis.value,
        radius: null, // No radius for cities
        confidence: 0.95
      });
    }
    
    // 5. Street suggestions
    else if (analysis.type === 'street') {
      suggestions.push({
        type: 'street',
        display: `${analysis.value} - Street`,
        value: analysis.value,
        radius: analysis.defaultRadius,
        confidence: 0.85
      });
    }
    
    // 6. Area suggestions
    else if (analysis.type === 'area') {
      suggestions.push({
        type: 'area',
        display: `${analysis.value} - Area`,
        value: analysis.value,
        radius: analysis.defaultRadius,
        confidence: 0.8
      });
    }
    
    // 7. Additional postcode area matches
    if (cleanedQuery.length >= 1) {
      const queryUpper = cleanedQuery.toUpperCase();
      Object.entries(ukPostcodeAreas).forEach(([code, area]) => {
        if (code.startsWith(queryUpper) && code !== queryUpper && suggestions.length < 5) {
          suggestions.push({
            type: 'postcode_match',
            display: `${code} - ${area}`,
            value: code,
            radius: code.length <= 2 ? 8 : 3,
            confidence: 0.8
          });
        }
      });
    }
    
    // 8. City partial matches
    ukCities.forEach(city => {
      if (city.toLowerCase().includes(cleanedQuery) && 
          !suggestions.some(s => s.value === city) && 
          suggestions.length < 8) {
        suggestions.push({
          type: 'city_match',
          display: `${city} - City (Full Coverage)`,
          value: city,
          radius: null,
          confidence: 0.7
        });
      }
    });
    
    // 9. API suggestions from backend (database cities)
    apiSuggestions.forEach(apiSug => {
      if (suggestions.length < 8) {
        suggestions.push({
          type: 'api',
          display: apiSug.display || apiSug.name,
          value: apiSug.value || apiSug.name,
          radius: apiSug.radius || 3,
          confidence: 0.6
        });
      }
    });
    
    // Add a fallback suggestion if no suggestions were generated
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'fallback',
        display: `Search for "${query}"`,
        value: query,
        radius: 3,
        confidence: 0.1
      });
    }
    
    console.log('🔍 DEBUG: Final suggestions generated:', suggestions);
    
    // Sort by confidence and limit to 8
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
  };

  /**
   * Fetch suggestions from backend API
   */
  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    setLastQuery(query);

    try {
      // Get suggestions from backend API (database cities)
      const response = await fetch(`/api/properties/search/suggestions?q=${encodeURIComponent(query)}`);
      let apiSuggestions = [];
      
      if (response.ok) {
        const data = await response.json();
        apiSuggestions = data.suggestions || [];
      }
      
      // Generate local + API suggestions
      const allSuggestions = generateSuggestions(query, apiSuggestions);
      setSuggestions(allSuggestions);
      
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      // Fallback to local suggestions only
      setSuggestions(generateSuggestions(query, []));
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  /**
   * Debouncing with intelligent delay based on user action
   * ✅ Fixes the premature filtering issue
   */
  useEffect(() => {
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Only process queries with 3+ characters
    if (searchQuery.length >= 3) {
      setIsTyping(true);
      
      // Smart delay: longer for deletion, shorter for typing
      const delay = searchQuery.length < lastQuery.length ? 1000 : 500; // 1s for deleting, 500ms for typing
      
      const timeout = setTimeout(() => {
        setIsTyping(false);
        if (searchQuery !== lastQuery && searchQuery.length >= 3) {
          fetchSuggestions(searchQuery);
        }
      }, delay);
      
      setTypingTimeout(timeout);
    } else {
      setIsTyping(false);
      setSuggestions([]);
      setShowSuggestions(false);
    }
    
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [searchQuery, fetchSuggestions, lastQuery]);

  /**
   * Handle input change with 3-character trigger
   */
  const handleInputChange = (e) => {
    const value = e.target.value;
    
    console.log(`🔍 DEBUG: Input changed to "${value}", length=${value.length}`);
    
    // Show suggestions only after 3+ characters
    if (value.length >= 3) {
      console.log(`✅ DEBUG: Showing suggestions for "${value}"`);
      setShowSuggestions(true);
    } else {
      console.log(`❌ DEBUG: Hiding suggestions (too short)`);
      setShowSuggestions(false);
      setSuggestions([]);
    }
    
    setSelectedSuggestionIndex(-1);
    
    if (onSearchQueryChange) {
      onSearchQueryChange(value);
    }
  };

  /**
   * Handle suggestion selection with smart radius setting
   */
  const handleSuggestionSelect = (suggestion) => {
    console.log('📍 Selected suggestion:', suggestion);
    
    if (onSearchQueryChange) {
      onSearchQueryChange(suggestion.value);
    }
    
    // Auto-set radius for postcodes/streets/areas (NOT for cities)
    if (onRadiusChange && suggestion.radius && suggestion.type !== 'city') {
      onRadiusChange(suggestion.radius.toString());
    }
    
    if (onSuggestionSelect) {
      onSuggestionSelect(suggestion);
    }
    
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  /**
   * Handle keyboard navigation
   */
  const handleKeyPress = (e) => {
    if (onKeyPress) {
      onKeyPress(e);
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
      } else if (onSearch) {
        onSearch(searchQuery, radius);
      }
      setShowSuggestions(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  /**
   * Handle radius change
   */
  const handleRadiusChange = (newRadius) => {
    if (onRadiusChange) {
      onRadiusChange(newRadius);
    }
  };

  /**
   * Handle click outside to close suggestions
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputContainerRef.current && !inputContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`filter-group location-group location-group-wide ${className}`} ref={inputContainerRef}>
      
      {/* Location Input with Smart Suggestions */}
      <div className="location-input-container">
        <input
          ref={actualInputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onFocus={() => {
            if (searchQuery.length >= 3) {
              setShowSuggestions(true);
            }
          }}
          className={`location-input location-input-wide ${isSearching ? 'searching' : ''}`}
          disabled={disabled || isSearching}
          autoComplete="off"
        />
        
        {/* Professional Suggestions Dropdown - Clean UI without icons */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="location-suggestions" ref={suggestionsRef}>
            {suggestions.map((suggestion, index) => (
              <div
                key={`${suggestion.type}-${index}`}
                className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                onClick={() => handleSuggestionSelect(suggestion)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
              >
                <span className="suggestion-text">{suggestion.display}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Loading indicator */}
        {isLoadingSuggestions && searchQuery.length >= 3 && (
          <div className="location-suggestions">
            <div className="suggestion-item loading">
              <span className="suggestion-text">Loading suggestions...</span>
            </div>
          </div>
        )}
      </div>

      {/* Radius Dropdown - Only shown for non-city searches */}
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