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
 * Professional Geocoding Service
 * Converts "Stone Road" to coordinates for radius-based search
 * Like top property websites (Rightmove, Zoopla, etc.)
 */
const geocodeLocation = async (location) => {
  if (!location || typeof location !== 'string') {
    return null;
  }

  try {
    // Try multiple geocoding services for reliability
    
    // 1. OpenStreetMap Nominatim (free, reliable)
    const nominatimResult = await geocodeWithNominatim(location);
    if (nominatimResult) {
      console.log(`🌍 Geocoded "${location}" via Nominatim: ${nominatimResult.lat}, ${nominatimResult.lng}`);
      return nominatimResult;
    }

    // 2. Fallback to LocationIQ (free tier available)
    const locationIqResult = await geocodeWithLocationIQ(location);
    if (locationIqResult) {
      console.log(`🌍 Geocoded "${location}" via LocationIQ: ${locationIqResult.lat}, ${locationIqResult.lng}`);
      return locationIqResult;
    }

    console.log(`⚠️  Could not geocode location: "${location}"`);
    return null;

  } catch (error) {
    console.error(`❌ Geocoding error for "${location}":`, error.message);
    return null;
  }
};

/**
 * Geocode using OpenStreetMap Nominatim (free, no API key needed)
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
  const coordinates = await geocodeLocation(query);
  
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
  geocodeLocation,
  geocodeWithNominatim,
  geocodeWithLocationIQ,
  calculateDistance,
  analyzeSearchType
}; 