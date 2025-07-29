/**
 * Geocoding Service for UK Postcodes and Location Search
 * Uses free UK Postcode API and Nominatim for geocoding
 * Enhanced with flexible search and fuzzy matching
 * 
 * SUPPORTED SEARCH VARIATIONS:
 * - Case insensitive: "london", "LONDON", "London"
 * - Spaces: "SW1A 1AA", "SW1A1AA", "SW1A  1AA"
 * - Hyphens: "St. Mary's", "St Marys", "St-Marys"
 * - Apostrophes: "King's Road", "Kings Road"
 * - Abbreviations: "St. John's Rd", "Saint Johns Road"
 * - Special chars: "London, UK", "London (Central)", "London #1"
 * - Postcodes: "SW1A", "sw1a", "SW1A-1AA", "SW1A.1AA"
 */

// Cache for storing geocoding results to avoid repeated API calls
const geocodingCache = new Map();

/**
 * Normalize search input for better matching
 * Handles case, spaces, hyphens, apostrophes, and other special characters
 * @param {string} input - Raw search input
 * @returns {string} Normalized input
 */
const normalizeSearchInput = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .trim()
    // Remove/normalize common punctuation and special characters
    .replace(/[''`]/g, '') // Remove apostrophes and quotes (St. Mary's → st marys)
    .replace(/[-–—]/g, ' ') // Replace all types of hyphens and dashes with spaces
    .replace(/[.,;:]/g, ' ') // Replace punctuation with spaces
    .replace(/[()[\]{}]/g, ' ') // Replace brackets with spaces
    .replace(/[&+@#$%^*=]/g, ' ') // Replace symbols with spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
};

/**
 * Create multiple normalized variations of an input for better matching
 * @param {string} input - Raw search input
 * @returns {Array} Array of normalized variations
 */
const createSearchVariations = (input) => {
  if (!input || typeof input !== 'string') return [''];
  
  const variations = new Set();
  
  // Original normalized version
  const normalized = normalizeSearchInput(input);
  variations.add(normalized);
  
  // Version with spaces removed (for postcodes like "SW1A1AA" vs "SW1A 1AA")
  variations.add(normalized.replace(/\s/g, ''));
  
  // Version with common abbreviations expanded
  let expanded = normalized
    .replace(/\bst\b/g, 'saint') // St → Saint
    .replace(/\brd\b/g, 'road') // Rd → Road
    .replace(/\bave\b/g, 'avenue') // Ave → Avenue
    .replace(/\bdr\b/g, 'drive') // Dr → Drive
    .replace(/\bln\b/g, 'lane') // Ln → Lane
    .replace(/\bpl\b/g, 'place') // Pl → Place
    .replace(/\bct\b/g, 'court') // Ct → Court
    .replace(/\bpk\b/g, 'park') // Pk → Park
    .replace(/\bsq\b/g, 'square'); // Sq → Square
  
  variations.add(expanded);
  
  // Version with common abbreviations contracted
  let contracted = normalized
    .replace(/\bsaint\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bpark\b/g, 'pk')
    .replace(/\bsquare\b/g, 'sq');
  
  variations.add(contracted);
  
  return Array.from(variations).filter(v => v.length > 0);
};

/**
 * Get coordinates for a UK postcode or location
 * @param {string} location - Postcode (e.g., "M1 4DY") or city name (e.g., "Manchester")
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export const getCoordinates = async (location) => {
  if (!location || typeof location !== 'string') {
    return null;
  }

  // Normalize but keep original for cache key
  const originalLocation = location.trim();
  const normalizedLocation = normalizeSearchInput(location);
  
  // Check cache first with original location
  const cacheKey = originalLocation.toUpperCase();
  if (geocodingCache.has(cacheKey)) {
    return geocodingCache.get(cacheKey);
  }

  try {
    // Try as UK postcode first with flexible matching
    const postcodeResult = await tryUKPostcode(originalLocation);
    if (postcodeResult) {
      geocodingCache.set(cacheKey, postcodeResult);
      return postcodeResult;
    }

    // Try as general location using Nominatim with both original and normalized
    const locationResult = await tryNominatim(originalLocation);
    if (locationResult) {
      geocodingCache.set(cacheKey, locationResult);
      return locationResult;
    }

    // Try with normalized input if different
    if (normalizedLocation !== originalLocation.toLowerCase()) {
      const normalizedResult = await tryNominatim(normalizedLocation);
      if (normalizedResult) {
        geocodingCache.set(cacheKey, normalizedResult);
        return normalizedResult;
      }
    }

    return null;
  } catch (error) {
    console.error('Geocoding error for:', location, error);
    return null;
  }
};

/**
 * Try to geocode as UK postcode using postcodes.io API
 * Enhanced with flexible postcode patterns and normalization
 */
const tryUKPostcode = async (postcode) => {
  if (!postcode || typeof postcode !== 'string') return null;
  
  // Normalize the postcode by removing special characters and normalizing spaces
  const normalizedPostcode = postcode
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
    .toUpperCase();
  
  // More flexible UK postcode patterns
  const flexiblePostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;
  const partialPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/i; // Just first part
  
  const cleanPostcode = normalizedPostcode.replace(/\s/g, '');
  
  // Try full postcode first
  if (flexiblePostcodeRegex.test(normalizedPostcode)) {
    try {
      const response = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 200 && data.result) {
          return {
            lat: data.result.latitude,
            lng: data.result.longitude
          };
        }
      }
    } catch (error) {
      console.error('UK Postcode API error:', error);
    }
  }
  
  // Try partial postcode (e.g., "M1", "SW1A")
  if (partialPostcodeRegex.test(normalizedPostcode)) {
    try {
      const response = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}/autocomplete`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 200 && data.result && data.result.length > 0) {
          // Get coordinates for the first suggested postcode
          const firstSuggestion = data.result[0];
          const coordsResponse = await fetch(`https://api.postcodes.io/postcodes/${firstSuggestion}`);
          
          if (coordsResponse.ok) {
            const coordsData = await coordsResponse.json();
            if (coordsData.status === 200 && coordsData.result) {
              return {
                lat: coordsData.result.latitude,
                lng: coordsData.result.longitude
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('UK Postcode autocomplete error:', error);
    }
  }
  
  return null;
};

/**
 * Try to geocode using Nominatim (free OSM service)
 * Enhanced with better query formation
 */
const tryNominatim = async (location) => {
  try {
    // Clean and prepare the location query
    const cleanLocation = location.trim();
    
    // Try multiple query variations for better results
    const queryVariations = [
      `${cleanLocation}, UK`,
      `${cleanLocation}, United Kingdom`,
      `${cleanLocation}`, // Without country if it's already specific
    ];
    
    for (const query of queryVariations) {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&limit=3&addressdetails=1&countrycodes=gb`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          // Prefer results with higher importance or city/town type
          const bestResult = data.find(result => 
            result.importance > 0.5 || 
            ['city', 'town', 'village', 'suburb', 'neighbourhood'].includes(result.type)
          ) || data[0];
          
          return {
            lat: parseFloat(bestResult.lat),
            lng: parseFloat(bestResult.lon)
          };
        }
      }
      
      // Add small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  } catch (error) {
    console.error('Nominatim API error:', error);
    return null;
  }
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in miles
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Get property coordinates from its address fields
 * Enhanced with better address parsing
 * @param {Object} property - Property object with address fields
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
export const getPropertyCoordinates = async (property) => {
  // Try postcode first (most accurate for UK)
  if (property.postcode || property.zip_code) {
    const postcode = property.postcode || property.zip_code;
    const coords = await getCoordinates(postcode);
    if (coords) return coords;
  }

  // Try full address with smart building
  const addressParts = [
    property.house_number,
    property.street_name,
    property.city,
    property.state || property.county
  ].filter(Boolean);

  if (addressParts.length > 0) {
    const fullAddress = addressParts.join(', ');
    const coords = await getCoordinates(fullAddress);
    if (coords) return coords;
  }

  // Try street + city combination
  if (property.street_name && property.city) {
    const streetCity = `${property.street_name}, ${property.city}`;
    const coords = await getCoordinates(streetCity);
    if (coords) return coords;
  }

  // Try address lines
  if (property.address_line1) {
    let address = property.address_line1;
    if (property.city) {
      address += `, ${property.city}`;
    }
    const coords = await getCoordinates(address);
    if (coords) return coords;
  }

  // Try just city
  if (property.city) {
    const coords = await getCoordinates(property.city);
    if (coords) return coords;
  }

  return null;
};

/**
 * Check if a property is within radius of a search location
 * @param {Object} property - Property object
 * @param {string} searchLocation - Search location (postcode or address)
 * @param {string|number} radiusInMiles - Radius in miles
 * @returns {Promise<boolean>}
 */
export const isPropertyWithinRadius = async (property, searchLocation, radiusInMiles) => {
  // If no search location or radius, don't filter
  if (!searchLocation || !radiusInMiles || radiusInMiles === '0') {
    return true;
  }

  try {
    // Get coordinates for search location using geocoding services
    const searchCoords = await getCoordinates(searchLocation);
    if (!searchCoords) {
      console.log(`⚠️ Could not geocode search location "${searchLocation}", falling back to text matching`);
      // If we can't geocode the search location, fall back to enhanced text matching
      return isLocationTextMatch(property, searchLocation);
    }

    // Get coordinates for property
    const propertyCoords = await getPropertyCoordinates(property);
    if (!propertyCoords) {
      // If we can't geocode the property, fall back to enhanced text matching
      return isLocationTextMatch(property, searchLocation);
    }

    // Calculate geographic distance
    const distance = calculateDistance(
      searchCoords.lat, searchCoords.lng,
      propertyCoords.lat, propertyCoords.lng
    );

    const isWithinRadius = distance <= parseFloat(radiusInMiles);
    
    if (process.env.NODE_ENV === 'development' && isWithinRadius) {
      console.log(`📌 Property ${property.id} found ${distance.toFixed(2)} miles from "${searchLocation}"`);
    }

    return isWithinRadius;

  } catch (error) {
    console.error('Geocoding error:', error);
    // Fall back to enhanced text matching on error
    return isLocationTextMatch(property, searchLocation);
  }
};

/**
 * Enhanced fallback text matching for when geocoding fails
 * Now supports fuzzy matching, case insensitive, partial matches, and special character handling
 * @param {Object} property - Property object
 * @param {string} searchLocation - Search location
 * @returns {boolean}
 */
export const isLocationTextMatch = (property, searchLocation) => {
  if (!searchLocation) return true;
  
  // Get all search variations for flexible matching
  const searchVariations = createSearchVariations(searchLocation);
  const primarySearch = searchVariations[0];
  const searchWords = primarySearch.split(' ').filter(word => word.length > 1);
  
  if (searchWords.length === 0) return true;
  
  // Collect all location-related fields and create variations for each
  const locationFields = [
    property.house_number,
    property.street_name,
    property.address_line1,
    property.address_line2,
    property.city,
    property.state,
    property.county,
    property.region,
    property.zip_code,
    property.postcode
  ].filter(Boolean);

  // Create normalized versions of all property fields
  const normalizedFields = [];
  const fieldVariations = [];
  
  locationFields.forEach(field => {
    const fieldStr = field.toString();
    const fieldNorm = normalizeSearchInput(fieldStr);
    normalizedFields.push(fieldNorm);
    
    // Also create variations for each field
    fieldVariations.push(...createSearchVariations(fieldStr));
  });

  // Join all normalized fields into one searchable text
  const fullLocationText = normalizedFields.join(' ');
  const allFieldVariations = fieldVariations.join(' ');
  
  // Check for various matching patterns with all search variations
  
  for (const searchVariation of searchVariations) {
    const searchVarWords = searchVariation.split(' ').filter(word => word.length > 1);
    
    // 1. Exact phrase match (most specific)
    if (fullLocationText.includes(searchVariation) || allFieldVariations.includes(searchVariation)) {
      return true;
    }
    
    // 2. All search words present (partial match)
    if (searchVarWords.every(word => fullLocationText.includes(word) || allFieldVariations.includes(word))) {
      return true;
    }
    
    // 3. Any individual field contains the search phrase
    if (normalizedFields.some(field => field.includes(searchVariation)) ||
        fieldVariations.some(field => field.includes(searchVariation))) {
      return true;
    }
  }
  
  // 4. Enhanced postcode matching (handles various formats)
  const postcodeFields = [property.postcode, property.zip_code].filter(Boolean);
  if (postcodeFields.length > 0) {
    const searchUpper = searchLocation.trim().toUpperCase().replace(/\s/g, '');
    const searchSpaced = searchLocation.trim().toUpperCase();
    
    for (const pc of postcodeFields) {
      const pcUpper = pc.toUpperCase().replace(/\s/g, '');
      const pcSpaced = pc.toUpperCase();
      
      // Exact match or starts with
      if (pcUpper === searchUpper || pcSpaced === searchSpaced ||
          pcUpper.startsWith(searchUpper) || pcSpaced.startsWith(searchSpaced)) {
        return true;
      }
    }
  }
  
  // 5. Enhanced city/region similarity check
  if (property.city) {
    const cityVariations = createSearchVariations(property.city);
    
    for (const searchVar of searchVariations) {
      for (const cityVar of cityVariations) {
        if (cityVar.includes(searchVar) || searchVar.includes(cityVar)) {
          return true;
        }
      }
    }
  }
  
  // 6. Enhanced street name similarity with abbreviations
  if (property.street_name) {
    const streetVariations = createSearchVariations(property.street_name);
    
    for (const searchVar of searchVariations) {
      const searchVarWords = searchVar.split(' ').filter(word => word.length > 1);
      
      for (const streetVar of streetVariations) {
        // Check if any search word matches part of street name variations
        if (searchVarWords.some(word => 
          streetVar.includes(word) || 
          word.includes(streetVar) ||
          streetVar.split(' ').some(streetWord => streetWord === word)
        )) {
          return true;
        }
      }
    }
  }
  
  return false;
};

/**
 * Batch process properties for radius filtering
 * Enhanced with better error handling and progress tracking
 * @param {Array} properties - Array of properties
 * @param {string} searchLocation - Search location
 * @param {string|number} radiusInMiles - Radius in miles
 * @returns {Promise<Array>} Filtered properties
 */
export const filterPropertiesByRadius = async (properties, searchLocation, radiusInMiles) => {
  if (!searchLocation || !searchLocation.trim()) {
    return properties;
  }

  // Always try geocoding first, fall back to text search if geocoding fails
  if (!radiusInMiles || radiusInMiles === '0') {
    radiusInMiles = '10'; // Default to 10 miles if no radius specified
  }

  const filteredProperties = [];
  const batchSize = 5; // Process in smaller batches to avoid rate limiting
  let processed = 0;

  console.log(`🔍 Starting geocoding search for ${properties.length} properties near "${searchLocation}" within ${radiusInMiles} miles`);

  for (let i = 0; i < properties.length; i += batchSize) {
    const batch = properties.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (property) => {
      try {
        const isWithin = await isPropertyWithinRadius(property, searchLocation, radiusInMiles);
        if (isWithin) {
          return property;
        }
        return null;
      } catch (error) {
        console.error(`Error filtering property ${property.id}:`, error);
        // Include property on error to avoid losing it
        return property;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    filteredProperties.push(...batchResults.filter(Boolean));
    
    processed += batch.length;
    console.log(`Processed ${processed}/${properties.length} properties, found ${filteredProperties.length} matches so far`);

    // Add delay between batches to be respectful to free APIs
    if (i + batchSize < properties.length) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  console.log(`📍 Geocoding search complete: Found ${filteredProperties.length}/${properties.length} properties near "${searchLocation}" within ${radiusInMiles} miles`);
  return filteredProperties;
}; 