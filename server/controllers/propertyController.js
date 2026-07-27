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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
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
      yearBuilt, // Alternative field name from frontend
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
      floorNumber, // Alternative field name from frontend
      
      // MISSING FIELDS: Added for complete field mapping
      reception_rooms,
      receptionRooms, // Alternative field name from frontend
      house_number,
      houseNumber, // Alternative field name from frontend
      street_name,
      streetName, // Alternative field name from frontend  
      fullAddress, // Alternative field name from frontend
      local_authority,
      localAuthority, // Alternative field name from frontend
      nearest_transport_links,
      nearestTransportLinks, // Alternative field name from frontend
      short_description,
      shortDescription, // Alternative field name from frontend
      virtual_tour_link,
      virtualTourLink, // Alternative field name from frontend
      
      // ADDITIONAL INFO FIELDS: Added for complete additional information
      heating_type,
      heatingType, // Alternative field name from frontend
      broadband_availability,
      broadbandAvailability, // Alternative field name from frontend
      accessibility_features,
      accessibilityFeatures, // Alternative field name from frontend
      custom_features,
      customFeatures, // Alternative field name from frontend
      has_residential_accommodation,
      hasResidentialAccommodation, // Alternative field name from frontend
      
      // UK-specific lease fields
      vat_on_rent,
      vatOnRent,
      repairing_obligation,
      repairingObligation,
      insurance_responsibility,
      insuranceResponsibility,
      rent_review_frequency,
      rentReviewFrequency,
      
      // Commercial lease-specific fields
      spaceSubtypes,
      space_subtypes,
      leaseType,
      lease_type,
      useClass,
      use_class,
      minDivisible,
      min_divisible,
      vacantSQFT,
      vacant_sqft,
      landAcres,
      land_acres,
      lotSizeUnit,
      lot_size_unit,
      taxesPerSQFT,
      taxes_per_sqft,
      power,
      zoning,
      serviceCharge,
      service_charge,
      businessRates,
      business_rates,
      floorLoadCapacity,
      floor_load_capacity,
      heatingCooling,
      heating_cooling,
      toiletKitchen,
      toilet_kitchen,
      openingHours,
      opening_hours,
      isMultipleTenancy,
      is_multiple_tenancy,
      breakClause,
      break_clause,
      depositRequired,
      deposit_required,
      parkingAvailable,
      parking_available,
      disabilityAccess,
      disability_access,
      signageAllowed,
      signage_allowed,
      utilities,
      security
    } = req.body;

    // Map frontend field names to backend field names
    const title = providedTitle || propertyTitle;
    const category_mapped = category || 'rent'; // Default to rent if not specified
    // Normalize property_type to a single string
    const normalizePropertyType = (val) => {
      if (Array.isArray(val)) return val.find(Boolean) || '';
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object') return (val.value || val.label || '').toString();
      return '';
    };
    const property_type_mapped = normalizePropertyType(property_type) || normalizePropertyType(propertyType); // flat/house/detached/etc
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
    
    // NEW FIELDS: Layout of Property (preserve existing values if not provided)
    const layout_file_name_mapped = layout_file_name || layoutFileName || '';
    const layout_file_url_mapped = layout_file_url || layoutFileUrl || '';
    const apartment_size_mapped = apartment_size || apartmentSize || '';
    const floor_number_mapped = floor_number || floorNumber || '';
    
    // MISSING FIELDS: Field mappings for submitProperty (new properties)
    const reception_rooms_mapped = reception_rooms || receptionRooms || null;
    const house_number_mapped = house_number || houseNumber || '';
    const street_name_mapped = street_name || streetName || fullAddress || '';
    const local_authority_mapped = local_authority || localAuthority || '';
    const nearest_transport_links_mapped = nearest_transport_links || nearestTransportLinks || '';
    const short_description_mapped = short_description || shortDescription || '';
    const virtual_tour_link_mapped = virtual_tour_link || virtualTourLink || '';
    
    // Additional information field mappings
    const year_built_mapped = year_built || yearBuilt;
    const heating_type_mapped = heating_type || heatingType || '';
    const broadband_availability_mapped = broadband_availability || broadbandAvailability || '';
    const accessibility_features_mapped = accessibility_features || accessibilityFeatures || '';
    const custom_features_mapped = custom_features || customFeatures || '[]';
    const has_residential_accommodation_mapped = (has_residential_accommodation === 'true' || has_residential_accommodation === true || hasResidentialAccommodation === 'true' || hasResidentialAccommodation === true) ? true : false;
    
    // UK-specific lease field mappings
    const vat_on_rent_mapped = vat_on_rent || vatOnRent || '';
    const repairing_obligation_mapped = repairing_obligation || repairingObligation || '';
    const insurance_responsibility_mapped = insurance_responsibility || insuranceResponsibility || '';
    const rent_review_frequency_mapped = rent_review_frequency || rentReviewFrequency || null;
    
    // Commercial lease field mappings
    const space_subtypes_mapped = space_subtypes || spaceSubtypes || '';
    const lease_type_mapped = lease_type || leaseType || '';
    const use_class_mapped = use_class || useClass || '';
    const min_divisible_mapped = min_divisible || minDivisible || null;
    const vacant_sqft_mapped = vacant_sqft || vacantSQFT || null;
    const land_acres_mapped = land_acres || landAcres || null;
    const lot_size_unit_mapped = lot_size_unit || lotSizeUnit || '';
    const taxes_per_sqft_mapped = taxes_per_sqft || taxesPerSQFT || null;
    const power_mapped = power || '';
    const zoning_mapped = zoning || '';
    const service_charge_mapped = service_charge || serviceCharge || null;
    const business_rates_mapped = business_rates || businessRates || null;
    const floor_load_capacity_mapped = floor_load_capacity || floorLoadCapacity || '';
    const heating_cooling_mapped = heating_cooling || heatingCooling || '';
    const toilet_kitchen_mapped = toilet_kitchen || toiletKitchen || '';
    const opening_hours_mapped = opening_hours || openingHours || '';
    const is_multiple_tenancy_mapped = is_multiple_tenancy === true || is_multiple_tenancy === 'true' || isMultipleTenancy === true || isMultipleTenancy === 'true' || false;
    const break_clause_mapped = break_clause === true || break_clause === 'true' || breakClause === true || breakClause === 'true' || false;
    const deposit_required_mapped = deposit_required === true || deposit_required === 'true' || depositRequired === true || depositRequired === 'true' || false;
    const disability_access_mapped = disability_access === true || disability_access === 'true' || disabilityAccess === true || disabilityAccess === 'true' || false;
    const signage_allowed_mapped = signage_allowed === true || signage_allowed === 'true' || signageAllowed === true || signageAllowed === 'true' || false;
    
    // Parse JSON fields
    const utilities_mapped = utilities || '{}';
    const security_mapped = security || '{}';

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

    // Convert year_built to proper integer
    const convertYearBuilt = (yearValue) => {
      if (!yearValue) return null;
      
      // Convert to string first to handle various input types
      const yearStr = String(yearValue).trim();
      
      // If it's empty or null-like, return null
      if (!yearStr || yearStr === 'null' || yearStr === 'undefined') return null;
      
      // Parse as integer
      const yearInt = parseInt(yearStr);
      
      // Validate year range (reasonable bounds for building years)
      if (isNaN(yearInt) || yearInt < 1500 || yearInt > new Date().getFullYear() + 5) {
        console.warn(`⚠️ Invalid year_built value: ${yearValue} -> ${yearInt}`);
        return null;
      }
      
      return yearInt;
    };

    // Convert form values to database-compatible types
    const bathrooms_converted = convertBathrooms(bathrooms);
    const bedrooms_converted = convertBedrooms(bedrooms);
    const year_built_converted = convertYearBuilt(year_built_mapped);

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
      bedrooms_converted, bathrooms_converted, square_feet, lot_size, year_built_converted,
      price_mapped, weekly_rent_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
      parking_spaces || 0, has_garage || false, has_pool || false, 
      has_garden || false, furnished_mapped || false, pets_allowed || false,
      student_housing_mapped, availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped, property_consultant || null, slug,
      latitude, longitude,
      // NEW FIELDS
      epc_rating_mapped, JSON.stringify(key_features_mapped),
      layout_file_name_mapped, layout_file_url_mapped, apartment_size_mapped, floor_number_mapped,
      council_tax_band_mapped, council_tax_status_mapped,
      reception_rooms_mapped, house_number_mapped, street_name_mapped, local_authority_mapped, nearest_transport_links_mapped, short_description_mapped, virtual_tour_link_mapped,
      // EPC Document fields (initially empty, will be updated if file is uploaded)
      '', '', // epc_document_name, epc_document_url
      // Additional information fields
      heating_type_mapped, broadband_availability_mapped, accessibility_features_mapped, custom_features_mapped, has_residential_accommodation_mapped,
      // UK-specific lease fields
      vat_on_rent_mapped, repairing_obligation_mapped, insurance_responsibility_mapped, rent_review_frequency_mapped,
      // Commercial lease-specific fields
      space_subtypes_mapped, lease_type_mapped, use_class_mapped, min_divisible_mapped, vacant_sqft_mapped,
      land_acres_mapped, lot_size_unit_mapped, taxes_per_sqft_mapped, power_mapped, zoning_mapped,
      service_charge_mapped, business_rates_mapped, floor_load_capacity_mapped, heating_cooling_mapped, toilet_kitchen_mapped,
      opening_hours_mapped, is_multiple_tenancy_mapped, break_clause_mapped, deposit_required_mapped,
      disability_access_mapped, signage_allowed_mapped, utilities_mapped, security_mapped
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
        council_tax_band, council_tax_status,
        reception_rooms, house_number, street_name, local_authority, nearest_transport_links, short_description, virtual_tour_link,
        epc_document_name, epc_document_url,
        heating_type, broadband_availability, accessibility_features, custom_features, has_residential_accommodation,
        vat_on_rent, repairing_obligation, insurance_responsibility, rent_review_frequency,
        space_subtypes, lease_type, use_class, min_divisible, vacant_sqft,
        land_acres, lot_size_unit, taxes_per_sqft, power, zoning,
        service_charge, business_rates, floor_load_capacity, heating_cooling, toilet_kitchen,
        opening_hours, is_multiple_tenancy, break_clause, deposit_required,
        disability_access, signage_allowed, utilities, security
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
        $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59,
        $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81, $82, $83, $84, $85, $86
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

      // Handle layout file (support both layoutFile and floorPlan field names)
      const layoutFileArray = req.files.layoutFile || req.files.floorPlan;
      if (layoutFileArray && layoutFileArray.length > 0) {
        const layoutFile = layoutFileArray[0];
        
        // Create unique filename for layout file
        const layoutFilename = `${property.id}_layout_${layoutFile.originalname}`;
        const layoutFilepath = path.join(uploadsDir, layoutFilename);
        
        // Save layout file to disk
        try {
          fs.writeFileSync(layoutFilepath, layoutFile.buffer);
          console.log(`📄 Layout/Floor Plan file saved: ${layoutFilename}`);
          
          // Update property with layout file information
          const layoutUrl = `/uploads/${layoutFilename}`;
          await client.query(
            `UPDATE properties SET layout_file_name = $1, layout_file_url = $2 WHERE id = $3`,
            [layoutFile.originalname, layoutUrl, property.id]
          );
          
          console.log(`✅ Layout/Floor Plan file updated in database: ${layoutFile.originalname}`);
        } catch (fileError) {
          console.error(`❌ Error saving layout/floor plan file ${layoutFilename}:`, fileError);
        }
      }

      // Handle EPC document file
      if (req.files.epcDocument && req.files.epcDocument.length > 0) {
        const epcFile = req.files.epcDocument[0];
        
        // Create unique filename for EPC document
        const epcFilename = `${property.id}_epc_${epcFile.originalname}`;
        const epcFilepath = path.join(uploadsDir, epcFilename);
        
        // Save EPC document to disk
        try {
          fs.writeFileSync(epcFilepath, epcFile.buffer);
          console.log(`📄 EPC document saved: ${epcFilename}`);
          
          // Update property with EPC document information
          const epcUrl = `/uploads/${epcFilename}`;
          await client.query(
            `UPDATE properties SET epc_document_name = $1, epc_document_url = $2 WHERE id = $3`,
            [epcFile.originalname, epcUrl, property.id]
          );
          
          console.log(`✅ EPC document updated in database: ${epcFile.originalname}`);
        } catch (fileError) {
          console.error(`❌ Error saving EPC document ${epcFilename}:`, fileError);
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
          <p><strong>Type:</strong> ${typeof property_type_mapped === 'string' ? property_type_mapped.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Not specified'}</p>
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
          <p><strong>Type:</strong> ${typeof property_type_mapped === 'string' ? property_type_mapped.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Not specified'}</p>
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

    // 🎯 SECURITY FIX: Ensure users only see their own properties, admins see all
    let whereClause;
    let queryParams = [];
    let paramCount = 0;

    // Check if this is an admin request (from admin dashboard)
    const isAdminRequest = req.path.includes('/admin/');
    
    if ((user_role === 'admin' || user_role === 'super_admin') && isAdminRequest) {
      // Admin dashboard request - show ALL properties for management
      whereClause = 'WHERE 1=1';
    } else {
      // Regular user request - show ONLY their own properties
      paramCount++;
      whereClause = 'WHERE p.user_id = $1';
      queryParams.push(user_id);
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

    // Normalize property_type so UI never sees array-like values
    const normalizePropertyTypeValue = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return (val.find(Boolean) || '').toString();
      if (typeof val === 'string') {
        // Handle postgres array literal formatted as string: {"Semi Detached","Semi-Detached"}
        if (/^\{.*\}$/.test(val)) {
          const inner = val.slice(1, -1);
          const parts = inner.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          return (parts.find(Boolean) || '').toString();
        }
        return val;
      }
      if (typeof val === 'object') return (val.value || val.label || '').toString();
      return String(val);
    };

    const normalizedRows = result.rows.map(p => ({
      ...p,
      property_type: normalizePropertyTypeValue(p.property_type)
    }));

    // Debug logging - check what data is returned from database
    console.log('🔍 Backend getUserProperties Debug:');
    console.log('📊 Total properties returned:', normalizedRows.length);
    if (normalizedRows.length > 0) {
      const firstProperty = normalizedRows[0];
      console.log('🏠 First property debug:', {
        id: firstProperty.id,
        title: firstProperty.title,
        status: firstProperty.status,
        hasDescription: !!firstProperty.description,
        descriptionLength: firstProperty.description?.length || 0,
        descriptionValue: firstProperty.description ? firstProperty.description.substring(0, 100) + '...' : 'NULL/EMPTY',
        propertyTypeValue: firstProperty.property_type
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
      properties: normalizedRows,
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

    // Normalize property_type for all properties (fix {"retail","retail"} bug)
    const normalizePropertyTypeValue = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return (val.find(Boolean) || '').toString();
      if (typeof val === 'string') {
        // Handle postgres array literal formatted as string: {"Terraced","Terraced"}
        if (/^\{.*\}$/.test(val)) {
          const inner = val.slice(1, -1);
          const parts = inner.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          return (parts.find(Boolean) || '').toString();
        }
        return val.trim();
      }
      if (typeof val === 'object') return (val.value || val.label || '').toString();
      return String(val).trim();
    };

    // Normalize all properties before sending to admin dashboard
    const normalizedProperties = result.rows.map(property => ({
      ...property,
      property_type: normalizePropertyTypeValue(property.property_type)
    }));

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM properties p LEFT JOIN users u ON p.user_id = u.id ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams.slice(0, paramCount));
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      properties: normalizedProperties,
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
      yearBuilt, // Alternative field name from frontend
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
      floorNumber, // Alternative field name from frontend
      
      // MISSING FIELDS: Added for complete field mapping (updateProperty)
      reception_rooms,
      receptionRooms, // Alternative field name from frontend
      house_number,
      houseNumber, // Alternative field name from frontend
      street_name,
      streetName, // Alternative field name from frontend  
      fullAddress, // Alternative field name from frontend
      local_authority,
      localAuthority, // Alternative field name from frontend
      nearest_transport_links,
      nearestTransportLinks, // Alternative field name from frontend
      short_description,
      shortDescription, // Alternative field name from frontend
      virtual_tour_link,
      virtualTourLink, // Alternative field name from frontend
      has_residential_accommodation,
      hasResidentialAccommodation, // Alternative field name from frontend
      
      // UK-specific lease fields
      vat_on_rent,
      vatOnRent,
      repairing_obligation,
      repairingObligation,
      insurance_responsibility,
      insuranceResponsibility,
      rent_review_frequency,
      rentReviewFrequency,
      
      // Commercial lease-specific fields
      spaceSubtypes,
      space_subtypes,
      leaseType,
      lease_type,
      useClass,
      use_class,
      minDivisible,
      min_divisible,
      vacantSQFT,
      vacant_sqft,
      landAcres,
      land_acres,
      lotSizeUnit,
      lot_size_unit,
      taxesPerSQFT,
      taxes_per_sqft,
      power,
      zoning,
      serviceCharge,
      service_charge,
      businessRates,
      business_rates,
      floorLoadCapacity,
      floor_load_capacity,
      heatingCooling,
      heating_cooling,
      toiletKitchen,
      toilet_kitchen,
      openingHours,
      opening_hours,
      isMultipleTenancy,
      is_multiple_tenancy,
      breakClause,
      break_clause,
      depositRequired,
      deposit_required,
      parkingAvailable,
      parking_available,
      disabilityAccess,
      disability_access,
      signageAllowed,
      signage_allowed,
      utilities,
      security
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
    
    // NEW FIELDS: Layout of Property (preserve existing values if not provided)
    const layout_file_name_mapped = layout_file_name || layoutFileName || existingProperty.layout_file_name || '';
    const layout_file_url_mapped = layout_file_url || layoutFileUrl || existingProperty.layout_file_url || '';
    const apartment_size_mapped = apartment_size || apartmentSize || '';
    const floor_number_mapped = floor_number || floorNumber || '';

    // NEW: Additional information fields (map camelCase and snake_case)
    const tenure_mapped = req.body.tenure || existingProperty.tenure || null;
    const service_charges_mapped = req.body.service_charges || req.body.serviceCharges || existingProperty.service_charges || null;
    const ground_rent_mapped = req.body.ground_rent || req.body.groundRent || existingProperty.ground_rent || null;
    const price_type_mapped = req.body.price_type || req.body.priceType || existingProperty.price_type || null;
    const floor_area_unit_mapped = req.body.floor_area_unit || req.body.floorAreaUnit || existingProperty.floor_area_unit || null;
    const heating_type_mapped = req.body.heating_type || req.body.heatingType || existingProperty.heating_type || null;
    const broadband_availability_mapped = req.body.broadband_availability || req.body.broadbandAvailability || existingProperty.broadband_availability || null;
    const accessibility_features_mapped = req.body.accessibility_features || req.body.accessibilityFeatures || existingProperty.accessibility_features || null;
    const custom_features_mapped = req.body.custom_features || req.body.customFeatures || existingProperty.custom_features || '[]';
    
    // Property feature boolean fields
    const is_new_build_mapped = req.body.is_new_build !== undefined ? req.body.is_new_build : (req.body.isNewBuild !== undefined ? req.body.isNewBuild : existingProperty.is_new_build);
    const is_chain_free_mapped = req.body.is_chain_free !== undefined ? req.body.is_chain_free : (req.body.isChainFree !== undefined ? req.body.isChainFree : existingProperty.is_chain_free);
    const is_recently_renovated_mapped = req.body.is_recently_renovated !== undefined ? req.body.is_recently_renovated : (req.body.isRecentlyRenovated !== undefined ? req.body.isRecentlyRenovated : existingProperty.is_recently_renovated);
    const has_balcony_terrace_mapped = req.body.has_balcony_terrace !== undefined ? req.body.has_balcony_terrace : (req.body.hasBalconyTerrace !== undefined ? req.body.hasBalconyTerrace : existingProperty.has_balcony_terrace);
    const has_accessible_access_mapped = req.body.has_accessible_access !== undefined ? req.body.has_accessible_access : (req.body.hasAccessibleAccess !== undefined ? req.body.hasAccessibleAccess : existingProperty.has_accessible_access);
    const has_residential_accommodation_mapped = (req.body.has_residential_accommodation === 'true' || req.body.has_residential_accommodation === true || req.body.hasResidentialAccommodation === 'true' || req.body.hasResidentialAccommodation === true) ? true : (existingProperty.has_residential_accommodation || false);
    const year_built_mapped = year_built || yearBuilt || existingProperty.year_built;

    // NEW: EPC document name/url (preserve if not provided; upload may override below)
    const epc_document_name_mapped = req.body.epc_document_name || existingProperty.epc_document_name || '';
    const epc_document_url_mapped = req.body.epc_document_url || existingProperty.epc_document_url || '';
    
    // MISSING FIELDS: Field mappings for updateProperty (add missing ones)
    const reception_rooms_mapped = reception_rooms || receptionRooms || existingProperty.reception_rooms || null;
    const house_number_mapped = house_number || houseNumber || existingProperty.house_number || "";
    const street_name_mapped = street_name || streetName || fullAddress || existingProperty.street_name || "";
    const local_authority_mapped = local_authority || localAuthority || existingProperty.local_authority || "";
    const nearest_transport_links_mapped = nearest_transport_links || nearestTransportLinks || existingProperty.nearest_transport_links || "";
    const short_description_mapped = short_description || shortDescription || existingProperty.short_description || "";
    const virtual_tour_link_mapped = virtual_tour_link || virtualTourLink || existingProperty.virtual_tour_link || "";
    const is_furnished_mapped = req.body.is_furnished !== undefined ? (req.body.is_furnished === "true" || req.body.is_furnished === true) : (req.body.isFurnished === true || existingProperty.is_furnished);
    
    // Commercial lease field mappings for updateProperty
    const space_subtypes_mapped = space_subtypes || spaceSubtypes || existingProperty.space_subtypes || '';
    const lease_type_mapped_update = lease_type || leaseType || existingProperty.lease_type || '';
    const use_class_mapped = use_class || useClass || existingProperty.use_class || '';
    const min_divisible_mapped = min_divisible || minDivisible || existingProperty.min_divisible || null;
    const vacant_sqft_mapped = vacant_sqft || vacantSQFT || existingProperty.vacant_sqft || null;
    const land_acres_mapped = land_acres || landAcres || existingProperty.land_acres || null;
    const lot_size_unit_mapped = lot_size_unit || lotSizeUnit || existingProperty.lot_size_unit || '';
    const taxes_per_sqft_mapped = taxes_per_sqft || taxesPerSQFT || existingProperty.taxes_per_sqft || null;
    const power_mapped = power || existingProperty.power || '';
    const zoning_mapped = zoning || existingProperty.zoning || '';
    const service_charge_mapped_update = service_charge || serviceCharge || existingProperty.service_charge || null;
    const business_rates_mapped = business_rates || businessRates || existingProperty.business_rates || null;
    const floor_load_capacity_mapped = floor_load_capacity || floorLoadCapacity || existingProperty.floor_load_capacity || '';
    const heating_cooling_mapped = heating_cooling || heatingCooling || existingProperty.heating_cooling || '';
    const toilet_kitchen_mapped = toilet_kitchen || toiletKitchen || existingProperty.toilet_kitchen || '';
    const opening_hours_mapped = opening_hours || openingHours || existingProperty.opening_hours || '';
    const is_multiple_tenancy_mapped = is_multiple_tenancy !== undefined ? (is_multiple_tenancy === true || is_multiple_tenancy === 'true' || isMultipleTenancy === true || isMultipleTenancy === 'true') : (existingProperty.is_multiple_tenancy || false);
    const break_clause_mapped = break_clause !== undefined ? (break_clause === true || break_clause === 'true' || breakClause === true || breakClause === 'true') : (existingProperty.break_clause || false);
    const deposit_required_mapped = deposit_required !== undefined ? (deposit_required === true || deposit_required === 'true' || depositRequired === true || depositRequired === 'true') : (existingProperty.deposit_required || false);
    const disability_access_mapped = disability_access !== undefined ? (disability_access === true || disability_access === 'true' || disabilityAccess === true || disabilityAccess === 'true') : (existingProperty.disability_access || false);
    const signage_allowed_mapped = signage_allowed !== undefined ? (signage_allowed === true || signage_allowed === 'true' || signageAllowed === true || signageAllowed === 'true') : (existingProperty.signage_allowed || false);
    const utilities_mapped_update = utilities || existingProperty.utilities || '{}';
    const security_mapped_update = security || existingProperty.security || '{}';
    
    // UK-specific lease field mappings for updateProperty
    const vat_on_rent_mapped = vat_on_rent || vatOnRent || existingProperty.vat_on_rent || '';
    const repairing_obligation_mapped = repairing_obligation || repairingObligation || existingProperty.repairing_obligation || '';
    const insurance_responsibility_mapped = insurance_responsibility || insuranceResponsibility || existingProperty.insurance_responsibility || '';
    const rent_review_frequency_mapped = rent_review_frequency || rentReviewFrequency || existingProperty.rent_review_frequency || null;

    // NEW: Floor area mapping - compute square_feet from floorArea + unit if provided
    const rawFloorArea = req.body.square_feet || req.body.squareFeet || req.body.floor_area || req.body.floorArea;
    let square_feet_mapped = existingProperty.square_feet;
    if (rawFloorArea !== undefined && rawFloorArea !== null && rawFloorArea !== '') {
      const areaVal = parseFloat(rawFloorArea);
      const unit = (floor_area_unit_mapped || '').toLowerCase();
      if (!isNaN(areaVal)) {
        // Validate reasonable floor area bounds
        if (unit === 'sq_m' || unit === 'sqm' || unit === 'm2') {
          // For square meters: reasonable range 1-50,000 sq_m
          if (areaVal > 0 && areaVal <= 50000) {
            square_feet_mapped = Math.round(areaVal * 10.7639);
          } else {
            console.warn(`⚠️ Invalid floor area in sq_m: ${areaVal}, keeping existing: ${existingProperty.square_feet}`);
            square_feet_mapped = existingProperty.square_feet;
          }
        } else {
          // For square feet: reasonable range 1-500,000 sq_ft
          if (areaVal > 0 && areaVal <= 500000) {
            square_feet_mapped = Math.round(areaVal);
          } else {
            console.warn(`⚠️ Invalid floor area in sq_ft: ${areaVal}, keeping existing: ${existingProperty.square_feet}`);
            square_feet_mapped = existingProperty.square_feet;
          }
        }
      }
    }

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

    // Convert year_built to proper integer for updateProperty
    const convertYearBuilt = (yearValue) => {
      if (!yearValue) return existingProperty.year_built;
      
      // Convert to string first to handle various input types
      const yearStr = String(yearValue).trim();
      
      // If it's empty or null-like, return existing value
      if (!yearStr || yearStr === 'null' || yearStr === 'undefined') return existingProperty.year_built;
      
      // Parse as integer
      const yearInt = parseInt(yearStr);
      
      // Validate year range (reasonable bounds for building years)
      if (isNaN(yearInt) || yearInt < 1500 || yearInt > new Date().getFullYear() + 5) {
        console.warn(`⚠️ Invalid year_built value in update: ${yearValue} -> ${yearInt}, keeping existing: ${existingProperty.year_built}`);
        return existingProperty.year_built;
      }
      
      return yearInt;
    };

    const bedrooms_converted = convertBedrooms(bedrooms);
    const bathrooms_converted = convertBathrooms(bathrooms);
    const year_built_converted = convertYearBuilt(year_built_mapped);

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
    console.log('🗓️ YEAR BUILT DEBUG:');
    console.log('Raw year_built from req.body:', req.body.year_built);
    console.log('Raw yearBuilt from req.body:', req.body.yearBuilt);
    console.log('year_built_mapped:', year_built_mapped);
    console.log('year_built_converted:', year_built_converted, typeof year_built_converted);
    console.log('Existing year_built:', existingProperty.year_built);
    console.log('📐 FLOOR AREA DEBUG:');
    console.log('Raw square_feet from req.body:', req.body.square_feet);
    console.log('Raw squareFeet from req.body:', req.body.squareFeet);
    console.log('Raw floor_area from req.body:', req.body.floor_area);
    console.log('Raw floorArea from req.body:', req.body.floorArea);
    console.log('rawFloorArea:', rawFloorArea);
    console.log('floor_area_unit_mapped:', floor_area_unit_mapped);
    console.log('square_feet_mapped:', square_feet_mapped, typeof square_feet_mapped);
    console.log('Existing square_feet:', existingProperty.square_feet);

    // Create parameter array for debugging
    const params = [
      title, description || existingProperty.description, category_mapped, property_type_mapped, property_category || existingProperty.property_category,
      address_line1_mapped, address_line2 || existingProperty.address_line2, city || existingProperty.city, state_mapped, zip_code_mapped, country || existingProperty.country,
      bedrooms_converted, bathrooms_converted, square_feet_mapped, lot_size || existingProperty.lot_size, year_built_converted,
      price_mapped, weekly_rent_mapped, monthly_rent_mapped, lease_term_mapped, deposit_amount_mapped,
      parking_spaces || existingProperty.parking_spaces, has_garage || existingProperty.has_garage, has_pool || existingProperty.has_pool, 
      has_garden || existingProperty.has_garden, furnished_mapped, pets_allowed || existingProperty.pets_allowed,
      student_housing_mapped, availability_date_mapped, contact_name_mapped, contact_phone_mapped, contact_email_mapped,
      property_consultant || existingProperty.property_consultant,
      epc_rating_mapped, JSON.stringify(key_features_mapped),
      layout_file_name_mapped, layout_file_url_mapped, apartment_size_mapped, floor_number_mapped,
      epc_document_name_mapped, epc_document_url_mapped,
      heating_type_mapped, broadband_availability_mapped, accessibility_features_mapped, custom_features_mapped,
      latitude, longitude,
      council_tax_band_mapped, council_tax_status_mapped,
      reception_rooms_mapped, house_number_mapped, street_name_mapped, local_authority_mapped, nearest_transport_links_mapped, short_description_mapped, virtual_tour_link_mapped, has_residential_accommodation_mapped,
      vat_on_rent_mapped, repairing_obligation_mapped, insurance_responsibility_mapped, rent_review_frequency_mapped,
      space_subtypes_mapped, lease_type_mapped_update, use_class_mapped, min_divisible_mapped, vacant_sqft_mapped,
      land_acres_mapped, lot_size_unit_mapped, taxes_per_sqft_mapped, power_mapped, zoning_mapped,
      service_charge_mapped_update, business_rates_mapped, floor_load_capacity_mapped, heating_cooling_mapped, toilet_kitchen_mapped,
      opening_hours_mapped, is_multiple_tenancy_mapped, break_clause_mapped, deposit_required_mapped,
      disability_access_mapped, signage_allowed_mapped, utilities_mapped_update, security_mapped_update,
      // NEW: Additional fields for Sale properties
      tenure_mapped, service_charges_mapped, ground_rent_mapped, price_type_mapped, floor_area_unit_mapped,
      is_new_build_mapped, is_chain_free_mapped, is_recently_renovated_mapped, has_balcony_terrace_mapped, has_accessible_access_mapped,
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
        epc_document_name = $40, epc_document_url = $41,
        heating_type = $42, broadband_availability = $43, accessibility_features = $44, custom_features = $45,
        updated_at = CURRENT_TIMESTAMP, status = 'pending',
        latitude = $46, longitude = $47,
        council_tax_band = $48, council_tax_status = $49,
        reception_rooms = $50, house_number = $51, street_name = $52, local_authority = $53, nearest_transport_links = $54, short_description = $55, virtual_tour_link = $56, has_residential_accommodation = $57,
        vat_on_rent = $58, repairing_obligation = $59, insurance_responsibility = $60, rent_review_frequency = $61,
        space_subtypes = $62, lease_type = $63, use_class = $64, min_divisible = $65, vacant_sqft = $66,
        land_acres = $67, lot_size_unit = $68, taxes_per_sqft = $69, power = $70, zoning = $71,
        service_charge = $72, business_rates = $73, floor_load_capacity = $74, heating_cooling = $75, toilet_kitchen = $76,
        opening_hours = $77, is_multiple_tenancy = $78, break_clause = $79, deposit_required = $80,
        disability_access = $81, signage_allowed = $82, utilities = $83, security = $84,
        tenure = $85, service_charges = $86, ground_rent = $87, price_type = $88, floor_area_unit = $89,
        is_new_build = $90, is_chain_free = $91, is_recently_renovated = $92, has_balcony_terrace = $93, has_accessible_access = $94
       WHERE id = $95 AND user_id = $96
       RETURNING *`,
      params
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
      try {
        // Try to parse as JSON first (e.g., from JSON.stringify)
        deletedPhotos = JSON.parse(deletedPhotos);
      } catch (e) {
        // If not JSON, treat as single string URL
        deletedPhotos = [deletedPhotos];
      }
    } else if (!Array.isArray(deletedPhotos)) {
      deletedPhotos = []; // Default to empty array if not string or array
    }
    
    if (typeof keptPhotos === 'string') {
      try {
        // Try to parse as JSON first (e.g., from JSON.stringify)
        keptPhotos = JSON.parse(keptPhotos);
      } catch (e) {
        // If not JSON, treat as single string URL
        keptPhotos = [keptPhotos];
      }
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

      // Handle layout file (support both layoutFile and floorPlan)
      const updateLayoutFileArray = req.files.layoutFile || req.files.floorPlan;
      if (updateLayoutFileArray && updateLayoutFileArray.length > 0) {
        console.log('📄 Processing layout/floor plan file upload...');
        
        const layoutFile = updateLayoutFileArray[0];
        
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

      // Handle EPC document file
      if (req.files.epcDocument && req.files.epcDocument.length > 0) {
        const epcFile = req.files.epcDocument[0];
        
        // Create unique filename for EPC document
        const epcFilename = `${property.id}_epc_${epcFile.originalname}`;
        const epcFilepath = path.join(uploadsDir, epcFilename);
        
        // Save EPC document to disk
        try {
          fs.writeFileSync(epcFilepath, epcFile.buffer);
          console.log(`📄 EPC document saved: ${epcFilename}`);
          
          // Update property with EPC document information
          const epcUrl = `/uploads/${epcFilename}`;
          await client.query(
            `UPDATE properties SET epc_document_name = $1, epc_document_url = $2 WHERE id = $3`,
            [epcFile.originalname, epcUrl, property.id]
          );
          
          console.log(`✅ EPC document updated in database: ${epcFile.originalname}`);
        } catch (fileError) {
          console.error(`❌ Error saving EPC document ${epcFilename}:`, fileError);
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

// Sale-specific wrappers to keep AddList isolated from other forms
const submitSaleProperty = async (req, res) => {
  try {
    // Force category to 'sale' regardless of incoming payload
    req.body = { ...req.body, category: 'sale' };
    return submitProperty(req, res);
  } catch (e) {
    console.error('submitSaleProperty error:', e);
    return res.status(500).json({ success: false, message: 'Failed to submit sale property', error: e.message });
  }
};

const updateSaleProperty = async (req, res) => {
  try {
    // Force category to 'sale' regardless of incoming payload
    req.body = { ...req.body, category: 'sale' };
    return updateProperty(req, res);
  } catch (e) {
    console.error('updateSaleProperty error:', e);
    return res.status(500).json({ success: false, message: 'Failed to update sale property', error: e.message });
  }
};

module.exports = {
  submitProperty,
  updateProperty,
  getUserProperties,
  getAllProperties,
  updatePropertyStatus,
  getDashboardStats,
  deleteProperty,
  submitSaleProperty,
  updateSaleProperty
}; 