const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const {
  submitProperty,
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
router.get('/my-properties', authenticateJWT, getUserProperties);
router.delete('/:id', authenticateJWT, deleteProperty);

// Admin routes (protected - admin only)
router.get('/admin/all', authenticateJWT, requireAdmin, getAllProperties);
router.put('/admin/:id/status', authenticateJWT, requireAdmin, updatePropertyStatus);
router.get('/admin/stats', authenticateJWT, requireAdmin, getDashboardStats);

// Public routes (for viewing approved properties)
router.get('/public', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
    });

    const { page = 1, limit = 12, type, city, min_price, max_price, bedrooms } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE p.status = 'approved'";
    let queryParams = [];
    let paramCount = 0;

    if (type) {
      paramCount++;
      whereClause += ` AND p.property_type = $${paramCount}`;
      queryParams.push(type);
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