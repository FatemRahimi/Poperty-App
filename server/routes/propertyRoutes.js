const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const config = require('../config/config');
const {
  submitProperty,
  updateProperty,
  getUserProperties,
  getAllProperties,
  updatePropertyStatus,
  getDashboardStats,
  deleteProperty
} = require('../controllers/propertyController');
const { 
  parseSearchQuery, 
  geocodeLocationEnhanced, 
  filterPropertiesByRadius, 
  calculateDistance,
  correctPropertyCoordinates
} = require('../utils/smartSearch');

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory for processing
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 512 * 1024 * 1024, // 512MB limit per file (increased from 1GB)
    files: 15 // Maximum 15 files (increased from 10)
  },
  fileFilter: (req, file, cb) => {
    // Accept images, videos, and PDF files
    if (file.mimetype.startsWith('image/') || 
        file.mimetype.startsWith('video/') || 
        file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image, video, and PDF files are allowed'), false);
    }
  }
});

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum file size is 512MB per file.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 15 files allowed.'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + err.message
    });
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  next();
};

// JWT Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret);
    
    // 🔍 CRITICAL DEBUG: Log the decoded token information
    console.log('🔍 JWT AUTHENTICATION DEBUG:');
    console.log('📋 Decoded token:', decoded);
    console.log('📋 User ID from token:', decoded.id);
    console.log('📋 User role from token:', decoded.role);
    console.log('📋 Admin table flag:', decoded.adminTable);
    console.log('📋 Request URL:', req.url);
    console.log('📋 Request method:', req.method);
    console.log('📋 JWT Secret used:', config.auth.jwt.secret ? 'Present' : 'Missing');
    console.log('📋 Token expiration:', new Date(decoded.exp * 1000).toISOString());
    console.log('📋 Current time:', new Date().toISOString());
    console.log('📋 Token issued at:', new Date(decoded.iat * 1000).toISOString());
    console.log('📋 Token age (minutes):', Math.round((Date.now() - decoded.iat * 1000) / 60000));
    console.log('📋 Request headers:', Object.keys(req.headers));
    console.log('📋 Authorization header present:', !!req.headers.authorization);
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    console.error('❌ JWT Secret available:', !!config.auth.jwt.secret);
    console.error('❌ Token length:', token.length);
    console.error('❌ Token preview:', token.substring(0, 50) + '...');
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
  next();
};

// Property submission routes (protected - user must be authenticated)
// Use multer to handle FormData with file uploads
router.post('/submit', authenticateJWT, upload.fields([
  { name: 'photos', maxCount: 15 },
  { name: 'layoutFile', maxCount: 1 }
]), handleMulterError, submitProperty);
router.put('/update/:id', authenticateJWT, upload.fields([
  { name: 'photos', maxCount: 15 },
  { name: 'layoutFile', maxCount: 1 }
]), handleMulterError, updateProperty);
router.get('/my-properties', authenticateJWT, getUserProperties);
router.delete('/:id', authenticateJWT, deleteProperty);

// Admin routes (protected - admin only)
router.get('/admin/all', authenticateJWT, requireAdmin, getAllProperties);
router.put('/admin/:id/status', authenticateJWT, requireAdmin, updatePropertyStatus);
router.get('/admin/stats', authenticateJWT, requireAdmin, getDashboardStats);

// Smart Search routes (public - for property search)  
router.get('/search', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
    });

    const { 
      q: query, 
      category, 
      property_type, 
      city, 
      min_price, 
      max_price, 
      bedrooms,
      radius = '10', // Default to 10 miles as requested
      page = 1,
      limit = 12,
      show_all_statuses = 'false',
      user_id = null // For dashboard context
    } = req.query;

    console.log(`🔍 Professional Search: "${query}" within ${radius} miles`);
    console.log('📍 Radius value:', radius, 'Type:', typeof radius);
    console.log('🏷️ Category filter:', category);
    console.log('👤 Context:', show_all_statuses === 'true' ? 'User Dashboard' : 'Public Search');
    
    const offset = (page - 1) * limit;
    
    // CONTEXT-AWARE STATUS FILTERING
    let whereClause;
    if (show_all_statuses === 'true') {
      // User Dashboard: Show all user's properties regardless of status
      whereClause = user_id ? `WHERE p.user_id = ${user_id}` : "WHERE 1=1";
      console.log('🏠 Dashboard mode: Showing all user properties');
      } else {
      // Public Search: Only approved properties
      whereClause = "WHERE p.status = 'approved'";
      console.log('🌐 Public mode: Showing only approved properties');
    }
    
    let queryParams = [];
    let paramCount = 0;

    // 🌍 PROFESSIONAL MIXED SEARCH STRATEGY - Database + Geocoding
    if (query && radius && radius.trim() !== '') {
      console.log('🌍 Professional mixed search mode. Radius:', radius, 'Query:', query);
      
      const radiusFloat = parseFloat(radius);
      console.log('📏 Parsed radius:', radiusFloat);
      
      if (radiusFloat >= 0) {
        // Check if this is a city search first (KEEP UNCHANGED)
        const { isCityPattern } = require('../utils/smartSearch');
        
        if (isCityPattern(query)) {
          console.log(`🏙️ City search detected for "${query}" - using direct database query (NO GEOCODING)`);
          paramCount++;
          const citySearchCondition = ` AND (
            LOWER(p.city) = LOWER($${paramCount}) OR 
            p.city ILIKE $${paramCount + 1} OR
            p.address_line1 ILIKE $${paramCount + 1} OR
            p.address_line2 ILIKE $${paramCount + 1}
          )`;
          whereClause += citySearchCondition;
          queryParams.push(query.trim(), `%${query.trim()}%`);
          paramCount++; // Increment for the second parameter
          console.log('🏙️ Added DIRECT CITY search condition:', citySearchCondition);
          console.log('📊 Query params:', queryParams);
        } else {
          // PROFESSIONAL MIXED STRATEGY for postcodes and street names
          console.log(`🔍 Professional mixed strategy for "${query}" - Database search + Geocoding`);
          
          // STEP 1: DATABASE SEARCH (Exact Matches)
          paramCount++;
          const databaseSearchCondition = ` AND (
            p.title ILIKE $${paramCount} OR 
            p.description ILIKE $${paramCount} OR 
            p.address_line1 ILIKE $${paramCount} OR 
            p.address_line2 ILIKE $${paramCount} OR 
            p.city ILIKE $${paramCount} OR 
            p.zip_code ILIKE $${paramCount} OR
            p.property_type ILIKE $${paramCount}
          )`;
          whereClause += databaseSearchCondition;
          queryParams.push(`%${query}%`);
          console.log('📊 Added DATABASE SEARCH condition for exact matches');
          
          // STEP 2: GEOCODING + RADIUS SEARCH (Nearby Properties)
          const { geocodeLocationEnhanced, parseLocationInput } = require('../utils/smartSearch');
          
          const geocodeLocation = async (searchTerm) => {
            console.log(`🌍 Enhanced Geocoding "${searchTerm}" for radius search...`);
            
            const parsedInput = parseLocationInput(searchTerm);
            console.log(`🔍 Input Analysis: ${JSON.stringify(parsedInput)}`);
            
            const result = await geocodeLocationEnhanced(searchTerm, parsedInput);
            
            if (result) {
              console.log(`✅ Enhanced geocoding success: ${result.display_name} (${result.lat}, ${result.lng}) - Source: ${result.source}`);
              return { lat: result.lat, lng: result.lng, success: true };
            }
            
            console.log(`⚠️ No coordinates found for "${searchTerm}"`);
            return { success: false };
          };
          
          const coords = await geocodeLocation(query);
          
          if (coords.success) {
            const searchLat = coords.lat;
            const searchLng = coords.lng;
            console.log(`📍 Using coordinates for radius search: ${searchLat}, ${searchLng}`);
            
            // Add radius condition for nearby properties
            paramCount += 3;
            const radiusCondition = ` OR (
              p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND
              (6371 * acos(
                cos(radians($${paramCount - 2})) 
                * cos(radians(p.latitude)) 
                * cos(radians(p.longitude) - radians($${paramCount - 1})) 
                + sin(radians($${paramCount - 2})) 
                * sin(radians(p.latitude))
              )) <= $${paramCount}
            )`;
            whereClause += radiusCondition;
            queryParams.push(searchLat, searchLng, radiusFloat);
            console.log('🎯 Added RADIUS SEARCH condition for nearby properties');
            console.log('📊 Query params:', queryParams);
          } else {
            console.log('⚠️ Geocoding failed, using database search only');
          }
        }
      }
    } else if (query) {
      // 📝 TEXT SEARCH MODE - When no radius specified or radius is empty
      console.log('📝 Text-based search mode (Any distance). Query:', query);
      
      // Build smart postcode patterns for UK postcodes
      let postcodeSearchTerms = [`%${query.trim()}%`];
      
      // Enhanced UK postcode pattern matching
      const postcodeMatch = query.trim().match(/^([a-z]{1,2})(\d{1,2})([a-z]?\d?[a-z]{0,2})$/i);
      if (postcodeMatch) {
        const [, letters, numbers, suffix] = postcodeMatch;
        const area = letters.toUpperCase();
        const district = numbers;
        
        if (district.length === 2 && !suffix) {
          const firstDigit = district[0];
          const secondDigit = district[1];
          postcodeSearchTerms.push(`${area}${district}%`);
          postcodeSearchTerms.push(`${area}${firstDigit} ${secondDigit}%`);
          postcodeSearchTerms.push(`${area} ${district}%`);
        } else if (suffix) {
          const sectorMatch = suffix.match(/^(\d)([a-z]{0,2})$/i);
          if (sectorMatch) {
            const [, sector, unit] = sectorMatch;
            const fullSuffix = sector + unit.toUpperCase();
            postcodeSearchTerms.push(`${area}${district} ${sector}${unit.toUpperCase()}`);
            postcodeSearchTerms.push(`${area}${district}${fullSuffix}`);
            postcodeSearchTerms.push(`${area}${district} ${sector}%`);
            postcodeSearchTerms.push(`${area}${district}%`);
          } else {
            postcodeSearchTerms.push(`${area}${district}${suffix.toUpperCase()}`);
            if (district.length === 2) {
              const firstDigit = district[0];
              const secondDigit = district[1];
              postcodeSearchTerms.push(`${area}${firstDigit} ${secondDigit}${suffix.toUpperCase()}`);
            }
            postcodeSearchTerms.push(`${area}${district}%`);
          }
        }
        postcodeSearchTerms.push(`${area}%`);
      }
      
      paramCount++;
      const generalSearchParam = paramCount;
      queryParams.push(`%${query.trim()}%`);
      
      const postcodeParams = [];
      postcodeSearchTerms.slice(1).forEach(term => { // Skip first one as it's already added as general
          paramCount++;
        postcodeParams.push(paramCount);
        queryParams.push(term);
      });
          
      const postcodeConditions = postcodeParams.map(param => `p.zip_code ILIKE $${param}`).join(' OR ');
      
          whereClause += ` AND (
        p.city ILIKE $${generalSearchParam} OR
        p.address_line1 ILIKE $${generalSearchParam} OR
        p.address_line2 ILIKE $${generalSearchParam} OR
        p.title ILIKE $${generalSearchParam} OR 
        p.description ILIKE $${generalSearchParam} OR 
        p.zip_code ILIKE $${generalSearchParam} OR
        p.property_type ILIKE $${generalSearchParam}
        ${postcodeConditions ? ' OR ' + postcodeConditions : ''}
      )`;
    }

    // 🏷️ CATEGORY FILTER (rent/sale/lease) - This is the main filter
    if (category && category !== 'all') {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(category);
      console.log(`🏷️ Added category filter: ${category}`);
    }

    // 🏠 PROPERTY TYPE FILTER (flat/house/studio etc.)
    if (property_type && property_type !== 'all') {
      paramCount++;
      whereClause += ` AND p.property_type = $${paramCount}`;
      queryParams.push(property_type);
      console.log(`🏠 Added property type filter: ${property_type}`);
    }

    // 🌆 CITY FILTER
    if (city) {
      paramCount++;
      whereClause += ` AND p.city ILIKE $${paramCount}`;
      queryParams.push(`%${city}%`);
      console.log(`🌆 Added city filter: ${city}`);
    }

    // 💰 PRICE FILTERS
    if (min_price) {
      paramCount++;
      whereClause += ` AND (p.price >= $${paramCount} OR p.monthly_rent >= $${paramCount})`;
      queryParams.push(min_price);
      console.log(`💰 Added min price filter: ${min_price}`);
    }

    if (max_price) {
      paramCount++;
      whereClause += ` AND (p.price <= $${paramCount} OR p.monthly_rent <= $${paramCount})`;
      queryParams.push(max_price);
      console.log(`💰 Added max price filter: ${max_price}`);
    }

    // 🛏️ BEDROOMS FILTER
    if (bedrooms) {
      paramCount++;
      whereClause += ` AND p.bedrooms >= $${paramCount}`;
      queryParams.push(bedrooms);
      console.log(`🛏️ Added bedrooms filter: ${bedrooms}`);
    }

    const searchQuery = `
      SELECT 
        p.*,
        ARRAY_AGG(
          CASE WHEN pi.id IS NOT NULL 
          THEN json_build_object('id', pi.id, 'url', pi.image_url, 'type', pi.image_type)
          ELSE NULL END
        ) FILTER (WHERE pi.id IS NOT NULL) as images
      FROM properties p
      LEFT JOIN property_images pi ON p.id = pi.property_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    console.log('🔍 Final search query WHERE clause:', whereClause);
    console.log('📊 Final query params:', queryParams);
    
    const result = await pool.query(searchQuery, queryParams);
    console.log('📊 Total properties returned:', result.rows.length);

    let properties = result.rows;
    let coordinates = null;

    // Apply radius filtering if coordinates were found
    if (query && radius && radius.trim() !== '') {
      const radiusFloat = parseFloat(radius);
      if (radiusFloat >= 0) {
        const { geocodeLocationEnhanced, parseLocationInput } = require('../utils/smartSearch');
        const parsedInput = parseLocationInput(query);
        if (parsedInput.success && parsedInput.lat && parsedInput.lng) {
          coordinates = { lat: parsedInput.lat, lng: parsedInput.lng };
          console.log(`📍 Using geographic search with coordinates: ${coordinates.lat}, ${coordinates.lng}`);
          properties = filterPropertiesByRadius(properties, coordinates.lat, coordinates.lng, radiusFloat);
        } else {
          console.log(`📝 Using text-based search (no coordinates found)`);
        }
      }
    }

    // Auto-correct coordinates for all properties before returning
    properties = properties.map(property => correctPropertyCoordinates(property));

    res.json({
      success: true,
      properties,
      total: properties.length,
      searchQuery: query,
      coordinates: coordinates || null,
      radius: radius,
      searchMode: coordinates ? 'geographic' : 'text'
    });

  } catch (error) {
    console.error('Search properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search properties',
      error: error.message
    });
  }
});

// Legacy simple suggestions (keeping for backwards compatibility)
router.get('/search/simple-suggestions', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
    });

    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const query = `
      SELECT DISTINCT title, city, property_type
      FROM properties 
      WHERE status = 'approved' 
      AND (title ILIKE $1 OR city ILIKE $1 OR property_type ILIKE $1)
      LIMIT 10
    `;

    const result = await pool.query(query, [`%${q}%`]);
    
    const suggestions = result.rows.map(row => ({
      title: row.title,
      city: row.city,
      type: row.property_type
    }));

    res.json({ suggestions });

  } catch (error) {
    console.error('Get search suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggestions',
      error: error.message
    });
  }
});

// Add this new route after the existing search/suggestions route

router.get('/search/location-suggestions', async (req, res) => {
  try {
    const { geocodeLocationEnhanced, parseLocationInput, geocodeWithUKPostcodes, geocodeWithUKPlaces } = require('../utils/smartSearch');
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    console.log(`🔍 Location suggestions requested for: "${q}"`);
    
    // Parse the input to understand what type of location it is
    const parsedInput = parseLocationInput(q);
    console.log(`📋 Parsed input: ${JSON.stringify(parsedInput)}`);
    
    const suggestions = [];

    try {
      // Strategy 1: UK Postcodes API for postcodes
      if (parsedInput.type.includes('postcode') || parsedInput.confidence > 0.8) {
        try {
          const https = require('https');
          const postcodeResponse = await new Promise((resolve, reject) => {
            const url = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(q)}&limit=5`;
            https.get(url, (response) => {
              let data = '';
              response.on('data', chunk => data += chunk);
              response.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  resolve(null);
                }
              });
            }).on('error', () => resolve(null));
          });

          if (postcodeResponse && postcodeResponse.status === 200 && postcodeResponse.result) {
            postcodeResponse.result.forEach(item => {
              suggestions.push({
                type: 'postcode',
                display: `${item.postcode} - ${item.admin_district}`,
                value: item.postcode,
                coordinates: { lat: item.latitude, lng: item.longitude },
                confidence: 0.95
              });
            });
          }
        } catch (e) {
          console.warn('Postcode API error:', e);
        }
      }

      // Strategy 2: UK Places API for cities and areas
      if (['city_with_area', 'known_area', 'general_location'].includes(parsedInput.searchStrategy)) {
        try {
          const https = require('https');
          const placesResponse = await new Promise((resolve, reject) => {
            const url = `https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=5`;
            https.get(url, (response) => {
              let data = '';
              response.on('data', chunk => data += chunk);
              response.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  resolve(null);
                }
              });
            }).on('error', () => resolve(null));
          });

          if (placesResponse && placesResponse.status === 200 && placesResponse.result) {
            placesResponse.result.forEach(place => {
              suggestions.push({
                type: 'place',
                display: `${place.name_1} - ${place.admin_county || place.admin_district}`,
                value: place.name_1,
                coordinates: { lat: place.latitude, lng: place.longitude },
                confidence: 0.9
              });
            });
          }
        } catch (e) {
          console.warn('Places API error:', e);
        }
      }

      // Strategy 3: Fallback to database search for properties
      if (suggestions.length < 3) {
        const { Pool } = require('pg');
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
        });

        const dbSuggestions = await pool.query(`
          SELECT DISTINCT 
            COALESCE(p.city, '') as city,
            COALESCE(p.address_line1, '') as address,
            COALESCE(p.zip_code, '') as postcode,
            COUNT(*) as property_count
          FROM properties p 
          WHERE 
            p.status = 'approved' AND (
              p.city ILIKE $1 OR 
              p.address_line1 ILIKE $1 OR 
              p.zip_code ILIKE $1 OR
              p.address_line2 ILIKE $1
            )
          GROUP BY p.city, p.address_line1, p.zip_code
          ORDER BY property_count DESC
          LIMIT 5
        `, [`%${q}%`]);

        dbSuggestions.rows.forEach(row => {
          if (row.city) {
            suggestions.push({
              type: 'database_city',
              display: `${row.city} (${row.property_count} properties)`,
              value: row.city,
              confidence: 0.7,
              propertyCount: row.property_count
            });
          }
          if (row.address && row.address !== row.city) {
            suggestions.push({
              type: 'database_address',
              display: `${row.address}, ${row.city}`,
              value: `${row.address} ${row.city}`,
              confidence: 0.75,
              propertyCount: row.property_count
            });
          }
        });
      }

      // Strategy 4: Common location fallbacks
      if (suggestions.length < 2) {
        const commonLocations = [
          { name: 'London', type: 'major_city' },
          { name: 'Birmingham', type: 'major_city' },
          { name: 'Manchester', type: 'major_city' },
          { name: 'Liverpool', type: 'major_city' },
          { name: 'Leeds', type: 'major_city' },
          { name: 'Finchley', type: 'area' },
          { name: 'Stone Road', type: 'street' }
        ];

        const qLower = q.toLowerCase();
        commonLocations.forEach(location => {
          if (location.name.toLowerCase().includes(qLower) && 
              !suggestions.some(s => s.value.toLowerCase() === location.name.toLowerCase())) {
            suggestions.push({
              type: location.type,
              display: location.name,
              value: location.name,
              confidence: 0.6
            });
          }
        });
      }

    } catch (error) {
      console.error('Location suggestions error:', error);
    }

    // Remove duplicates and limit results
    const uniqueSuggestions = suggestions
      .filter((suggestion, index, self) => 
        index === self.findIndex(s => s.display === suggestion.display)
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);

    console.log(`📍 Returning ${uniqueSuggestions.length} location suggestions`);
    
    res.json({
      success: true,
      suggestions: uniqueSuggestions,
      parsedInput: parsedInput
    });

  } catch (error) {
    console.error('Location suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get location suggestions',
      error: error.message
    });
  }
});

// Smart Geographic Suggestions - Pure Location Search (No Mile Filtering)
router.get('/search/suggestions', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 3) {
      return res.json({ 
        success: true, 
        suggestions: [],
        inputType: 'too_short'
      });
    }

    console.log(`🔍 Smart geographic suggestions for: "${q}"`);
    
    // Smart input analysis - Geographic locations only
    const analyzeInput = (input) => {
      if (!input || !input.trim()) return { type: 'empty' };
      
      const trimmed = input.trim().toLowerCase();
      
      // UK Postcode patterns (Full & Partial)
      const fullPostcodePattern = /^[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}$/i;
      const partialPostcodePattern = /^[a-z]{1,2}\d[a-z0-9]?$/i;
      
      if (fullPostcodePattern.test(trimmed)) {
        return { type: 'postcode', value: trimmed.toUpperCase().replace(/\s+/g, ' ') };
      }
      
      if (partialPostcodePattern.test(trimmed)) {
        return { type: 'partial_postcode', value: trimmed.toUpperCase() };
      }
      
      // Known UK cities and areas (comprehensive list)
      const knownLocations = ['london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 'bristol', 'edinburgh', 'glasgow', 'cardiff', 'belfast', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford', 'stoke', 'wolverhampton', 'plymouth', 'derby', 'southampton', 'portsmouth', 'brighton', 'reading', 'oxford', 'cambridge', 'york', 'bath', 'finchley', 'ealing', 'camden', 'westminster', 'kensington', 'chelsea', 'islington', 'hackney', 'tower hamlets', 'greenwich', 'lewisham', 'southwark', 'lambeth', 'wandsworth', 'hammersmith', 'fulham', 'richmond', 'kingston', 'croydon', 'bromley', 'bexley', 'havering', 'barking', 'redbridge', 'waltham forest', 'haringey', 'enfield', 'barnet', 'harrow', 'brent', 'hillingdon', 'hounslow', 'ealing', 'acton', 'chiswick', 'putney', 'wimbledon', 'clapham', 'brixton', 'dulwich', 'peckham', 'bermondsey', 'canary wharf'];
      
      if (knownLocations.includes(trimmed)) {
        return { type: 'city_area', value: trimmed };
      }
      
      // Street indicators (including hospital as potential street name)
      const streetWords = ['road', 'street', 'st', 'avenue', 'ave', 'lane', 'ln', 'drive', 'dr', 'close', 'cl', 'way', 'court', 'ct', 'place', 'pl', 'crescent', 'grove', 'gardens', 'park', 'square', 'terrace', 'hill', 'hospital'];
      const hasStreetIndicator = streetWords.some(word => trimmed.includes(word));
      
      if (hasStreetIndicator) {
        return { type: 'street', value: trimmed };
      }
      
      return { type: 'general_location', value: trimmed };
    };

    // Simple fuzzy matching for typos
    const calculateSimilarity = (str1, str2) => {
      const len1 = str1.length;
      const len2 = str2.length;
      const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
      
      for (let i = 0; i <= len1; i++) matrix[0][i] = i;
      for (let j = 0; j <= len2; j++) matrix[j][0] = j;
      
      for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
          const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[j][i] = Math.min(
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1,
            matrix[j - 1][i - 1] + cost
          );
        }
      }
      
      const distance = matrix[len2][len1];
      return 1 - (distance / Math.max(len1, len2));
    };
    
    const inputAnalysis = analyzeInput(q);
    console.log(`📋 Input type: ${inputAnalysis.type} for "${q}"`);
    
    const suggestions = [];
    const processedItems = new Set();

    const addSuggestion = (suggestion) => {
      const key = `${suggestion.type}:${suggestion.value.toLowerCase()}`;
      if (!processedItems.has(key)) {
        processedItems.add(key);
        suggestions.push(suggestion);
      }
    };

    // Strategy 1: Postcode Search (All types - no filtering)
    if (['postcode', 'partial_postcode'].includes(inputAnalysis.type)) {
      console.log(`📮 Postcode search for: "${q}"`);
      
      try {
        const https = require('https');
        
        // Get ALL postcode matches - no limit filtering
        const searchUrl = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(q)}&limit=12`;
        const postcodeResponse = await new Promise((resolve) => {
          const request = https.get(searchUrl, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                resolve(null);
              }
            });
          });
          request.on('error', () => resolve(null));
          request.setTimeout(3000, () => {
            request.destroy();
            resolve(null);
          });
        });

        if (postcodeResponse && postcodeResponse.status === 200 && postcodeResponse.result) {
          postcodeResponse.result.forEach((item) => {
            addSuggestion({
              type: 'postcode',
              display: `${item.postcode} - ${item.admin_district}`,
              value: item.postcode,
              coordinates: { lat: item.latitude, lng: item.longitude },
              icon: '📮'
            });
          });
        }
      } catch (e) {
        console.warn('Postcode API error:', e);
      }
    }

    // Strategy 2: Places API for cities and areas (Always run)
    try {
      const https = require('https');
      const placesResponse = await new Promise((resolve) => {
        const url = `https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=8`;
        const request = https.get(url, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(null);
            }
          });
        });
        request.on('error', () => resolve(null));
        request.setTimeout(3000, () => {
          request.destroy();
          resolve(null);
        });
      });

      if (placesResponse && placesResponse.status === 200 && placesResponse.result) {
        placesResponse.result.forEach((place) => {
          addSuggestion({
            type: 'place',
            display: `${place.name_1} - ${place.admin_county || place.admin_district}`,
            value: place.name_1,
            coordinates: { lat: place.latitude, lng: place.longitude },
            icon: '🏙️'
          });
        });
      }
    } catch (e) {
      console.warn('Places API error:', e);
    }

    // Strategy 3: Database search for existing properties (Always run)
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
      });

      const dbQuery = `
        SELECT DISTINCT 
          p.city,
          p.address_line1,
          p.zip_code,
          COUNT(*) as property_count
        FROM properties p 
        WHERE 
          p.status = 'approved' AND (
            LOWER(p.city) ILIKE LOWER($1) OR 
            LOWER(p.address_line1) ILIKE LOWER($1) OR 
            LOWER(p.zip_code) ILIKE LOWER($1) OR
            LOWER(p.address_line2) ILIKE LOWER($1)
          )
        GROUP BY p.city, p.address_line1, p.zip_code
        ORDER BY property_count DESC
        LIMIT 10
      `;

      const dbSuggestions = await pool.query(dbQuery, [`%${q}%`]);

      dbSuggestions.rows.forEach((row) => {
        if (row.city && row.city.toLowerCase().includes(q.toLowerCase())) {
          addSuggestion({
            type: 'database_city',
            display: `${row.city} (${row.property_count} properties)`,
            value: row.city,
            propertyCount: row.property_count
          });
        }
        if (row.address_line1 && row.address_line1 !== row.city && row.address_line1.toLowerCase().includes(q.toLowerCase())) {
          addSuggestion({
            type: 'database_address',
            display: `${row.address_line1}, ${row.city}`,
            value: `${row.address_line1} ${row.city}`,
            propertyCount: row.property_count
          });
        }
      });
    } catch (e) {
      console.warn('Database search error:', e);
    }

    // Strategy 4: OpenStreetMap for streets and areas (Geographic only)
    if (['street', 'general_location'].includes(inputAnalysis.type)) {
      try {
        const https = require('https');
        const osmResponse = await new Promise((resolve) => {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' UK')}&limit=6&countrycodes=gb`;
          const request = https.get(url, {
            headers: {
              'User-Agent': 'PropertySearchApp/1.0'
            }
          }, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                resolve(null);
              }
            });
          });
          request.on('error', () => resolve(null));
          request.setTimeout(3000, () => {
            request.destroy();
            resolve(null);
          });
        });

        if (osmResponse && osmResponse.length > 0) {
          osmResponse.forEach((item) => {
            // Focus on geographic locations only (streets, areas)
            let type = 'location';
            
            if (item.class === 'highway' || item.type === 'road' || item.type === 'residential') {
              type = 'street';
            } else if (item.type === 'suburb' || item.type === 'neighbourhood' || item.type === 'quarter') {
              type = 'area';
            }

            // Only add if it's a geographic location
            if (['street', 'area', 'location'].includes(type)) {
              addSuggestion({
                type: type,
                display: item.display_name.split(',').slice(0, 3).join(', '),
                value: item.display_name.split(',')[0],
                coordinates: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) }
              });
            }
          });
        }
      } catch (e) {
        console.warn('OSM API error:', e);
      }
    }

    // Strategy 5: Fuzzy matching for common UK locations
    const commonLocations = [
      { name: 'London', type: 'major_city' },
      { name: 'Birmingham', type: 'major_city' },
      { name: 'Manchester', type: 'major_city' },
      { name: 'Liverpool', type: 'major_city' },
      { name: 'Leeds', type: 'major_city' },
      { name: 'Sheffield', type: 'major_city' },
      { name: 'Bristol', type: 'major_city' },
      { name: 'Finchley', type: 'area' },
      { name: 'Ealing', type: 'area' },
      { name: 'Stone Road', type: 'street' },
      { name: 'High Street', type: 'street' },
      { name: 'Snow Hill', type: 'area' },
      { name: 'Uxbridge Road', type: 'street' },
      { name: 'Hospital Road', type: 'street' }
    ];

    const qLower = q.toLowerCase();
    commonLocations.forEach(location => {
      const similarity = calculateSimilarity(qLower, location.name.toLowerCase());
      
      if (similarity > 0.6) {
        const isTypo = similarity < 0.95 && similarity > 0.7;
        
        if (!suggestions.some(s => s.value.toLowerCase() === location.name.toLowerCase())) {
          addSuggestion({
            type: isTypo ? 'fuzzy_match' : location.type,
            display: isTypo ? `Did you mean "${location.name}"?` : location.name,
            value: location.name,
            isFuzzy: isTypo
          });
        }
      }
    });

    // Return ALL suggestions (no artificial limits)
    const finalSuggestions = suggestions.slice(0, 15); // Reasonable UI limit only

    console.log(`📍 Found ${finalSuggestions.length} geographic suggestions for "${q}"`);

    res.json({
      success: true,
      suggestions: finalSuggestions,
      inputType: inputAnalysis.type,
      meta: {
        totalFound: suggestions.length,
        query: q,
        strategies: ['postcode', 'places', 'database', 'osm', 'fuzzy']
      }
    });

  } catch (error) {
    console.error('Geographic suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get geographic suggestions',
      error: error.message
    });
  }
});

// Public routes (for viewing approved properties)
router.get('/public', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
    });

    const { page = 1, limit = 12, category, property_type, city, min_price, max_price, bedrooms } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE p.status = 'approved'";
    let queryParams = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(category);
    }

    if (property_type) {
      paramCount++;
      whereClause += ` AND p.property_type = $${paramCount}`;
      queryParams.push(property_type);
    }

    if (city) {
      paramCount++;
      whereClause += ` AND p.city ILIKE $${paramCount}`;
      queryParams.push(`%${city}%`);
    }

    if (min_price) {
      paramCount++;
      whereClause += ` AND (p.price >= $${paramCount} OR p.monthly_rent >= $${paramCount})`;
      queryParams.push(min_price);
    }

    if (max_price) {
      paramCount++;
      whereClause += ` AND (p.price <= $${paramCount} OR p.monthly_rent <= $${paramCount})`;
      queryParams.push(max_price);
    }

    if (bedrooms) {
      paramCount++;
      whereClause += ` AND p.bedrooms >= $${paramCount}`;
      queryParams.push(bedrooms);
    }

    const query = `
      SELECT 
        p.*,
        ARRAY_AGG(
          CASE WHEN pi.id IS NOT NULL 
          THEN json_build_object('id', pi.id, 'url', pi.image_url, 'type', pi.image_type)
          ELSE NULL END
        ) FILTER (WHERE pi.id IS NOT NULL) as images
      FROM properties p
      LEFT JOIN property_images pi ON p.id = pi.property_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);
    console.log('📊 Total properties returned:', result.rows.length);

    // Auto-correct coordinates for all properties before returning
    let properties = result.rows.map(property => correctPropertyCoordinates(property));

    res.json({
      success: true,
      properties,
      total: properties.length,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: properties.length
      }
    });

  } catch (error) {
    console.error('Get public properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties',
      error: error.message
    });
  }
});

// Get single property by slug (public)
router.get('/property/:slug', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
    });

    const { slug } = req.params;

    const query = `
      SELECT 
        p.*,
        ARRAY_AGG(
          CASE WHEN pi.id IS NOT NULL 
          THEN json_build_object('id', pi.id, 'url', pi.image_url, 'type', pi.image_type, 'alt_text', pi.alt_text)
          ELSE NULL END
        ) FILTER (WHERE pi.id IS NOT NULL) as images,
        ARRAY_AGG(
          CASE WHEN pa.id IS NOT NULL 
          THEN json_build_object('name', pa.amenity_name, 'category', pa.amenity_category)
          ELSE NULL END
        ) FILTER (WHERE pa.id IS NOT NULL) as amenities
      FROM properties p
      LEFT JOIN property_images pi ON p.id = pi.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.slug = $1 AND p.status = 'approved'
      GROUP BY p.id
    `;

    const result = await pool.query(query, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    res.json({
      success: true,
      property: result.rows[0]
    });

  } catch (error) {
    console.error('Get property by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property',
      error: error.message
    });
  }
});

module.exports = router; 