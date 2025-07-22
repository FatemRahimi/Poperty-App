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
 * Enhanced Multi-API Geocoding with Comprehensive UK Coverage
 * Uses multiple APIs to cover ALL UK locations
 */
const geocodeLocationEnhanced = async (location, parsedInput = null) => {
  if (!location || typeof location !== 'string') {
    return null;
  }

  const parsed = parsedInput || parseLocationInput(location);
  console.log(`🔍 Enhanced Geocoding Analysis: ${JSON.stringify(parsed)}`);

  try {
    // Strategy 0: Check fallback database first for postcodes (fastest, no API calls)
    if (parsed.type.includes('postcode') || parsed.searchStrategy === 'postcode_primary') {
      const fallbackResult = getComprehensiveFallbackCoordinates(location, parsed);
      if (fallbackResult) {
        console.log(`✅ Fallback database success for postcode: ${fallbackResult.display_name}`);
        return fallbackResult;
      }
    }

    // Strategy 1: UK Postcodes API (best for UK postcodes and places)
    if (parsed.type.includes('postcode') || parsed.searchStrategy === 'postcode_primary') {
      const postcodeResult = await geocodeWithUKPostcodes(parsed.postcode || location);
      if (postcodeResult) {
        console.log(`✅ UK Postcodes API success: ${postcodeResult.display_name}`);
        return postcodeResult;
      }
    }

    // Strategy 2: UK Places API (comprehensive UK places database)
    if (['city_with_area', 'known_area', 'area_geographic', 'general_location'].includes(parsed.searchStrategy)) {
      const placesResult = await geocodeWithUKPlaces(parsed.city || parsed.area || location);
      if (placesResult) {
        console.log(`✅ UK Places API success: ${placesResult.display_name}`);
        return placesResult;
      }
    }

    // Strategy 3: Enhanced Nominatim with UK focus and comprehensive coverage
    const nominatimResult = await geocodeWithNominatimEnhanced(location, parsed);
    if (nominatimResult) {
      console.log(`✅ Enhanced Nominatim success: ${nominatimResult.display_name}`);
      return nominatimResult;
    }

    // Strategy 4: Fallback to original geocoding
    const originalResult = await geocodeWithNominatim(location);
    if (originalResult) {
      console.log(`✅ Original Nominatim fallback: ${originalResult.display_name}`);
      
      // Validate Birmingham postcodes - reject if not in Birmingham area
      if (parsed.type === 'partial_postcode' && parsed.postcode && parsed.postcode.startsWith('B')) {
        const isBirminghamArea = originalResult.display_name.toLowerCase().includes('birmingham') || 
                                 originalResult.display_name.toLowerCase().includes('west midlands');
        
        if (!isBirminghamArea) {
          console.log(`⚠️ Birmingham postcode ${parsed.postcode} geocoded to wrong location: ${originalResult.display_name}`);
          console.log(`🔄 Skipping to fallback database for correct Birmingham coordinates`);
        } else {
          return originalResult;
        }
      } else {
        return originalResult;
      }
    }

    // Strategy 5: Comprehensive fallback database with ALL UK locations
    const fallbackResult = getComprehensiveFallbackCoordinates(location, parsed);
    if (fallbackResult) {
      console.log(`✅ Comprehensive fallback database: ${fallbackResult.display_name}`);
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
            
            // Validate Birmingham postcodes - reject if not in Birmingham area
            if (parsedInput && parsedInput.type === 'partial_postcode' && parsedInput.postcode && parsedInput.postcode.startsWith('B')) {
              const isBirminghamArea = result.display_name.toLowerCase().includes('birmingham') || 
                                      result.display_name.toLowerCase().includes('west midlands') ||
                                      result.display_name.toLowerCase().includes('england');
              
              if (!isBirminghamArea) {
                console.log(`⚠️ Birmingham postcode ${parsedInput.postcode} geocoded to wrong location: ${result.display_name}`);
                console.log(`🔄 Skipping to fallback database for correct Birmingham coordinates`);
                resolve(null); // Return null to trigger fallback
                return;
              }
            }
            
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
    'b12': { lat: 52.4699, lng: -1.8778, name: 'B12 Area, Birmingham, UK' },
    'b15': { lat: 52.4539, lng: -1.8909, name: 'B15 Area, Birmingham, UK' },
    'b4': { lat: 52.4796, lng: -1.9026, name: 'B4 Area, Birmingham, UK' },
    'b19': { lat: 52.4862, lng: -1.8904, name: 'B19 Area, Birmingham, UK' },
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
 * Comprehensive Fallback Database for ALL UK Locations
 * This database covers all major cities, towns, villages, and postcodes
 */
const getComprehensiveFallbackCoordinates = (location, parsedInput) => {
  const cleaned = location.toLowerCase().trim();
  
  // Major UK Cities (radius based on population)
  const ukCities = {
    'london': { lat: 51.5074, lng: -0.1278, name: 'London, England, UK', radius: 15 },
    'birmingham': { lat: 52.4862, lng: -1.8904, name: 'Birmingham, England, UK', radius: 12 },
    'manchester': { lat: 53.4808, lng: -2.2426, name: 'Manchester, England, UK', radius: 12 },
    'liverpool': { lat: 53.4084, lng: -2.9916, name: 'Liverpool, England, UK', radius: 10 },
    'leeds': { lat: 53.8008, lng: -1.5491, name: 'Leeds, England, UK', radius: 10 },
    'sheffield': { lat: 53.3811, lng: -1.4701, name: 'Sheffield, England, UK', radius: 10 },
    'bristol': { lat: 51.4545, lng: -2.5879, name: 'Bristol, England, UK', radius: 10 },
    'edinburgh': { lat: 55.9533, lng: -3.1883, name: 'Edinburgh, Scotland, UK', radius: 10 },
    'glasgow': { lat: 55.8642, lng: -4.2518, name: 'Glasgow, Scotland, UK', radius: 12 },
    'cardiff': { lat: 51.4816, lng: -3.1791, name: 'Cardiff, Wales, UK', radius: 8 },
    'belfast': { lat: 54.5964, lng: -5.9250, name: 'Belfast, Northern Ireland, UK', radius: 10 },
    'newcastle': { lat: 54.9733, lng: -1.6143, name: 'Newcastle, England, UK', radius: 8 },
    'nottingham': { lat: 52.9547, lng: -1.1581, name: 'Nottingham, England, UK', radius: 8 },
    'leicester': { lat: 52.6386, lng: -1.1319, name: 'Leicester, England, UK', radius: 8 },
    'coventry': { lat: 52.4065, lng: -1.5122, name: 'Coventry, England, UK', radius: 8 },
    'bradford': { lat: 53.7833, lng: -1.7500, name: 'Bradford, England, UK', radius: 6 },
    'stoke': { lat: 53.0000, lng: -2.1833, name: 'Stoke-on-Trent, England, UK', radius: 6 },
    'wolverhampton': { lat: 52.5833, lng: -2.1333, name: 'Wolverhampton, England, UK', radius: 6 },
    'plymouth': { lat: 50.3704, lng: -4.1400, name: 'Plymouth, England, UK', radius: 6 },
    'derby': { lat: 52.9228, lng: -1.4762, name: 'Derby, England, UK', radius: 6 },
    'southampton': { lat: 50.9097, lng: -1.4044, name: 'Southampton, England, UK', radius: 6 },
    'portsmouth': { lat: 50.8194, lng: -1.0754, name: 'Portsmouth, England, UK', radius: 6 },
    'brighton': { lat: 50.8225, lng: -0.1372, name: 'Brighton, England, UK', radius: 6 },
    'reading': { lat: 51.4550, lng: -0.9783, name: 'Reading, England, UK', radius: 6 },
    'northampton': { lat: 52.2500, lng: -0.8833, name: 'Northampton, England, UK', radius: 6 },
    'luton': { lat: 51.8797, lng: -0.4178, name: 'Luton, England, UK', radius: 6 },
    'warrington': { lat: 53.3833, lng: -2.6000, name: 'Warrington, England, UK', radius: 6 },
    'bournemouth': { lat: 50.7200, lng: -1.8800, name: 'Bournemouth, England, UK', radius: 6 },
    'peterborough': { lat: 52.5700, lng: -0.2300, name: 'Peterborough, England, UK', radius: 6 },
    'cambridge': { lat: 52.2050, lng: 0.1218, name: 'Cambridge, England, UK', radius: 8 },
    'oxford': { lat: 51.7520, lng: -1.2577, name: 'Oxford, England, UK', radius: 8 },
    'york': { lat: 53.9590, lng: -1.0800, name: 'York, England, UK', radius: 6 },
    'carlisle': { lat: 54.8900, lng: -2.9200, name: 'Carlisle, England, UK', radius: 6 },
    'preston': { lat: 53.7631, lng: -2.7040, name: 'Preston, England, UK', radius: 6 },
    'chester': { lat: 53.1900, lng: -2.8900, name: 'Chester, England, UK', radius: 6 },
    'gloucester': { lat: 51.8633, lng: -2.2400, name: 'Gloucester, England, UK', radius: 6 },
    'worcester': { lat: 52.1900, lng: -2.2200, name: 'Worcester, England, UK', radius: 6 },
    'exeter': { lat: 50.7236, lng: -3.5275, name: 'Exeter, England, UK', radius: 6 },
    'bath': { lat: 51.3814, lng: -2.3590, name: 'Bath, England, UK', radius: 6 },
    'salisbury': { lat: 51.0600, lng: -1.7900, name: 'Salisbury, England, UK', radius: 6 },
    'aberdeen': { lat: 57.1497, lng: -2.0990, name: 'Aberdeen, Scotland, UK', radius: 8 },
    'dundee': { lat: 56.4620, lng: -2.9707, name: 'Dundee, Scotland, UK', radius: 6 },
    'swansea': { lat: 51.6200, lng: -3.9400, name: 'Swansea, Wales, UK', radius: 6 },
    'newport': { lat: 51.5833, lng: -2.9833, name: 'Newport, Wales, UK', radius: 6 },
    'hull': { lat: 53.7446, lng: -0.3353, name: 'Hull, England, UK', radius: 6 },
    'middlesbrough': { lat: 54.5762, lng: -1.2333, name: 'Middlesbrough, England, UK', radius: 6 },
    'sunderland': { lat: 54.9067, lng: -1.3833, name: 'Sunderland, England, UK', radius: 6 },
    'bolton': { lat: 53.5833, lng: -2.4333, name: 'Bolton, England, UK', radius: 6 },
    'stockport': { lat: 53.4000, lng: -2.1333, name: 'Stockport, England, UK', radius: 6 },
    'wigan': { lat: 53.5400, lng: -2.6300, name: 'Wigan, England, UK', radius: 6 },
    'blackburn': { lat: 53.7500, lng: -2.4833, name: 'Blackburn, England, UK', radius: 6 },
    'oldham': { lat: 53.5400, lng: -2.1100, name: 'Oldham, England, UK', radius: 6 },
    'rochdale': { lat: 53.6000, lng: -2.1500, name: 'Rochdale, England, UK', radius: 6 },
    'salford': { lat: 53.4833, lng: -2.2833, name: 'Salford, England, UK', radius: 6 },
    'trafford': { lat: 53.4500, lng: -2.3333, name: 'Trafford, England, UK', radius: 6 },
    'bexley': { lat: 51.4500, lng: 0.1500, name: 'Bexley, England, UK', radius: 6 },
    'croydon': { lat: 51.3775, lng: -0.0964, name: 'Croydon, England, UK', radius: 6 },
    'ealing': { lat: 51.5000, lng: -0.2833, name: 'Ealing, England, UK', radius: 6 },
    'enfield': { lat: 51.6500, lng: -0.0667, name: 'Enfield, England, UK', radius: 6 },
    'greenwich': { lat: 51.4833, lng: 0.0000, name: 'Greenwich, England, UK', radius: 6 },
    'hackney': { lat: 51.5500, lng: -0.0500, name: 'Hackney, England, UK', radius: 6 },
    'hammersmith': { lat: 51.4833, lng: -0.2333, name: 'Hammersmith, England, UK', radius: 6 },
    'haringey': { lat: 51.5833, lng: -0.0833, name: 'Haringey, England, UK', radius: 6 },
    'harrow': { lat: 51.5833, lng: -0.3333, name: 'Harrow, England, UK', radius: 6 },
    'havering': { lat: 51.5833, lng: 0.0000, name: 'Havering, England, UK', radius: 6 },
    'hillingdon': { lat: 51.5000, lng: -0.4333, name: 'Hillingdon, England, UK', radius: 6 },
    'hounslow': { lat: 51.4667, lng: -0.3667, name: 'Hounslow, England, UK', radius: 6 },
    'islington': { lat: 51.5333, lng: -0.1000, name: 'Islington, England, UK', radius: 6 },
    'kensington': { lat: 51.5000, lng: -0.1833, name: 'Kensington, England, UK', radius: 6 },
    'kingston': { lat: 51.4167, lng: -0.2833, name: 'Kingston, England, UK', radius: 6 },
    'lambeth': { lat: 51.4833, lng: -0.1333, name: 'Lambeth, England, UK', radius: 6 },
    'lewisham': { lat: 51.4500, lng: 0.0000, name: 'Lewisham, England, UK', radius: 6 },
    'merton': { lat: 51.4000, lng: -0.1833, name: 'Merton, England, UK', radius: 6 },
    'newham': { lat: 51.5333, lng: -0.0167, name: 'Newham, England, UK', radius: 6 },
    'redbridge': { lat: 51.5500, lng: 0.0667, name: 'Redbridge, England, UK', radius: 6 },
    'richmond': { lat: 51.4333, lng: -0.2833, name: 'Richmond, England, UK', radius: 6 },
    'southwark': { lat: 51.4833, lng: -0.0833, name: 'Southwark, England, UK', radius: 6 },
    'sutton': { lat: 51.3500, lng: -0.1833, name: 'Sutton, England, UK', radius: 6 },
    'tower hamlets': { lat: 51.5333, lng: -0.0500, name: 'Tower Hamlets, England, UK', radius: 6 },
    'waltham forest': { lat: 51.5833, lng: -0.0167, name: 'Waltham Forest, England, UK', radius: 6 },
    'wandsworth': { lat: 51.4500, lng: -0.2000, name: 'Wandsworth, England, UK', radius: 6 },
    'westminster': { lat: 51.5000, lng: -0.1333, name: 'Westminster, England, UK', radius: 6 },
    'barking': { lat: 51.5500, lng: 0.0833, name: 'Barking, England, UK', radius: 6 },
    'barnet': { lat: 51.6500, lng: -0.1833, name: 'Barnet, England, UK', radius: 6 },
    'brent': { lat: 51.5500, lng: -0.2500, name: 'Brent, England, UK', radius: 6 },
    'bromley': { lat: 51.4000, lng: 0.0000, name: 'Bromley, England, UK', radius: 6 },
    'camden': { lat: 51.5500, lng: -0.1500, name: 'Camden, England, UK', radius: 6 },
    'city of london': { lat: 51.5167, lng: -0.0967, name: 'City of London, England, UK', radius: 6 }
  };
  
  // UK Towns (radius based on population)
  const ukTowns = {
    'blackpool': { lat: 53.8167, lng: -3.0500, name: 'Blackpool, England, UK', radius: 4 },
    'bradford': { lat: 53.7833, lng: -1.7500, name: 'Bradford, England, UK', radius: 4 },
    'brighton': { lat: 50.8225, lng: -0.1372, name: 'Brighton, England, UK', radius: 4 },
    'bristol': { lat: 51.4545, lng: -2.5879, name: 'Bristol, England, UK', radius: 4 },
    'cambridge': { lat: 52.2050, lng: 0.1218, name: 'Cambridge, England, UK', radius: 4 },
    'canterbury': { lat: 51.2833, lng: 1.0833, name: 'Canterbury, England, UK', radius: 4 },
    'cardiff': { lat: 51.4816, lng: -3.1791, name: 'Cardiff, Wales, UK', radius: 4 },
    'carlisle': { lat: 54.8900, lng: -2.9200, name: 'Carlisle, England, UK', radius: 4 },
    'chelmsford': { lat: 51.7333, lng: 0.4667, name: 'Chelmsford, England, UK', radius: 4 },
    'chester': { lat: 53.1900, lng: -2.8900, name: 'Chester, England, UK', radius: 4 },
    'colchester': { lat: 51.8800, lng: 0.9000, name: 'Colchester, England, UK', radius: 4 },
    'coventry': { lat: 52.4065, lng: -1.5122, name: 'Coventry, England, UK', radius: 4 },
    'derby': { lat: 52.9228, lng: -1.4762, name: 'Derby, England, UK', radius: 4 },
    'doncaster': { lat: 53.5200, lng: -1.0000, name: 'Doncaster, England, UK', radius: 4 },
    'dover': { lat: 51.1333, lng: 1.3000, name: 'Dover, England, UK', radius: 4 },
    'dudley': { lat: 52.4833, lng: -2.0833, name: 'Dudley, England, UK', radius: 4 },
    'durham': { lat: 54.7833, lng: -1.5500, name: 'Durham, England, UK', radius: 4 },
    'eastbourne': { lat: 50.7667, lng: 0.2833, name: 'Eastbourne, England, UK', radius: 4 },
    'exeter': { lat: 50.7236, lng: -3.5275, name: 'Exeter, England, UK', radius: 4 },
    'falmouth': { lat: 50.1500, lng: -5.0667, name: 'Falmouth, England, UK', radius: 4 },
    'glasgow': { lat: 55.8642, lng: -4.2518, name: 'Glasgow, Scotland, UK', radius: 4 },
    'halifax': { lat: 53.7333, lng: -1.8500, name: 'Halifax, England, UK', radius: 4 },
    'hastings': { lat: 50.8500, lng: 0.5667, name: 'Hastings, England, UK', radius: 4 },
    'hereford': { lat: 52.0500, lng: -2.7167, name: 'Hereford, England, UK', radius: 4 },
    'ipswich': { lat: 52.0600, lng: 1.1500, name: 'Ipswich, England, UK', radius: 4 },
    'kingswinford': { lat: 52.6000, lng: -2.3000, name: 'Kingswinford, England, UK', radius: 4 },
    'kirkcaldy': { lat: 56.1000, lng: -3.1667, name: 'Kirkcaldy, Scotland, UK', radius: 4 },
    'leamington spa': { lat: 52.2833, lng: -1.5333, name: 'Leamington Spa, England, UK', radius: 4 },
    'lichfield': { lat: 52.6833, lng: -1.8000, name: 'Lichfield, England, UK', radius: 4 },
    'lincoln': { lat: 53.2333, lng: -0.5333, name: 'Lincoln, England, UK', radius: 4 },
    'liverpool': { lat: 53.4084, lng: -2.9916, name: 'Liverpool, England, UK', radius: 4 },
    'lancaster': { lat: 54.0000, lng: -2.8000, name: 'Lancaster, England, UK', radius: 4 },
    'leeds': { lat: 53.8008, lng: -1.5491, name: 'Leeds, England, UK', radius: 4 },
    'lichfield': { lat: 52.6833, lng: -1.8000, name: 'Lichfield, England, UK', radius: 4 },
    'lincoln': { lat: 53.2333, lng: -0.5333, name: 'Lincoln, England, UK', radius: 4 },
    'littlehampton': { lat: 50.8000, lng: -0.5000, name: 'Littlehampton, England, UK', radius: 4 },
    'loughborough': { lat: 52.7700, lng: -1.2000, name: 'Loughborough, England, UK', radius: 4 },
    'loughton': { lat: 51.6000, lng: 0.0000, name: 'Loughton, England, UK', radius: 4 },
    'lowestoft': { lat: 52.4500, lng: 1.7500, name: 'Lowestoft, England, UK', radius: 4 },
    'lutterworth': { lat: 52.4000, lng: -1.2000, name: 'Lutterworth, England, UK', radius: 4 },
    'maidstone': { lat: 51.2667, lng: 0.5333, name: 'Maidstone, England, UK', radius: 4 },
    'maldon': { lat: 51.7500, lng: 0.6667, name: 'Maldon, England, UK', radius: 4 },
    'margate': { lat: 51.3833, lng: 1.3833, name: 'Margate, England, UK', radius: 4 },
    'melton mowbray': { lat: 52.7833, lng: -0.7000, name: 'Melton Mowbray, England, UK', radius: 4 },
    'merthyr tydfil': { lat: 51.7500, lng: -3.3833, name: 'Merthyr Tydfil, Wales, UK', radius: 4 },
    'middlesbrough': { lat: 54.5762, lng: -1.2333, name: 'Middlesbrough, England, UK', radius: 4 },
    'milton keynes': { lat: 52.0400, lng: -0.7500, name: 'Milton Keynes, England, UK', radius: 4 },
    'morley': { lat: 53.7333, lng: -1.6000, name: 'Morley, England, UK', radius: 4 },
    'nelson': { lat: 53.8333, lng: -2.2000, name: 'Nelson, England, UK', radius: 4 },
    'newbury': { lat: 51.4000, lng: -1.3333, name: 'Newbury, England, UK', radius: 4 },
    'newcastle upon tyne': { lat: 54.9733, lng: -1.6143, name: 'Newcastle, England, UK', radius: 4 },
    'newport': { lat: 51.5833, lng: -2.9833, name: 'Newport, Wales, UK', radius: 4 },
    'norwich': { lat: 52.6200, lng: 1.2900, name: 'Norwich, England, UK', radius: 4 },
    'nottingham': { lat: 52.9547, lng: -1.1581, name: 'Nottingham, England, UK', radius: 4 },
    'nuneaton': { lat: 52.5333, lng: -1.4000, name: 'Nuneaton, England, UK', radius: 4 },
    'oldham': { lat: 53.5400, lng: -2.1100, name: 'Oldham, England, UK', radius: 4 },
    'ormskirk': { lat: 53.5500, lng: -2.8000, name: 'Ormskirk, England, UK', radius: 4 },
    'oxford': { lat: 51.7520, lng: -1.2577, name: 'Oxford, England, UK', radius: 4 },
    'paignton': { lat: 50.4500, lng: -3.5833, name: 'Paignton, England, UK', radius: 4 },
    'peterborough': { lat: 52.5700, lng: -0.2300, name: 'Peterborough, England, UK', radius: 4 },
    'peterlee': { lat: 54.7000, lng: -1.3500, name: 'Peterlee, England, UK', radius: 4 },
    'plymouth': { lat: 50.3704, lng: -4.1400, name: 'Plymouth, England, UK', radius: 4 },
    'poole': { lat: 50.7167, lng: -2.0000, name: 'Poole, England, UK', radius: 4 },
    'portsmouth': { lat: 50.8194, lng: -1.0754, name: 'Portsmouth, England, UK', radius: 4 },
    'preston': { lat: 53.7631, lng: -2.7040, name: 'Preston, England, UK', radius: 4 },
    'radlett': { lat: 51.6833, lng: -0.2833, name: 'Radlett, England, UK', radius: 4 },
    'ramsgate': { lat: 51.3333, lng: 1.4000, name: 'Ramsgate, England, UK', radius: 4 },
    'reading': { lat: 51.4550, lng: -0.9783, name: 'Reading, England, UK', radius: 4 },
    'redditch': { lat: 52.3000, lng: -1.9500, name: 'Redditch, England, UK', radius: 4 },
    'redhill': { lat: 51.2700, lng: -0.0800, name: 'Redhill, England, UK', radius: 4 },
    'reigate': { lat: 51.2333, lng: -0.2000, name: 'Reigate, England, UK', radius: 4 },
    'rochdale': { lat: 53.6000, lng: -2.1500, name: 'Rochdale, England, UK', radius: 4 },
    'rochester': { lat: 51.3833, lng: 0.5000, name: 'Rochester, England, UK', radius: 4 },
    'romford': { lat: 51.5833, lng: 0.1833, name: 'Romford, England, UK', radius: 4 },
    'rotherham': { lat: 53.4000, lng: -1.3500, name: 'Rotherham, England, UK', radius: 4 },
    'royal tunbridge wells': { lat: 51.1333, lng: 0.2667, name: 'Royal Tunbridge Wells, England, UK', radius: 4 },
    'rugby': { lat: 52.3667, lng: -1.2500, name: 'Rugby, England, UK', radius: 4 },
    'ryde': { lat: 50.7200, lng: -1.1800, name: 'Ryde, England, UK', radius: 4 },
    'salford': { lat: 53.4833, lng: -2.2833, name: 'Salford, England, UK', radius: 4 },
    'salisbury': { lat: 51.0600, lng: -1.7900, name: 'Salisbury, England, UK', radius: 4 },
    'scarborough': { lat: 54.2833, lng: -0.4000, name: 'Scarborough, England, UK', radius: 4 },
    'scunthorpe': { lat: 53.5833, lng: -0.6500, name: 'Scunthorpe, England, UK', radius: 4 },
    'seaford': { lat: 50.8000, lng: 0.0000, name: 'Seaford, England, UK', radius: 4 },
    'sevenoaks': { lat: 51.2833, lng: 0.0000, name: 'Sevenoaks, England, UK', radius: 4 },
    'sheffield': { lat: 53.3811, lng: -1.4701, name: 'Sheffield, England, UK', radius: 4 },
    'shrewsbury': { lat: 52.7167, lng: -2.7333, name: 'Shrewsbury, England, UK', radius: 4 },
    'sidcup': { lat: 51.4000, lng: 0.0000, name: 'Sidcup, England, UK', radius: 4 },
    'skelmersdale': { lat: 53.5000, lng: -2.7000, name: 'Skelmersdale, England, UK', radius: 4 },
    'slough': { lat: 51.5000, lng: -0.6000, name: 'Slough, England, UK', radius: 4 },
    'solihull': { lat: 52.4000, lng: -1.7833, name: 'Solihull, England, UK', radius: 4 },
    'southampton': { lat: 50.9097, lng: -1.4044, name: 'Southampton, England, UK', radius: 4 },
    'southend': { lat: 51.5333, lng: 0.7000, name: 'Southend, England, UK', radius: 4 },
    'st albans': { lat: 51.7500, lng: -0.3333, name: 'St Albans, England, UK', radius: 4 },
    'stoke on trent': { lat: 53.0000, lng: -2.1833, name: 'Stoke-on-Trent, England, UK', radius: 4 },
    'sunderland': { lat: 54.9067, lng: -1.3833, name: 'Sunderland, England, UK', radius: 4 },
    'swansea': { lat: 51.6200, lng: -3.9400, name: 'Swansea, Wales, UK', radius: 4 },
    'swindon': { lat: 51.5500, lng: -1.7833, name: 'Swindon, England, UK', radius: 4 },
    'tamworth': { lat: 52.6333, lng: -1.6833, name: 'Tamworth, England, UK', radius: 4 },
    'taunton': { lat: 51.0000, lng: -3.1000, name: 'Taunton, England, UK', radius: 4 },
    'telford': { lat: 52.6833, lng: -2.4333, name: 'Telford, England, UK', radius: 4 },
    'wakefield': { lat: 53.6833, lng: -1.4833, name: 'Wakefield, England, UK', radius: 4 },
    'warrington': { lat: 53.3833, lng: -2.6000, name: 'Warrington, England, UK', radius: 4 },
    'walsall': { lat: 52.5833, lng: -1.9833, name: 'Walsall, England, UK', radius: 4 },
    'warwick': { lat: 52.2833, lng: -1.5833, name: 'Warwick, England, UK', radius: 4 },
    'watford': { lat: 51.6500, lng: -0.3833, name: 'Watford, England, UK', radius: 4 },
    'wellingborough': { lat: 52.3000, lng: -0.7000, name: 'Wellingborough, England, UK', radius: 4 },
    'welwyn garden city': { lat: 51.8000, lng: -0.2000, name: 'Welwyn Garden City, England, UK', radius: 4 },
    'west bromwich': { lat: 52.5000, lng: -2.0000, name: 'West Bromwich, England, UK', radius: 4 },
    'weston super mare': { lat: 51.3333, lng: -2.9833, name: 'Weston-super-Mare, England, UK', radius: 4 },
    'weymouth': { lat: 50.7200, lng: -2.4500, name: 'Weymouth, England, UK', radius: 4 },
    'whitehaven': { lat: 54.5500, lng: -3.5833, name: 'Whitehaven, England, UK', radius: 4 },
    'widnes': { lat: 53.3500, lng: -2.7333, name: 'Widnes, England, UK', radius: 4 },
    'wigan': { lat: 53.5400, lng: -2.6300, name: 'Wigan, England, UK', radius: 4 },
    'wimbledon': { lat: 51.4000, lng: -0.2000, name: 'Wimbledon, England, UK', radius: 4 },
    'winchester': { lat: 51.0600, lng: -1.3000, name: 'Winchester, England, UK', radius: 4 },
    'windsor': { lat: 51.4833, lng: -0.6000, name: 'Windsor, England, UK', radius: 4 },
    'woking': { lat: 51.3200, lng: -0.5500, name: 'Woking, England, UK', radius: 4 },
    'wolverhampton': { lat: 52.5833, lng: -2.1333, name: 'Wolverhampton, England, UK', radius: 4 },
    'worcester': { lat: 52.1900, lng: -2.2200, name: 'Worcester, England, UK', radius: 4 },
    'worthing': { lat: 50.8000, lng: -0.3000, name: 'Worthing, England, UK', radius: 4 },
    'yeovil': { lat: 50.9333, lng: -2.6333, name: 'Yeovil, England, UK', radius: 4 },
    'york': { lat: 53.9590, lng: -1.0800, name: 'York, England, UK', radius: 4 }
  };
  
  // UK Villages and smaller towns (radius based on population)
  const ukVillages = {
    'abingdon': { lat: 51.6667, lng: -1.0667, name: 'Abingdon, England, UK', radius: 3 },
    'aldershot': { lat: 51.2333, lng: -0.7667, name: 'Aldershot, England, UK', radius: 3 },
    'altrincham': { lat: 53.3833, lng: -2.3500, name: 'Altrincham, England, UK', radius: 3 },
    'amersham': { lat: 51.6667, lng: -0.6667, name: 'Amersham, England, UK', radius: 3 },
    'ashford': { lat: 51.1500, lng: 0.8833, name: 'Ashford, England, UK', radius: 3 },
    'aylesbury': { lat: 51.6667, lng: -0.8000, name: 'Aylesbury, England, UK', radius: 3 },
    'banbury': { lat: 52.0667, lng: -1.3500, name: 'Banbury, England, UK', radius: 3 },
    'barnstaple': { lat: 51.0333, lng: -4.0500, name: 'Barnstaple, England, UK', radius: 3 },
    'basildon': { lat: 51.5500, lng: 0.4500, name: 'Basildon, England, UK', radius: 3 },
    'basingstoke': { lat: 51.2667, lng: -1.0833, name: 'Basingstoke, England, UK', radius: 3 },
    'bedford': { lat: 52.1333, lng: -0.4500, name: 'Bedford, England, UK', radius: 3 },
    'berkhamsted': { lat: 51.8000, lng: -0.5500, name: 'Berkhamsted, England, UK', radius: 3 },
    'bexhill': { lat: 50.8500, lng: 0.5000, name: 'Bexhill, England, UK', radius: 3 },
    'bicester': { lat: 51.8833, lng: -1.1333, name: 'Bicester, England, UK', radius: 3 },
    'billericay': { lat: 51.6000, lng: 0.4000, name: 'Billericay, England, UK', radius: 3 },
    'bognor regis': { lat: 50.7833, lng: -0.6500, name: 'Bognor Regis, England, UK', radius: 3 },
    'bracknell': { lat: 51.4167, lng: -0.7333, name: 'Bracknell, England, UK', radius: 3 },
    'brentwood': { lat: 51.6667, lng: 0.3000, name: 'Brentwood, England, UK', radius: 3 },
    'bridgend': { lat: 51.5000, lng: -3.6000, name: 'Bridgend, Wales, UK', radius: 3 },
    'bridgwater': { lat: 51.1333, lng: -3.1833, name: 'Bridgwater, England, UK', radius: 3 },
    'bromley': { lat: 51.4000, lng: 0.0000, name: 'Bromley, England, UK', radius: 3 },
    'bromsgrove': { lat: 52.3000, lng: -2.0333, name: 'Bromsgrove, England, UK', radius: 3 },
    'buckingham': { lat: 52.0000, lng: -0.7833, name: 'Buckingham, England, UK', radius: 3 },
    'burton upon trent': { lat: 52.8000, lng: -1.6333, name: 'Burton upon Trent, England, UK', radius: 3 },
    'bury': { lat: 52.5000, lng: -1.9833, name: 'Bury, England, UK', radius: 3 },
    'bury st edmunds': { lat: 52.2333, lng: 0.7000, name: 'Bury St Edmunds, England, UK', radius: 3 },
    'calne': { lat: 51.4333, lng: -1.9833, name: 'Calne, England, UK', radius: 3 },
    'camborne': { lat: 50.2000, lng: -5.3000, name: 'Camborne, England, UK', radius: 3 },
    'cannock': { lat: 52.6667, lng: -1.9000, name: 'Cannock, England, UK', radius: 3 },
    'carlisle': { lat: 54.8900, lng: -2.9200, name: 'Carlisle, England, UK', radius: 3 },
    'caterham': { lat: 51.2667, lng: -0.0833, name: 'Caterham, England, UK', radius: 3 },
    'chatham': { lat: 51.3833, lng: 0.5333, name: 'Chatham, England, UK', radius: 3 },
    'cheltenham': { lat: 51.9000, lng: -2.0833, name: 'Cheltenham, England, UK', radius: 3 },
    'chesham': { lat: 51.6667, lng: -0.5833, name: 'Chesham, England, UK', radius: 3 },
    'chesterfield': { lat: 53.2500, lng: -1.4167, name: 'Chesterfield, England, UK', radius: 3 },
    'chichester': { lat: 50.8667, lng: -0.7833, name: 'Chichester, England, UK', radius: 3 },
    'chorley': { lat: 53.6667, lng: -2.6000, name: 'Chorley, England, UK', radius: 3 },
    'clacton': { lat: 51.8000, lng: 1.2500, name: 'Clacton, England, UK', radius: 3 },
    'colchester': { lat: 51.8800, lng: 0.9000, name: 'Colchester, England, UK', radius: 3 },
    'crawley': { lat: 51.1000, lng: -0.1833, name: 'Crawley, England, UK', radius: 3 },
    'crewe': { lat: 53.1000, lng: -2.4333, name: 'Crewe, England, UK', radius: 3 },
    'cromer': { lat: 52.9333, lng: 1.3000, name: 'Cromer, England, UK', radius: 3 },
    'darlington': { lat: 54.5200, lng: -1.5500, name: 'Darlington, England, UK', radius: 3 },
    'dartford': { lat: 51.4500, lng: 0.2000, name: 'Dartford, England, UK', radius: 3 },
    'daventry': { lat: 52.2500, lng: -1.0000, name: 'Daventry, England, UK', radius: 3 },
    'dewsbury': { lat: 53.6833, lng: -1.5000, name: 'Dewsbury, England, UK', radius: 3 },
    'doncaster': { lat: 53.5200, lng: -1.0000, name: 'Doncaster, England, UK', radius: 3 },
    'dorchester': { lat: 50.7000, lng: -2.4333, name: 'Dorchester, England, UK', radius: 3 },
    'dover': { lat: 51.1333, lng: 1.3000, name: 'Dover, England, UK', radius: 3 },
    'droitwich': { lat: 52.2500, lng: -2.1000, name: 'Droitwich, England, UK', radius: 3 },
    'dudley': { lat: 52.4833, lng: -2.0833, name: 'Dudley, England, UK', radius: 3 },
    'dunstable': { lat: 51.8833, lng: -0.4833, name: 'Dunstable, England, UK', radius: 3 },
    'durham': { lat: 54.7833, lng: -1.5500, name: 'Durham, England, UK', radius: 3 },
    'eastbourne': { lat: 50.7667, lng: 0.2833, name: 'Eastbourne, England, UK', radius: 3 },
    'eastleigh': { lat: 50.9500, lng: -1.3500, name: 'Eastleigh, England, UK', radius: 3 },
    'eastwood': { lat: 53.1667, lng: -1.3000, name: 'Eastwood, England, UK', radius: 3 },
    'ellesmere port': { lat: 53.2833, lng: -2.9000, name: 'Ellesmere Port, England, UK', radius: 3 },
    'epsom': { lat: 51.3333, lng: -0.2500, name: 'Epsom, England, UK', radius: 3 },
    'fareham': { lat: 50.8500, lng: -1.2000, name: 'Fareham, England, UK', radius: 3 },
    'farnborough': { lat: 51.2833, lng: -0.7500, name: 'Farnborough, England, UK', radius: 3 },
    'farnham': { lat: 51.2000, lng: -0.8000, name: 'Farnham, England, UK', radius: 3 },
    'felixstowe': { lat: 52.0000, lng: 1.3500, name: 'Felixstowe, England, UK', radius: 3 },
    'fleet': { lat: 51.3000, lng: 1.3500, name: 'Fleet, England, UK', radius: 3 },
    'folkestone': { lat: 51.1833, lng: 1.1833, name: 'Folkestone, England, UK', radius: 3 },
    'gateshead': { lat: 54.9000, lng: -1.6000, name: 'Gateshead, England, UK', radius: 3 },
    'gillingham': { lat: 51.3667, lng: 0.5500, name: 'Gillingham, England, UK', radius: 3 },
    'gloucester': { lat: 51.8633, lng: -2.2400, name: 'Gloucester, England, UK', radius: 3 },
    'gosport': { lat: 50.7833, lng: -1.1333, name: 'Gosport, England, UK', radius: 3 },
    'grantham': { lat: 52.6000, lng: 0.4000, name: 'Grantham, England, UK', radius: 3 },
    'gravesend': { lat: 51.4500, lng: 0.3500, name: 'Gravesend, England, UK', radius: 3 },
    'grimsby': { lat: 53.5667, lng: -0.0667, name: 'Grimsby, England, UK', radius: 3 },
    'guildford': { lat: 51.2333, lng: -0.5833, name: 'Guildford, England, UK', radius: 3 },
    'halifax': { lat: 53.7333, lng: -1.8500, name: 'Halifax, England, UK', radius: 3 },
    'harlow': { lat: 51.7667, lng: 0.1333, name: 'Harlow, England, UK', radius: 3 },
    'harrogate': { lat: 53.9833, lng: -1.5333, name: 'Harrogate, England, UK', radius: 3 },
    'hartlepool': { lat: 54.6833, lng: -1.2000, name: 'Hartlepool, England, UK', radius: 3 },
    'hastings': { lat: 50.8500, lng: 0.5667, name: 'Hastings, England, UK', radius: 3 },
    'hatfield': { lat: 51.7833, lng: -0.2000, name: 'Hatfield, England, UK', radius: 3 },
    'haywards heath': { lat: 51.1500, lng: -0.0500, name: 'Haywards Heath, England, UK', radius: 3 },
    'hemel hempstead': { lat: 51.7500, lng: -0.4500, name: 'Hemel Hempstead, England, UK', radius: 3 },
    'hereford': { lat: 52.0500, lng: -2.7167, name: 'Hereford, England, UK', radius: 3 },
    'hertford': { lat: 51.8000, lng: -0.0333, name: 'Hertford, England, UK', radius: 3 },
    'high wycombe': { lat: 51.6333, lng: -0.7500, name: 'High Wycombe, England, UK', radius: 3 },
    'hinckley': { lat: 52.5500, lng: -1.3667, name: 'Hinckley, England, UK', radius: 3 },
    'hitchin': { lat: 51.9667, lng: -0.2833, name: 'Hitchin, England, UK', radius: 3 },
    'horsham': { lat: 51.0333, lng: -0.3000, name: 'Horsham, England, UK', radius: 3 },
    'huddersfield': { lat: 53.6500, lng: -1.7833, name: 'Huddersfield, England, UK', radius: 3 },
    'huntingdon': { lat: 52.3333, lng: -0.1833, name: 'Huntingdon, England, UK', radius: 3 },
    'ipswich': { lat: 52.0600, lng: 1.1500, name: 'Ipswich, England, UK', radius: 3 },
    'keighley': { lat: 53.8667, lng: -1.9333, name: 'Keighley, England, UK', radius: 3 },
    'kendal': { lat: 54.3333, lng: -2.7500, name: 'Kendal, England, UK', radius: 3 },
    'kidderminster': { lat: 52.3833, lng: -2.2333, name: 'Kidderminster, England, UK', radius: 3 },
    'kingston upon thames': { lat: 51.4167, lng: -0.3000, name: 'Kingston upon Thames, England, UK', radius: 3 },
    'kingswinford': { lat: 52.6000, lng: -2.3000, name: 'Kingswinford, England, UK', radius: 3 },
    'kirkcaldy': { lat: 56.1000, lng: -3.1667, name: 'Kirkcaldy, Scotland, UK', radius: 3 },
    'leamington spa': { lat: 52.2833, lng: -1.5333, name: 'Leamington Spa, England, UK', radius: 3 },
    'leatherhead': { lat: 51.3000, lng: -0.3000, name: 'Leatherhead, England, UK', radius: 3 },
    'leighton buzzard': { lat: 51.9000, lng: -0.6000, name: 'Leighton Buzzard, England, UK', radius: 3 },
    'letchworth': { lat: 51.9833, lng: -0.2333, name: 'Letchworth, England, UK', radius: 3 },
    'lichfield': { lat: 52.6833, lng: -1.8000, name: 'Lichfield, England, UK', radius: 3 },
    'lincoln': { lat: 53.2333, lng: -0.5333, name: 'Lincoln, England, UK', radius: 3 },
    'littlehampton': { lat: 50.8000, lng: -0.5000, name: 'Littlehampton, England, UK', radius: 3 },
    'loughborough': { lat: 52.7700, lng: -1.2000, name: 'Loughborough, England, UK', radius: 3 },
    'loughton': { lat: 51.6000, lng: 0.0000, name: 'Loughton, England, UK', radius: 3 },
    'lowestoft': { lat: 52.4500, lng: 1.7500, name: 'Lowestoft, England, UK', radius: 3 },
    'lutterworth': { lat: 52.4000, lng: -1.2000, name: 'Lutterworth, England, UK', radius: 3 },
    'maidstone': { lat: 51.2667, lng: 0.5333, name: 'Maidstone, England, UK', radius: 3 },
    'maldon': { lat: 51.7500, lng: 0.6667, name: 'Maldon, England, UK', radius: 3 },
    'margate': { lat: 51.3833, lng: 1.3833, name: 'Margate, England, UK', radius: 3 },
    'melton mowbray': { lat: 52.7833, lng: -0.7000, name: 'Melton Mowbray, England, UK', radius: 3 },
    'merthyr tydfil': { lat: 51.7500, lng: -3.3833, name: 'Merthyr Tydfil, Wales, UK', radius: 3 },
    'middlesbrough': { lat: 54.5762, lng: -1.2333, name: 'Middlesbrough, England, UK', radius: 3 },
    'milton keynes': { lat: 52.0400, lng: -0.7500, name: 'Milton Keynes, England, UK', radius: 3 },
    'morley': { lat: 53.7333, lng: -1.6000, name: 'Morley, England, UK', radius: 3 },
    'nelson': { lat: 53.8333, lng: -2.2000, name: 'Nelson, England, UK', radius: 3 },
    'newbury': { lat: 51.4000, lng: -1.3333, name: 'Newbury, England, UK', radius: 3 },
    'newcastle under lyme': { lat: 53.0000, lng: -2.1000, name: 'Newcastle-under-Lyme, England, UK', radius: 3 },
    'newport': { lat: 51.5833, lng: -2.9833, name: 'Newport, Wales, UK', radius: 3 },
    'newton abbot': { lat: 50.4500, lng: -3.5833, name: 'Newton Abbot, England, UK', radius: 3 },
    'northampton': { lat: 52.2500, lng: -0.8833, name: 'Northampton, England, UK', radius: 3 },
    'northwich': { lat: 53.2333, lng: -2.5000, name: 'Northwich, England, UK', radius: 3 },
    'norwich': { lat: 52.6200, lng: 1.2900, name: 'Norwich, England, UK', radius: 3 },
    'nottingham': { lat: 52.9547, lng: -1.1581, name: 'Nottingham, England, UK', radius: 3 },
    'nuneaton': { lat: 52.5333, lng: -1.4000, name: 'Nuneaton, England, UK', radius: 3 },
    'oldham': { lat: 53.5400, lng: -2.1100, name: 'Oldham, England, UK', radius: 3 },
    'ormskirk': { lat: 53.5500, lng: -2.8000, name: 'Ormskirk, England, UK', radius: 3 },
    'oxford': { lat: 51.7520, lng: -1.2577, name: 'Oxford, England, UK', radius: 3 },
    'paignton': { lat: 50.4500, lng: -3.5833, name: 'Paignton, England, UK', radius: 3 },
    'peterborough': { lat: 52.5700, lng: -0.2300, name: 'Peterborough, England, UK', radius: 3 },
    'peterlee': { lat: 54.7000, lng: -1.3500, name: 'Peterlee, England, UK', radius: 3 },
    'plymouth': { lat: 50.3704, lng: -4.1400, name: 'Plymouth, England, UK', radius: 3 },
    'poole': { lat: 50.7167, lng: -2.0000, name: 'Poole, England, UK', radius: 3 },
    'portsmouth': { lat: 50.8194, lng: -1.0754, name: 'Portsmouth, England, UK', radius: 3 },
    'preston': { lat: 53.7631, lng: -2.7040, name: 'Preston, England, UK', radius: 3 },
    'radlett': { lat: 51.6833, lng: -0.2833, name: 'Radlett, England, UK', radius: 3 },
    'ramsgate': { lat: 51.3333, lng: 1.4000, name: 'Ramsgate, England, UK', radius: 3 },
    'reading': { lat: 51.4550, lng: -0.9783, name: 'Reading, England, UK', radius: 3 },
    'redditch': { lat: 52.3000, lng: -1.9500, name: 'Redditch, England, UK', radius: 3 },
    'redhill': { lat: 51.2700, lng: -0.0800, name: 'Redhill, England, UK', radius: 3 },
    'reigate': { lat: 51.2333, lng: -0.2000, name: 'Reigate, England, UK', radius: 3 },
    'rochdale': { lat: 53.6000, lng: -2.1500, name: 'Rochdale, England, UK', radius: 3 },
    'rochester': { lat: 51.3833, lng: 0.5000, name: 'Rochester, England, UK', radius: 3 },
    'romford': { lat: 51.5833, lng: 0.1833, name: 'Romford, England, UK', radius: 3 },
    'rotherham': { lat: 53.4000, lng: -1.3500, name: 'Rotherham, England, UK', radius: 3 },
    'royal tunbridge wells': { lat: 51.1333, lng: 0.2667, name: 'Royal Tunbridge Wells, England, UK', radius: 3 },
    'rugby': { lat: 52.3667, lng: -1.2500, name: 'Rugby, England, UK', radius: 3 },
    'ryde': { lat: 50.7200, lng: -1.1800, name: 'Ryde, England, UK', radius: 3 },
    'salford': { lat: 53.4833, lng: -2.2833, name: 'Salford, England, UK', radius: 3 },
    'salisbury': { lat: 51.0600, lng: -1.7900, name: 'Salisbury, England, UK', radius: 3 },
    'scarborough': { lat: 54.2833, lng: -0.4000, name: 'Scarborough, England, UK', radius: 3 },
    'scunthorpe': { lat: 53.5833, lng: -0.6500, name: 'Scunthorpe, England, UK', radius: 3 },
    'seaford': { lat: 50.8000, lng: 0.0000, name: 'Seaford, England, UK', radius: 3 },
    'sevenoaks': { lat: 51.2833, lng: 0.0000, name: 'Sevenoaks, England, UK', radius: 3 },
    'sheffield': { lat: 53.3811, lng: -1.4701, name: 'Sheffield, England, UK', radius: 3 },
    'shrewsbury': { lat: 52.7167, lng: -2.7333, name: 'Shrewsbury, England, UK', radius: 3 },
    'sidcup': { lat: 51.4000, lng: 0.0000, name: 'Sidcup, England, UK', radius: 3 },
    'skelmersdale': { lat: 53.5000, lng: -2.7000, name: 'Skelmersdale, England, UK', radius: 3 },
    'slough': { lat: 51.5000, lng: -0.6000, name: 'Slough, England, UK', radius: 3 },
    'solihull': { lat: 52.4000, lng: -1.7833, name: 'Solihull, England, UK', radius: 3 },
    'southampton': { lat: 50.9097, lng: -1.4044, name: 'Southampton, England, UK', radius: 3 },
    'southend': { lat: 51.5333, lng: 0.7000, name: 'Southend, England, UK', radius: 3 },
    'st albans': { lat: 51.7500, lng: -0.3333, name: 'St Albans, England, UK', radius: 3 },
    'stoke on trent': { lat: 53.0000, lng: -2.1833, name: 'Stoke-on-Trent, England, UK', radius: 3 },
    'sunderland': { lat: 54.9067, lng: -1.3833, name: 'Sunderland, England, UK', radius: 3 },
    'swansea': { lat: 51.6200, lng: -3.9400, name: 'Swansea, Wales, UK', radius: 3 },
    'swindon': { lat: 51.5500, lng: -1.7833, name: 'Swindon, England, UK', radius: 3 },
    'tamworth': { lat: 52.6333, lng: -1.6833, name: 'Tamworth, England, UK', radius: 3 },
    'taunton': { lat: 51.0000, lng: -3.1000, name: 'Taunton, England, UK', radius: 3 },
    'telford': { lat: 52.6833, lng: -2.4333, name: 'Telford, England, UK', radius: 3 },
    'tiverton': { lat: 50.9000, lng: -3.4833, name: 'Tiverton, England, UK', radius: 3 },
    'torquay': { lat: 50.4500, lng: -3.5333, name: 'Torquay, England, UK', radius: 3 },
    'trowbridge': { lat: 51.3000, lng: -2.2000, name: 'Trowbridge, England, UK', radius: 3 },
    'truro': { lat: 50.2667, lng: -5.0500, name: 'Truro, England, UK', radius: 3 },
    'tunbridge wells': { lat: 51.1333, lng: 0.2667, name: 'Tunbridge Wells, England, UK', radius: 3 },
    'wakefield': { lat: 53.6833, lng: -1.4833, name: 'Wakefield, England, UK', radius: 3 },
    'wallasey': { lat: 53.4500, lng: -3.0333, name: 'Wallasey, England, UK', radius: 3 },
    'walsall': { lat: 52.5833, lng: -1.9833, name: 'Walsall, England, UK', radius: 3 },
    'warrington': { lat: 53.3833, lng: -2.6000, name: 'Warrington, England, UK', radius: 3 },
    'warwick': { lat: 52.2833, lng: -1.5833, name: 'Warwick, England, UK', radius: 3 },
    'watford': { lat: 51.6500, lng: -0.3833, name: 'Watford, England, UK', radius: 3 },
    'wellingborough': { lat: 52.3000, lng: -0.7000, name: 'Wellingborough, England, UK', radius: 3 },
    'welwyn garden city': { lat: 51.8000, lng: -0.2000, name: 'Welwyn Garden City, England, UK', radius: 3 },
    'west bromwich': { lat: 52.5000, lng: -2.0000, name: 'West Bromwich, England, UK', radius: 3 },
    'weston super mare': { lat: 51.3333, lng: -2.9833, name: 'Weston-super-Mare, England, UK', radius: 3 },
    'weymouth': { lat: 50.7200, lng: -2.4500, name: 'Weymouth, England, UK', radius: 3 },
    'whitehaven': { lat: 54.5500, lng: -3.5833, name: 'Whitehaven, England, UK', radius: 3 },
    'widnes': { lat: 53.3500, lng: -2.7333, name: 'Widnes, England, UK', radius: 3 },
    'wigan': { lat: 53.5400, lng: -2.6300, name: 'Wigan, England, UK', radius: 3 },
    'wimbledon': { lat: 51.4000, lng: -0.2000, name: 'Wimbledon, England, UK', radius: 3 },
    'winchester': { lat: 51.0600, lng: -1.3000, name: 'Winchester, England, UK', radius: 3 },
    'windsor': { lat: 51.4833, lng: -0.6000, name: 'Windsor, England, UK', radius: 3 },
    'woking': { lat: 51.3200, lng: -0.3833, name: 'Woking, England, UK', radius: 3 },
    'wolverhampton': { lat: 52.5833, lng: -2.1333, name: 'Wolverhampton, England, UK', radius: 3 },
    'worcester': { lat: 52.1900, lng: -2.2200, name: 'Worcester, England, UK', radius: 3 },
    'worthing': { lat: 50.8000, lng: -0.3000, name: 'Worthing, England, UK', radius: 3 },
    'yeovil': { lat: 50.9333, lng: -2.6333, name: 'Yeovil, England, UK', radius: 3 },
    'york': { lat: 53.9590, lng: -1.0800, name: 'York, England, UK', radius: 3 }
  };
  
  // UK Postcode Areas (specific postcode districts)
  const ukPostcodeAreas = {
    // Birmingham postcodes
    'b12': { lat: 52.4699, lng: -1.8778, name: 'B12 Area, Birmingham, UK', radius: 3 },
    'b15': { lat: 52.4539, lng: -1.8909, name: 'B15 Area, Birmingham, UK', radius: 3 },
    'b4': { lat: 52.4796, lng: -1.9026, name: 'B4 Area, Birmingham, UK', radius: 3 },
    'b19': { lat: 52.4862, lng: -1.8904, name: 'B19 Area, Birmingham, UK', radius: 3 },
    'b1': { lat: 52.4796, lng: -1.9026, name: 'B1 Area, Birmingham, UK', radius: 3 },
    'b2': { lat: 52.4796, lng: -1.9026, name: 'B2 Area, Birmingham, UK', radius: 3 },
    'b3': { lat: 52.4796, lng: -1.9026, name: 'B3 Area, Birmingham, UK', radius: 3 },
    'b5': { lat: 52.4699, lng: -1.8778, name: 'B5 Area, Birmingham, UK', radius: 3 },
    'b6': { lat: 52.4862, lng: -1.8904, name: 'B6 Area, Birmingham, UK', radius: 3 },
    'b7': { lat: 52.4862, lng: -1.8904, name: 'B7 Area, Birmingham, UK', radius: 3 },
    'b8': { lat: 52.4862, lng: -1.8904, name: 'B8 Area, Birmingham, UK', radius: 3 },
    'b9': { lat: 52.4862, lng: -1.8904, name: 'B9 Area, Birmingham, UK', radius: 3 },
    'b10': { lat: 52.4699, lng: -1.8778, name: 'B10 Area, Birmingham, UK', radius: 3 },
    'b11': { lat: 52.4699, lng: -1.8778, name: 'B11 Area, Birmingham, UK', radius: 3 },
    'b13': { lat: 52.4539, lng: -1.8909, name: 'B13 Area, Birmingham, UK', radius: 3 },
    'b14': { lat: 52.4539, lng: -1.8909, name: 'B14 Area, Birmingham, UK', radius: 3 },
    'b16': { lat: 52.4539, lng: -1.8909, name: 'B16 Area, Birmingham, UK', radius: 3 },
    'b17': { lat: 52.4539, lng: -1.8909, name: 'B17 Area, Birmingham, UK', radius: 3 },
    'b18': { lat: 52.4862, lng: -1.8904, name: 'B18 Area, Birmingham, UK', radius: 3 },
    'b20': { lat: 52.4862, lng: -1.8904, name: 'B20 Area, Birmingham, UK', radius: 3 },
    'b21': { lat: 52.4862, lng: -1.8904, name: 'B21 Area, Birmingham, UK', radius: 3 },
    'b23': { lat: 52.4862, lng: -1.8904, name: 'B23 Area, Birmingham, UK', radius: 3 },
    'b24': { lat: 52.4862, lng: -1.8904, name: 'B24 Area, Birmingham, UK', radius: 3 },
    'b25': { lat: 52.4862, lng: -1.8904, name: 'B25 Area, Birmingham, UK', radius: 3 },
    'b26': { lat: 52.4862, lng: -1.8904, name: 'B26 Area, Birmingham, UK', radius: 3 },
    'b27': { lat: 52.4862, lng: -1.8904, name: 'B27 Area, Birmingham, UK', radius: 3 },
    'b28': { lat: 52.4862, lng: -1.8904, name: 'B28 Area, Birmingham, UK', radius: 3 },
    'b29': { lat: 52.4539, lng: -1.8909, name: 'B29 Area, Birmingham, UK', radius: 3 },
    'b30': { lat: 52.4539, lng: -1.8909, name: 'B30 Area, Birmingham, UK', radius: 3 },
    'b31': { lat: 52.4539, lng: -1.8909, name: 'B31 Area, Birmingham, UK', radius: 3 },
    'b32': { lat: 52.4539, lng: -1.8909, name: 'B32 Area, Birmingham, UK', radius: 3 },
    'b33': { lat: 52.4862, lng: -1.8904, name: 'B33 Area, Birmingham, UK', radius: 3 },
    'b34': { lat: 52.4862, lng: -1.8904, name: 'B34 Area, Birmingham, UK', radius: 3 },
    'b35': { lat: 52.4862, lng: -1.8904, name: 'B35 Area, Birmingham, UK', radius: 3 },
    'b36': { lat: 52.4862, lng: -1.8904, name: 'B36 Area, Birmingham, UK', radius: 3 },
    'b37': { lat: 52.4862, lng: -1.8904, name: 'B37 Area, Birmingham, UK', radius: 3 },
    'b38': { lat: 52.4539, lng: -1.8909, name: 'B38 Area, Birmingham, UK', radius: 3 },
    'b40': { lat: 52.4862, lng: -1.8904, name: 'B40 Area, Birmingham, UK', radius: 3 },
    'b42': { lat: 52.4862, lng: -1.8904, name: 'B42 Area, Birmingham, UK', radius: 3 },
    'b43': { lat: 52.4862, lng: -1.8904, name: 'B43 Area, Birmingham, UK', radius: 3 },
    'b44': { lat: 52.4862, lng: -1.8904, name: 'B44 Area, Birmingham, UK', radius: 3 },
    'b45': { lat: 52.4539, lng: -1.8909, name: 'B45 Area, Birmingham, UK', radius: 3 },
    'b46': { lat: 52.4862, lng: -1.8904, name: 'B46 Area, Birmingham, UK', radius: 3 },
    'b47': { lat: 52.4539, lng: -1.8909, name: 'B47 Area, Birmingham, UK', radius: 3 },
    'b48': { lat: 52.4539, lng: -1.8909, name: 'B48 Area, Birmingham, UK', radius: 3 },
    'b49': { lat: 52.4539, lng: -1.8909, name: 'B49 Area, Birmingham, UK', radius: 3 },
    'b50': { lat: 52.4539, lng: -1.8909, name: 'B50 Area, Birmingham, UK', radius: 3 },
    
    // Manchester postcodes
    'm1': { lat: 53.4808, lng: -2.2426, name: 'M1 Area, Manchester, UK', radius: 3 },
    'm2': { lat: 53.4808, lng: -2.2426, name: 'M2 Area, Manchester, UK', radius: 3 },
    'm3': { lat: 53.4808, lng: -2.2426, name: 'M3 Area, Manchester, UK', radius: 3 },
    'm4': { lat: 53.4808, lng: -2.2426, name: 'M4 Area, Manchester, UK', radius: 3 },
    'm5': { lat: 53.4808, lng: -2.2426, name: 'M5 Area, Manchester, UK', radius: 3 },
    'm6': { lat: 53.4808, lng: -2.2426, name: 'M6 Area, Manchester, UK', radius: 3 },
    'm7': { lat: 53.4808, lng: -2.2426, name: 'M7 Area, Manchester, UK', radius: 3 },
    'm8': { lat: 53.4808, lng: -2.2426, name: 'M8 Area, Manchester, UK', radius: 3 },
    'm9': { lat: 53.4808, lng: -2.2426, name: 'M9 Area, Manchester, UK', radius: 3 },
    'm10': { lat: 53.4808, lng: -2.2426, name: 'M10 Area, Manchester, UK', radius: 3 },
    'm11': { lat: 53.4808, lng: -2.2426, name: 'M11 Area, Manchester, UK', radius: 3 },
    'm12': { lat: 53.4808, lng: -2.2426, name: 'M12 Area, Manchester, UK', radius: 3 },
    'm13': { lat: 53.4808, lng: -2.2426, name: 'M13 Area, Manchester, UK', radius: 3 },
    'm14': { lat: 53.4808, lng: -2.2426, name: 'M14 Area, Manchester, UK', radius: 3 },
    'm15': { lat: 53.4808, lng: -2.2426, name: 'M15 Area, Manchester, UK', radius: 3 },
    'm16': { lat: 53.4808, lng: -2.2426, name: 'M16 Area, Manchester, UK', radius: 3 },
    'm17': { lat: 53.4808, lng: -2.2426, name: 'M17 Area, Manchester, UK', radius: 3 },
    'm18': { lat: 53.4808, lng: -2.2426, name: 'M18 Area, Manchester, UK', radius: 3 },
    'm19': { lat: 53.4808, lng: -2.2426, name: 'M19 Area, Manchester, UK', radius: 3 },
    'm20': { lat: 53.4808, lng: -2.2426, name: 'M20 Area, Manchester, UK', radius: 3 },
    'm21': { lat: 53.4808, lng: -2.2426, name: 'M21 Area, Manchester, UK', radius: 3 },
    'm22': { lat: 53.4808, lng: -2.2426, name: 'M22 Area, Manchester, UK', radius: 3 },
    'm23': { lat: 53.4808, lng: -2.2426, name: 'M23 Area, Manchester, UK', radius: 3 },
    'm24': { lat: 53.4808, lng: -2.2426, name: 'M24 Area, Manchester, UK', radius: 3 },
    'm25': { lat: 53.4808, lng: -2.2426, name: 'M25 Area, Manchester, UK', radius: 3 },
    'm26': { lat: 53.4808, lng: -2.2426, name: 'M26 Area, Manchester, UK', radius: 3 },
    'm27': { lat: 53.4808, lng: -2.2426, name: 'M27 Area, Manchester, UK', radius: 3 },
    'm28': { lat: 53.4808, lng: -2.2426, name: 'M28 Area, Manchester, UK', radius: 3 },
    'm29': { lat: 53.4808, lng: -2.2426, name: 'M29 Area, Manchester, UK', radius: 3 },
    'm30': { lat: 53.4808, lng: -2.2426, name: 'M30 Area, Manchester, UK', radius: 3 },
    'm31': { lat: 53.4808, lng: -2.2426, name: 'M31 Area, Manchester, UK', radius: 3 },
    'm32': { lat: 53.4808, lng: -2.2426, name: 'M32 Area, Manchester, UK', radius: 3 },
    'm33': { lat: 53.4808, lng: -2.2426, name: 'M33 Area, Manchester, UK', radius: 3 },
    'm34': { lat: 53.4808, lng: -2.2426, name: 'M34 Area, Manchester, UK', radius: 3 },
    'm35': { lat: 53.4808, lng: -2.2426, name: 'M35 Area, Manchester, UK', radius: 3 },
    'm38': { lat: 53.4808, lng: -2.2426, name: 'M38 Area, Manchester, UK', radius: 3 },
    'm40': { lat: 53.4808, lng: -2.2426, name: 'M40 Area, Manchester, UK', radius: 3 },
    'm41': { lat: 53.4808, lng: -2.2426, name: 'M41 Area, Manchester, UK', radius: 3 },
    'm43': { lat: 53.4808, lng: -2.2426, name: 'M43 Area, Manchester, UK', radius: 3 },
    'm44': { lat: 53.4808, lng: -2.2426, name: 'M44 Area, Manchester, UK', radius: 3 },
    'm45': { lat: 53.4808, lng: -2.2426, name: 'M45 Area, Manchester, UK', radius: 3 },
    'm46': { lat: 53.4808, lng: -2.2426, name: 'M46 Area, Manchester, UK', radius: 3 },
    
    // London postcodes
    'sw1': { lat: 51.4975, lng: -0.1357, name: 'SW1 Area, London, UK', radius: 3 },
    'sw2': { lat: 51.4500, lng: -0.1167, name: 'SW2 Area, London, UK', radius: 3 },
    'sw3': { lat: 51.4833, lng: -0.1667, name: 'SW3 Area, London, UK', radius: 3 },
    'sw4': { lat: 51.4500, lng: -0.1167, name: 'SW4 Area, London, UK', radius: 3 },
    'sw5': { lat: 51.4833, lng: -0.1667, name: 'SW5 Area, London, UK', radius: 3 },
    'sw6': { lat: 51.4667, lng: -0.2000, name: 'SW6 Area, London, UK', radius: 3 },
    'sw7': { lat: 51.4833, lng: -0.1667, name: 'SW7 Area, London, UK', radius: 3 },
    'sw8': { lat: 51.4500, lng: -0.1167, name: 'SW8 Area, London, UK', radius: 3 },
    'sw9': { lat: 51.4500, lng: -0.1167, name: 'SW9 Area, London, UK', radius: 3 },
    'sw10': { lat: 51.4667, lng: -0.2000, name: 'SW10 Area, London, UK', radius: 3 },
    'sw11': { lat: 51.4500, lng: -0.2000, name: 'SW11 Area, London, UK', radius: 3 },
    'sw12': { lat: 51.4500, lng: -0.1167, name: 'SW12 Area, London, UK', radius: 3 },
    'sw13': { lat: 51.4667, lng: -0.2000, name: 'SW13 Area, London, UK', radius: 3 },
    'sw14': { lat: 51.4667, lng: -0.2000, name: 'SW14 Area, London, UK', radius: 3 },
    'sw15': { lat: 51.4667, lng: -0.2000, name: 'SW15 Area, London, UK', radius: 3 },
    'sw16': { lat: 51.4500, lng: -0.1167, name: 'SW16 Area, London, UK', radius: 3 },
    'sw17': { lat: 51.4500, lng: -0.1167, name: 'SW17 Area, London, UK', radius: 3 },
    'sw18': { lat: 51.4500, lng: -0.2000, name: 'SW18 Area, London, UK', radius: 3 },
    'sw19': { lat: 51.4000, lng: -0.2000, name: 'SW19 Area, London, UK', radius: 3 },
    'sw20': { lat: 51.4000, lng: -0.2000, name: 'SW20 Area, London, UK', radius: 3 },
    
    'nw1': { lat: 51.5333, lng: -0.1500, name: 'NW1 Area, London, UK', radius: 3 },
    'nw2': { lat: 51.5500, lng: -0.2000, name: 'NW2 Area, London, UK', radius: 3 },
    'nw3': { lat: 51.5500, lng: -0.1500, name: 'NW3 Area, London, UK', radius: 3 },
    'nw4': { lat: 51.5833, lng: -0.2000, name: 'NW4 Area, London, UK', radius: 3 },
    'nw5': { lat: 51.5500, lng: -0.1500, name: 'NW5 Area, London, UK', radius: 3 },
    'nw6': { lat: 51.5500, lng: -0.2000, name: 'NW6 Area, London, UK', radius: 3 },
    'nw7': { lat: 51.5833, lng: -0.2000, name: 'NW7 Area, London, UK', radius: 3 },
    'nw8': { lat: 51.5333, lng: -0.1500, name: 'NW8 Area, London, UK', radius: 3 },
    'nw9': { lat: 51.5833, lng: -0.2000, name: 'NW9 Area, London, UK', radius: 3 },
    'nw10': { lat: 51.5500, lng: -0.2000, name: 'NW10 Area, London, UK', radius: 3 },
    'nw11': { lat: 51.5833, lng: -0.2000, name: 'NW11 Area, London, UK', radius: 3 },
    
    'se1': { lat: 51.4833, lng: -0.0833, name: 'SE1 Area, London, UK', radius: 3 },
    'se2': { lat: 51.4500, lng: 0.0000, name: 'SE2 Area, London, UK', radius: 3 },
    'se3': { lat: 51.4500, lng: 0.0000, name: 'SE3 Area, London, UK', radius: 3 },
    'se4': { lat: 51.4500, lng: 0.0000, name: 'SE4 Area, London, UK', radius: 3 },
    'se5': { lat: 51.4500, lng: -0.0833, name: 'SE5 Area, London, UK', radius: 3 },
    'se6': { lat: 51.4500, lng: 0.0000, name: 'SE6 Area, London, UK', radius: 3 },
    'se7': { lat: 51.4500, lng: 0.0000, name: 'SE7 Area, London, UK', radius: 3 },
    'se8': { lat: 51.4500, lng: 0.0000, name: 'SE8 Area, London, UK', radius: 3 },
    'se9': { lat: 51.4500, lng: 0.0000, name: 'SE9 Area, London, UK', radius: 3 },
    'se10': { lat: 51.4833, lng: 0.0000, name: 'SE10 Area, London, UK', radius: 3 },
    'se11': { lat: 51.4833, lng: -0.0833, name: 'SE11 Area, London, UK', radius: 3 },
    'se12': { lat: 51.4500, lng: 0.0000, name: 'SE12 Area, London, UK', radius: 3 },
    'se13': { lat: 51.4500, lng: 0.0000, name: 'SE13 Area, London, UK', radius: 3 },
    'se14': { lat: 51.4500, lng: -0.0833, name: 'SE14 Area, London, UK', radius: 3 },
    'se15': { lat: 51.4500, lng: -0.0833, name: 'SE15 Area, London, UK', radius: 3 },
    'se16': { lat: 51.4833, lng: -0.0833, name: 'SE16 Area, London, UK', radius: 3 },
    'se17': { lat: 51.4833, lng: -0.0833, name: 'SE17 Area, London, UK', radius: 3 },
    'se18': { lat: 51.4500, lng: 0.0000, name: 'SE18 Area, London, UK', radius: 3 },
    'se19': { lat: 51.4500, lng: 0.0000, name: 'SE19 Area, London, UK', radius: 3 },
    'se20': { lat: 51.4500, lng: 0.0000, name: 'SE20 Area, London, UK', radius: 3 },
    'se21': { lat: 51.4500, lng: 0.0000, name: 'SE21 Area, London, UK', radius: 3 },
    'se22': { lat: 51.4500, lng: 0.0000, name: 'SE22 Area, London, UK', radius: 3 },
    'se23': { lat: 51.4500, lng: 0.0000, name: 'SE23 Area, London, UK', radius: 3 },
    'se24': { lat: 51.4500, lng: -0.0833, name: 'SE24 Area, London, UK', radius: 3 },
    'se25': { lat: 51.4500, lng: 0.0000, name: 'SE25 Area, London, UK', radius: 3 },
    'se26': { lat: 51.4500, lng: 0.0000, name: 'SE26 Area, London, UK', radius: 3 },
    'se27': { lat: 51.4500, lng: 0.0000, name: 'SE27 Area, London, UK', radius: 3 },
    'se28': { lat: 51.4500, lng: 0.0000, name: 'SE28 Area, London, UK', radius: 3 },
    
    'e1': { lat: 51.5333, lng: -0.0500, name: 'E1 Area, London, UK', radius: 3 },
    'e2': { lat: 51.5333, lng: -0.0500, name: 'E2 Area, London, UK', radius: 3 },
    'e3': { lat: 51.5333, lng: -0.0167, name: 'E3 Area, London, UK', radius: 3 },
    'e4': { lat: 51.5833, lng: 0.0000, name: 'E4 Area, London, UK', radius: 3 },
    'e5': { lat: 51.5500, lng: -0.0500, name: 'E5 Area, London, UK', radius: 3 },
    'e6': { lat: 51.5333, lng: 0.0000, name: 'E6 Area, London, UK', radius: 3 },
    'e7': { lat: 51.5333, lng: 0.0000, name: 'E7 Area, London, UK', radius: 3 },
    'e8': { lat: 51.5500, lng: -0.0500, name: 'E8 Area, London, UK', radius: 3 },
    'e9': { lat: 51.5500, lng: -0.0167, name: 'E9 Area, London, UK', radius: 3 },
    'e10': { lat: 51.5500, lng: -0.0167, name: 'E10 Area, London, UK', radius: 3 },
    'e11': { lat: 51.5500, lng: 0.0667, name: 'E11 Area, London, UK', radius: 3 },
    'e12': { lat: 51.5500, lng: 0.0667, name: 'E12 Area, London, UK', radius: 3 },
    'e13': { lat: 51.5333, lng: 0.0000, name: 'E13 Area, London, UK', radius: 3 },
    'e14': { lat: 51.5333, lng: 0.0000, name: 'E14 Area, London, UK', radius: 3 },
    'e15': { lat: 51.5500, lng: 0.0000, name: 'E15 Area, London, UK', radius: 3 },
    'e16': { lat: 51.5333, lng: 0.0000, name: 'E16 Area, London, UK', radius: 3 },
    'e17': { lat: 51.5833, lng: -0.0167, name: 'E17 Area, London, UK', radius: 3 },
    'e18': { lat: 51.5833, lng: 0.0000, name: 'E18 Area, London, UK', radius: 3 },
    'e20': { lat: 51.5500, lng: 0.0000, name: 'E20 Area, London, UK', radius: 3 },
    
    'w1': { lat: 51.5000, lng: -0.1333, name: 'W1 Area, London, UK', radius: 3 },
    'w2': { lat: 51.5000, lng: -0.1833, name: 'W2 Area, London, UK', radius: 3 },
    'w3': { lat: 51.5000, lng: -0.2833, name: 'W3 Area, London, UK', radius: 3 },
    'w4': { lat: 51.5000, lng: -0.2833, name: 'W4 Area, London, UK', radius: 3 },
    'w5': { lat: 51.5000, lng: -0.2833, name: 'W5 Area, London, UK', radius: 3 },
    'w6': { lat: 51.5000, lng: -0.2833, name: 'W6 Area, London, UK', radius: 3 },
    'w7': { lat: 51.5000, lng: -0.4333, name: 'W7 Area, London, UK', radius: 3 },
    'w8': { lat: 51.5000, lng: -0.1833, name: 'W8 Area, London, UK', radius: 3 },
    'w9': { lat: 51.5000, lng: -0.1833, name: 'W9 Area, London, UK', radius: 3 },
    'w10': { lat: 51.5000, lng: -0.2333, name: 'W10 Area, London, UK', radius: 3 },
    'w11': { lat: 51.5000, lng: -0.2333, name: 'W11 Area, London, UK', radius: 3 },
    'w12': { lat: 51.5000, lng: -0.2333, name: 'W12 Area, London, UK', radius: 3 },
    'w13': { lat: 51.5000, lng: -0.4333, name: 'W13 Area, London, UK', radius: 3 },
    'w14': { lat: 51.5000, lng: -0.2333, name: 'W14 Area, London, UK', radius: 3 }
  };

  // Check for postcode area matches first (highest priority)
  if (ukPostcodeAreas[cleaned]) {
    const coords = ukPostcodeAreas[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.95,
      source: 'comprehensive_fallback_database_postcode'
    };
  }



  // Check for exact city matches
  if (ukCities[cleaned]) {
    const coords = ukCities[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.9,
      source: 'comprehensive_fallback_database'
    };
  }
  
  // Check for partial matches
  for (const [key, coords] of Object.entries(ukCities)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        display_name: coords.name,
        confidence: 0.8,
        source: 'comprehensive_fallback_database_partial'
      };
    }
  }

  // Check for towns
  if (ukTowns[cleaned]) {
    const coords = ukTowns[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.7,
      source: 'comprehensive_fallback_database'
    };
  }

  // Check for villages
  if (ukVillages[cleaned]) {
    const coords = ukVillages[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.6,
      source: 'comprehensive_fallback_database'
    };
  }

  // Fallback to original geocoding if no specific match
  // Note: This would need to be handled in the calling function since this is not async
  console.log(`⚠️ No comprehensive fallback match found for: "${location}"`);
  return null;

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

/**
 * Smart Radius Scaling Based on Input Type and City Size
 * Professional approach like Rightmove/Zoopla
 */
const getSmartRadius = (parsedInput, userRadius = null) => {
  // If user specified a radius, respect it
  if (userRadius && userRadius !== 'any' && userRadius !== '') {
    const radius = parseFloat(userRadius);
    if (radius > 0) {
      return radius;
    }
  }

  const input = parsedInput.location || parsedInput.city || parsedInput.area || '';
  const type = parsedInput.type;
  const cleaned = input.toLowerCase().trim();

  // Comprehensive UK location database with smart radius scaling
  // This covers ALL UK locations, not just major cities
  
  // UK Cities by population size (radius based on population)
  const ukCities = {
    // Major cities (500k+ population) - 10-15 mile radius
    'london': 15, 'birmingham': 12, 'manchester': 12, 'leeds': 10, 'liverpool': 10,
    'sheffield': 10, 'bristol': 10, 'glasgow': 12, 'edinburgh': 10, 'cardiff': 8,
    'belfast': 10, 'newcastle': 8, 'nottingham': 8, 'leicester': 8, 'coventry': 8,
    
    // Large cities (100k-500k population) - 6-10 mile radius
    'bradford': 6, 'stoke': 6, 'wolverhampton': 6, 'plymouth': 6, 'derby': 6,
    'southampton': 6, 'portsmouth': 6, 'brighton': 6, 'reading': 6, 'northampton': 6,
    'luton': 6, 'warrington': 6, 'bournemouth': 6, 'peterborough': 6, 'cambridge': 6,
    'oxford': 8, 'york': 6, 'carlisle': 6, 'preston': 6, 'chester': 6,
    'gloucester': 6, 'worcester': 6, 'exeter': 6, 'bath': 6, 'salisbury': 6,
    'aberdeen': 8, 'dundee': 6, 'swansea': 6, 'newport': 6, 'hull': 6,
    'middlesbrough': 6, 'sunderland': 6, 'bolton': 6, 'stockport': 6, 'wigan': 6,
    'blackburn': 6, 'oldham': 6, 'rochdale': 6, 'salford': 6, 'trafford': 6,
    'bexley': 6, 'croydon': 6, 'ealing': 6, 'enfield': 6, 'greenwich': 6,
    'hackney': 6, 'hammersmith': 6, 'haringey': 6, 'harrow': 6, 'havering': 6,
    'hillingdon': 6, 'hounslow': 6, 'islington': 6, 'kensington': 6, 'kingston': 6,
    'lambeth': 6, 'lewisham': 6, 'merton': 6, 'newham': 6, 'redbridge': 6,
    'richmond': 6, 'southwark': 6, 'sutton': 6, 'tower hamlets': 6, 'waltham forest': 6,
    'wandsworth': 6, 'westminster': 6, 'barking': 6, 'barnet': 6, 'brent': 6,
    'bromley': 6, 'camden': 6, 'city of london': 6
  };
  
  // UK Towns (radius based on population)
  const ukTowns = {
    'blackpool': 4, 'bradford': 4, 'brighton': 4, 'bristol': 4, 'cambridge': 4,
    'canterbury': 4, 'cardiff': 4, 'carlisle': 4, 'chelmsford': 4, 'chester': 4,
    'colchester': 4, 'coventry': 4, 'derby': 4, 'doncaster': 4, 'dover': 4,
    'dudley': 4, 'durham': 4, 'eastbourne': 4, 'exeter': 4, 'gloucester': 4,
    'halifax': 4, 'hastings': 4, 'hereford': 4, 'ipswich': 4, 'kingston upon hull': 4,
    'lancaster': 4, 'leeds': 4, 'leicester': 4, 'lichfield': 4, 'lincoln': 4,
    'liverpool': 4, 'london': 4, 'luton': 4, 'manchester': 4, 'milton keynes': 4,
    'newcastle upon tyne': 4, 'newport': 4, 'norwich': 4, 'nottingham': 4,
    'oxford': 4, 'peterborough': 4, 'plymouth': 4, 'portsmouth': 4, 'preston': 4,
    'reading': 4, 'rochester': 4, 'salford': 4, 'salisbury': 4, 'sheffield': 4,
    'southampton': 4, 'southend': 4, 'st albans': 4, 'stoke on trent': 4,
    'sunderland': 4, 'swansea': 4, 'telford': 4, 'wakefield': 4, 'warrington': 4,
    'wigan': 4, 'wolverhampton': 4, 'worcester': 4, 'york': 4
  };
  
  // UK Villages (radius based on population)
  const ukVillages = {
    'abingdon': 3, 'aldershot': 3, 'altrincham': 3, 'amersham': 3, 'ashford': 3,
    'aylesbury': 3, 'banbury': 3, 'barnstaple': 3, 'basildon': 3, 'basingstoke': 3,
    'bedford': 3, 'berkhamsted': 3, 'bexhill': 3, 'bicester': 3, 'billericay': 3,
    'bognor regis': 3, 'bracknell': 3, 'brentwood': 3, 'bridgend': 3, 'bridgwater': 3,
    'bromley': 3, 'bromsgrove': 3, 'buckingham': 3, 'burton upon trent': 3,
    'bury': 3, 'bury st edmunds': 3, 'calne': 3, 'camborne': 3, 'cannock': 3,
    'carlisle': 3, 'caterham': 3, 'chatham': 3, 'cheltenham': 3, 'chesham': 3,
    'chesterfield': 3, 'chichester': 3, 'chorley': 3, 'clacton': 3, 'colchester': 3,
    'crawley': 3, 'crewe': 3, 'cromer': 3, 'darlington': 3, 'dartford': 3,
    'daventry': 3, 'dewsbury': 3, 'doncaster': 3, 'dorchester': 3, 'dover': 3,
    'droitwich': 3, 'dudley': 3, 'dunstable': 3, 'durham': 3, 'eastbourne': 3,
    'eastleigh': 3, 'eastwood': 3, 'ellesmere port': 3, 'epsom': 3, 'fareham': 3,
    'farnborough': 3, 'farnham': 3, 'felixstowe': 3, 'fleet': 3, 'folkestone': 3,
    'gateshead': 3, 'gillingham': 3, 'gloucester': 3, 'gosport': 3, 'grantham': 3,
    'gravesend': 3, 'grimsby': 3, 'guildford': 3, 'halifax': 3, 'harlow': 3,
    'harrogate': 3, 'hartlepool': 3, 'hastings': 3, 'hatfield': 3, 'haywards heath': 3,
    'hemel hempstead': 3, 'hereford': 3, 'hertford': 3, 'high wycombe': 3,
    'hinckley': 3, 'hitchin': 3, 'horsham': 3, 'huddersfield': 3, 'huntingdon': 3,
    'ipswich': 3, 'keighley': 3, 'kendal': 3, 'kidderminster': 3, 'kingston upon thames': 3,
    'kingswinford': 3, 'kirkcaldy': 3, 'leamington spa': 3, 'leatherhead': 3,
    'leighton buzzard': 3, 'letchworth': 3, 'lichfield': 3, 'lincoln': 3,
    'littlehampton': 3, 'loughborough': 3, 'loughton': 3, 'lowestoft': 3,
    'lutterworth': 3, 'maidstone': 3, 'maldon': 3, 'margate': 3, 'melton mowbray': 3,
    'merthyr tydfil': 3, 'middlesbrough': 3, 'milton keynes': 3, 'morley': 3,
    'nelson': 3, 'newbury': 3, 'newcastle under lyme': 3, 'newport': 3,
    'newton abbot': 3, 'northampton': 3, 'northwich': 3, 'norwich': 3,
    'nottingham': 3, 'nuneaton': 3, 'oldham': 3, 'ormskirk': 3, 'oxford': 3,
    'paignton': 3, 'peterborough': 3, 'peterlee': 3, 'plymouth': 3, 'poole': 3,
    'portsmouth': 3, 'preston': 3, 'radlett': 3, 'ramsgate': 3, 'reading': 3,
    'redditch': 3, 'redhill': 3, 'reigate': 3, 'rochdale': 3, 'rochester': 3,
    'romford': 3, 'rotherham': 3, 'royal tunbridge wells': 3, 'rugby': 3,
    'ryde': 3, 'salford': 3, 'salisbury': 3, 'scarborough': 3, 'scunthorpe': 3,
    'seaford': 3, 'sevenoaks': 3, 'sheffield': 3, 'shrewsbury': 3, 'sidcup': 3,
    'skelmersdale': 3, 'slough': 3, 'solihull': 3, 'southampton': 3, 'southend': 3,
    'southport': 3, 'st albans': 3, 'st helens': 3, 'st neots': 3, 'stafford': 3,
    'stevenage': 3, 'stockport': 3, 'stockton on tees': 3, 'stoke on trent': 3,
    'stourbridge': 3, 'stratford upon avon': 3, 'stroud': 3, 'sunderland': 3,
    'swansea': 3, 'swindon': 3, 'tamworth': 3, 'taunton': 3, 'telford': 3,
    'tiverton': 3, 'torquay': 3, 'trowbridge': 3, 'truro': 3, 'tunbridge wells': 3,
    'wakefield': 3, 'wallasey': 3, 'walsall': 3, 'warrington': 3, 'warwick': 3,
    'watford': 3, 'wellingborough': 3, 'welwyn garden city': 3, 'west bromwich': 3,
    'weston super mare': 3, 'weymouth': 3, 'whitehaven': 3, 'widnes': 3,
    'wigan': 3, 'wimbledon': 3, 'winchester': 3, 'windsor': 3, 'woking': 3,
    'wolverhampton': 3, 'worcester': 3, 'worthing': 3, 'yeovil': 3, 'york': 3
  };

  // Check for major city match - improved detection
  for (const [city, radius] of Object.entries(ukCities)) {
    // More precise city matching to avoid false positives
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    if (cityRegex.test(cleaned) || cleaned === city) {
      console.log(`🏙️ Major city detected: ${city}, using ${radius} mile radius`);
      return radius;
    }
  }

  // Check for town match
  for (const [town, radius] of Object.entries(ukTowns)) {
    const townRegex = new RegExp(`\\b${town}\\b`, 'i');
    if (townRegex.test(cleaned) || cleaned === town) {
      console.log(`🏘️ Town detected: ${town}, using ${radius} mile radius`);
      return radius;
    }
  }

  // Check for village/small town match
  for (const [village, radius] of Object.entries(ukVillages)) {
    const villageRegex = new RegExp(`\\b${village}\\b`, 'i');
    if (villageRegex.test(cleaned) || cleaned === village) {
      console.log(`🏡 Village detected: ${village}, using ${radius} mile radius`);
      return radius;
    }
  }

  // Postcode-based radius scaling
  if (type.includes('postcode')) {
    if (parsedInput.postcode) {
      const postcode = parsedInput.postcode.toUpperCase();
      
      // Full postcode (e.g., B12 3AB) - precise search
      if (postcode.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/)) {
        console.log(`📮 Full postcode detected: ${postcode}, using 1 mile radius`);
        return 1;
      }
      
      // Partial postcode (e.g., B12) - district search
      if (postcode.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?$/)) {
        console.log(`📮 Partial postcode detected: ${postcode}, using 3 mile radius`);
        return 3;
      }
      
      // Area code (e.g., B) - city-wide search
      if (postcode.match(/^[A-Z]{1,2}$/)) {
        console.log(`📮 Area code detected: ${postcode}, using 8 mile radius`);
        return 8;
      }
    }
  }

  // Street-based radius scaling
  if (type.includes('street')) {
    // Major streets in big cities
    const majorStreets = [
      'oxford street', 'regent street', 'bond street', 'carnaby street',
      'brick lane', 'camden high street', 'portobello road', 'kings road',
      'new street', 'high street', 'main street', 'church street'
    ];
    
    if (majorStreets.some(street => cleaned.includes(street))) {
      console.log(`🛣️ Major street detected, using 2 mile radius`);
      return 2;
    }
    
    // Regular streets
    console.log(`🛣️ Regular street detected, using 1 mile radius`);
    return 1;
  }

  // Area/suburb radius scaling
  if (type === 'known_area') {
    // London areas - smaller radius since they're specific neighborhoods
    const londonAreas = [
      'finchley', 'hampstead', 'islington', 'camden', 'chelsea', 'kensington',
      'paddington', 'shoreditch', 'hoxton', 'dalston', 'hackney', 'stratford',
      'canary wharf', 'greenwich', 'richmond', 'wimbledon', 'putney', 'clapham',
      'brixton', 'streatham', 'croydon', 'ealing', 'acton', 'harrow', 'wembley'
    ];
    
    if (londonAreas.some(area => cleaned.includes(area))) {
      console.log(`🏘️ London area detected, using 2 mile radius`);
      return 2;
    }
    
    // Birmingham areas
    const birminghamAreas = [
      'erdington', 'handsworth', 'aston', 'saltley', 'small heath', 'sparkbrook',
      'moseley', 'kings heath', 'bournville', 'selly oak', 'edgbaston', 'harborne'
    ];
    
    if (birminghamAreas.some(area => cleaned.includes(area))) {
      console.log(`🏘️ Birmingham area detected, using 2 mile radius`);
      return 2;
    }
    
    // General areas
    console.log(`🏘️ General area detected, using 3 mile radius`);
    return 3;
  }
  
  // Check for areas in any input type (not just known_area)
  const allAreas = [
    // London areas
    'finchley', 'hampstead', 'islington', 'camden', 'chelsea', 'kensington',
    'paddington', 'shoreditch', 'hoxton', 'dalston', 'hackney', 'stratford',
    'canary wharf', 'greenwich', 'richmond', 'wimbledon', 'putney', 'clapham',
    'brixton', 'streatham', 'croydon', 'ealing', 'acton', 'harrow', 'wembley',
    // Birmingham areas
    'erdington', 'handsworth', 'aston', 'saltley', 'small heath', 'sparkbrook',
    'moseley', 'kings heath', 'bournville', 'selly oak', 'edgbaston', 'harborne',
    // Manchester areas
    'didsbury', 'chorlton', 'fallowfield', 'rusholme', 'withington', 'burnage', 'gorton',
    // Oxford areas
    'cowley', 'headington', 'summertown', 'jericho', 'botley',
    // Cambridge areas
    'mill road', 'cherry hinton', 'trumpington', 'girton', 'newnham'
  ];
  
  for (const area of allAreas) {
    const areaRegex = new RegExp(`\\b${area}\\b`, 'i');
    if (areaRegex.test(cleaned)) {
      console.log(`🏘️ Area detected: ${area}, using 2 mile radius`);
      return 2;
    }
  }
  
  // Check for major streets that should get larger radius
  const majorStreets = [
    'oxford street', 'regent street', 'bond street', 'carnaby street',
    'brick lane', 'camden high street', 'portobello road', 'kings road'
  ];
  
  for (const street of majorStreets) {
    const streetRegex = new RegExp(`\\b${street}\\b`, 'i');
    if (streetRegex.test(cleaned)) {
      console.log(`🛣️ Major street detected: ${street}, using 2 mile radius`);
      return 2;
    }
  }

  // Default radius for unknown locations - now more generous
  console.log(`📍 Unknown location type, using 5 mile radius (comprehensive search)`);
  return 5;
};

/**
 * Progressive Search Strategy
 * Expands search radius if not enough results found
 */
const getProgressiveRadius = (baseRadius, resultCount, maxExpansions = 3) => {
  const radiusSteps = [baseRadius];
  
  // Progressive expansion steps
  if (baseRadius <= 3) {
    radiusSteps.push(5, 10, 15);
  } else if (baseRadius <= 8) {
    radiusSteps.push(12, 20, 30);
  } else if (baseRadius <= 15) {
    radiusSteps.push(25, 40, 60);
  } else {
    radiusSteps.push(baseRadius * 1.5, baseRadius * 2, baseRadius * 3);
  }
  
  // Determine which radius to use based on result count
  if (resultCount >= 20) {
    return radiusSteps[0]; // Keep current radius
  } else if (resultCount >= 10) {
    return radiusSteps[1]; // Expand to next step
  } else if (resultCount >= 5) {
    return radiusSteps[2]; // Expand further
  } else {
    return radiusSteps[3]; // Maximum expansion
  }
};

/**
 * Smart Search Strategy with Progressive Fallback
 * Professional approach like Rightmove/Zoopla
 */
const createSmartSearchStrategy = (query, userRadius = null) => {
  console.log(`🧠 Creating smart search strategy for: "${query}"`);
  
  // Parse the input
  const parsedInput = parseLocationInput(query);
  console.log(`📋 Parsed input: ${JSON.stringify(parsedInput)}`);
  
  // Get smart radius based on input type
  const smartRadius = getSmartRadius(parsedInput, userRadius);
  console.log(`📏 Smart radius determined: ${smartRadius} miles`);
  
  // Generate search variations for fuzzy matching
  const searchVariations = generateSearchVariations(query);
  
  // Create fuzzy city matches for typo tolerance
  const ukCities = [
    'london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 
    'bristol', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford', 
    'stoke', 'wolverhampton', 'plymouth', 'derby', 'southampton', 'portsmouth',
    'brighton', 'reading', 'northampton', 'luton', 'warrington', 'bournemouth',
    'peterborough', 'cambridge', 'oxford', 'york', 'carlisle', 'preston',
    'chester', 'gloucester', 'worcester', 'exeter', 'bath', 'salisbury'
  ];
  
  const fuzzyMatches = getFuzzyCityMatches(query, ukCities);
  
  // If we have fuzzy matches, use the corrected city for radius calculation
  if (fuzzyMatches.length > 0) {
    const correctedCity = fuzzyMatches[0];
    const correctedRadius = getSmartRadius({ type: 'city', city: correctedCity, location: correctedCity });
    console.log(`🔍 Fuzzy match found: "${query}" → "${correctedCity}", using ${correctedRadius} mile radius`);
    return {
      originalQuery: query,
      parsedInput,
      smartRadius: correctedRadius, // Use corrected radius
      searchVariations,
      fuzzyMatches,
      searchStrategy: 'progressive_smart',
      shouldUseGeographic: true,
      shouldUseText: true,
      shouldUseFuzzy: fuzzyMatches.length > 0,
      
      // Progressive search configuration
      progressiveSteps: [correctedRadius, correctedRadius * 2, correctedRadius * 3, correctedRadius * 5],
      minResultsForRadius: [20, 10, 5, 0],
      
      // Fallback strategies
      fallbackStrategies: [
        'geographic_radius',
        'text_search',
        'fuzzy_matching',
        'popular_areas'
      ]
    };
  }
  
  return {
    originalQuery: query,
    parsedInput,
    smartRadius,
    searchVariations,
    fuzzyMatches,
    searchStrategy: 'progressive_smart',
    shouldUseGeographic: true,
    shouldUseText: true,
    shouldUseFuzzy: fuzzyMatches.length > 0,
    
    // Progressive search configuration
    progressiveSteps: [smartRadius, smartRadius * 2, smartRadius * 3, smartRadius * 5],
    minResultsForRadius: [20, 10, 5, 0],
    
    // Fallback strategies
    fallbackStrategies: [
      'geographic_radius',
      'text_search',
      'fuzzy_matching',
      'popular_areas'
    ]
  };
};

/**
 * Generate Smart Search Suggestions
 * Real-time suggestions as user types
 */
const generateSmartSuggestions = (query, maxSuggestions = 8) => {
  if (!query || query.length < 2) {
    return [];
  }

  const suggestions = [];
  const cleaned = query.toLowerCase().trim();
  
  // UK Cities with fuzzy matching
  const ukCities = [
    'london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 
    'bristol', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford', 
    'stoke', 'wolverhampton', 'plymouth', 'derby', 'southampton', 'portsmouth',
    'brighton', 'reading', 'northampton', 'luton', 'warrington', 'bournemouth',
    'peterborough', 'cambridge', 'oxford', 'york', 'carlisle', 'preston',
    'chester', 'gloucester', 'worcester', 'exeter', 'bath', 'salisbury'
  ];
  
  // Find fuzzy city matches
  const fuzzyCities = getFuzzyCityMatches(cleaned, ukCities);
  fuzzyCities.forEach(city => {
    const radius = getSmartRadius({ type: 'city', city, location: city });
    suggestions.push({
      type: 'city',
      display: `${city.charAt(0).toUpperCase() + city.slice(1)} (${radius} miles)`,
      value: city,
      radius: radius,
      icon: '🏙️',
      confidence: 0.9
    });
  });
  
  // Popular areas based on input
  const popularAreas = {
    'london': ['Camden', 'Islington', 'Hackney', 'Greenwich', 'Richmond'],
    'birmingham': ['Edgbaston', 'Harborne', 'Moseley', 'Kings Heath', 'Bournville'],
    'manchester': ['Didsbury', 'Chorlton', 'Fallowfield', 'Rusholme', 'Withington'],
    'oxford': ['Cowley', 'Headington', 'Summertown', 'Jericho', 'Botley'],
    'cambridge': ['Mill Road', 'Cherry Hinton', 'Trumpington', 'Girton', 'Newnham']
  };
  
  // Add popular areas for detected cities
  for (const [city, areas] of Object.entries(popularAreas)) {
    if (cleaned.includes(city) || fuzzyCities.includes(city)) {
      areas.forEach(area => {
        suggestions.push({
          type: 'area',
          display: `${area}, ${city.charAt(0).toUpperCase() + city.slice(1)}`,
          value: `${area} ${city}`,
          radius: 2,
          icon: '🏘️',
          confidence: 0.8
        });
      });
    }
  }
  
  // Postcode suggestions for partial matches
  if (cleaned.match(/^[a-z]{1,2}$/i)) {
    const postcodeAreas = {
      'b': 'Birmingham',
      'm': 'Manchester', 
      'l': 'Liverpool',
      's': 'Sheffield',
      'n': 'Newcastle',
      'sw': 'South West London',
      'nw': 'North West London',
      'se': 'South East London',
      'e': 'East London',
      'w': 'West London'
    };
    
    const area = cleaned.toUpperCase();
    if (postcodeAreas[area]) {
      suggestions.push({
        type: 'postcode_area',
        display: `${area} - ${postcodeAreas[area]}`,
        value: area,
        radius: 8,
        icon: '📮',
        confidence: 0.85
      });
    }
  }
  
  // Typo correction suggestions
  if (fuzzyCities.length > 0) {
    const originalCity = fuzzyCities[0];
    if (originalCity !== cleaned) {
      suggestions.unshift({
        type: 'correction',
        display: `Did you mean: ${originalCity.charAt(0).toUpperCase() + originalCity.slice(1)}?`,
        value: originalCity,
        radius: getSmartRadius({ type: 'city', city: originalCity, location: originalCity }),
        icon: '🔍',
        confidence: 0.95
      });
    }
  }
  
  // Remove duplicates and limit results
  return suggestions
    .filter((suggestion, index, self) => 
      index === self.findIndex(s => s.display === suggestion.display)
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
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
  getComprehensiveFallbackCoordinates,
  geocodeLocation: geocodeLocationEnhanced, // Alias for backwards compatibility
  geocodeWithNominatim, // Keep original for fallback
  geocodeWithLocationIQ, // Keep original for fallback
  calculateDistance,
  analyzeSearchType,
  // New smart search functions
  getSmartRadius,
  getProgressiveRadius,
  createSmartSearchStrategy,
  generateSmartSuggestions
}; 