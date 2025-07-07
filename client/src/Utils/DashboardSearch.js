/**
 * Fast Dashboard Search Utility
 * Instant text-based property filtering for user dashboards
 * NO external API calls - optimized for speed and user experience
 */

/**
 * Normalize text for consistent searching
 */
const normalizeText = (text) => {
  if (!text) return '';
  return text.toString().toLowerCase().trim()
    .replace(/[^\w\s]/g, ' ')  // Replace special chars with spaces
    .replace(/\s+/g, ' ')      // Multiple spaces to single
    .trim();
};

/**
 * Create search variations for better matching
 */
const createSearchVariations = (query) => {
  const normalized = normalizeText(query);
  const variations = [normalized];
  
  // Add abbreviations
  const abbrevMap = {
    'birmingham': ['bham', 'birmingham'],
    'manchester': ['manc', 'manchester'],
    'london': ['ldn', 'london'],
    'street': ['st', 'street'],
    'road': ['rd', 'road'],
    'avenue': ['ave', 'avenue'],
    'drive': ['dr', 'drive']
  };
  
  Object.entries(abbrevMap).forEach(([full, variants]) => {
    variants.forEach(variant => {
      if (normalized.includes(variant)) {
        // Add version with full word
        variations.push(normalized.replace(variant, full));
        // Add version with other abbreviations
        variants.forEach(otherVariant => {
          if (otherVariant !== variant) {
            variations.push(normalized.replace(variant, otherVariant));
          }
        });
      }
    });
  });
  
  return [...new Set(variations)];
};

/**
 * Fast property matching - checks if property matches search query
 */
const isPropertyMatch = (property, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  
  const searchVariations = createSearchVariations(searchQuery);
  
  // Get all searchable fields from property
  const searchableFields = [
    property.title,
    property.address_line1,
    property.address_line2,
    property.city,
    property.state,
    property.region,
    property.zip_code,
    property.postcode,
    property.street_name,
    property.house_number,
    property.property_type
  ].filter(Boolean);
  
  // Normalize all property text
  const propertyText = searchableFields
    .map(field => normalizeText(field))
    .join(' ');
  
  // Check if any search variation matches
  return searchVariations.some(searchVar => {
    const searchWords = searchVar.split(' ').filter(word => word.length > 1);
    
    // For single word searches (like "birmingham")
    if (searchWords.length === 1) {
      return propertyText.includes(searchWords[0]);
    }
    
    // For multi-word searches, all words should be present
    return searchWords.every(word => propertyText.includes(word));
  });
};

/**
 * Calculate search relevance score for ranking
 */
const calculateRelevanceScore = (property, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return 50;
  
  const searchNormalized = normalizeText(searchQuery);
  let score = 0;
  
  // City match (highest priority)
  const cityText = normalizeText(property.city || '');
  if (cityText === searchNormalized) score += 100;
  else if (cityText.includes(searchNormalized)) score += 80;
  
  // Address match (high priority)
  const addressText = normalizeText(property.address_line1 || '');
  if (addressText.includes(searchNormalized)) score += 60;
  
  // Postcode match (medium priority)
  const postcodeText = normalizeText(property.zip_code || property.postcode || '');
  if (postcodeText.includes(searchNormalized)) score += 40;
  
  // Title match (lower priority)
  const titleText = normalizeText(property.title || '');
  if (titleText.includes(searchNormalized)) score += 20;
  
  return score;
};

/**
 * Fast dashboard property filtering with instant results
 * Optimized for user dashboard - no external API calls
 */
export const filterDashboardProperties = (properties, searchQuery, radius = '1') => {
  console.log(`🚀 Fast dashboard search: "${searchQuery}" (${properties.length} properties)`);
  
  if (!searchQuery || !searchQuery.trim()) {
    return properties;
  }
  
  const startTime = performance.now();
  
  // Filter matching properties
  const matchingProperties = properties.filter(property => 
    isPropertyMatch(property, searchQuery)
  );
  
  // Sort by relevance score (higher scores first)
  const sortedProperties = matchingProperties.sort((a, b) => {
    const scoreA = calculateRelevanceScore(a, searchQuery);
    const scoreB = calculateRelevanceScore(b, searchQuery);
    return scoreB - scoreA;
  });
  
  const endTime = performance.now();
  console.log(`⚡ Dashboard search completed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log(`📊 Found ${sortedProperties.length}/${properties.length} matching properties`);
  
  return sortedProperties;
};

/**
 * Test what a search would return (for debugging)
 */
export const testDashboardSearch = (properties, searchQuery) => {
  const results = filterDashboardProperties(properties, searchQuery);
  
  console.log(`🔍 Search test for "${searchQuery}":`);
  console.log(`📈 Results: ${results.length} properties found`);
  
  if (results.length > 0) {
    console.log('📋 Top matches:');
    results.slice(0, 3).forEach((property, index) => {
      const score = calculateRelevanceScore(property, searchQuery);
      console.log(`  ${index + 1}. "${property.title}" - ${property.city} (score: ${score})`);
    });
  }
  
  return results;
};

export default { filterDashboardProperties, testDashboardSearch }; 