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
 * Calculate distance between two points using Haversine formula
 * Returns distance in miles
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Analyze search type to determine the best search strategy
 */
const analyzeSearchType = (query) => {
  if (!query || typeof query !== 'string') {
    return { type: 'unknown', confidence: 0 };
  }
  
  const normalized = normalizeSearchText(query);
  
  if (isPostcodePattern(query)) {
    return { type: 'postcode', confidence: 0.9 };
  }
  
  if (isCityPattern(query)) {
    return { type: 'city', confidence: 0.8 };
  }
  
  if (isStreetPattern(query)) {
    return { type: 'street', confidence: 0.7 };
  }
  
  return { type: 'general', confidence: 0.5 };
};

/**
 * Get smart radius based on search type and location
 */
const getSmartRadius = (parsedInput, userRadius = null) => {
  // If user specified a radius, use it
  if (userRadius && userRadius > 0) {
    console.log(`👤 User specified radius: ${userRadius} miles`);
    return userRadius;
  }

  if (!parsedInput) {
    console.log(`📍 No parsed input, using default 5 mile radius`);
    return 5;
  }

  // Ensure type is properly defined
  const type = parsedInput.type || 'general';
  const location = parsedInput.location || parsedInput.city || parsedInput.area || '';
  const cleaned = location.toLowerCase().trim();

  // Major UK Cities (radius based on population)
  const ukCities = {
    'london': 15, 'birmingham': 12, 'manchester': 12, 'liverpool': 10, 'leeds': 10,
    'sheffield': 10, 'bristol': 10, 'edinburgh': 10, 'glasgow': 12, 'cardiff': 8,
    'belfast': 10, 'newcastle': 8, 'nottingham': 8, 'leicester': 8, 'coventry': 8,
    'bradford': 6, 'stoke': 6, 'wolverhampton': 6, 'plymouth': 6, 'derby': 6,
    'southampton': 6, 'portsmouth': 6, 'brighton': 6, 'reading': 6, 'northampton': 6,
    'luton': 6, 'warrington': 6, 'bournemouth': 6, 'peterborough': 6, 'cambridge': 8,
    'oxford': 8, 'york': 6, 'carlisle': 6, 'preston': 6, 'chester': 6, 'gloucester': 6,
    'worcester': 6, 'exeter': 6, 'bath': 6, 'salisbury': 6
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

  // Check for major city match
  for (const [city, radius] of Object.entries(ukCities)) {
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

  // Postcode-based radius scaling
  if (type && type.includes('postcode')) {
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
  if (type && type.includes('street')) {
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
      console.log(`🏘️ London area detected, using 3 mile radius`);
      return 3;
    }
    
    // Other city areas
    console.log(`🏘️ City area detected, using 4 mile radius`);
    return 4;
  }

  // Default radius based on input type
  if (type && type.includes('postcode')) {
    console.log(`📮 Postcode search, using 2 mile radius`);
    return 2;
  }
  
  if (type && type.includes('city')) {
    console.log(`🏙️ City search, using 8 mile radius`);
    return 8;
  }
  
  if (type && type.includes('street')) {
    console.log(`🛣️ Street search, using 1 mile radius`);
    return 1;
  }

  // General search
  console.log(`🔍 General search, using 5 mile radius`);
  return 5;
};

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
  
  // Common street/area names that are NOT cities (exclude these)
  const notCities = [
    'snow hill', 'high street', 'main street', 'church street', 'station road',
    'queensway', 'moor street', 'bull street', 'new street', 'old street',
    'market street', 'king street', 'queen street', 'prince street',
    'hospital road', 'school lane', 'park road', 'church lane',
    'finchley', 'finchley central', 'north finchley', 'east finchley',
    'ballards lane', 'tally ho', 'clive passage', 'shadwell street',
    'hospital street', 'monmouth street', 'camden',
    // London areas (should use geocoding + radius, not city search)
    'ealing', 'acton', 'harrow', 'wembley', 'barnet', 'enfield', 'edmonton',
    'brixton', 'streatham', 'croydon', 'bexley', 'greenwich', 'lewisham',
    'southwark', 'lambeth', 'wandsworth', 'hammersmith', 'fulham', 'richmond',
    'kingston', 'bromley', 'havering', 'barking', 'redbridge', 'waltham forest',
    'haringey', 'hillingdon', 'hounslow', 'chiswick', 'putney', 'wimbledon',
    'clapham', 'dulwich', 'peckham', 'bermondsey', 'canary wharf', 'westminster',
    'kensington', 'chelsea', 'islington', 'hackney', 'tower hamlets'
  ];
  
  const isNotCity = notCities.some(notCity => 
    normalized.includes(notCity) || notCity.includes(normalized)
  );
  
  // If it's 1-3 words and contains no numbers, likely a city (but exclude known non-cities)
  return (wordCount >= 1 && wordCount <= 3 && !/\d/.test(normalized) && !isNotCity) || hasIndicators;
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
 * Enhanced Geocoding with Multiple Services for Maximum Accuracy
 * 
 * Services used in order of preference:
 * 1. Google Geocoding API (highest accuracy)
 * 2. UK Postcodes API (best for UK postcodes)
 * 3. UK Places API (comprehensive UK places)
 * 4. Enhanced Nominatim (OpenStreetMap)
 * 5. LocationIQ (backup)
 * 6. Comprehensive fallback database
 */

const geocodeLocationEnhanced = async (location, parsedInput = null) => {
  if (!location || typeof location !== 'string') {
    return null;
  }

  const parsed = parsedInput || parseLocationInput(location);
  console.log(`🔍 Enhanced Geocoding Analysis: ${JSON.stringify(parsed)}`);

  try {
    // Strategy 0: Check fallback database first for postcodes (fastest, no API calls)
    if ((parsed.type && parsed.type.includes('postcode')) || parsed.searchStrategy === 'postcode_primary') {
      const fallbackResult = getComprehensiveFallbackCoordinates(location, parsed);
      if (fallbackResult) {
        console.log(`✅ Fallback database success for postcode: ${fallbackResult.display_name}`);
        return fallbackResult;
      }
    }

    // Strategy 1: Google Geocoding API (highest accuracy for all locations)
    const googleResult = await geocodeWithGoogle(location, parsed);
    if (googleResult) {
      console.log(`✅ Google Geocoding API success: ${googleResult.display_name}`);
      return googleResult;
    }

    // Strategy 2: UK Postcodes API (best for UK postcodes and places)
    if ((parsed.type && parsed.type.includes('postcode')) || parsed.searchStrategy === 'postcode_primary') {
      const postcodeResult = await geocodeWithUKPostcodes(parsed.postcode || location);
      if (postcodeResult) {
        console.log(`✅ UK Postcodes API success: ${postcodeResult.display_name}`);
        return postcodeResult;
      }
    }

    // Strategy 3: UK Places API (comprehensive UK places database)
    if (['city_with_area', 'known_area', 'area_geographic', 'general_location'].includes(parsed.searchStrategy)) {
      const placesResult = await geocodeWithUKPlaces(parsed.city || parsed.area || location);
      if (placesResult) {
        console.log(`✅ UK Places API success: ${placesResult.display_name}`);
        return placesResult;
      }
    }

    // Strategy 4: Enhanced Nominatim with UK focus and comprehensive coverage
    const nominatimResult = await geocodeWithNominatimEnhanced(location, parsed);
    if (nominatimResult) {
      console.log(`✅ Enhanced Nominatim success: ${nominatimResult.display_name}`);
      return nominatimResult;
    }

    // Strategy 5: LocationIQ as backup
    const locationIQResult = await geocodeWithLocationIQ(location);
    if (locationIQResult) {
      console.log(`✅ LocationIQ success: ${locationIQResult.display_name}`);
      return locationIQResult;
    }

    // Strategy 6: Comprehensive fallback database with ALL UK locations
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
 * Google Geocoding API Integration (Highest Accuracy)
 */
const geocodeWithGoogle = async (location, parsedInput = null) => {
  return new Promise((resolve, reject) => {
    // Check if Google API key is available
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      console.log('⚠️ Google Maps API key not found, skipping Google geocoding');
      resolve(null);
      return;
    }

    const encodedLocation = encodeURIComponent(location);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedLocation}&key=${googleApiKey}&region=gb&components=country:GB`;
    
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (result.status === 'OK' && result.results && result.results.length > 0) {
            const geocodeResult = result.results[0];
            const location = geocodeResult.geometry.location;
            
            // Extract address components for better display name
            const addressComponents = geocodeResult.address_components;
            let displayName = geocodeResult.formatted_address;
            
            // Try to create a more user-friendly display name
            const locality = addressComponents.find(comp => comp.types.includes('locality'))?.long_name;
            const administrativeArea = addressComponents.find(comp => comp.types.includes('administrative_area_level_1'))?.long_name;
            const postalCode = addressComponents.find(comp => comp.types.includes('postal_code'))?.long_name;
            
            if (locality && administrativeArea) {
              displayName = `${locality}, ${administrativeArea}`;
              if (postalCode) {
                displayName += ` ${postalCode}`;
              }
            }
            
            const result = {
              lat: location.lat,
              lng: location.lng,
              display_name: displayName,
              confidence: 0.95, // Google has highest confidence
              source: 'google_geocoding',
              address_components: addressComponents
            };
            
            console.log(`🌍 Google Geocoding result: ${displayName} (${location.lat}, ${location.lng})`);
            resolve(result);
          } else {
            console.log(`⚠️ Google Geocoding failed for "${location}": ${result.status}`);
            resolve(null);
          }
        } catch (error) {
          console.error(`❌ Google Geocoding parsing error:`, error.message);
          resolve(null);
        }
      });
    });
    
    request.on('error', (error) => {
      console.error(`❌ Google Geocoding request error:`, error.message);
      resolve(null);
    });
    
    request.setTimeout(5000, () => {
      console.log(`⏰ Google Geocoding timeout for "${location}"`);
      request.destroy();
      resolve(null);
    });
  });
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
  
  // Ensure type is properly defined from parsedInput
  const type = parsedInput ? (parsedInput.type || 'general') : 'general';
  
  // Major UK Cities with enhanced coverage
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
    'belfast': { lat: 54.5973, lng: -5.9301, name: 'Belfast, Northern Ireland, UK', radius: 10 },
    'newcastle': { lat: 54.9783, lng: -1.6178, name: 'Newcastle, England, UK', radius: 8 },
    'nottingham': { lat: 52.9548, lng: -1.1581, name: 'Nottingham, England, UK', radius: 8 },
    'leicester': { lat: 52.6369, lng: -1.1398, name: 'Leicester, England, UK', radius: 8 },
    'coventry': { lat: 52.4068, lng: -1.5197, name: 'Coventry, England, UK', radius: 8 },
    'bradford': { lat: 53.7950, lng: -1.7594, name: 'Bradford, England, UK', radius: 6 },
    'stoke': { lat: 53.0258, lng: -2.1858, name: 'Stoke-on-Trent, England, UK', radius: 6 },
    'wolverhampton': { lat: 52.5862, lng: -2.1286, name: 'Wolverhampton, England, UK', radius: 6 },
    'plymouth': { lat: 50.3755, lng: -4.1427, name: 'Plymouth, England, UK', radius: 6 },
    'derby': { lat: 52.9228, lng: -1.4766, name: 'Derby, England, UK', radius: 6 },
    'southampton': { lat: 50.9097, lng: -1.4044, name: 'Southampton, England, UK', radius: 6 },
    'portsmouth': { lat: 50.8198, lng: -1.1138, name: 'Portsmouth, England, UK', radius: 6 },
    'brighton': { lat: 50.8225, lng: -0.1372, name: 'Brighton, England, UK', radius: 6 },
    'reading': { lat: 51.4543, lng: -0.9781, name: 'Reading, England, UK', radius: 6 },
    'northampton': { lat: 52.2405, lng: -0.9027, name: 'Northampton, England, UK', radius: 6 },
    'luton': { lat: 51.8795, lng: -0.4172, name: 'Luton, England, UK', radius: 6 },
    'warrington': { lat: 53.3900, lng: -2.5969, name: 'Warrington, England, UK', radius: 6 },
    'bournemouth': { lat: 50.7192, lng: -1.8808, name: 'Bournemouth, England, UK', radius: 6 },
    'peterborough': { lat: 52.5736, lng: -0.2475, name: 'Peterborough, England, UK', radius: 6 },
    'cambridge': { lat: 52.2053, lng: 0.1218, name: 'Cambridge, England, UK', radius: 8 },
    'oxford': { lat: 51.7520, lng: -1.2577, name: 'Oxford, England, UK', radius: 8 },
    'york': { lat: 53.9598, lng: -1.0823, name: 'York, England, UK', radius: 6 },
    'carlisle': { lat: 54.8925, lng: -2.9329, name: 'Carlisle, England, UK', radius: 6 },
    'preston': { lat: 53.7576, lng: -2.7034, name: 'Preston, England, UK', radius: 6 },
    'chester': { lat: 53.1934, lng: -2.8931, name: 'Chester, England, UK', radius: 6 },
    'gloucester': { lat: 51.8642, lng: -2.2380, name: 'Gloucester, England, UK', radius: 6 },
    'worcester': { lat: 52.1920, lng: -2.2200, name: 'Worcester, England, UK', radius: 6 },
    'exeter': { lat: 50.7184, lng: -3.5339, name: 'Exeter, England, UK', radius: 6 },
    'bath': { lat: 51.3758, lng: -2.3599, name: 'Bath, England, UK', radius: 6 },
    'salisbury': { lat: 51.0688, lng: -1.7945, name: 'Salisbury, England, UK', radius: 6 }
  };

  // London Areas (enhanced coverage)
  const londonAreas = {
    'colindale': { lat: 51.5894, lng: -0.2389, name: 'Colindale, London, UK', radius: 3 },
    'finchley': { lat: 51.5958, lng: -0.1883, name: 'Finchley, London, UK', radius: 3 },
    'north finchley': { lat: 51.6130, lng: -0.1772, name: 'North Finchley, London, UK', radius: 3 },
    'hampstead': { lat: 51.5581, lng: -0.1755, name: 'Hampstead, London, UK', radius: 3 },
    'islington': { lat: 51.5362, lng: -0.1034, name: 'Islington, London, UK', radius: 3 },
    'camden': { lat: 51.5392, lng: -0.1426, name: 'Camden, London, UK', radius: 3 },
    'hackney': { lat: 51.5455, lng: -0.0557, name: 'Hackney, London, UK', radius: 3 },
    'tower hamlets': { lat: 51.5200, lng: -0.0290, name: 'Tower Hamlets, London, UK', radius: 3 },
    'greenwich': { lat: 51.4800, lng: 0.0000, name: 'Greenwich, London, UK', radius: 3 },
    'lewisham': { lat: 51.4620, lng: -0.0120, name: 'Lewisham, London, UK', radius: 3 },
    'southwark': { lat: 51.5000, lng: -0.0833, name: 'Southwark, London, UK', radius: 3 },
    'lambeth': { lat: 51.5000, lng: -0.1167, name: 'Lambeth, London, UK', radius: 3 },
    'wandsworth': { lat: 51.4567, lng: -0.1897, name: 'Wandsworth, London, UK', radius: 3 },
    'hammersmith': { lat: 51.5000, lng: -0.2333, name: 'Hammersmith, London, UK', radius: 3 },
    'kensington': { lat: 51.5000, lng: -0.1833, name: 'Kensington, London, UK', radius: 3 },
    'westminster': { lat: 51.5000, lng: -0.1333, name: 'Westminster, London, UK', radius: 3 },
    'city of london': { lat: 51.5154, lng: -0.0922, name: 'City of London, UK', radius: 3 },
    'brent': { lat: 51.5580, lng: -0.2800, name: 'Brent, London, UK', radius: 3 },
    'ealing': { lat: 51.5130, lng: -0.3080, name: 'Ealing, London, UK', radius: 3 },
    'hillingdon': { lat: 51.5400, lng: -0.4700, name: 'Hillingdon, London, UK', radius: 3 },
    'harrow': { lat: 51.5800, lng: -0.3300, name: 'Harrow, London, UK', radius: 3 },
    'barnet': { lat: 51.6300, lng: -0.2000, name: 'Barnet, London, UK', radius: 3 },
    'enfield': { lat: 51.6500, lng: -0.0800, name: 'Enfield, London, UK', radius: 3 },
    'waltham forest': { lat: 51.5900, lng: -0.0200, name: 'Waltham Forest, London, UK', radius: 3 },
    'redbridge': { lat: 51.5600, lng: 0.0700, name: 'Redbridge, London, UK', radius: 3 },
    'havering': { lat: 51.5800, lng: 0.2000, name: 'Havering, London, UK', radius: 3 },
    'barking': { lat: 51.5400, lng: 0.0800, name: 'Barking, London, UK', radius: 3 },
    'newham': { lat: 51.5300, lng: 0.0000, name: 'Newham, London, UK', radius: 3 },
    'bexley': { lat: 51.4500, lng: 0.1500, name: 'Bexley, London, UK', radius: 3 },
    'bromley': { lat: 51.4000, lng: 0.0200, name: 'Bromley, London, UK', radius: 3 },
    'croydon': { lat: 51.3700, lng: -0.1000, name: 'Croydon, London, UK', radius: 3 },
    'sutton': { lat: 51.3600, lng: -0.2000, name: 'Sutton, London, UK', radius: 3 },
    'kingston': { lat: 51.4100, lng: -0.3000, name: 'Kingston, London, UK', radius: 3 },
    'richmond': { lat: 51.4500, lng: -0.3000, name: 'Richmond, London, UK', radius: 3 },
    'merton': { lat: 51.4100, lng: -0.2000, name: 'Merton, London, UK', radius: 3 }
  };

  // Birmingham Areas (enhanced coverage)
  const birminghamAreas = {
    'erdington': { lat: 52.5292, lng: -1.8441, name: 'Erdington, Birmingham, UK', radius: 3 },
    'handsworth': { lat: 52.5184, lng: -1.9286, name: 'Handsworth, Birmingham, UK', radius: 3 },
    'edgbaston': { lat: 52.4539, lng: -1.9248, name: 'Edgbaston, Birmingham, UK', radius: 3 },
    'aston': { lat: 52.5000, lng: -1.8833, name: 'Aston, Birmingham, UK', radius: 3 },
    'nechells': { lat: 52.5000, lng: -1.8667, name: 'Nechells, Birmingham, UK', radius: 3 },
    'ladywood': { lat: 52.4667, lng: -1.9167, name: 'Ladywood, Birmingham, UK', radius: 3 },
    'sparkbrook': { lat: 52.4667, lng: -1.8833, name: 'Sparkbrook, Birmingham, UK', radius: 3 },
    'sparkhill': { lat: 52.4500, lng: -1.8667, name: 'Sparkhill, Birmingham, UK', radius: 3 },
    'small heath': { lat: 52.4667, lng: -1.8500, name: 'Small Heath, Birmingham, UK', radius: 3 },
    'digbeth': { lat: 52.4667, lng: -1.8833, name: 'Digbeth, Birmingham, UK', radius: 3 },
    'bordesley': { lat: 52.4667, lng: -1.8667, name: 'Bordesley, Birmingham, UK', radius: 3 },
    'saltley': { lat: 52.4833, lng: -1.8500, name: 'Saltley, Birmingham, UK', radius: 3 },
    'washwood heath': { lat: 52.5000, lng: -1.8500, name: 'Washwood Heath, Birmingham, UK', radius: 3 },
    'ward end': { lat: 52.5000, lng: -1.8667, name: 'Ward End, Birmingham, UK', radius: 3 },
    'tyburn': { lat: 52.5167, lng: -1.8500, name: 'Tyburn, Birmingham, UK', radius: 3 },
    'castle vale': { lat: 52.5167, lng: -1.8167, name: 'Castle Vale, Birmingham, UK', radius: 3 },
    'sutton coldfield': { lat: 52.5667, lng: -1.8167, name: 'Sutton Coldfield, Birmingham, UK', radius: 3 },
    'perry barr': { lat: 52.5167, lng: -1.9000, name: 'Perry Barr, Birmingham, UK', radius: 3 },
    'oscott': { lat: 52.5333, lng: -1.9000, name: 'Oscott, Birmingham, UK', radius: 3 },
    'kingstanding': { lat: 52.5333, lng: -1.8833, name: 'Kingstanding, Birmingham, UK', radius: 3 },
    'great barr': { lat: 52.5500, lng: -1.9000, name: 'Great Barr, Birmingham, UK', radius: 3 },
    'west bromwich': { lat: 52.5167, lng: -2.0000, name: 'West Bromwich, Birmingham, UK', radius: 3 },
    'smethwick': { lat: 52.5000, lng: -2.0000, name: 'Smethwick, Birmingham, UK', radius: 3 },
    'oldbury': { lat: 52.5000, lng: -2.0167, name: 'Oldbury, Birmingham, UK', radius: 3 },
    'rowley regis': { lat: 52.4833, lng: -2.0333, name: 'Rowley Regis, Birmingham, UK', radius: 3 },
    'tividale': { lat: 52.4833, lng: -2.0167, name: 'Tividale, Birmingham, UK', radius: 3 },
    'blackheath': { lat: 52.4667, lng: -2.0500, name: 'Blackheath, Birmingham, UK', radius: 3 },
    'halesowen': { lat: 52.4500, lng: -2.0500, name: 'Halesowen, Birmingham, UK', radius: 3 },
    'cradley heath': { lat: 52.4667, lng: -2.0833, name: 'Cradley Heath, Birmingham, UK', radius: 3 },
    'stourbridge': { lat: 52.4500, lng: -2.1500, name: 'Stourbridge, Birmingham, UK', radius: 3 },
    'dudley': { lat: 52.5000, lng: -2.0833, name: 'Dudley, Birmingham, UK', radius: 3 },
    'netherton': { lat: 52.4833, lng: -2.0833, name: 'Netherton, Birmingham, UK', radius: 3 },
    'brierley hill': { lat: 52.4667, lng: -2.1167, name: 'Brierley Hill, Birmingham, UK', radius: 3 },
    'kingswinford': { lat: 52.4833, lng: -2.1667, name: 'Kingswinford, Birmingham, UK', radius: 3 },
    'amblecote': { lat: 52.4667, lng: -2.1500, name: 'Amblecote, Birmingham, UK', radius: 3 },
    'pedmore': { lat: 52.4500, lng: -2.1500, name: 'Pedmore, Birmingham, UK', radius: 3 },
    'wollaston': { lat: 52.4500, lng: -2.1667, name: 'Wollaston, Birmingham, UK', radius: 3 },
    'stourton': { lat: 52.4500, lng: -2.1833, name: 'Stourton, Birmingham, UK', radius: 3 },
    'kinver': { lat: 52.4500, lng: -2.2167, name: 'Kinver, Birmingham, UK', radius: 3 },
    'enville': { lat: 52.4500, lng: -2.2500, name: 'Enville, Birmingham, UK', radius: 3 },
    'trysull': { lat: 52.4500, lng: -2.2833, name: 'Trysull, Birmingham, UK', radius: 3 },
    'wombourne': { lat: 52.5333, lng: -2.1833, name: 'Wombourne, Birmingham, UK', radius: 3 },
    'pattingham': { lat: 52.5667, lng: -2.2667, name: 'Pattingham, Birmingham, UK', radius: 3 },
    'tettenhall': { lat: 52.5833, lng: -2.1667, name: 'Tettenhall, Birmingham, UK', radius: 3 },
    'wolverhampton': { lat: 52.5862, lng: -2.1286, name: 'Wolverhampton, Birmingham, UK', radius: 3 },
    'bilston': { lat: 52.5667, lng: -2.0833, name: 'Bilston, Birmingham, UK', radius: 3 },
    'willenhall': { lat: 52.5833, lng: -2.0667, name: 'Willenhall, Birmingham, UK', radius: 3 },
    'walsall': { lat: 52.5833, lng: -1.9833, name: 'Walsall, Birmingham, UK', radius: 3 },
    'bloxwich': { lat: 52.6167, lng: -2.0000, name: 'Bloxwich, Birmingham, UK', radius: 3 },
    'brownhills': { lat: 52.6500, lng: -1.9333, name: 'Brownhills, Birmingham, UK', radius: 3 },
    'aldridge': { lat: 52.6000, lng: -1.9167, name: 'Aldridge, Birmingham, UK', radius: 3 },
    'streetly': { lat: 52.5667, lng: -1.8833, name: 'Streetly, Birmingham, UK', radius: 3 },
    'shenstone': { lat: 52.6333, lng: -1.8333, name: 'Shenstone, Birmingham, UK', radius: 3 },
    'lichfield': { lat: 52.6833, lng: -1.8333, name: 'Lichfield, Birmingham, UK', radius: 3 },
    'tamworth': { lat: 52.6333, lng: -1.6833, name: 'Tamworth, Birmingham, UK', radius: 3 },
    'atherstone': { lat: 52.5833, lng: -1.5500, name: 'Atherstone, Birmingham, UK', radius: 3 },
    'nuneaton': { lat: 52.5167, lng: -1.4667, name: 'Nuneaton, Birmingham, UK', radius: 3 },
    'bedworth': { lat: 52.4833, lng: -1.4667, name: 'Bedworth, Birmingham, UK', radius: 3 },
    'coventry': { lat: 52.4068, lng: -1.5197, name: 'Coventry, Birmingham, UK', radius: 3 },
    'rugby': { lat: 52.3667, lng: -1.2667, name: 'Rugby, Birmingham, UK', radius: 3 },
    'leamington spa': { lat: 52.3000, lng: -1.5333, name: 'Leamington Spa, Birmingham, UK', radius: 3 },
    'warwick': { lat: 52.2833, lng: -1.5833, name: 'Warwick, Birmingham, UK', radius: 3 },
    'stratford': { lat: 52.2000, lng: -1.7000, name: 'Stratford, Birmingham, UK', radius: 3 },
    'redditch': { lat: 52.3000, lng: -1.9500, name: 'Redditch, Birmingham, UK', radius: 3 },
    'bromsgrove': { lat: 52.3333, lng: -2.0667, name: 'Bromsgrove, Birmingham, UK', radius: 3 },
    'droitwich': { lat: 52.2667, lng: -2.1500, name: 'Droitwich, Birmingham, UK', radius: 3 },
    'worcester': { lat: 52.1920, lng: -2.2200, name: 'Worcester, Birmingham, UK', radius: 3 },
    'malvern': { lat: 52.1167, lng: -2.3167, name: 'Malvern, Birmingham, UK', radius: 3 },
    'hereford': { lat: 52.0500, lng: -2.7167, name: 'Hereford, Birmingham, UK', radius: 3 },
    'ledbury': { lat: 52.0333, lng: -2.4167, name: 'Ledbury, Birmingham, UK', radius: 3 },
    'ross on wye': { lat: 51.9167, lng: -2.5833, name: 'Ross on Wye, Birmingham, UK', radius: 3 },
    'monmouth': { lat: 51.8167, lng: -2.7167, name: 'Monmouth, Birmingham, UK', radius: 3 },
    'chepstow': { lat: 51.6333, lng: -2.6833, name: 'Chepstow, Birmingham, UK', radius: 3 },
    'newport': { lat: 51.5833, lng: -2.9833, name: 'Newport, Birmingham, UK', radius: 3 },
    'cardiff': { lat: 51.4816, lng: -3.1791, name: 'Cardiff, Birmingham, UK', radius: 3 },
    'swansea': { lat: 51.6167, lng: -3.9500, name: 'Swansea, Birmingham, UK', radius: 3 },
    'neath': { lat: 51.6500, lng: -3.8000, name: 'Neath, Birmingham, UK', radius: 3 },
    'port talbot': { lat: 51.6000, lng: -3.7833, name: 'Port Talbot, Birmingham, UK', radius: 3 },
    'bridgend': { lat: 51.5000, lng: -3.5833, name: 'Bridgend, Birmingham, UK', radius: 3 },
    'pontypridd': { lat: 51.6000, lng: -3.3333, name: 'Pontypridd, Birmingham, UK', radius: 3 },
    'merthyr tydfil': { lat: 51.7500, lng: -3.3833, name: 'Merthyr Tydfil, Birmingham, UK', radius: 3 },
    'aberystwyth': { lat: 52.4167, lng: -4.0833, name: 'Aberystwyth, Birmingham, UK', radius: 3 },
    'bangor': { lat: 53.2167, lng: -4.1167, name: 'Bangor, Birmingham, UK', radius: 3 },
    'caernarfon': { lat: 53.1333, lng: -4.2667, name: 'Caernarfon, Birmingham, UK', radius: 3 },
    'llandudno': { lat: 53.3167, lng: -3.8333, name: 'Llandudno, Birmingham, UK', radius: 3 },
    'rhyl': { lat: 53.3167, lng: -3.5000, name: 'Rhyl, Birmingham, UK', radius: 3 },
    'prestatyn': { lat: 53.3333, lng: -3.4167, name: 'Prestatyn, Birmingham, UK', radius: 3 },
    'colwyn bay': { lat: 53.3000, lng: -3.7167, name: 'Colwyn Bay, Birmingham, UK', radius: 3 },
    'abergele': { lat: 53.2833, lng: -3.5833, name: 'Abergele, Birmingham, UK', radius: 3 },
    'conwy': { lat: 53.2833, lng: -3.8333, name: 'Conwy, Birmingham, UK', radius: 3 },
    'betws y coed': { lat: 53.1000, lng: -3.8000, name: 'Betws y Coed, Birmingham, UK', radius: 3 },
    'blaenau ffestiniog': { lat: 52.9833, lng: -3.9333, name: 'Blaenau Ffestiniog, Birmingham, UK', radius: 3 },
    'dolgellau': { lat: 52.7500, lng: -3.8833, name: 'Dolgellau, Birmingham, UK', radius: 3 },
    'bala': { lat: 52.9167, lng: -3.6000, name: 'Bala, Birmingham, UK', radius: 3 },
    'corwen': { lat: 52.9833, lng: -3.3667, name: 'Corwen, Birmingham, UK', radius: 3 },
    'llangollen': { lat: 52.9667, lng: -3.1667, name: 'Llangollen, Birmingham, UK', radius: 3 },
    'wrexham': { lat: 53.0333, lng: -2.9833, name: 'Wrexham, Birmingham, UK', radius: 3 },
    'mold': { lat: 53.1667, lng: -3.1333, name: 'Mold, Birmingham, UK', radius: 3 },
    'flint': { lat: 53.2500, lng: -3.1333, name: 'Flint, Birmingham, UK', radius: 3 },
    'rhyl': { lat: 53.3167, lng: -3.5000, name: 'Rhyl, Birmingham, UK', radius: 3 },
    'prestatyn': { lat: 53.3333, lng: -3.4167, name: 'Prestatyn, Birmingham, UK', radius: 3 },
    'colwyn bay': { lat: 53.3000, lng: -3.7167, name: 'Colwyn Bay, Birmingham, UK', radius: 3 },
    'abergele': { lat: 53.2833, lng: -3.5833, name: 'Abergele, Birmingham, UK', radius: 3 },
    'conwy': { lat: 53.2833, lng: -3.8333, name: 'Conwy, Birmingham, UK', radius: 3 },
    'betws y coed': { lat: 53.1000, lng: -3.8000, name: 'Betws y Coed, Birmingham, UK', radius: 3 },
    'blaenau ffestiniog': { lat: 52.9833, lng: -3.9333, name: 'Blaenau Ffestiniog, Birmingham, UK', radius: 3 },
    'dolgellau': { lat: 52.7500, lng: -3.8833, name: 'Dolgellau, Birmingham, UK', radius: 3 },
    'bala': { lat: 52.9167, lng: -3.6000, name: 'Bala, Birmingham, UK', radius: 3 },
    'corwen': { lat: 52.9833, lng: -3.3667, name: 'Corwen, Birmingham, UK', radius: 3 },
    'llangollen': { lat: 52.9667, lng: -3.1667, name: 'Llangollen, Birmingham, UK', radius: 3 },
    'wrexham': { lat: 53.0333, lng: -2.9833, name: 'Wrexham, Birmingham, UK', radius: 3 },
    'mold': { lat: 53.1667, lng: -3.1333, name: 'Mold, Birmingham, UK', radius: 3 },
    'flint': { lat: 53.2500, lng: -3.1333, name: 'Flint, Birmingham, UK', radius: 3 }
  };

  // Check for exact matches in all databases
  if (ukCities[cleaned]) {
    const coords = ukCities[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.9,
      source: 'comprehensive_fallback_cities',
      radius: coords.radius
    };
  }

  if (londonAreas[cleaned]) {
    const coords = londonAreas[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.85,
      source: 'comprehensive_fallback_london',
      radius: coords.radius
    };
  }

  if (birminghamAreas[cleaned]) {
    const coords = birminghamAreas[cleaned];
    return {
      lat: coords.lat,
      lng: coords.lng,
      display_name: coords.name,
      confidence: 0.85,
      source: 'comprehensive_fallback_birmingham',
      radius: coords.radius
    };
  }

  // Check for partial matches
  for (const [key, coords] of Object.entries({ ...ukCities, ...londonAreas, ...birminghamAreas })) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        display_name: coords.name,
        confidence: 0.7,
        source: 'comprehensive_fallback_partial',
        radius: coords.radius
      };
    }
  }

  // Postcode-specific handling
  if (type === 'postcode' || type === 'partial_postcode') {
    const postcode = parsedInput?.postcode || location;
    
    // London postcodes
    if (postcode.match(/^(E|EC|N|NW|SE|SW|W|WC)\d/)) {
      return {
        lat: 51.5074,
        lng: -0.1278,
        display_name: 'London, England, UK',
        confidence: 0.8,
        source: 'comprehensive_fallback_london_postcode',
        radius: 15
      };
    }
    
    // Birmingham postcodes
    if (postcode.match(/^B\d/)) {
      return {
        lat: 52.4862,
        lng: -1.8904,
        display_name: 'Birmingham, England, UK',
        confidence: 0.8,
        source: 'comprehensive_fallback_birmingham_postcode',
        radius: 12
      };
    }
    
    // Manchester postcodes
    if (postcode.match(/^M\d/)) {
      return {
        lat: 53.4808,
        lng: -2.2426,
        display_name: 'Manchester, England, UK',
        confidence: 0.8,
        source: 'comprehensive_fallback_manchester_postcode',
        radius: 12
      };
    }
  }

  console.log(`⚠️ No comprehensive fallback found for: "${location}"`);
  return null;
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

/**
 * Auto-correct coordinates for known areas when they are clearly wrong
 * This fixes cases where properties have incorrect coordinates in the database
 */
const correctPropertyCoordinates = (property) => {
  if (!property || !property.address_line1) return property;
  
  const address = property.address_line1.toLowerCase();
  const city = (property.city || '').toLowerCase();
  
  // Known area coordinates (correct ones)
  const areaCoordinates = {
    'finchley central': { lat: 51.6000, lng: -0.2000 },
    'finchley': { lat: 51.6000, lng: -0.2000 },
    'north finchley': { lat: 51.6100, lng: -0.1900 },
    'east finchley': { lat: 51.5900, lng: -0.2100 },
    'ealing': { lat: 51.5000, lng: -0.2833 },
    'acton': { lat: 51.5100, lng: -0.2700 },
    'harrow': { lat: 51.5800, lng: -0.3300 },
    'wembley': { lat: 51.5500, lng: -0.2800 },
    'barnet': { lat: 51.6500, lng: -0.2000 },
    'enfield': { lat: 51.6500, lng: -0.0800 },
    'edmonton': { lat: 51.6200, lng: -0.0600 },
    'brixton': { lat: 51.4600, lng: -0.1100 },
    'streatham': { lat: 51.4300, lng: -0.1300 },
    'croydon': { lat: 51.3800, lng: -0.1100 },
    'bexley': { lat: 51.4500, lng: 0.1500 },
    'greenwich': { lat: 51.4800, lng: 0.0000 },
    'lewisham': { lat: 51.4600, lng: -0.0100 },
    'southwark': { lat: 51.5000, lng: -0.0900 },
    'lambeth': { lat: 51.4900, lng: -0.1100 },
    'wandsworth': { lat: 51.4600, lng: -0.1900 },
    'hammersmith': { lat: 51.4900, lng: -0.2200 },
    'fulham': { lat: 51.4800, lng: -0.2000 },
    'richmond': { lat: 51.4600, lng: -0.3000 },
    'kingston': { lat: 51.4100, lng: -0.3000 },
    'bromley': { lat: 51.4000, lng: 0.0200 },
    'havering': { lat: 51.5800, lng: 0.1800 },
    'barking': { lat: 51.5400, lng: 0.0800 },
    'redbridge': { lat: 51.5600, lng: 0.0700 },
    'waltham forest': { lat: 51.5800, lng: -0.0200 },
    'haringey': { lat: 51.5800, lng: -0.1000 },
    'hillingdon': { lat: 51.5400, lng: -0.4700 },
    'hounslow': { lat: 51.4700, lng: -0.3600 },
    'chiswick': { lat: 51.4900, lng: -0.2600 },
    'putney': { lat: 51.4600, lng: -0.2200 },
    'wimbledon': { lat: 51.4200, lng: -0.2100 },
    'clapham': { lat: 51.4600, lng: -0.1600 },
    'dulwich': { lat: 51.4500, lng: -0.0900 },
    'peckham': { lat: 51.4700, lng: -0.0700 },
    'bermondsey': { lat: 51.4900, lng: -0.0800 },
    'canary wharf': { lat: 51.5000, lng: -0.0200 },
    'westminster': { lat: 51.5000, lng: -0.1300 },
    'kensington': { lat: 51.5000, lng: -0.1900 },
    'chelsea': { lat: 51.4800, lng: -0.1700 },
    'islington': { lat: 51.5400, lng: -0.1000 },
    'hackney': { lat: 51.5500, lng: -0.0500 },
    'tower hamlets': { lat: 51.5200, lng: -0.0300 }
  };
  
  // Check if property address contains known areas
  for (const [area, coords] of Object.entries(areaCoordinates)) {
    if (address.includes(area) || city.includes(area)) {
      // Check if current coordinates are clearly wrong (more than 2 miles off)
      const currentLat = parseFloat(property.latitude);
      const currentLng = parseFloat(property.longitude);
      
      if (currentLat && currentLng) {
        const distance = calculateDistance(currentLat, currentLng, coords.lat, coords.lng);
        
        // If coordinates are more than 2 miles off, correct them
        if (distance > 2) {
          console.log(`🔧 Auto-correcting coordinates for property ${property.id}: ${address}`);
          console.log(`   Old: (${currentLat}, ${currentLng}) → New: (${coords.lat}, ${coords.lng})`);
          
          return {
            ...property,
            latitude: coords.lat.toString(),
            longitude: coords.lng.toString()
          };
        }
      }
    }
  }
  
  return property;
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
  generateSmartSuggestions,
  correctPropertyCoordinates
}; 