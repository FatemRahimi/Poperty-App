const { Pool } = require('pg');
const nodemailer = require('nodemailer');

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

// Send email notification
const sendEmailNotification = async (notificationData) => {
  try {
    const { to, subject, html, property, user, notificationType } = notificationData;
    
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
    console.error('Email sending failed:', error);
    
    // Log failed notification
    await pool.query(
      `INSERT INTO email_notifications (user_id, property_id, notification_type, email_subject, email_body, sent_to, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'failed')`,
      [user?.id, property?.id, notificationType, subject, html || '', to]
    );
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
      property_type, 
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
      monthly_rent, 
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
      availability_date, 
      availableFrom, // Alternative field name from frontend
      contact_name, 
      contactName, // Alternative field name from frontend
      contact_phone, 
      contactPhone, // Alternative field name from frontend
      contact_email, 
      contactEmail, // Alternative field name from frontend
      amenities = [], 
      images = []
    } = req.body;

    // Map frontend field names to backend field names
    const title = providedTitle || propertyTitle;
    const property_type_mapped = property_type || propertyType;
    const address_line1_mapped = address_line1 || streetAddress;
    const state_mapped = state || region;
    const zip_code_mapped = zip_code || postcode;
    const price_mapped = price || askingPrice;
    const monthly_rent_mapped = monthly_rent || rentalPrice;
    const lease_term_mapped = lease_term || tenancyLength;
    const deposit_amount_mapped = deposit_amount || depositAmount;
    const furnished_mapped = furnished || (furnishedStatus === 'furnished');
    const availability_date_mapped = availability_date || availableFrom;
    const contact_name_mapped = contact_name || contactName;
    const contact_phone_mapped = contact_phone || contactPhone;
    const contact_email_mapped = contact_email || contactEmail || req.user?.email;

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

    // Validate required fields
    if (!title) {
      console.log('❌ Title validation failed - title is:', title);
      return res.status(400).json({
        success: false,
        message: 'Property title is required'
      });
    }

    if (!property_type_mapped) {
      return res.status(400).json({
        success: false,
        message: 'Property type is required'
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

    // Insert property
    const propertyResult = await client.query(
      `INSERT INTO properties (
        user_id, title, description, property_type, property_category,
        address_line1, address_line2, city, state, zip_code, country,
        bedrooms, bathrooms, square_feet, lot_size, year_built,
        price, monthly_rent, lease_term, deposit_amount,
        parking_spaces, has_garage, has_pool, has_garden, furnished, pets_allowed,
        availability_date, contact_name, contact_phone, contact_email, slug
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
      ) RETURNING *`,
      [
        user_id, title, description, property_type_mapped, property_category,
        address_line1_mapped, address_line2, city, state_mapped, zip_code_mapped, country || 'USA',
        bedrooms, bathrooms, square_feet, lot_size, year_built,
        price_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
        parking_spaces || 0, has_garage || false, has_pool || false, 
        has_garden || false, furnished_mapped || false, pets_allowed || false,
        availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped, slug
      ]
    );

    const property = propertyResult.rows[0];

    // Handle uploaded files from multer
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        
        // In a production environment, you would upload these files to a cloud storage service
        // For now, we'll create a placeholder URL
        const imageUrl = `/uploads/${property.id}_${i}_${file.originalname}`;
        
        await client.query(
          `INSERT INTO property_images (property_id, image_url, image_type, image_order, alt_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [property.id, imageUrl, file.mimetype.startsWith('video/') ? 'video' : 'image', i, title]
        );
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
          <p><strong>Type:</strong> ${property_type_mapped.charAt(0).toUpperCase() + property_type_mapped.slice(1)}</p>
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
          <p><strong>Type:</strong> ${property_type_mapped.charAt(0).toUpperCase() + property_type_mapped.slice(1)}</p>
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
    const { page = 1, limit = 10, status, type } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE p.user_id = $1';
    let queryParams = [user_id];
    let paramCount = 1;

    if (status) {
      paramCount++;
      whereClause += ` AND p.status = $${paramCount}`;
      queryParams.push(status);
    }

    if (type) {
      paramCount++;
      whereClause += ` AND p.property_type = $${paramCount}`;
      queryParams.push(type);
    }

    const query = `
      SELECT 
        p.*,
        COUNT(pi.id) as image_count,
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

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM properties p ${whereClause}`;
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
      whereClause += ` AND p.property_type = $${paramCount}`;
      queryParams.push(type);
    }

    if (search) {
      paramCount++;
      whereClause += ` AND (p.title ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR p.address_line1 ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
    }

    const query = `
      SELECT 
        p.*,
        u.first_name, u.last_name, u.email as user_email,
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
      GROUP BY p.id, u.first_name, u.last_name, u.email
      ORDER BY p.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);

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

    res.json({
      success: true,
      message: `Property ${status} successfully. User has been notified via email.`,
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
        COUNT(*) FILTER (WHERE property_type = 'sale') as total_for_sale,
        COUNT(*) FILTER (WHERE property_type = 'rent') as total_for_rent,
        COUNT(*) FILTER (WHERE property_type = 'lease') as total_for_lease,
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

module.exports = {
  submitProperty,
  getUserProperties,
  getAllProperties,
  updatePropertyStatus,
  getDashboardStats
}; 