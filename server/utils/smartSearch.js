/**
 * Smart Search Utilities for Property Platform
 * Professional-grade search functionality like Rightmove, Zoopla, SpareRoom
 * 
 * Features:
 * - Case insensitive search
 * - Fuzzy matching for addresses
 * - City-only searches
 * - Street name partial matching
 * - Postcode variations
 * - Common abbreviation handling
 * - TYPO TOLERANCE
 * - PROFESSIONAL GEOGRAPHIC SEARCH (NEW!)
 * - ENHANCED INPUT PARSING (NEW!)
 * - MULTI-FORMAT SUPPORT (NEW!)
 */

const https = require('https');
const http = require('http');

/**
 * Calculate Levenshtein distance for fuzzy matching
 * Measures how many single-character edits are needed
 */
const levenshteinDistance = (str1, str2) => {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }
  return matrix[str2.length][str1.length];
};

/**
 * Check if query is similar enough to city name (handles typos)
 * Example: "birminghma" should match "Birmingham"
 */
const isFuzzyMatch = (query, cityName, maxDistance = 2) => {
  const distance = levenshteinDistance(
    query.toLowerCase(),
    cityName.toLowerCase()
  );
  
  // Allow more distance for longer city names
  const tolerance = Math.max(1, Math.floor(cityName.length * 0.2));
  return distance <= Math.min(maxDistance, tolerance);
};

/**
 * Get fuzzy city matches from a list of known cities
 */
const getFuzzyCityMatches = (query, knownCities) => {
  return knownCities.filter(city => 
    isFuzzyMatch(query, city)
  ).sort((a, b) => {
    // Sort by distance - closer matches first
    const distA = levenshteinDistance(query.toLowerCase(), a.toLowerCase());
    const distB = levenshteinDistance(query.toLowerCase(), b.toLowerCase());
    return distA - distB;
  });
};

/**
 * Normalize search text for better matching
 * Handles case, spaces, punctuation, and common variations
 */
const normalizeSearchText = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .trim()
    // Remove/normalize common punctuation
    .replace(/[''`]/g, '') // Remove apostrophes (St. Mary's → st marys)
    .replace(/[-–—]/g, ' ') // Replace hyphens with spaces
    .replace(/[.,!?;:]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Multiple spaces → single space
    .replace(/\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|close|cl|court|ct|place|pl)\b/g, (match) => {
      // Normalize street suffixes
      const streetMap = {
        'street': 'st', 'road': 'rd', 'avenue': 'ave', 'lane': 'ln',
        'drive': 'dr', 'close': 'cl', 'court': 'ct', 'place': 'pl'
      };
      return streetMap[match] || match;
    });
};

/**
 * Generate search variations for better matching
 * Handles different ways users might type the same thing
 */
const generateSearchVariations = (query) => {
  const normalized = normalizeSearchText(query);
  const variations = [normalized];
  
  // Add original query
  if (query !== normalized) {
    variations.push(query.toLowerCase().trim());
  }
  
  // Add space variations
  variations.push(normalized.replace(/\s+/g, ''));
  
  // Add common city abbreviations
  const cityAbbreviations = {
    'bham': 'birmingham',
    'manc': 'manchester', 
    'lon': 'london',
    'liv': 'liverpool',
    'leeds': 'leeds',
    'sheff': 'sheffield'
  };
  
  Object.entries(cityAbbreviations).forEach(([abbr, full]) => {
    if (normalized.includes(abbr)) {
      variations.push(normalized.replace(abbr, full));
    }
    if (normalized.includes(full)) {
      variations.push(normalized.replace(full, abbr));
    }
  });
  
  return [...new Set(variations)]; // Remove duplicates
};

/**
 * Enhanced search with fuzzy matching for typos
 * Professional-grade search that handles user mistakes
 */
const createSmartSearchCondition = (query, knownCities = []) => {
  const normalizedQuery = normalizeSearchText(query);
  const variations = generateSearchVariations(query);
  
  // Check for fuzzy city matches (handle typos)
  const fuzzyCityMatches = getFuzzyCityMatches(normalizedQuery, knownCities);
  
  return {
    exactQuery: query.trim(),
    normalizedQuery,
    variations,
    fuzzyCityMatches,
    shouldUseFuzzy: fuzzyCityMatches.length > 0
  };
};

/**
 * Detect if search query is likely a postcode
 */
const isPostcodePattern = (input) => {
  if (!input || typeof input !== 'string') return false;
  
  const cleaned = input.replace(/\s/g, '').toUpperCase();
  
  // UK postcode patterns - more flexible to handle real-world formats
  // Full postcodes: B46GE, B4 6GE, SW1A 1AA, etc.
  const ukFullPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/;
  // Partial postcodes: B4, B46, SW1A, etc.
  const ukPartialPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;
  // Additional flexible pattern for postcodes like B46GE
  const ukFlexiblePostcodeRegex = /^[A-Z]{1,2}[0-9]{1,2}[A-Z]{0,2}[0-9]?[A-Z]{0,2}$/;
  
  // US ZIP code patterns
  const usZipRegex = /^[0-9]{5}(-[0-9]{4})?$/;
  
  return ukFullPostcodeRegex.test(input) || 
         ukPartialPostcodeRegex.test(cleaned) || 
         ukFlexiblePostcodeRegex.test(cleaned) ||
         usZipRegex.test(cleaned);
};

/**
 * Detect if search query is likely a city name
 */
const isCityPattern = (input) => {
  if (!input || typeof input !== 'string') return false;
  
  const normalized = normalizeSearchText(input);
  
  // Single word or two words (likely city name)
  const wordCount = normalized.split(' ').length;
  
  // Common city indicators
  const cityIndicators = [
    'city', 'town', 'village', 'borough', 'district', 'area',
    'upon', 'under', 'super', 'magna', 'parva', 'green', 'common'
  ];
  
  const hasIndicators = cityIndicators.some(indicator => 
    normalized.includes(indicator)
  );
  
  // If it's 1-3 words and contains no numbers, likely a city
  return (wordCount >= 1 && wordCount <= 3 && !/\d/.test(normalized)) || hasIndicators;
};

/**
 * Detect if search query is likely a street name
 */
const isStreetPattern = (input) => {
  if (!input || typeof input !== 'string') return false;
  
  const normalized = normalizeSearchText(input);
  
  // Common street suffixes
  const streetSuffixes = [
    'street', 'road', 'avenue', 'drive', 'lane', 'place', 'court',
    'park', 'square', 'close', 'grove', 'way', 'walk', 'terrace',
    'circle', 'boulevard', 'crescent', 'gardens', 'mews', 'row',
    'st', 'rd', 'ave', 'dr', 'ln', 'pl', 'ct', 'pk', 'sq', 'cl',
    'grv', 'terr', 'circ', 'blvd', 'cres', 'gdns'
  ];
  
  return streetSuffixes.some(suffix => 
    normalized.includes(` ${suffix}`) || normalized.endsWith(suffix)
  );
};

/**
 * Generate SQL search conditions based on search type
 */
const generateSearchConditions = (query, paramIndex) => {
  if (!query) return { condition: '', params: [] };
  
  const normalized = normalizeSearchText(query);
  const variations = generateSearchVariations(query);
  
  let conditions = [];
  let params = [];
  
  if (isPostcodePattern(query)) {
    // Postcode search - prioritize exact postcode matches
    conditions.push(`REPLACE(REPLACE(p.zip_code, ' ', ''), '-', '') ILIKE REPLACE(REPLACE($${paramIndex}, ' ', ''), '-', '')`);
    params.push(normalized);
  } else if (isCityPattern(query)) {
    // City search - prioritize exact city matches
    conditions.push(`LOWER(p.city) = LOWER($${paramIndex})`);
    conditions.push(`p.city ILIKE $${paramIndex + 1}`);
    conditions.push(`p.state ILIKE $${paramIndex + 1}`);
    params.push(query.trim(), `%${normalized}%`);
  } else if (isStreetPattern(query)) {
    // Street search - prioritize street name matches
    conditions.push(`p.street_name ILIKE $${paramIndex}`);
    conditions.push(`p.address_line1 ILIKE $${paramIndex}`);
    params.push(`%${normalized}%`);
  } else {
    // General search - try all fields
    conditions.push(`p.city ILIKE $${paramIndex}`);
    conditions.push(`p.street_name ILIKE $${paramIndex}`);
    conditions.push(`p.address_line1 ILIKE $${paramIndex}`);
    conditions.push(`p.title ILIKE $${paramIndex}`);
    params.push(`%${normalized}%`);
  }
  
  return {
    condition: `(${conditions.join(' OR ')})`,
    params
  };
};

/**
 * Calculate search ranking score
 */
const calculateSearchRank = (searchQuery, property) => {
  if (!searchQuery || !property) return 0;
  
  const normalized = normalizeSearchText(searchQuery);
  const lowerQuery = searchQuery.toLowerCase();
  
  let score = 0;
  
  // Exact city match (highest priority)
  if (property.city && property.city.toLowerCase() === lowerQuery) {
    score += 100;
  }
  
  // City starts with search
  if (property.city && property.city.toLowerCase().startsWith(lowerQuery)) {
    score += 90;
  }
  
  // Street name match
  if (property.street_name && property.street_name.toLowerCase().includes(normalized)) {
    score += 80;
  }
  
  // Address line match
  if (property.address_line1 && property.address_line1.toLowerCase().includes(normalized)) {
    score += 70;
  }
  
  // Postcode match
  if (property.zip_code && property.zip_code.toLowerCase().includes(normalized)) {
    score += 70;
  }
  
  // State/region match
  if (property.state && property.state.toLowerCase().includes(normalized)) {
    score += 60;
  }
  
  // Title match
  if (property.title && property.title.toLowerCase().includes(normalized)) {
    score += 40;
  }
  
  // Description match (lowest priority)
  if (property.description && property.description.toLowerCase().includes(normalized)) {
    score += 20;
  }
  
  return score;
};

/**
 * Extract location components from search query
 * Useful for understanding what the user is searching for
 */
const parseSearchQuery = (query) => {
  if (!query || typeof query !== 'string') {
    return {
      type: 'unknown',
      components: {},
      confidence: 0
    };
  }
  
  const normalized = normalizeSearchText(query);
  
  if (isPostcodePattern(query)) {
    return {
      type: 'postcode',
      components: { postcode: query.trim() },
      confidence: 0.9
    };
  }
  
  if (isCityPattern(query)) {
    return {
      type: 'city',
      components: { city: query.trim() },
      confidence: 0.8
    };
  }
  
  if (isStreetPattern(query)) {
    return {
      type: 'street',
      components: { street: query.trim() },
      confidence: 0.7
    };
  }
  
  return {
    type: 'general',
    components: { text: query.trim() },
    confidence: 0.5
  };
};

/**
 * Enhanced Input Parsing for Multiple Location Formats
 * Handles: postcodes, cities, streets, areas, mixed inputs, reverse formats
 */
const parseLocationInput = (input) => {
  if (!input || typeof input !== 'string') {
    return { type: 'unknown', components: [], confidence: 0 };
  }

  const cleaned = input.trim().toLowerCase();
  const original = input.trim();
  
  // UK Postcode patterns (comprehensive)
  const fullPostcodeRegex = /\b([a-z]{1,2}[0-9][a-z0-9]?\s*[0-9][a-z]{2})\b/i;
  const partialPostcodeRegex = /\b([a-z]{1,2}[0-9][a-z0-9]?)\b/i;
  
  // Enhanced postcode detection with location
  const postcodeMatch = original.match(fullPostcodeRegex);
  if (postcodeMatch) {
    const postcode = postcodeMatch[1].replace(/\s/g, '').toUpperCase();
    const remaining = original.replace(postcodeMatch[0], '').trim();
    
    return {
      type: 'postcode_with_location',
      postcode: postcode,
      location: remaining,
      components: [postcode, remaining].filter(Boolean),
      confidence: 0.95,
      searchStrategy: 'postcode_primary'
    };
  }

  // Partial postcode detection
  const partialMatch = original.match(partialPostcodeRegex);
  if (partialMatch && !cleaned.includes('road') && !cleaned.includes('street') && !cleaned.includes('avenue')) {
    return {
      type: 'partial_postcode',
      postcode: partialMatch[1].toUpperCase(),
      components: [partialMatch[1]],
      confidence: 0.8,
      searchStrategy: 'postcode_area'
    };
  }

  // Street patterns with enhanced detection
  const streetIndicators = ['road', 'street', 'st', 'avenue', 'ave', 'lane', 'ln', 'drive', 'dr', 'close', 'cl', 'way', 'court', 'ct', 'place', 'pl', 'crescent', 'grove', 'gardens', 'park', 'square', 'terrace'];
  const hasStreetIndicator = streetIndicators.some(indicator => cleaned.includes(indicator));
  
  if (hasStreetIndicator) {
    // Parse street + area combinations
    const parts = original.split(/[,\s]+/).filter(Boolean);
    const streetPart = parts.find(part => 
      streetIndicators.some(indicator => part.toLowerCase().includes(indicator))
    );
    
    return {
      type: 'street_with_area',
      street: streetPart || parts[0],
      area: parts.filter(p => p !== streetPart).join(' '),
      components: parts,
      fullAddress: original,
      confidence: 0.85,
      searchStrategy: 'street_geographic'
    };
  }

  // Enhanced city detection with common UK cities
  const ukCities = [
    'london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 
    'bristol', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford', 
    'stoke', 'wolverhampton', 'plymouth', 'derby', 'southampton', 'portsmouth',
    'brighton', 'reading', 'northampton', 'luton', 'warrington', 'bournemouth',
    'peterborough', 'cambridge', 'oxford', 'york', 'carlisle', 'preston',
    'chester', 'gloucester', 'worcester', 'exeter', 'bath', 'salisbury'
  ];
  
  // Check for city matches (case insensitive)
  const cityMatch = ukCities.find(city => {
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    return cityRegex.test(cleaned);
  });
  
  if (cityMatch) {
    const cityRegex = new RegExp(`\\b${cityMatch}\\b`, 'i');
    const remaining = original.replace(cityRegex, '').trim().replace(/^,\s*|,\s*$/, '');
    
    return {
      type: 'city_with_area',
      city: cityMatch,
      area: remaining,
      components: [cityMatch, remaining].filter(Boolean),
      confidence: 0.9,
      searchStrategy: 'city_geographic'
    };
  }

  // Area/suburb detection (common London areas, Birmingham areas, etc.)
  const commonAreas = [
    'finchley', 'hampstead', 'islington', 'camden', 'chelsea', 'kensington', 'paddington',
    'shoreditch', 'hoxton', 'dalston', 'hackney', 'stratford', 'canary wharf', 'greenwich',
    'richmond', 'wimbledon', 'putney', 'clapham', 'brixton', 'streatham', 'croydon',
    'ealing', 'acton', 'harrow', 'wembley', 'barnet', 'enfield', 'edmonton',
    // Birmingham areas
    'erdington', 'handsworth', 'aston', 'saltley', 'small heath', 'sparkbrook', 'moseley',
    'kings heath', 'bournville', 'selly oak', 'edgbaston', 'harborne', 'quinton',
    // Manchester areas
    'didsbury', 'chorlton', 'fallowfield', 'rusholme', 'withington', 'burnage', 'gorton'
  ];
  
  const areaMatch = commonAreas.find(area => cleaned.includes(area));
  if (areaMatch) {
    return {
      type: 'known_area',
      area: areaMatch,
      location: original,
      components: [areaMatch],
      confidence: 0.8,
      searchStrategy: 'area_geographic'
    };
  }

  // Mixed format detection (reverse order handling)
  const words = original.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    // Check for reverse format: "Manchester M1" or "Birmingham Stone Road"
    const lastWord = words[words.length - 1].toLowerCase();
    const firstWords = words.slice(0, -1).join(' ').toLowerCase();
    
    // Check if last word is a postcode area
    if (partialPostcodeRegex.test(lastWord)) {
      return {
        type: 'reverse_city_postcode',
        city: firstWords,
        postcodeArea: lastWord.toUpperCase(),
        components: [firstWords, lastWord],
        confidence: 0.75,
        searchStrategy: 'mixed_geographic'
      };
    }
    
    // Check if first word is a city and rest is area/street
    if (ukCities.includes(firstWords) || commonAreas.includes(firstWords)) {
      return {
        type: 'reverse_location_area',
        location: firstWords,
        area: words.slice(1).join(' '),
        components: words,
        confidence: 0.75,
        searchStrategy: 'mixed_geographic'
      };
    }
  }

  // Default to general location with smart analysis
  return {
    type: 'general_location',
    location: original,
    components: [original],
    confidence: 0.6,
    searchStrategy: 'text_fuzzy'
  };
};

/**
 * Enhanced Multi-API Geocoding with Fallback Strategy
 */
const geocodeLocationEnhanced = async (location, parsedInput = null) => {
  if (!location || typeof location !== 'string') {
    return null;
  }

  const parsed = parsedInput || parseLocationInput(location);
  console.log(`🔍 Enhanced Geocoding Analysis: ${JSON.stringify(parsed)}`);

  try {
    // Strategy 1: UK Postcodes API (best for UK postcodes and places)
    if (parsed.type.includes('postcode') || parsed.searchStrategy === 'postcode_primary') {
      const postcodeResult = await geocodeWithUKPostcodes(parsed.postcode || location);
      if (postcodeResult) {
        console.log(`✅ UK Postcodes API success: ${postcodeResult.display_name}`);
        return postcodeResult;
      }
    }

    // Strategy 2: UK Places API (best for cities and known areas)
    if (['city_with_area', 'known_area', 'area_geographic'].includes(parsed.searchStrategy)) {
      const placesResult = await geocodeWithUKPlaces(parsed.city || parsed.area || location);
      if (placesResult) {
        console.log(`✅ UK Places API success: ${placesResult.display_name}`);
        return placesResult;
      }
    }

    // Strategy 3: Enhanced Nominatim with UK focus
    const nominatimResult = await geocodeWithNominatimEnhanced(location, parsed);
    if (nominatimResult) {
      console.log(`✅ Enhanced Nominatim success: ${nominatimResult.display_name}`);
      return nominatimResult;
    }

    // Strategy 4: Fallback to original geocoding
    const originalResult = await geocodeWithNominatim(location);
    if (originalResult) {
      console.log(`✅ Original Nominatim fallback: ${originalResult.display_name}`);
      return originalResult;
    }

    // Strategy 5: Custom fallback database
    const fallbackResult = getFallbackCoordinates(location, parsed);
    if (fallbackResult) {
      console.log(`✅ Fallback database: ${fallbackResult.display_name}`);
      return fallbackResult;
    }

    console.log(`⚠️ No geocoding result for: "${location}"`);
    return null;

  } catch (error) {
    console.error(`❌ Enhanced geocoding error for "${location}":`, error.message);
    return null;
  }
};

/**
 * UK Postcodes API Integration
 */
const geocodeWithUKPostcodes = async (postcode) => {
  return new Promise((resolve, reject) => {
    const cleanPostcode = postcode.replace(/\s/g, '').toUpperCase();
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(cleanPostcode)}`;
    
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.status === 200 && result.result) {
            const postcodeData = result.result;
            resolve({
              lat: postcodeData.latitude,
              lng: postcodeData.longitude,
              display_name: `${postcodeData.postcode}, ${postcodeData.admin_district}, ${postcodeData.country}`,
              confidence: 0.95,
              source: 'uk_postcodes_api'
            });
          } else {
            resolve(null);
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
    
    request.on('error', (error) => {
      resolve(null); // Don't reject, just return null for fallback
    });
    
    request.setTimeout(3000, () => {
      request.destroy();
      resolve(null);
    });
  });
};

/**
 * UK Places API Integration
 */
const geocodeWithUKPlaces = async (placeName) => {
  return new Promise((resolve, reject) => {
    const url = `https://api.postcodes.io/places?q=${encodeURIComponent(placeName)}&limit=1`;
    
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.status === 200 && result.result && result.result.length > 0) {
            const place = result.result[0];
            resolve({
              lat: parseFloat(place.latitude),
              lng: parseFloat(place.longitude),
              display_name: `${place.name_1}, ${place.admin_county || place.admin_district}, UK`,
              confidence: 0.9,
              source: 'uk_places_api'
            });
          } else {
            resolve(null);
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
    
    request.on('error', (error) => {
      resolve(null);
    });
    
    request.setTimeout(3000, () => {
      request.destroy();
      resolve(null);
    });
  });
};

/**
 * Enhanced Nominatim with better UK handling
 */
const geocodeWithNominatimEnhanced = async (location, parsedInput) => {
  return new Promise((resolve, reject) => {
    // Build smarter query based on parsed input
    let searchQuery = location;
    
    if (parsedInput.type === 'street_with_area' && parsedInput.area) {
      searchQuery = `${parsedInput.street}, ${parsedInput.area}, UK`;
    } else if (parsedInput.type === 'city_with_area' && parsedInput.area) {
      searchQuery = `${parsedInput.area}, ${parsedInput.city}, UK`;
    } else {
      searchQuery = `${location}, UK`;
    }
    
    const encodedLocation = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1&countrycodes=gb&addressdetails=1`;
    
    const request = https.get(url, {
      headers: {
        'User-Agent': 'PropertyPlatform/2.0 Enhanced'
      }
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            const result = results[0];
            resolve({
              lat: parseFloat(result.lat),
              lng: parseFloat(result.lon),
              display_name: result.display_name,
              confidence: 0.8,
              source: 'nominatim_enhanced'
            });
          } else {
            resolve(null);
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
    
    request.on('error', (error) => {
      resolve(null);
    });
    
    request.setTimeout(5000, () => {
      request.destroy();
      resolve(null);
    });
  });
};

/**
 * Geocode using OpenStreetMap Nominatim (free, no API key needed)
 * Original function kept for fallback
 */
const geocodeWithNominatim = (location) => {
  return new Promise((resolve, reject) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1&countrycodes=gb,us`;
    
    const request = https.get(url, {
      headers: {
        'User-Agent': 'PropertyPlatform/1.0'
      }
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            const result = results[0];
            resolve({
              lat: parseFloat(result.lat),
              lng: parseFloat(result.lon),
              display_name: result.display_name
            });
          } else {
            resolve(null);
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('Geocoding timeout'));
    });
  });
};

/**
 * Fallback geocoding using LocationIQ (backup service)
 */
const geocodeWithLocationIQ = (location) => {
  return new Promise((resolve, reject) => {
    // Only use if API key is provided in environment
    if (!process.env.LOCATIONIQ_API_KEY) {
      resolve(null);
      return;
    }

    const encodedLocation = encodeURIComponent(location);
    const url = `https://us1.locationiq.com/v1/search.php?key=${process.env.LOCATIONIQ_API_KEY}&q=${encodedLocation}&format=json&limit=1`;
    
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            const result = results[0];
            resolve({
              lat: parseFloat(result.lat),
              lng: parseFloat(result.lon),
              display_name: result.display_name
            });
          } else {
            resolve(null);
          }
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
    
    request.on('error', (error) => {
      reject(error);
    });
    
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('LocationIQ timeout'));
    });
  });
};

/**
 * Custom Fallback Database for Common UK Locations
 */
const getFallbackCoordinates = (location, parsedInput) => {
  const cleaned = location.toLowerCase().trim();
  
  // Extended fallback database
  const fallbackDB = {
    // Major cities
    'london': { lat: 51.5074, lng: -0.1278, name: 'London, England, UK' },
    'birmingham': { lat: 52.4862, lng: -1.8904, name: 'Birmingham, England, UK' },
    'manchester': { lat: 53.4808, lng: -2.2426, name: 'Manchester, England, UK' },
    'liverpool': { lat: 53.4084, lng: -2.9916, name: 'Liverpool, England, UK' },
    'leeds': { lat: 53.8008, lng: -1.5491, name: 'Leeds, England, UK' },
    
    // London areas
    'finchley': { lat: 51.5958, lng: -0.1883, name: 'Finchley, London, UK' },
    'north finchley': { lat: 51.6130, lng: -0.1772, name: 'North Finchley, London, UK' },
    'hampstead': { lat: 51.5581, lng: -0.1755, name: 'Hampstead, London, UK' },
    'islington': { lat: 51.5362, lng: -0.1034, name: 'Islington, London, UK' },
    'camden': { lat: 51.5392, lng: -0.1426, name: 'Camden, London, UK' },
    
    // Birmingham areas
    'erdington': { lat: 52.5292, lng: -1.8441, name: 'Erdington, Birmingham, UK' },
    'handsworth': { lat: 52.5184, lng: -1.9286, name: 'Handsworth, Birmingham, UK' },
    'edgbaston': { lat: 52.4539, lng: -1.9248, name: 'Edgbaston, Birmingham, UK' },
    
    // Common postcodes
    'b15': { lat: 52.4539, lng: -1.8909, name: 'B15 Area, Birmingham, UK' },
    'b4': { lat: 52.4796, lng: -1.9026, name: 'B4 Area, Birmingham, UK' },
    'm1': { lat: 53.4808, lng: -2.2426, name: 'M1 Area, Manchester, UK' },
    'sw1': { lat: 51.4975, lng: -0.1357, name: 'SW1 Area, London, UK' },
    
    // Stone Road specific
    'stone road': { lat: 52.4539, lng: -1.8909, name: 'Stone Road, Birmingham, UK' },
    'stone road birmingham': { lat: 52.4539, lng: -1.8909, name: 'Stone Road, Birmingham, UK' },
    'birmingham stone road': { lat: 52.4539, lng: -1.8909, name: 'Stone Road, Birmingham, UK' },
  };
  
  // Check for exact matches
  if (fallbackDB[cleaned]) {
    const coords = fallbackDB[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.7,
      source: 'fallback_database'
    };
  }
  
  // Check for partial matches
  for (const [key, coords] of Object.entries(fallbackDB)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        display_name: coords.name,
        confidence: 0.6,
        source: 'fallback_database_partial'
      };
    }
  }
  
  return null;
};

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in miles
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees) => degrees * (Math.PI / 180);

/**
 * Professional Geographic Search Analysis
 * Determines if we should use geographic or text-based search
 * Like how Rightmove/Zoopla intelligently handle searches
 */
const analyzeSearchType = async (query, knownCities = []) => {
  const normalizedQuery = normalizeSearchText(query);
  
  // Professional search strategy:
  // 1. Try to geocode the location first
  // 2. If successful, use geographic search (like pro sites)
  // 3. If failed, fall back to text search with fuzzy matching
  
  console.log(`🔍 Analyzing search type for: "${query}"`);
  
  // Try geocoding (this is what makes us professional)
  const coordinates = await geocodeLocationEnhanced(query);
  
  if (coordinates) {
    console.log(`✅ Geographic search mode: Found coordinates for "${query}"`);
    return {
      searchMode: 'geographic',
      coordinates,
      originalQuery: query,
      normalizedQuery,
      shouldUseGeographic: true,
      shouldUseText: false
    };
  }
  
  // Fall back to smart text search with fuzzy matching
  console.log(`📝 Text search mode: No coordinates found for "${query}", using smart text matching`);
  const fuzzyCityMatches = getFuzzyCityMatches(normalizedQuery, knownCities);
  
  return {
    searchMode: 'text',
    coordinates: null,
    originalQuery: query,
    normalizedQuery,
    variations: generateSearchVariations(query),
    fuzzyCityMatches,
    shouldUseGeographic: false,
    shouldUseText: true,
    shouldUseFuzzy: fuzzyCityMatches.length > 0
  };
};

module.exports = {
  normalizeSearchText,
  generateSearchVariations,
  createSmartSearchCondition,
  isFuzzyMatch,
  getFuzzyCityMatches,
  levenshteinDistance,
  isPostcodePattern,
  isCityPattern,
  isStreetPattern,
  generateSearchConditions,
  calculateSearchRank,
  parseSearchQuery,
  parseLocationInput,
  geocodeLocationEnhanced,
  geocodeWithUKPostcodes,
  geocodeWithUKPlaces,
  geocodeWithNominatimEnhanced,
  getFallbackCoordinates,
  geocodeLocation: geocodeLocationEnhanced, // Alias for backwards compatibility
  geocodeWithNominatim, // Keep original for fallback
  geocodeWithLocationIQ, // Keep original for fallback
  calculateDistance,
  analyzeSearchType
}; 