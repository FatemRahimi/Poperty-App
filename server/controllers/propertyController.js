const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { geocodeLocationEnhanced } = require('../utils/smartSearch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://fatemehrahimi@localhost:5432/propertydb'
});

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate unique slug for property
const generateSlug = (title) => {
  // Handle undefined, null, or empty title
  if (!title || typeof title !== 'string') {
    title = 'property-listing'; // Fallback title
  }
  
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-') + '-' + Date.now();
};

// Convert lease term to proper integer value
const convertLeaseTerm = (leaseTerm) => {
  if (!leaseTerm) return null;
  
  // Handle string values
  if (typeof leaseTerm === 'string') {
    const term = leaseTerm.toLowerCase().trim();
    
    // Handle common lease term mappings
    switch (term) {
      case 'flexible':
      case 'rolling':
      case 'month-to-month':
        return null; // No fixed term
      case 'short-term':
        return 6; // 6 months
      case 'long-term':
        return 12; // 12 months
      default:
        // Try to parse as number (e.g., "12", "6")
        const parsed = parseInt(leaseTerm);
        return !isNaN(parsed) ? parsed : null;
    }
  }
  
  // If already a number
  return parseInt(leaseTerm) || null;
};

// Send email notification
const sendEmailNotification = async (notificationData) => {
  try {
    const { to, subject, html, property, user, notificationType } = notificationData;
    
    // Check if email configuration is available
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email configuration missing - skipping email notification');
      return;
    }
    
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    });

    // Log notification in database
    await pool.query(
      `INSERT INTO email_notifications (user_id, property_id, notification_type, email_subject, email_body, sent_to)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user?.id, property?.id, notificationType, subject, html, to]
    );

    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    
    // Log failed notification
    try {
      await pool.query(
        `INSERT INTO email_notifications (user_id, property_id, notification_type, email_subject, email_body, sent_to, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'failed')`,
        [user?.id, property?.id, notificationType, subject, html || '', to]
      );
    } catch (dbError) {
      console.error('❌ Failed to log email notification to database:', dbError);
    }
  }
};

// Submit new property (for sale, rent, or lease)
const submitProperty = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      title: providedTitle,
      propertyTitle, // Alternative field name from frontend
      description,
      category, // NEW: Property category (rent/sale/lease)
      property_type, // Property type (flat/house/detached/etc)
      propertyType, // Alternative field name from frontend
      property_category,
      address_line1, 
      streetAddress, // Alternative field name from frontend
      address_line2, 
      city, 
      state, 
      region, // Alternative field name from frontend
      zip_code, 
      postcode, // Alternative field name from frontend
      country,
      bedrooms, 
      bathrooms, 
      square_feet, 
      lot_size, 
      year_built,
      price, 
      askingPrice, // Alternative field name from frontend
      weekly_rent,
      weeklyRent, // Alternative field name from frontend
      monthly_rent, 
      monthlyRent, // Alternative field name from frontend
      rentalPrice, // Alternative field name from frontend
      lease_term, 
      tenancyLength, // Alternative field name from frontend
      deposit_amount,
      depositAmount, // Alternative field name from frontend
      parking_spaces, 
      has_garage, 
      has_pool, 
      has_garden, 
      furnished, 
      furnishedStatus, // Alternative field name from frontend
      pets_allowed,
      student_housing,
      studentHousing, // Alternative field name from frontend
      availability_date, 
      availableFrom, // Alternative field name from frontend
      contact_name, 
      contactName, // Alternative field name from frontend
      contact_phone, 
      contactPhone, // Alternative field name from frontend
      contact_email, 
      contactEmail, // Alternative field name from frontend
      amenities = [], 
      images = [],
      
      // NEW FIELDS: EPC Rating
      epc_rating,
      epcRating, // Alternative field name from frontend
      
      // NEW FIELDS: Council Tax
      council_tax_band,
      councilTaxBand, // Alternative field name from frontend
      council_tax_status,
      councilTaxStatus, // Alternative field name from frontend
      
      // NEW FIELDS: Key Features
      key_features,
      keyFeatures, // Alternative field name from frontend
      
      // NEW FIELDS: Layout of Property
      layout_file_name,
      layoutFileName, // Alternative field name from frontend
      layout_file_url,
      layoutFileUrl, // Alternative field name from frontend
      apartment_size,
      apartmentSize, // Alternative field name from frontend
      floor_number,
      floorNumber // Alternative field name from frontend
    } = req.body;

    // Map frontend field names to backend field names
    const title = providedTitle || propertyTitle;
    const category_mapped = category || 'rent'; // Default to rent if not specified
    const property_type_mapped = property_type || propertyType; // flat/house/detached/etc
    const address_line1_mapped = address_line1 || streetAddress;
    const state_mapped = state || region;
    const zip_code_mapped = zip_code || postcode;
    const price_mapped = price || askingPrice;
    
    // Convert rent values to numbers and map them
    const weekly_rent_value = weekly_rent || weeklyRent;
    const monthly_rent_value = monthly_rent || monthlyRent || rentalPrice;
    
    const weekly_rent_mapped = weekly_rent_value ? parseFloat(weekly_rent_value) : null;
    const monthly_rent_mapped = monthly_rent_value ? parseFloat(monthly_rent_value) : null;
    

    
    const lease_term_mapped = convertLeaseTerm(lease_term || tenancyLength);
    console.log('🔧 LEASE TERM DEBUG:');
    console.log('🔧 Raw lease_term:', lease_term);
    console.log('🔧 Raw tenancyLength:', tenancyLength);
    console.log('🔧 Converted lease_term_mapped:', lease_term_mapped);
    console.log('🔧 Type of lease_term_mapped:', typeof lease_term_mapped);
    const deposit_amount_mapped = deposit_amount || depositAmount;
    const furnished_mapped = furnished || (furnishedStatus === 'furnished');
    const student_housing_mapped = student_housing || studentHousing || false;
    const availability_date_mapped = availability_date || availableFrom;
    const contact_name_mapped = contact_name || contactName;
    const contact_phone_mapped = contact_phone || contactPhone;
    const contact_email_mapped = contact_email || contactEmail || req.user?.email;
    const property_consultant = req.body.property_consultant || req.body.propertyConsultant || null;

    // NEW FIELDS: EPC Rating
    const epc_rating_mapped = epc_rating || epcRating || '';
    
    // NEW FIELDS: Council Tax
    const council_tax_band_mapped = council_tax_band || councilTaxBand || '';
    const council_tax_status_mapped = council_tax_status || councilTaxStatus || '';
    
    // NEW FIELDS: Key Features
    const key_features_mapped = (() => {
      try {
        if (key_features || keyFeatures) {
          if (typeof (key_features || keyFeatures) === 'string') {
            return JSON.parse(key_features || keyFeatures);
          } else if (Array.isArray(key_features || keyFeatures)) {
            return key_features || keyFeatures;
          } else if (typeof (key_features || keyFeatures) === 'object') {
            return key_features || keyFeatures;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to parse key_features:', error);
        return [];
      }
    })();
    
    // NEW FIELDS: Layout of Property
    const layout_file_name_mapped = layout_file_name || layoutFileName || '';
    const layout_file_url_mapped = layout_file_url || layoutFileUrl || '';
    const apartment_size_mapped = apartment_size || apartmentSize || '';
    const floor_number_mapped = floor_number || floorNumber || '';

    // Data conversion for numeric fields
    const convertBathrooms = (bathrooms) => {
      if (!bathrooms) return null;
      if (typeof bathrooms === 'string') {
        if (bathrooms.includes('+')) {
          // Convert "4+" to 4, "10+" to 10, etc.
          return parseInt(bathrooms.replace('+', ''));
        }
        return parseInt(bathrooms) || null;
      }
      return bathrooms;
    };

    const convertBedrooms = (bedrooms) => {
      if (!bedrooms) return null;
      if (typeof bedrooms === 'string') {
        if (bedrooms.includes('+')) {
          // Convert "6+" to 6, "10+" to 10, etc.
          return parseInt(bedrooms.replace('+', ''));
        }
        return parseInt(bedrooms) || null;
      }
      return bedrooms;
    };

    // Convert form values to database-compatible types
    const bathrooms_converted = convertBathrooms(bathrooms);
    const bedrooms_converted = convertBedrooms(bedrooms);

    // Debug logging for property submission
    console.log('🔍 Property submission debug:');
    console.log('📋 Raw request body keys:', Object.keys(req.body));
    console.log('📋 Uploaded files count:', req.files ? req.files.length : 0);
    console.log('📋 providedTitle:', providedTitle);
    console.log('📋 propertyTitle:', propertyTitle);
    console.log('📋 Final title value:', title);
    console.log('📋 Is title truthy?', !!title);
    console.log('📋 property_type_mapped:', property_type_mapped);
    console.log('📋 city:', city);
    console.log('🏠 ADDRESS DEBUG:');
    console.log('🏠 address_line1_mapped:', address_line1_mapped);
    console.log('📋 bathrooms (raw):', bathrooms);
    console.log('📋 bathrooms_converted:', bathrooms_converted);
    console.log('📋 bedrooms (raw):', bedrooms);
    console.log('📋 bedrooms_converted:', bedrooms_converted);
    console.log('💰 RENTAL PRICES DEBUG:');
    console.log('💰 Raw weekly_rent:', weekly_rent);
    console.log('💰 Raw weeklyRent:', weeklyRent);
    console.log('💰 Raw monthly_rent:', monthly_rent);
    console.log('💰 Raw monthlyRent:', monthlyRent);
    console.log('💰 Raw rentalPrice:', rentalPrice);
    console.log('💰 Mapped weekly_rent:', weekly_rent_mapped);
    console.log('💰 Mapped monthly_rent:', monthly_rent_mapped);
    console.log('💰 Types:', {
      weekly_rent: typeof weekly_rent,
      weeklyRent: typeof weeklyRent,
      weekly_rent_mapped: typeof weekly_rent_mapped,
      monthly_rent: typeof monthly_rent,
      monthlyRent: typeof monthlyRent,
      monthly_rent_mapped: typeof monthly_rent_mapped
    });

    // Validate required fields
    if (!title) {
      console.log('❌ Title validation failed - title is:', title);
      return res.status(400).json({
        success: false,
        message: 'Property title is required'
      });
    }

    if (!category_mapped) {
      return res.status(400).json({
        success: false,
        message: 'Property category is required'
      });
    }

    if (!city) {
      return res.status(400).json({
        success: false,
        message: 'City is required'
      });
    }

    const user_id = req.user.id;
    const slug = generateSlug(title);

    // Geocode location for all properties
    let latitude = null;
    let longitude = null;
    const locationString = `${address_line1_mapped || ''} ${city || ''} ${zip_code_mapped || ''} ${country || ''}`;
    try {
      const geoResult = await geocodeLocationEnhanced(locationString);
      if (geoResult && geoResult.lat && geoResult.lng) {
        latitude = geoResult.lat;
        longitude = geoResult.lng;
      }
    } catch (e) {
      console.warn('Geocoding failed:', e.message);
    }

    // Insert property
    console.log('📝 INSERT DEBUG - Values being inserted:');
    console.log('weekly_rent_mapped:', weekly_rent_mapped);
    console.log('monthly_rent_mapped:', monthly_rent_mapped);
    console.log('🔧 FINAL lease_term_mapped value:', lease_term_mapped, typeof lease_term_mapped);
    
    const valuesArray = [
      user_id, title, description, category_mapped, property_type_mapped, property_category,
      address_line1_mapped, address_line2, city, state_mapped, zip_code_mapped, country || 'USA',
      bedrooms_converted, bathrooms_converted, square_feet, lot_size, year_built,
      price_mapped, weekly_rent_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
      parking_spaces || 0, has_garage || false, has_pool || false, 
      has_garden || false, furnished_mapped || false, pets_allowed || false,
      student_housing_mapped, availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped, property_consultant || null, slug,
      latitude, longitude,
      // NEW FIELDS
      epc_rating_mapped, JSON.stringify(key_features_mapped),
      layout_file_name_mapped, layout_file_url_mapped, apartment_size_mapped, floor_number_mapped,
      council_tax_band_mapped, council_tax_status_mapped
    ];
    
    console.log('Values array position 21 (lease_term):', valuesArray[20]);
    console.log('Values array:', valuesArray);
    
    const propertyResult = await client.query(
      `INSERT INTO properties (
        user_id, title, description, category, property_type, property_category,
        address_line1, address_line2, city, state, zip_code, country,
        bedrooms, bathrooms, square_feet, lot_size, year_built,
        price, weekly_rent, monthly_rent, lease_term, deposit_amount,
        parking_spaces, has_garage, has_pool, has_garden, furnished, pets_allowed,
        student_housing, availability_date, contact_name, contact_phone, contact_email, property_consultant, slug,
        latitude, longitude,
        epc_rating, key_features,
        layout_file_name, layout_file_url, apartment_size, floor_number,
        council_tax_band, council_tax_status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45
      ) RETURNING *`,
      valuesArray
    );

    const property = propertyResult.rows[0];

    // Handle uploaded files from multer
    if (req.files) {
      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Handle photos
      if (req.files.photos && req.files.photos.length > 0) {
        for (let i = 0; i < req.files.photos.length; i++) {
          const file = req.files.photos[i];
          
          // Create unique filename
          const filename = `${property.id}_photo_${i}_${file.originalname}`;
          const filepath = path.join(uploadsDir, filename);
          
          // Save file to disk
          try {
            fs.writeFileSync(filepath, file.buffer);
            console.log(`📁 Photo saved: ${filename}`);
          } catch (fileError) {
            console.error(`❌ Error saving photo ${filename}:`, fileError);
            continue; // Skip this file if save fails
          }
          
          // Store URL in database
          const imageUrl = `/uploads/${filename}`;
          
          await client.query(
            `INSERT INTO property_images (property_id, image_url, image_type, image_order, alt_text)
             VALUES ($1, $2, $3, $4, $5)`,
            [property.id, imageUrl, file.mimetype.startsWith('video/') ? 'video' : 'image', i, title]
          );
        }
      }

      // Handle layout file
      if (req.files.layoutFile && req.files.layoutFile.length > 0) {
        const layoutFile = req.files.layoutFile[0];
        
        // Create unique filename for layout file
        const layoutFilename = `${property.id}_layout_${layoutFile.originalname}`;
        const layoutFilepath = path.join(uploadsDir, layoutFilename);
        
        // Save layout file to disk
        try {
          fs.writeFileSync(layoutFilepath, layoutFile.buffer);
          console.log(`📄 Layout file saved: ${layoutFilename}`);
          
          // Update property with layout file information
          const layoutUrl = `/uploads/${layoutFilename}`;
          await client.query(
            `UPDATE properties SET layout_file_name = $1, layout_file_url = $2 WHERE id = $3`,
            [layoutFile.originalname, layoutUrl, property.id]
          );
          
          console.log(`✅ Layout file updated in database: ${layoutFile.originalname}`);
        } catch (fileError) {
          console.error(`❌ Error saving layout file ${layoutFilename}:`, fileError);
        }
      }
    }

    // Insert property images (legacy support for image URLs from frontend)
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        await client.query(
          `INSERT INTO property_images (property_id, image_url, image_type, image_order, alt_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [property.id, image.url, image.type || 'interior', i, image.alt_text || title]
        );
      }
    }

    // Insert amenities
    if (amenities && amenities.length > 0) {
      for (const amenity of amenities) {
        await client.query(
          `INSERT INTO property_amenities (property_id, amenity_name, amenity_category)
           VALUES ($1, $2, $3)`,
          [property.id, amenity.name, amenity.category || 'general']
        );
      }
    }

    // Insert submission tracking
    await client.query(
      `INSERT INTO property_submissions (property_id, user_id, submission_type)
       VALUES ($1, $2, 'new')`,
      [property.id, user_id]
    );

    await client.query('COMMIT');

    // Get user details for email
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
    const user = userResult.rows[0];

    // Send confirmation email to user
    const userEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Property Submission Confirmed! 🏠</h2>
        <p>Dear ${user.first_name} ${user.last_name},</p>
        <p>Thank you for submitting your property listing. Here are the details:</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #667eea; margin-top: 0;">${title}</h3>
          <p><strong>Category:</strong> ${category_mapped.charAt(0).toUpperCase() + category_mapped.slice(1)}</p>
          <p><strong>Type:</strong> ${property_type_mapped ? property_type_mapped.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Not specified'}</p>
          <p><strong>Address:</strong> ${address_line1_mapped}, ${city}, ${state_mapped} ${zip_code_mapped}</p>
          <p><strong>Price:</strong> $${price_mapped ? price_mapped.toLocaleString() : monthly_rent_mapped?.toLocaleString() + '/month'}</p>
          <p><strong>Status:</strong> Pending Review</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <p>Your property is now under review by our team. We'll notify you once it's approved and live on our platform.</p>
        <p>You can track your submission status in your dashboard at any time.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>
        </div>
        
        <p>Best regards,<br>Property Management Team</p>
      </div>
    `;

    await sendEmailNotification({
      to: user.email,
      subject: `Property Submission Confirmed - ${title}`,
      html: userEmailHtml,
      property,
      user,
      notificationType: 'submission_confirm'
    });

    // Send alert email to admin
    const adminEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">🚨 New Property Submission</h2>
        <p>A new property has been submitted and requires review:</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #667eea; margin-top: 0;">${title}</h3>
          <p><strong>Submitted by:</strong> ${user.first_name} ${user.last_name} (${user.email})</p>
          <p><strong>Category:</strong> ${category_mapped.charAt(0).toUpperCase() + category_mapped.slice(1)}</p>
          <p><strong>Type:</strong> ${property_type_mapped ? property_type_mapped.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Not specified'}</p>
          <p><strong>Address:</strong> ${address_line1_mapped}, ${city}, ${state_mapped} ${zip_code_mapped}</p>
          <p><strong>Price:</strong> $${price_mapped ? price_mapped.toLocaleString() : monthly_rent_mapped?.toLocaleString() + '/month'}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>
        </div>
      </div>
    `;

    await sendEmailNotification({
      to: process.env.ADMIN_EMAIL || 'admin@property.com',
      subject: `🏠 New Property Submission: ${title}`,
      html: adminEmailHtml,
      property,
      user,
      notificationType: 'admin_alert'
    });

    res.status(201).json({
      success: true,
      message: 'Property submitted successfully! You will receive a confirmation email shortly.',
      property: {
        id: property.id,
        title: property.title,
        status: property.status,
        slug: property.slug
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Property submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit property. Please try again.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Get user's properties
const getUserProperties = async (req, res) => {
  try {
    const user_id = req.user.id;
    const user_role = req.user.role;
    const { page = 1, limit = 100, status, type } = req.query;
    const offset = (page - 1) * limit;

    // 🔍 CRITICAL DEBUG: Log user authentication details
    console.log('🔍 AUTHENTICATION DEBUG:');
    console.log('📋 User ID from req.user:', user_id);
    console.log('📋 User role:', user_role);
    console.log('📋 User object:', req.user);
    console.log('📋 Request headers:', req.headers.authorization ? 'Authorization header present' : 'No authorization header');
    console.log('📋 Request user agent:', req.headers['user-agent']);

    // 🎯 SECURITY FIX: Ensure users only see their own properties, admins see all
    let whereClause;
    let queryParams = [];
    let paramCount = 0;

    // Check if this is an admin request (from admin dashboard)
    const isAdminRequest = req.path.includes('/admin/');
    
    if ((user_role === 'admin' || user_role === 'super_admin') && isAdminRequest) {
      // Admin dashboard request - show ALL properties for management
      whereClause = 'WHERE 1=1';
      console.log('👑 Admin dashboard: Showing ALL properties for management');
    } else {
      // Regular user request - show ONLY their own properties
      paramCount++;
      whereClause = 'WHERE p.user_id = $1';
      queryParams.push(user_id);
      console.log(`👤 User mode: Showing only properties for user ID ${user_id}`);
    }

    if (status) {
      paramCount++;
      whereClause += ` AND p.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (type) {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(type);
    }

    // Build base query
    let query = `
      SELECT 
        p.*,
        u.first_name, u.last_name, u.email as user_email, u.phone as user_phone,
        COUNT(pi.id) as image_count,
        ARRAY_AGG(
          CASE WHEN pi.id IS NOT NULL 
          THEN json_build_object('id', pi.id, 'url', pi.image_url, 'type', pi.image_type)
          ELSE NULL END
        ) FILTER (WHERE pi.id IS NOT NULL) as images
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN property_images pi ON p.id = pi.property_id
      ${whereClause}
      GROUP BY p.id, u.first_name, u.last_name, u.email, u.phone
      ORDER BY p.updated_at DESC, p.created_at DESC
    `;

    // Only add LIMIT and OFFSET if limit is reasonable (not trying to get all records)
    if (limit && limit < 1000) {
      query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
    }

    // 🔍 DEBUG: Log the query and parameters
    console.log('🔍 getUserProperties DEBUG:');
    console.log('📋 User ID:', user_id);
    console.log('📋 User Role:', user_role);
    console.log('📋 Is Admin Request:', isAdminRequest);
    console.log('📋 Request Path:', req.path);
    console.log('📋 Query params:', queryParams);
    console.log('📋 Where clause:', whereClause);
    console.log('📋 Full query:', query);

    const result = await pool.query(query, queryParams);

    // 🔒 SECURITY CHECK: Verify all returned properties belong to the requesting user (for non-admin requests)
    if (!isAdminRequest && result.rows.length > 0) {
      const unauthorizedProperties = result.rows.filter(property => property.user_id !== user_id);
      if (unauthorizedProperties.length > 0) {
        console.error('🚨 SECURITY BREACH: User accessing unauthorized properties!');
        console.error('🚨 User ID:', user_id);
        console.error('🚨 Unauthorized properties:', unauthorizedProperties.map(p => ({ id: p.id, user_id: p.user_id })));
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Debug logging - check what data is returned from database
    console.log('🔍 Backend getUserProperties Debug:');
    console.log('📊 Total properties returned:', result.rows.length);
    if (result.rows.length > 0) {
      const firstProperty = result.rows[0];
      console.log('🏠 First property debug:', {
        id: firstProperty.id,
        title: firstProperty.title,
        status: firstProperty.status,
        hasDescription: !!firstProperty.description,
        descriptionLength: firstProperty.description?.length || 0,
        descriptionValue: firstProperty.description ? firstProperty.description.substring(0, 100) + '...' : 'NULL/EMPTY',
        allFields: Object.keys(firstProperty)
      });
      
      // Debug contact information specifically
      console.log('👤 Contact Information Debug:', {
        propertyId: firstProperty.id,
        firstName: firstProperty.first_name,
        lastName: firstProperty.last_name,
        userEmail: firstProperty.user_email,
        userPhone: firstProperty.user_phone,
        contactName: firstProperty.contact_name,
        contactPhone: firstProperty.contact_phone,
        contactEmail: firstProperty.contact_email
      });
    } else {
      console.log('❌ No properties found - checking database directly...');
      
      // Check if user has any properties at all
      const userPropertiesCheck = await pool.query(
        'SELECT COUNT(*) as total FROM properties WHERE user_id = $1',
        [user_id]
      );
      console.log('🔍 User properties count:', userPropertiesCheck.rows[0].total);
      
      // Check if there are any properties with different statuses
      const statusCheck = await pool.query(
        'SELECT status, COUNT(*) as count FROM properties WHERE user_id = $1 GROUP BY status',
        [user_id]
      );
      console.log('🔍 Properties by status:', statusCheck.rows);
      
      // 🔍 CRITICAL DEBUG: Check if there are properties for other users
      const allPropertiesCheck = await pool.query(
        'SELECT user_id, COUNT(*) as count FROM properties GROUP BY user_id ORDER BY count DESC LIMIT 5'
      );
      console.log('🔍 All properties by user:', allPropertiesCheck.rows);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM properties p LEFT JOIN users u ON p.user_id = u.id ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams.slice(0, paramCount));
    const totalCount = parseInt(countResult.rows[0].count);

    // Build pagination response
    const paginationResponse = {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages: limit < 1000 ? Math.ceil(totalCount / limit) : 1,
      hasNextPage: limit < 1000 ? (page * limit) < totalCount : false,
      hasPrevPage: page > 1
    };

    res.json({
      success: true,
      properties: result.rows,
      pagination: paginationResponse
    });

  } catch (error) {
    console.error('Get user properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties',
      error: error.message
    });
  }
};

// Get all properties (admin)
const getAllProperties = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      whereClause += ` AND p.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (type) {
      paramCount++;
      whereClause += ` AND p.category = $${paramCount}`;
      queryParams.push(type);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.address_line1 ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    let query = `
      SELECT 
        p.*,
        u.first_name, u.last_name, u.email as user_email, u.phone as user_phone,
        COUNT(pi.id) as image_count,
        ARRAY_AGG(
          CASE WHEN pi.id IS NOT NULL 
          THEN json_build_object('id', pi.id, 'url', pi.image_url, 'type', pi.image_type)
          ELSE NULL END
        ) FILTER (WHERE pi.id IS NOT NULL) as images
      FROM properties p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN property_images pi ON p.id = pi.property_id
      ${whereClause}
      GROUP BY p.id, u.first_name, u.last_name, u.email, u.phone
      ORDER BY p.updated_at DESC, p.created_at DESC
    `;

    // Only add LIMIT and OFFSET if limit is reasonable (not trying to get all records)
    if (limit && limit < 1000) {
      query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      queryParams.push(limit, offset);
    }

    const result = await pool.query(query, queryParams);

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM properties p LEFT JOIN users u ON p.user_id = u.id ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams.slice(0, paramCount));
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      properties: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get all properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch properties',
      error: error.message
    });
  }
};

// Approve/Reject property (admin)
const updatePropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, rejection_reason } = req.body;
    const admin_id = req.user.id;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be approved or rejected.'
      });
    }

    // Update property status
    const updateQuery = `
      UPDATE properties 
      SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $3 
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [status, admin_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    const property = result.rows[0];

    // Update submission tracking
    await pool.query(
      `INSERT INTO property_submissions (property_id, user_id, submission_type, admin_notes, rejection_reason, reviewed_by, reviewed_at)
       VALUES ($1, $2, 'review', $3, $4, $5, NOW())`,
      [property.id, property.user_id, admin_notes, rejection_reason, admin_id]
    );

    // Get user details for email
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [property.user_id]);
    const user = userResult.rows[0];

    // Send notification email to user
    const emailSubject = status === 'approved' 
      ? `🎉 Property Approved: ${property.title}`
      : `📝 Property Review Required: ${property.title}`;

    const emailHtml = status === 'approved' ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">🎉 Congratulations! Your Property is Now Live!</h2>
        <p>Dear ${user.first_name} ${user.last_name},</p>
        <p>Great news! Your property listing has been approved and is now live on our platform.</p>
        
        <div style="background: #d5edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60;">
          <h3 style="color: #155724; margin-top: 0;">${property.title}</h3>
          <p><strong>Status:</strong> ✅ Approved & Live</p>
          <p><strong>Approved on:</strong> ${new Date().toLocaleDateString()}</p>
          ${admin_notes ? `<p><strong>Admin Notes:</strong> ${admin_notes}</p>` : ''}
        </div>
        
        <p>Your property is now visible to potential buyers/renters. You can view and manage your listing anytime.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}/property/${property.slug}" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">View Property</a>
          <a href="${process.env.CLIENT_URL}/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Dashboard</a>
        </div>
        
        <p>Best regards,<br>Property Management Team</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">📝 Property Needs Attention</h2>
        <p>Dear ${user.first_name} ${user.last_name},</p>
        <p>Your property listing requires some updates before it can be approved.</p>
        
        <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c;">
          <h3 style="color: #721c24; margin-top: 0;">${property.title}</h3>
          <p><strong>Status:</strong> ❌ Needs Review</p>
          <p><strong>Reviewed on:</strong> ${new Date().toLocaleDateString()}</p>
          ${rejection_reason ? `<p><strong>Required Changes:</strong> ${rejection_reason}</p>` : ''}
          ${admin_notes ? `<p><strong>Admin Notes:</strong> ${admin_notes}</p>` : ''}
        </div>
        
        <p>Please review the feedback above and update your property listing accordingly. Once updated, resubmit for approval.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}/dashboard" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Property</a>
        </div>
        
        <p>Best regards,<br>Property Management Team</p>
      </div>
    `;

    await sendEmailNotification({
      to: user.email,
      subject: emailSubject,
      html: emailHtml,
      property,
      user,
      notificationType: status === 'approved' ? 'approval' : 'rejection'
    });

    // 🔧 SOCKET.IO: Send real-time notification to user
    const io = req.app.get('io');
    if (io) {
      const notificationData = {
        ...property,
        ownerId: property.user_id,
        approvedBy: admin_id,
        adminNotes: admin_notes,
        rejectionReason: rejection_reason
      };

      if (status === 'approved') {
        console.log(`📢 Emitting propertyApproved to user ${property.user_id} for property ${property.id}`);
        io.emit('propertyApproved', notificationData);
      } else {
        console.log(`📢 Emitting propertyRejected to user ${property.user_id} for property ${property.id}`);
        io.emit('propertyRejected', notificationData);
      }
    }

    res.json({
      success: true,
      message: `Property ${status} successfully. User has been notified via email and real-time notification.`,
      property
    });

  } catch (error) {
    console.error('Update property status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property status',
      error: error.message
    });
  }
};

// Get dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE category = 'sale') as total_for_sale,
        COUNT(*) FILTER (WHERE category = 'rent') as total_for_rent,
        COUNT(*) FILTER (WHERE category = 'lease') as total_for_lease,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_approval,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as this_week,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as this_month,
        COUNT(*) as total_properties
      FROM properties
    `;

    const usersQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE role = 'user') as total_users,
        COUNT(*) FILTER (WHERE role = 'admin') as total_admins,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_week
      FROM users
    `;

    const [statsResult, usersResult] = await Promise.all([
      pool.query(statsQuery),
      pool.query(usersQuery)
    ]);

    const stats = {
      ...statsResult.rows[0],
      ...usersResult.rows[0]
    };

    // Convert string numbers to integers
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]) || 0;
    });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message
    });
  }
};

// Delete property (user can delete their own property)
const deleteProperty = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const user_id = req.user.id;
    
    // Check if property exists and belongs to user
    const propertyResult = await client.query(
      'SELECT * FROM properties WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );
    
    if (propertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you do not have permission to delete it'
      });
    }
    
    const property = propertyResult.rows[0];
    
    // Get all image files to delete from filesystem
    const imagesResult = await client.query(
      'SELECT image_url FROM property_images WHERE property_id = $1',
      [id]
    );
    
    // Delete images from filesystem
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    for (const imageRow of imagesResult.rows) {
      const imageUrl = imageRow.image_url;
      if (imageUrl.startsWith('/uploads/')) {
        const filename = imageUrl.replace('/uploads/', '');
        const filepath = path.join(uploadsDir, filename);
        
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            console.log(`🗑️ Deleted file: ${filename}`);
          }
        } catch (fileError) {
          console.error(`❌ Error deleting file ${filename}:`, fileError);
        }
      }
    }
    
    // Delete related records (cascading)
    await client.query('DELETE FROM email_notifications WHERE property_id = $1', [id]);
    await client.query('DELETE FROM property_images WHERE property_id = $1', [id]);
    await client.query('DELETE FROM property_amenities WHERE property_id = $1', [id]);
    await client.query('DELETE FROM property_submissions WHERE property_id = $1', [id]);
    
    // Delete the property
    await client.query('DELETE FROM properties WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    console.log(`🗑️ Property deleted: ${property.title} (ID: ${id})`);
    
    res.json({
      success: true,
      message: `Property "${property.title}" has been deleted successfully`
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete property',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Frontend can load properties in chunks
const loadAllProperties = async () => {
  let allProperties = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(`/api/properties/my-properties?page=${page}&limit=100`);
    const data = await response.json();
    
    allProperties = [...allProperties, ...data.properties];
    hasMore = data.pagination.hasNextPage;
    page++;
  }
  
  return allProperties;
};

// Update existing property
const updateProperty = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const user_id = req.user.id;
    
    // Check if property exists and belongs to user
    const existingPropertyResult = await client.query(
      'SELECT * FROM properties WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );
    
    if (existingPropertyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you do not have permission to edit it'
      });
    }
    
    const existingProperty = existingPropertyResult.rows[0];
    
    const {
      title: providedTitle,
      propertyTitle, // Alternative field name from frontend
      description,
      category, // Property category (rent/sale/lease)
      property_type, // Property type (flat/house/detached/etc)
      propertyType, // Alternative field name from frontend
      property_category,
      address_line1, 
      streetAddress, // Alternative field name from frontend
      address_line2, 
      city, 
      state, 
      region, // Alternative field name from frontend
      zip_code, 
      postcode, // Alternative field name from frontend
      country,
      bedrooms, 
      bathrooms, 
      square_feet, 
      lot_size, 
      year_built,
      price, 
      askingPrice, // Alternative field name from frontend
      weekly_rent,
      weeklyRent, // Alternative field name from frontend
      monthly_rent, 
      monthlyRent, // Alternative field name from frontend
      rentalPrice, // Alternative field name from frontend
      lease_term, 
      tenancyLength, // Alternative field name from frontend
      deposit_amount,
      depositAmount, // Alternative field name from frontend
      parking_spaces, 
      has_garage, 
      has_pool, 
      has_garden, 
      furnished, 
      furnishedStatus, // Alternative field name from frontend
      pets_allowed,
      student_housing,
      studentHousing, // Alternative field name from frontend
      availability_date, 
      availableFrom, // Alternative field name from frontend
      contact_name, 
      contactName, // Alternative field name from frontend
      contact_phone, 
      contactPhone, // Alternative field name from frontend
      contact_email, 
      contactEmail, // Alternative field name from frontend
      amenities = [], 
      images = [],
      
      // NEW FIELDS: EPC Rating
      epc_rating,
      epcRating, // Alternative field name from frontend
      
      // NEW FIELDS: Council Tax
      council_tax_band,
      councilTaxBand, // Alternative field name from frontend
      council_tax_status,
      councilTaxStatus, // Alternative field name from frontend
      
      // NEW FIELDS: Key Features
      key_features,
      keyFeatures, // Alternative field name from frontend
      
      // NEW FIELDS: Layout of Property
      layout_file_name,
      layoutFileName, // Alternative field name from frontend
      layout_file_url,
      layoutFileUrl, // Alternative field name from frontend
      apartment_size,
      apartmentSize, // Alternative field name from frontend
      floor_number,
      floorNumber // Alternative field name from frontend
    } = req.body;

    // Map frontend field names to backend field names
    const title = providedTitle || propertyTitle || existingProperty.title;
    const category_mapped = category || existingProperty.category;
    const property_type_mapped = property_type || propertyType || existingProperty.property_type;
    const address_line1_mapped = address_line1 || streetAddress || existingProperty.address_line1;
    const state_mapped = state || region || existingProperty.state;
    const zip_code_mapped = zip_code || postcode || existingProperty.zip_code;
    const price_mapped = price || askingPrice || existingProperty.price;
    
    // Convert rent values to numbers and map them
    const weekly_rent_value = weekly_rent || weeklyRent;
    const monthly_rent_value = monthly_rent || monthlyRent || rentalPrice;
    
    const weekly_rent_mapped = weekly_rent_value ? parseFloat(weekly_rent_value) : existingProperty.weekly_rent;
    const monthly_rent_mapped = monthly_rent_value ? parseFloat(monthly_rent_value) : existingProperty.monthly_rent;
    
    const lease_term_mapped = convertLeaseTerm(lease_term || tenancyLength) || existingProperty.lease_term;
    const deposit_amount_mapped = deposit_amount || depositAmount || existingProperty.deposit_amount;
    const furnished_mapped = furnished !== undefined ? furnished : (furnishedStatus === 'furnished') || existingProperty.furnished;
    const student_housing_mapped = student_housing !== undefined ? student_housing : (studentHousing || existingProperty.student_housing);
    const availability_date_mapped = availability_date || availableFrom || existingProperty.availability_date;
    const contact_name_mapped = contact_name || contactName || existingProperty.contact_name;
    const contact_phone_mapped = contact_phone || contactPhone || existingProperty.contact_phone;
    const contact_email_mapped = contact_email || contactEmail || existingProperty.contact_email;
    const property_consultant = req.body.property_consultant || req.body.propertyConsultant || existingProperty.property_consultant;

    // NEW FIELDS: EPC Rating
    const epc_rating_mapped = epc_rating || epcRating || '';
    
    // NEW FIELDS: Council Tax
    const council_tax_band_mapped = council_tax_band || councilTaxBand || '';
    const council_tax_status_mapped = council_tax_status || councilTaxStatus || '';
    
    // NEW FIELDS: Key Features
    const key_features_mapped = (() => {
      try {
        if (key_features || keyFeatures) {
          if (typeof (key_features || keyFeatures) === 'string') {
            return JSON.parse(key_features || keyFeatures);
          } else if (Array.isArray(key_features || keyFeatures)) {
            return key_features || keyFeatures;
          } else if (typeof (key_features || keyFeatures) === 'object') {
            return key_features || keyFeatures;
          }
        }
        return [];
      } catch (error) {
        console.warn('Failed to parse key_features:', error);
        return [];
      }
    })();
    
    // NEW FIELDS: Layout of Property
    const layout_file_name_mapped = layout_file_name || layoutFileName || '';
    const layout_file_url_mapped = layout_file_url || layoutFileUrl || '';
    const apartment_size_mapped = apartment_size || apartmentSize || '';
    const floor_number_mapped = floor_number || floorNumber || '';

    // Geocode location for all properties
    let latitude = null;
    let longitude = null;
    const locationString = `${address_line1_mapped || ''} ${city || ''} ${zip_code_mapped || ''} ${country || ''}`;
    try {
      const geoResult = await geocodeLocationEnhanced(locationString);
      if (geoResult && geoResult.lat && geoResult.lng) {
        latitude = geoResult.lat;
        longitude = geoResult.lng;
      }
    } catch (e) {
      console.warn('Geocoding failed:', e.message);
    }

    // Data conversion for numeric fields
    const convertBathrooms = (bathrooms) => {
      if (!bathrooms) return existingProperty.bathrooms;
      if (typeof bathrooms === 'string') {
        if (bathrooms.includes('+')) {
          return parseInt(bathrooms.replace('+', ''));
        }
        return parseInt(bathrooms) || existingProperty.bathrooms;
      }
      return bathrooms;
    };

    const convertBedrooms = (bedrooms) => {
      if (!bedrooms) return existingProperty.bedrooms;
      if (typeof bedrooms === 'string') {
        if (bedrooms.includes('+')) {
          return parseInt(bedrooms.replace('+', ''));
        }
        return parseInt(bedrooms) || existingProperty.bedrooms;
      }
      return bedrooms;
    };

    const bedrooms_converted = convertBedrooms(bedrooms);
    const bathrooms_converted = convertBathrooms(bathrooms);

    console.log('🔄 UPDATE DEBUG - Values being updated:');
    console.log('Property ID:', id);
    console.log('User ID:', user_id);
    console.log('Title:', title);
    console.log('Category:', category_mapped);
    console.log('Property Type:', property_type_mapped);
    console.log('Council Tax Band:', council_tax_band_mapped);
    console.log('Council Tax Status:', council_tax_status_mapped);
    console.log('Bedrooms:', bedrooms_converted, typeof bedrooms_converted);
    console.log('Bathrooms:', bathrooms_converted, typeof bathrooms_converted);

    // Create parameter array for debugging
    const params = [
      title, description || existingProperty.description, category_mapped, property_type_mapped, property_category || existingProperty.property_category,
      address_line1_mapped, address_line2 || existingProperty.address_line2, city || existingProperty.city, state_mapped, zip_code_mapped, country || existingProperty.country,
      bedrooms_converted, bathrooms_converted, square_feet || existingProperty.square_feet, lot_size || existingProperty.lot_size, year_built || existingProperty.year_built,
      price_mapped, weekly_rent_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
      parking_spaces || existingProperty.parking_spaces, has_garage || existingProperty.has_garage, has_pool || existingProperty.has_pool, 
      has_garden || existingProperty.has_garden, furnished_mapped, pets_allowed || existingProperty.pets_allowed,
      student_housing_mapped, availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped,
      epc_rating_mapped, JSON.stringify(key_features_mapped),
      layout_file_name_mapped, layout_file_url_mapped, apartment_size_mapped, floor_number_mapped,
      latitude, longitude,
      council_tax_band_mapped, council_tax_status_mapped,
      parseInt(id), parseInt(user_id)
    ];

    console.log('🔄 PARAMETER DEBUG:');
    params.forEach((param, index) => {
      if (typeof param === 'string' && param.length < 50) {
        console.log(`Param ${index + 1}: ${param} (${typeof param})`);
      }
    });

    // Update property
    const propertyResult = await client.query(
      `UPDATE properties SET 
        title = $1, description = $2, category = $3, property_type = $4, property_category = $5,
        address_line1 = $6, address_line2 = $7, city = $8, state = $9, zip_code = $10, country = $11,
        bedrooms = $12, bathrooms = $13, square_feet = $14, lot_size = $15, year_built = $16,
        price = $17, weekly_rent = $18, monthly_rent = $19, lease_term = $20, deposit_amount = $21,
        parking_spaces = $22, has_garage = $23, has_pool = $24, has_garden = $25, furnished = $26, pets_allowed = $27,
        student_housing = $28, availability_date = $29, contact_name = $30, contact_phone = $31, contact_email = $32, property_consultant = $33,
        epc_rating = $34, key_features = $35,
        layout_file_name = $36, layout_file_url = $37, apartment_size = $38, floor_number = $39,
        updated_at = CURRENT_TIMESTAMP, status = 'pending',
        latitude = $40, longitude = $41,
        council_tax_band = $42, council_tax_status = $43
       WHERE id = $44 AND user_id = $45
       RETURNING *`,
      [
        title, description || existingProperty.description, category_mapped, property_type_mapped, property_category || existingProperty.property_category,
        address_line1_mapped, address_line2 || existingProperty.address_line2, city || existingProperty.city, state_mapped, zip_code_mapped, country || existingProperty.country,
        bedrooms_converted, bathrooms_converted, square_feet || existingProperty.square_feet, lot_size || existingProperty.lot_size, year_built || existingProperty.year_built,
        price_mapped, weekly_rent_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
        parking_spaces || existingProperty.parking_spaces, has_garage || existingProperty.has_garage, has_pool || existingProperty.has_pool, 
        has_garden || existingProperty.has_garden, furnished_mapped, pets_allowed || existingProperty.pets_allowed,
        student_housing_mapped, availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped, property_consultant || existingProperty.property_consultant,
        epc_rating_mapped, JSON.stringify(key_features_mapped),
        layout_file_name_mapped, layout_file_url_mapped, apartment_size_mapped, floor_number_mapped,
        latitude, longitude,
        council_tax_band_mapped, council_tax_status_mapped,
        parseInt(id), parseInt(user_id)
      ]
    );

    if (propertyResult.rows.length === 0) {
      throw new Error('Failed to update property');
    }

    const property = propertyResult.rows[0];

    // Handle photo management: Keep specific photos, delete specific photos, add new photos
    let deletedPhotos = req.body.deletedPhotos;
    let keptPhotos = req.body.keptPhotos;
    
    // CRITICAL FIX: Ensure deletedPhotos and keptPhotos are arrays, not strings
    if (typeof deletedPhotos === 'string') {
      deletedPhotos = [deletedPhotos]; // Convert single string to array
    } else if (!Array.isArray(deletedPhotos)) {
      deletedPhotos = []; // Default to empty array if not string or array
    }
    
    if (typeof keptPhotos === 'string') {
      keptPhotos = [keptPhotos]; // Convert single string to array
    } else if (!Array.isArray(keptPhotos)) {
      keptPhotos = []; // Default to empty array if not string or array
    }
    
    console.log('📷 PHOTO MANAGEMENT DEBUG:');
    console.log('📷 Deleted photos received (type:', typeof req.body.deletedPhotos, '):', deletedPhotos);
    console.log('📷 Kept photos received (type:', typeof req.body.keptPhotos, '):', keptPhotos);
    console.log('📷 New photos to upload:', req.files ? req.files.length : 0);
    
    // Step 1: Handle deleted photos (remove from database and file system)
    if (deletedPhotos && deletedPhotos.length > 0) {
      console.log('🗑️ Processing deleted photos:', deletedPhotos);
      
      for (const deletedPhotoIdentifier of deletedPhotos) {
        console.log('🔍 Looking for photo to delete:', deletedPhotoIdentifier);
        
        // Try to find by exact URL match first
        let existingImage = await client.query(
          'SELECT * FROM property_images WHERE property_id = $1 AND image_url = $2',
          [property.id, deletedPhotoIdentifier]
        );
        
        // If not found by exact URL, try filename pattern matching
        if (existingImage.rows.length === 0) {
          const filename = deletedPhotoIdentifier.split('/').pop();
          existingImage = await client.query(
            'SELECT * FROM property_images WHERE property_id = $1 AND image_url LIKE $2',
            [property.id, `%${filename}%`]
          );
        }
        
        if (existingImage.rows.length > 0) {
          const imageRecord = existingImage.rows[0];
          console.log('✅ Found image to delete:', imageRecord.image_url);
          
          // Delete from database
          await client.query(
            'DELETE FROM property_images WHERE id = $1',
            [imageRecord.id]
          );
          
          // Delete physical file
          try {
            const fullPath = path.join(__dirname, '..', imageRecord.image_url);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              console.log(`🗑️ Successfully deleted file: ${imageRecord.image_url}`);
            } else {
              console.log(`⚠️ File not found on disk: ${fullPath}`);
            }
          } catch (fileDeleteError) {
            console.error(`❌ Error deleting file ${imageRecord.image_url}:`, fileDeleteError);
          }
        } else {
          console.log(`⚠️ Could not find image to delete: ${deletedPhotoIdentifier}`);
        }
      }
    }
    
    // Step 2: Verify kept photos still exist in database (no action needed, just validation)
    if (keptPhotos && keptPhotos.length > 0) {
      console.log('✅ Verifying kept photos are preserved:');
      for (const keptPhotoUrl of keptPhotos) {
        const keptImage = await client.query(
          'SELECT * FROM property_images WHERE property_id = $1 AND image_url = $2',
          [property.id, keptPhotoUrl]
        );
        if (keptImage.rows.length > 0) {
          console.log(`✅ Kept photo verified: ${keptPhotoUrl}`);
        } else {
          console.log(`⚠️ Kept photo not found in DB: ${keptPhotoUrl}`);
        }
      }
    }

    // Step 3: Handle uploaded files from multer (add new photos and layout file)
    if (req.files) {
      console.log('📁 Processing new file uploads...');
      
      // Ensure uploads directory exists
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Handle new photos
      if (req.files.photos && req.files.photos.length > 0) {
        console.log('📁 Processing new photo uploads...');
        
        // Get current max image_order to append new photos
        const maxOrderResult = await client.query(
          'SELECT COALESCE(MAX(image_order), -1) as max_order FROM property_images WHERE property_id = $1',
          [property.id]
        );
        let currentMaxOrder = maxOrderResult.rows[0].max_order;

        for (let i = 0; i < req.files.photos.length; i++) {
          const file = req.files.photos[i];
          
          // Create unique filename
          const filename = `${property.id}_${Date.now()}_photo_${i}_${file.originalname}`;
          const filepath = path.join(uploadsDir, filename);
          
          // Save file to disk
          try {
            fs.writeFileSync(filepath, file.buffer);
            console.log(`📁 New photo saved: ${filename}`);
          } catch (fileError) {
            console.error(`❌ Error saving photo ${filename}:`, fileError);
            continue;
          }
          
          // Store URL in database with proper ordering
          const imageUrl = `/uploads/${filename}`;
          const newOrder = currentMaxOrder + 1 + i;
          
          await client.query(
            `INSERT INTO property_images (property_id, image_url, image_type, image_order, alt_text)
             VALUES ($1, $2, $3, $4, $5)`,
            [property.id, imageUrl, file.mimetype.startsWith('video/') ? 'video' : 'image', newOrder, title]
          );
          
          console.log(`✅ Added new photo to DB: ${imageUrl} (order: ${newOrder})`);
        }
      }

      // Handle layout file
      if (req.files.layoutFile && req.files.layoutFile.length > 0) {
        console.log('📄 Processing layout file upload...');
        
        const layoutFile = req.files.layoutFile[0];
        
        // Create unique filename for layout file
        const layoutFilename = `${property.id}_layout_${Date.now()}_${layoutFile.originalname}`;
        const layoutFilepath = path.join(uploadsDir, layoutFilename);
        
        // Save layout file to disk
        try {
          fs.writeFileSync(layoutFilepath, layoutFile.buffer);
          console.log(`📄 Layout file saved: ${layoutFilename}`);
          
          // Update property with layout file information
          const layoutUrl = `/uploads/${layoutFilename}`;
          await client.query(
            `UPDATE properties SET layout_file_name = $1, layout_file_url = $2 WHERE id = $3`,
            [layoutFile.originalname, layoutUrl, property.id]
          );
          
          console.log(`✅ Layout file updated in database: ${layoutFile.originalname}`);
        } catch (fileError) {
          console.error(`❌ Error saving layout file ${layoutFilename}:`, fileError);
        }
      }
    }

    // Insert property images (legacy support for image URLs from frontend)
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        await client.query(
          `INSERT INTO property_images (property_id, image_url, image_type, image_order, alt_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [property.id, image.url, image.type || 'interior', i, image.alt_text || title]
        );
      }
    }

    // Update amenities (clear existing and add new ones)
    if (amenities && amenities.length > 0) {
      // Delete existing amenities
      await client.query('DELETE FROM property_amenities WHERE property_id = $1', [property.id]);
      
      // Insert new amenities
      for (const amenity of amenities) {
        await client.query(
          `INSERT INTO property_amenities (property_id, amenity_name, amenity_category)
           VALUES ($1, $2, $3)`,
          [property.id, amenity.name, amenity.category || 'general']
        );
      }
    }

    // Final verification: Log current photo status
    const finalPhotoCount = await client.query(
      'SELECT COUNT(*) as total_photos FROM property_images WHERE property_id = $1',
      [property.id]
    );
    
    console.log('📷 FINAL PHOTO STATUS:');
    console.log(`📷 Property ID: ${property.id}`);
    console.log(`📷 Total photos after update: ${finalPhotoCount.rows[0].total_photos}`);
    console.log(`📷 Photos deleted: ${deletedPhotos ? deletedPhotos.length : 0}`);
    console.log(`📷 Photos kept: ${keptPhotos ? keptPhotos.length : 0}`);
    console.log(`📷 New photos added: ${req.files && req.files.photos ? req.files.photos.length : 0}`);
    console.log(`📷 Layout file uploaded: ${req.files && req.files.layoutFile ? req.files.layoutFile.length : 0}`);

    // Insert submission tracking
    await client.query(
      `INSERT INTO property_submissions (property_id, user_id, submission_type)
       VALUES ($1, $2, 'edit')`,
      [property.id, user_id]
    );

    // Get user details for email notifications
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
    const user = userResult.rows[0];

    // Send notification email to user
    const userEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">📝 Property Update Submitted</h2>
        <p>Dear ${user.first_name} ${user.last_name},</p>
        <p>Your property has been updated and is now pending review.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #667eea; margin-top: 0;">${property.title}</h3>
          <p><strong>Status:</strong> Pending Review</p>
          <p><strong>Updated:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Note:</strong> Since this was an approved property, it will need admin review before being visible again.</p>
        </div>
        
        <p>We'll notify you once the review is complete.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}/dashboard" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Dashboard</a>
        </div>
        
        <p>Best regards,<br>Property Management Team</p>
      </div>
    `;

    await sendEmailNotification({
      to: user.email,
      subject: `Property Update Submitted - ${property.title}`,
      html: userEmailHtml,
      property,
      user,
      notificationType: 'update_confirm'
    });

    // Send alert email to admin for edited approved properties
    if (property.status === 'pending') {
      const adminEmailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">🔄 Approved Property Updated</h2>
          <p>An approved property has been edited and requires review:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">${property.title}</h3>
            <p><strong>Updated by:</strong> ${user.first_name} ${user.last_name} (${user.email})</p>
            <p><strong>Previous Status:</strong> Approved</p>
            <p><strong>Current Status:</strong> Pending Review</p>
            <p><strong>Updated:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL}/admin-x9k7m2p5q8" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Property</a>
          </div>
        </div>
      `;

      await sendEmailNotification({
        to: process.env.ADMIN_EMAIL || 'admin@property.com',
        subject: `🔄 Approved Property Updated: ${property.title}`,
        html: adminEmailHtml,
        property,
        user,
        notificationType: 'admin_update_alert'
      });
    }

    await client.query('COMMIT');

    // 🔧 SOCKET.IO: Send real-time notification to admin about property update
    const io = req.app.get('io');
    if (io && property.status === 'pending') {
      const notificationData = {
        ...property,
        ownerId: property.user_id,
        updatedBy: user.first_name + ' ' + user.last_name,
        userEmail: user.email
      };

      console.log(`📢 Emitting propertyEdited to notify admin of property update for property ${property.id}`);
      io.emit('propertyEdited', notificationData);
    }

    console.log(`🔄 Property updated successfully: ${property.title} (ID: ${property.id})`);

    res.status(200).json({
      success: true,
      message: 'Property updated successfully! Changes are pending review.',
      property: {
        id: property.id,
        title: property.title,
        status: property.status,
        slug: property.slug
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Property update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property. Please try again.',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  submitProperty,
  updateProperty,
  getUserProperties,
  getAllProperties,
  updatePropertyStatus,
  getDashboardStats,
  deleteProperty
}; 