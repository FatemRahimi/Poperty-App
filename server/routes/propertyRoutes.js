const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const {
  submitProperty,
  updateProperty,
  getUserProperties,
  getAllProperties,
  updatePropertyStatus,
  getDashboardStats,
  deleteProperty
} = require('../controllers/propertyController');

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store files in memory for processing
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB limit per file (increased from 100MB)
    files: 15 // Maximum 15 files (increased from 10)
  },
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum file size is 1GB per file.'
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
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
router.post('/submit', authenticateJWT, upload.array('photos', 15), handleMulterError, submitProperty);
router.put('/update/:id', authenticateJWT, upload.array('photos', 15), handleMulterError, updateProperty);
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
      radius = '5',
      page = 1,
      limit = 12,
      show_all_statuses = 'false' // New parameter to control status filtering
    } = req.query;

    console.log(`🔍 Professional Search: "${query}" within ${radius} miles`);
    console.log('📍 Radius value:', radius, 'Type:', typeof radius);

    const offset = (page - 1) * limit;
    // Show all statuses only for UserDashboard professional search, otherwise show only approved
    let whereClause = show_all_statuses === 'true' ? "WHERE 1=1" : "WHERE p.status = 'approved'";
    let queryParams = [];
    let paramCount = 0;

    // 🎯 SMART LOCATION SEARCH - Enhanced for UK postcodes, cities, and streets
    if (query) {
      const searchTerm = query.trim();
      
      // Build smart postcode patterns for UK postcodes
      let postcodeSearchTerms = [`%${searchTerm}%`];
      
      // Enhanced UK postcode pattern matching for formats like "b46", "b46ge", "b192yf"
      const postcodeMatch = searchTerm.match(/^([a-z]{1,2})(\d{1,2})([a-z]?\d?[a-z]{0,2})$/i);
      if (postcodeMatch) {
        const [, letters, numbers, suffix] = postcodeMatch;
        
        // Create various patterns to match different postcode formats
        const area = letters.toUpperCase();
        const district = numbers;
        
        // For searches like "b46", we need to handle both:
        // 1. "B46xx" (compact format)
        // 2. "B4 6xx" (UK standard spaced format)
        
        if (district.length === 2 && !suffix) {
          // "b46" should match both "B46xx" and "B4 6xx"
          const firstDigit = district[0];
          const secondDigit = district[1];
          
          // Pattern 1: Compact format "B46%"
          postcodeSearchTerms.push(`${area}${district}%`);
          
          // Pattern 2: Standard UK spaced format "B4 6%"  
          postcodeSearchTerms.push(`${area}${firstDigit} ${secondDigit}%`);
          
          // Pattern 3: Spaced format "B 46%"
          postcodeSearchTerms.push(`${area} ${district}%`);
        } else if (suffix) {
          // For formats like "b46ge" or "b192yf"
          // Check if suffix starts with a digit (like "2yf" in "b192yf")
          const sectorMatch = suffix.match(/^(\d)([a-z]{0,2})$/i);
          
          if (sectorMatch) {
            // This is a full postcode like "b192yf" -> "B19 2YF"
            const [, sector, unit] = sectorMatch;
            const fullSuffix = sector + unit.toUpperCase();
            
            // Pattern 1: Standard UK format "B19 2YF"
            postcodeSearchTerms.push(`${area}${district} ${sector}${unit.toUpperCase()}`);
            
            // Pattern 2: Compact format "B192YF"  
            postcodeSearchTerms.push(`${area}${district}${fullSuffix}`);
            
            // Pattern 3: Partial matches
            postcodeSearchTerms.push(`${area}${district} ${sector}%`);
            postcodeSearchTerms.push(`${area}${district}%`);
          } else {
            // This is like "b46ge" -> district + letters
            // Pattern 1: Compact format "B46GE"
            postcodeSearchTerms.push(`${area}${district}${suffix.toUpperCase()}`);
            
            // Pattern 2: Standard spaced format - need to split district properly
            if (district.length === 2) {
              const firstDigit = district[0];
              const secondDigit = district[1];
              postcodeSearchTerms.push(`${area}${firstDigit} ${secondDigit}${suffix.toUpperCase()}`);
            }
            
            // Pattern 3: Partial matches
            postcodeSearchTerms.push(`${area}${district}%`);
          }
        }
        
        // Pattern: Just the area
        postcodeSearchTerms.push(`${area}%`);
      }
      
      paramCount++;
      const generalSearchParam = paramCount;
      
      // Add the general search parameter first
      queryParams.push(`%${searchTerm}%`);
      
      // Add postcode-specific parameters
      const postcodeParams = [];
      postcodeSearchTerms.forEach(term => {
        paramCount++;
        postcodeParams.push(paramCount);
        queryParams.push(term);
      });
      
      // Build the WHERE clause - LOCATION ONLY (no description search)
      const postcodeConditions = postcodeParams.map(param => `p.zip_code ILIKE $${param}`).join(' OR ');
      
      whereClause += ` AND (
        p.city ILIKE $${generalSearchParam} OR
        p.address_line1 ILIKE $${generalSearchParam} OR
        p.address_line2 ILIKE $${generalSearchParam} OR
        ${postcodeConditions}
      )`;
    }

    // Add filters
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

    // 🌍 RADIUS FILTERING - Geographic distance search with proper geocoding
    if (radius && query) {
      console.log('🌍 Radius filtering triggered. Radius:', radius, 'Query:', query);
      
      // Simple geocoding function for UK locations
      const geocodeLocation = (searchTerm) => {
        const term = searchTerm.toLowerCase().trim();
        
        // UK Postcode patterns
        if (term.match(/^b152?/)) return { lat: 52.4539, lng: -1.8909 }; // B15 area (Stone Road area)
        if (term.match(/^b46?/)) return { lat: 52.4796, lng: -1.9026 }; // B4 area
        if (term.match(/^b19/)) return { lat: 52.4908, lng: -1.9108 }; // B19 area
        if (term.match(/^b69/)) return { lat: 52.5031, lng: -2.0137 }; // B69 area (Oldbury)
        
        // Common areas/streets
        if (term.includes('stone road')) return { lat: 52.4539, lng: -1.8909 }; // Stone Road, Birmingham
        if (term.includes('hospital street')) return { lat: 52.4908, lng: -1.9108 }; // Hospital Street area
        if (term.includes('halesowen')) return { lat: 52.5031, lng: -2.0137 }; // Halesowen area
        
        // Default to Birmingham city center if not found
        console.log(`⚠️ No specific coordinates found for "${searchTerm}", using Birmingham center`);
        return { lat: 52.4796, lng: -1.9026 };
      };
      
      const radiusFloat = parseFloat(radius);
      console.log('📏 Parsed radius:', radiusFloat);
      if (radiusFloat >= 0) {
        // Get proper coordinates for the search term
        const coords = geocodeLocation(query);
        const searchLat = coords.lat;
        const searchLng = coords.lng;
        console.log(`📍 Using coordinates for "${query}": ${searchLat}, ${searchLng}`);
        
        paramCount += 3;
        const radiusCondition = ` AND (
          (p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND
          (6371 * acos(
            cos(radians($${paramCount - 2})) 
            * cos(radians(p.latitude)) 
            * cos(radians(p.longitude) - radians($${paramCount - 1})) 
            + sin(radians($${paramCount - 2})) 
            * sin(radians(p.latitude))
          )) <= $${paramCount})
          OR (p.latitude IS NULL OR p.longitude IS NULL)
        )`;
        whereClause += radiusCondition;
        queryParams.push(searchLat, searchLng, radiusFloat);
        console.log('🔧 Added radius condition:', radiusCondition);
        console.log('📊 Query params:', queryParams);
      }
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
    const result = await pool.query(searchQuery, queryParams);

    res.json({
      success: true,
      properties: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rows.length
      }
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

router.get('/search/suggestions', async (req, res) => {
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

    res.json({
      success: true,
      properties: result.rows
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