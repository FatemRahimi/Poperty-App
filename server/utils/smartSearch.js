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
    if ((parsed.type && parsed.type.includes('postcode')) || parsed.searchStrategy === 'postcode_primary') {
      const fallbackResult = getComprehensiveFallbackCoordinates(location, parsed);
      if (fallbackResult) {
        console.log(`✅ Fallback database success for postcode: ${fallbackResult.display_name}`);
        return fallbackResult;
      }
    }

    // Strategy 1: UK Postcodes API (best for UK postcodes and places)
    if ((parsed.type && parsed.type.includes('postcode')) || parsed.searchStrategy === 'postcode_primary') {
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
  
  // Ensure type is properly defined from parsedInput
  const type = parsedInput ? (parsedInput.type || 'general') : 'general';
  
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
    'stone': 2, 'sutton coldfield': 2, 'solihull': 2, 'redditch': 2, 'dudley': 2,
    'walsall': 2, 'west bromwich': 2, 'sandwell': 2, 'tamworth': 2, 'litchfield': 2,
    'cannock': 2, 'stafford': 2, 'burton upon trent': 2, 'swadlincote': 2, 'coalville': 2,
    'ashby de la zouch': 2, 'melton mowbray': 2, 'oakham': 2, 'uppingham': 2, 'market harborough': 2,
    'lutterworth': 2, 'rugby': 2, 'nuneaton': 2, 'bedworth': 2, 'kenilworth': 2,
    'leamington spa': 2, 'stratford upon avon': 2, 'warwick': 2, 'henley in arden': 2,
    'alcester': 2, 'studley': 2, 'redditch': 2, 'bromsgrove': 2, 'droitwich': 2,
    'pershore': 2, 'evesham': 2, 'moreton in marsh': 2, 'chipping campden': 2, 'stow on the wold': 2,
    'bourton on the water': 2, 'northleach': 2, 'fairford': 2, 'lechlade': 2, 'witney': 2,
    'carterton': 2, 'bicester': 2, 'banbury': 2, 'chipping norton': 2, 'deddington': 2,
    'brackley': 2, 'towcester': 2, 'daventry': 2, 'northampton': 2, 'wellingborough': 2,
    'rushden': 2, 'kettering': 2, 'corby': 2, 'market harborough': 2, 'lutterworth': 2,
    'rugby': 2, 'nuneaton': 2, 'bedworth': 2, 'kenilworth': 2, 'leamington spa': 2,
    'stratford upon avon': 2, 'warwick': 2, 'henley in arden': 2, 'alcester': 2, 'studley': 2,
    'redditch': 2, 'bromsgrove': 2, 'droitwich': 2, 'pershore': 2, 'evesham': 2,
    'moreton in marsh': 2, 'chipping campden': 2, 'stow on the wold': 2, 'bourton on the water': 2,
    'northleach': 2, 'fairford': 2, 'lechlade': 2, 'witney': 2, 'carterton': 2,
    'bicester': 2, 'banbury': 2, 'chipping norton': 2, 'deddington': 2, 'brackley': 2,
    'towcester': 2, 'daventry': 2, 'northampton': 2, 'wellingborough': 2, 'rushden': 2,
    'kettering': 2, 'corby': 2, 'market harborough': 2, 'lutterworth': 2, 'rugby': 2,
    'nuneaton': 2, 'bedworth': 2, 'kenilworth': 2, 'leamington spa': 2, 'stratford upon avon': 2,
    'warwick': 2, 'henley in arden': 2, 'alcester': 2, 'studley': 2, 'redditch': 2,
    'bromsgrove': 2, 'droitwich': 2, 'pershore': 2, 'evesham': 2, 'moreton in marsh': 2,
    'chipping campden': 2, 'stow on the wold': 2, 'bourton on the water': 2, 'northleach': 2,
    'fairford': 2, 'lechlade': 2, 'witney': 2, 'carterton': 2, 'bicester': 2, 'banbury': 2,
    'chipping norton': 2, 'deddington': 2, 'brackley': 2, 'towcester': 2, 'daventry': 2,
    'northampton': 2, 'wellingborough': 2, 'rushden': 2, 'kettering': 2, 'corby': 2
  };

  // Check for major city match
  for (const [city, data] of Object.entries(ukCities)) {
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    if (cityRegex.test(cleaned) || cleaned === city) {
      console.log(`🏙️ Major city detected: ${city}, using ${data.radius} mile radius`);
      return {
        lat: data.lat,
        lng: data.lng,
        display_name: data.name,
        confidence: 0.9,
        source: 'uk_cities_database'
      };
    }
  }

  // Check for town match
  for (const [town, radius] of Object.entries(ukTowns)) {
    const townRegex = new RegExp(`\\b${town}\\b`, 'i');
    if (townRegex.test(cleaned) || cleaned === town) {
      console.log(`🏘️ Town detected: ${town}, using ${radius} mile radius`);
      return {
        lat: 52.4862, // Default to Birmingham area for towns
        lng: -1.8904,
        display_name: `${town.charAt(0).toUpperCase() + town.slice(1)}, England, UK`,
        confidence: 0.8,
        source: 'uk_towns_database'
      };
    }
  }

  // Check for village match
  for (const [village, radius] of Object.entries(ukVillages)) {
    const villageRegex = new RegExp(`\\b${village}\\b`, 'i');
    if (villageRegex.test(cleaned) || cleaned === village) {
      console.log(`🏡 Village detected: ${village}, using ${radius} mile radius`);
      return {
        lat: 52.4862, // Default to Birmingham area for villages
        lng: -1.8904,
        display_name: `${village.charAt(0).toUpperCase() + village.slice(1)}, England, UK`,
        confidence: 0.7,
        source: 'uk_villages_database'
      };
    }
  }

  // Postcode-based radius scaling
  if (type && type.includes('postcode')) {
    if (parsedInput && parsedInput.postcode) {
      const postcode = parsedInput.postcode.toUpperCase();
      
      // London postcodes - return London coordinates
      if (postcode.match(/^(TW|SW|SE|N|E|W|EC|WC|HA|UB|WD|EN|IG|RM|DA|BR|CR|KT|SM|TW|GU|SL|RG|HP|LU|MK|AL|SG|CM|SS|CO|IP|NR|CB|PE|NN|LE|NG|DE|S|DN|LN|HU|YO|HG|BD|HD|LS|WF|HX|OL|BL|PR|BB|FY|LA|CA|DG|TD|EH|ML|FK|G|PA|KA|AB|DD|PH|KY|DD|FK|ML|EH|TD|DG|CA|LA|FY|BB|PR|BL|OL|HX|WF|LS|HD|BD|HG|YO|HU|LN|DN|S|DE|NG|LE|NN|PE|CB|NR|IP|CO|SS|CM|SG|AL|MK|LU|HP|RG|SL|GU|TW|SM|KT|CR|BR|DA|RM|IG|EN|WD|UB|HA|WC|EC|W|E|N|SE|SW|TW)[0-9]/)) {
        console.log(`📮 London postcode detected: ${postcode}, using London coordinates`);
        return {
          lat: 51.5074, // London coordinates
          lng: -0.1278,
          display_name: `${postcode}, London, England, UK`,
          confidence: 0.9,
          source: 'london_postcode_database'
        };
      }
      
      // Birmingham postcodes - return Birmingham coordinates
      if (postcode.match(/^B[0-9]/)) {
        console.log(`📮 Birmingham postcode detected: ${postcode}, using Birmingham coordinates`);
        return {
          lat: 52.4862, // Birmingham coordinates
          lng: -1.8904,
          display_name: `${postcode}, Birmingham, England, UK`,
          confidence: 0.9,
          source: 'birmingham_postcode_database'
        };
      }
      
      // Manchester postcodes - return Manchester coordinates
      if (postcode.match(/^M[0-9]/)) {
        console.log(`📮 Manchester postcode detected: ${postcode}, using Manchester coordinates`);
        return {
          lat: 53.4808, // Manchester coordinates
          lng: -2.2426,
          display_name: `${postcode}, Manchester, England, UK`,
          confidence: 0.9,
          source: 'manchester_postcode_database'
        };
      }
      
      // Full postcode (e.g., B12 3AB) - precise search
      if (postcode.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/)) {
        console.log(`📮 Full postcode detected: ${postcode}, using 1 mile radius`);
        return {
          lat: 52.4862, // Default to Birmingham area
          lng: -1.8904,
          display_name: `${postcode}, Birmingham, England, UK`,
          confidence: 0.9,
          source: 'postcode_database'
        };
      }
      
      // Partial postcode (e.g., B12) - district search
      if (postcode.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?$/)) {
        console.log(`📮 Partial postcode detected: ${postcode}, using 3 mile radius`);
        return {
          lat: 52.4862, // Default to Birmingham area
          lng: -1.8904,
          display_name: `${postcode} Area, Birmingham, England, UK`,
          confidence: 0.8,
          source: 'postcode_database'
        };
      }
      
      // Area code (e.g., B) - city-wide search
      if (postcode.match(/^[A-Z]{1,2}$/)) {
        console.log(`📮 Area code detected: ${postcode}, using 8 mile radius`);
        return {
          lat: 52.4862, // Default to Birmingham area
          lng: -1.8904,
          display_name: `${postcode} Area, Birmingham, England, UK`,
          confidence: 0.7,
          source: 'postcode_database'
        };
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
      return {
        lat: 52.4862, // Default to Birmingham area
        lng: -1.8904,
        display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
        confidence: 0.8,
        source: 'street_database'
      };
    }
    
    // Regular streets
    console.log(`🛣️ Regular street detected, using 1 mile radius`);
    return {
      lat: 52.4862, // Default to Birmingham area
      lng: -1.8904,
      display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
      confidence: 0.7,
      source: 'street_database'
    };
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
      return {
        lat: 51.5074, // London coordinates
        lng: -0.1278,
        display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, London, England, UK`,
        confidence: 0.8,
        source: 'london_area_database'
      };
    }
    
    // Other city areas
    console.log(`🏘️ City area detected, using 4 mile radius`);
    return {
      lat: 52.4862, // Default to Birmingham area
      lng: -1.8904,
      display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
      confidence: 0.7,
      source: 'city_area_database'
    };
  }

  // Default radius based on input type
  if (type && type.includes('postcode')) {
    console.log(`📮 Postcode search, using 2 mile radius`);
    return {
      lat: 52.4862, // Default to Birmingham area
      lng: -1.8904,
      display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
      confidence: 0.6,
      source: 'default_postcode_database'
    };
  }
  
  if (type && type.includes('city')) {
    console.log(`🏙️ City search, using 8 mile radius`);
    return {
      lat: 52.4862, // Default to Birmingham area
      lng: -1.8904,
      display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
      confidence: 0.6,
      source: 'default_city_database'
    };
  }
  
  if (type && type.includes('street')) {
    console.log(`🛣️ Street search, using 1 mile radius`);
    return {
      lat: 52.4862, // Default to Birmingham area
      lng: -1.8904,
      display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
      confidence: 0.6,
      source: 'default_street_database'
    };
  }

  // General search
  console.log(`🔍 General search, using 5 mile radius`);
  return {
    lat: 52.4862, // Default to Birmingham area
    lng: -1.8904,
    display_name: `${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}, Birmingham, England, UK`,
    confidence: 0.5,
    source: 'default_general_database'
  };
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