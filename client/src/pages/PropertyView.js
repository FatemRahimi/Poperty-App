import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import './PropertyView.css';

const PropertyView = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  // Helper function to check if a feature is available
  const hasFeature = (features, key) => {
    if (!features) return false;

    // Case 1: Array (e.g. ['bills_included', 'has_garden'])
    if (Array.isArray(features)) {
      return features.includes(key);
    }

    // Case 2: Object (e.g. { bills_included: true, has_garden: false })
    if (typeof features === 'object' && features !== null) {
      return features[key] === true || features[key] === 'true';
    }

    return false;
  };

  useEffect(() => {
    fetchProperty();
  }, [slug]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const propertyId = params.get('propertyId');
    if (propertyId) {
      const card = document.getElementById(`property-card-${propertyId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Optionally highlight the card
        card.classList.add('highlight');
        setTimeout(() => card.classList.remove('highlight'), 2000);
      }
    }
  }, []);

  // Add scroll detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setIsScrolled(scrollTop > 100); // Change state when scrolled more than 100px
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchProperty = async () => {
    try {
      const response = await fetch(`/api/properties/property/${slug}`);
      const data = await response.json();
      
      if (data.success) {
        setProperty(data.property);
        
        // Debug: Log property features received
        console.log('🔍 Frontend Property Features Debug:');
        console.log('📋 Property ID:', data.property.id);
        console.log('📋 has_garden:', data.property.has_garden);
        console.log('📋 parking_spaces:', data.property.parking_spaces);
        console.log('📋 pets_allowed:', data.property.pets_allowed);
        console.log('📋 student_housing:', data.property.student_housing);
        console.log('📋 furnished:', data.property.furnished);
        console.log('📋 has_garage:', data.property.has_garage);
        console.log('📋 has_pool:', data.property.has_pool);
        console.log('📋 key_features RAW:', data.property.key_features);
        console.log('📋 key_features TYPE:', Object.prototype.toString.call(data.property.key_features));
        console.log('📋 key_features JSON:', JSON.stringify(data.property.key_features, null, 2));
      } else {
        setError(data.message || 'Property not found');
      }
    } catch (err) {
      console.error('Error fetching property:', err);
      setError('Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (property) => {
    if (property.category === 'sale' && property.price) {
      return `£${Number(property.price).toLocaleString()}`;
    } else if (property.weekly_rent) {
      return `£${Number(property.weekly_rent).toLocaleString()}/pw`;
    } else if (property.monthly_rent) {
      return `£${Number(property.monthly_rent).toLocaleString()}/pcm`;
    }
    return 'Price not available';
  };

  const formatAddress = (property) => {
    const parts = [];
    if (property.house_number) parts.push(property.house_number);
    if (property.street_name) parts.push(property.street_name);
    if (property.city) parts.push(property.city);
    if (property.zip_code || property.postcode) parts.push(property.zip_code || property.postcode);
    return parts.length > 0 ? parts.join(', ') : 'Location not specified';
  };

  const nextMedia = () => {
    if (property.images && property.images.length > 0) {
      setCurrentMediaIndex((prev) => (prev + 1) % property.images.length);
    }
  };

  const prevMedia = () => {
    if (property.images && property.images.length > 0) {
      setCurrentMediaIndex((prev) => (prev - 1 + property.images.length) % property.images.length);
    }
  };

  if (loading) {
    return (
      <div className="property-view-container">
        <div className="loading-spinner">
          <i className="fas fa-spinner fa-spin"></i>
          <p>Loading property details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="property-view-container">
        <div className="error-message">
          <i className="fas fa-exclamation-triangle"></i>
          <h3>Property Not Found</h3>
          <p>{error}</p>
          <button onClick={() => navigate(-1)} className="back-btn">
            <i className="fas fa-arrow-left"></i> Back to Properties
          </button>
        </div>
      </div>
    );
  }

  if (!property) {
    return null;
  }

  const handleBack = () => {
    console.log('🔍 PropertyView handleBack Debug:', {
      locationState: location.state,
      returnPath: location.state?.returnPath,
      sessionStoragePath: sessionStorage.getItem('lastDashboardPath'),
      currentUrl: window.location.href,
      pathname: location.pathname,
      search: location.search
    });

    // Priority 1: Use returnPath from location state (most accurate)
    if (location.state?.returnPath) {
      console.log('✅ Using returnPath from location state:', location.state.returnPath);
      navigate(location.state.returnPath);
      return;
    }

    // Priority 2: Use sessionStorage backup
    const sessionStoragePath = sessionStorage.getItem('lastDashboardPath');
    if (sessionStoragePath) {
      console.log('✅ Using sessionStorage backup:', sessionStoragePath);
      navigate(sessionStoragePath);
      return;
    }

    // Priority 3: Always default to My Properties tab (most reliable)
    console.log('⚠️ No returnPath found, navigating to My Properties tab');
    navigate('/dashboard?tab=properties');
  };

  const handleFixedBackClick = () => {
    // If scrolled down, first scroll to top smoothly
    if (isScrolled) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      
      // Wait for scroll to complete, then navigate
      setTimeout(() => {
        handleBack();
      }, 500);
    } else {
      // If already at top, navigate immediately
      handleBack();
    }
  };

  return (
    <div className="property-view-container">
      {/* Fixed/Sticky Back Button that appears when scrolled */}
      <div className={`back-btn-fixed ${isScrolled ? 'back-btn-fixed--visible' : ''}`}>
        <button onClick={handleFixedBackClick} className="back-btn back-btn--fixed">
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>

      <div className={`property-view-header ${isScrolled ? 'property-view-header--scrolled' : ''}`}>
        <button onClick={handleBack} className={`back-btn ${isScrolled ? 'back-btn--hidden' : ''}`}>
          <i className="fas fa-arrow-left"></i> Back to Properties
        </button>
        <div className="property-status">
          <span className={`status-badge status-${property.status}`}>
            {property.status}
          </span>
        </div>
      </div>

      <div className="property-view-content">
        {/* Media Gallery (shorter height) */}
        <div className="property-media-gallery property-media-gallery--short">
          {property.images && property.images.length > 0 ? (
            <div className="media-viewer">
              {property.images.length >= 4 ? (
                // Modern layout with 3 main pictures + scrollable row below
                <>
                  <div className="modern-gallery-layout">
                    <div className="main-image-container">
                      {(() => {
                        const currentMedia = property.images[currentMediaIndex];
                        const isVideo = currentMedia?.type === 'video' || 
                          currentMedia?.image_type === 'video' || 
                          (currentMedia?.url && (
                            currentMedia.url.toLowerCase().endsWith('.mp4') ||
                            currentMedia.url.toLowerCase().endsWith('.mov') ||
                            currentMedia.url.toLowerCase().endsWith('.avi') ||
                            currentMedia.url.toLowerCase().endsWith('.webm') ||
                            currentMedia.url.toLowerCase().endsWith('.ogg')
                          ));

                        return isVideo ? (
                          <video
                            src={currentMedia.url}
                            controls
                            className="main-video"
                            onError={(e) => {
                              console.error('Video load error:', currentMedia.url, e);
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                        ) : (
                          <img
                            src={currentMedia.url}
                            alt={`${property.title} - Media ${currentMediaIndex + 1}`}
                            className="main-image"
                            onError={(e) => {
                              console.error('Image load error:', currentMedia.url, e);
                            }}
                          />
                        );
                      })()}
                      {property.images.length > 1 && (
                        <>
                          <button className="media-nav prev" onClick={prevMedia}>
                            <i className="fas fa-chevron-left"></i>
                          </button>
                          <button className="media-nav next" onClick={nextMedia}>
                            <i className="fas fa-chevron-right"></i>
                          </button>
                        </>
                      )}
                    </div>
                    <div className="side-images-container">
                      {/* Show next 2 images as side images */}
                      {[1, 2].map((offset) => {
                        const index = (currentMediaIndex + offset) % property.images.length;
                        const media = property.images[index];
                        const isVideo = media.type === 'video' || media.image_type === 'video' || 
                          (media.url && (
                            media.url.toLowerCase().endsWith('.mp4') ||
                            media.url.toLowerCase().endsWith('.mov') ||
                            media.url.toLowerCase().endsWith('.avi') ||
                            media.url.toLowerCase().endsWith('.webm') ||
                            media.url.toLowerCase().endsWith('.ogg')
                          ));

                        return (
                          <div
                            key={index}
                            className="side-image"
                            onClick={() => setCurrentMediaIndex(index)}
                          >
                            {isVideo ? (
                              <div className="video-thumbnail">
                                <video src={media.url} muted>
                                  <source src={media.url} />
                                </video>
                                <div className="property-video-overlay">
                                  <i className="fas fa-play"></i>
                                </div>
                              </div>
                            ) : (
                              <img src={media.url} alt={`Side image ${index + 1}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Scrollable row with all remaining images */}
                  <div className="all-images-row">
                    {property.images.map((media, index) => {
                      // Skip the 3 images already shown in main gallery
                      const isCurrentlyShown = index === currentMediaIndex || 
                        index === (currentMediaIndex + 1) % property.images.length ||
                        index === (currentMediaIndex + 2) % property.images.length;
                      
                      if (isCurrentlyShown) return null;

                      const isVideo = media.type === 'video' || media.image_type === 'video' || 
                        (media.url && (
                          media.url.toLowerCase().endsWith('.mp4') ||
                          media.url.toLowerCase().endsWith('.mov') ||
                          media.url.toLowerCase().endsWith('.avi') ||
                          media.url.toLowerCase().endsWith('.webm') ||
                          media.url.toLowerCase().endsWith('.ogg')
                        ));

                      return (
                        <div
                          key={index}
                          className="all-images-item"
                          onClick={() => setCurrentMediaIndex(index)}
                        >
                          {isVideo ? (
                            <div className="video-thumbnail">
                              <video src={media.url} muted>
                                <source src={media.url} />
                              </video>
                              <div className="property-video-overlay">
                                <i className="fas fa-play"></i>
                              </div>
                            </div>
                          ) : (
                            <img src={media.url} alt={`Image ${index + 1}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                // Original layout for less than 4 images
                <>
                  <div className="main-media">
                    {(() => {
                      const currentMedia = property.images[currentMediaIndex];
                      const isVideo = currentMedia?.type === 'video' || 
                        currentMedia?.image_type === 'video' || 
                        (currentMedia?.url && (
                          currentMedia.url.toLowerCase().endsWith('.mp4') ||
                          currentMedia.url.toLowerCase().endsWith('.mov') ||
                          currentMedia.url.toLowerCase().endsWith('.avi') ||
                          currentMedia.url.toLowerCase().endsWith('.webm') ||
                          currentMedia.url.toLowerCase().endsWith('.ogg')
                        ));

                      return isVideo ? (
                        <video
                          src={currentMedia.url}
                          controls
                          className="main-video"
                          onError={(e) => {
                            console.error('Video load error:', currentMedia.url, e);
                          }}
                        >
                          Your browser does not support the video tag.
                        </video>
                      ) : (
                        <img
                          src={currentMedia.url}
                          alt={`${property.title} - Media ${currentMediaIndex + 1}`}
                          className="main-image"
                          onError={(e) => {
                            console.error('Image load error:', currentMedia.url, e);
                          }}
                        />
                      );
                    })()}
                    {property.images.length > 1 && (
                      <>
                        <button className="media-nav prev" onClick={prevMedia}>
                          <i className="fas fa-chevron-left"></i>
                        </button>
                        <button className="media-nav next" onClick={nextMedia}>
                          <i className="fas fa-chevron-right"></i>
                        </button>
                      </>
                    )}
                  </div>
                  {property.images.length > 1 && (
                    <div className="media-thumbnails">
                      {property.images.map((media, index) => {
                        const isVideo = media.type === 'video' || media.image_type === 'video' || 
                          (media.url && (
                            media.url.toLowerCase().endsWith('.mp4') ||
                            media.url.toLowerCase().endsWith('.mov') ||
                            media.url.toLowerCase().endsWith('.avi') ||
                            media.url.toLowerCase().endsWith('.webm') ||
                            media.url.toLowerCase().endsWith('.ogg')
                          ));

                        return (
                          <div
                            key={index}
                            className={`thumbnail ${index === currentMediaIndex ? 'active' : ''}`}
                            onClick={() => setCurrentMediaIndex(index)}
                          >
                            {isVideo ? (
                              <div className="video-thumbnail">
                                <video src={media.url} muted>
                                  <source src={media.url} />
                                </video>
                                <div className="property-video-overlay">
                                  <i className="fas fa-play"></i>
                                </div>
                              </div>
                            ) : (
                              <img src={media.url} alt={`Thumbnail ${index + 1}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="no-media">
              <i className="fas fa-home"></i>
              <p>No media available</p>
            </div>
          )}
        </div>


        {/* New Property Info Section below gallery */}
        <div className="property-info-section">
          <div className="property-info-item">
            <i className="fas fa-home property-info-icon"></i>
            <span className="property-info-label">{property.title}</span>
          </div>
          <div className="property-info-item">
            <i className="fas fa-tag property-info-icon"></i>
            <span className="property-info-label">Property for {property.category ? property.category.charAt(0).toUpperCase() + property.category.slice(1) : ''}</span>
          </div>
          <div className="property-info-item">
            <i className="fas fa-map-marker-alt property-info-icon"></i>
            <span className="property-info-label">{formatAddress(property)}</span>
          </div>
          {/* More categorized info will be added here in the next step */}
        </div>

        {/* Property Details Sidebar (Contact Info, Description, etc.) */}
        <div className="view-property-details">
          {/* Heading with property for rent/sale/lease - property type - address - prices */}
          <div className="property-details-heading" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <div className="property-details-main-row">
              <span className="property-details-category" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                Property for {property.category ? property.category.charAt(0).toUpperCase() + property.category.slice(1) : ''}
              </span>
              <span className="property-details-dash" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}> - </span>
              <span className="property-details-type" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                {property.property_type || property.propertyType || 'Property'}
              </span>
            </div>
            <div className="property-details-location-prices" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
              <div className="property-details-address" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontWeight: 500, fontSize: '1.1rem', flex: 1 }}>
                <i className="fas fa-map-marker-alt" style={{ color: '#667eea', marginRight: 6 }}></i>
                {(() => {
                  // Modern address formatting (like PropertyCard)
                  const parts = [];
                  // Helper: Title case
                  const toTitleCase = (str) => str ? str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : '';
                  let street = '';
                  if (property.street_name) {
                    // Use street_name, up to 2 parts
                    const streetParts = property.street_name.split(',').map(part => toTitleCase(part.trim()));
                    street = streetParts.slice(0, 2).join(', ');
                  } else if (property.address_line1) {
                    // Remove house number and flat/unit from address_line1
                    let cleaned = property.address_line1
                      .replace(/^[0-9]+[a-zA-Z]?\s+/, '')
                      .replace(/^Flat\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')
                      .replace(/^Apartment\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')
                      .replace(/^Unit\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')
                      .trim();
                    const streetParts = cleaned.split(',').map(part => toTitleCase(part.trim()));
                    street = streetParts.slice(0, 2).join(', ');
                  }
                  if (street) parts.push(street);
                  if (property.city) parts.push(toTitleCase(property.city));
                  if (property.zip_code || property.postcode) {
                    const postcode = (property.zip_code || property.postcode).replace(/\s+/g, '').toUpperCase();
                    parts.push(postcode.substring(0, 3));
                  }
                  return parts.length > 0 ? parts.join(', ') : 'Location not specified';
                })()}
              </div>
              <div className="property-details-prices" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20 }}>
                {property.monthly_rent || property.monthlyRent ? (
                  <span className="property-details-price" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 4, fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    £{Number(property.monthly_rent || property.monthlyRent).toLocaleString()}/month
                  </span>
                ) : null}
                {property.weekly_rent || property.weeklyRent ? (
                  <span className="property-details-price" style={{ fontSize: '1rem', fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    £{Number(property.weekly_rent || property.weeklyRent).toLocaleString()}/week
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Bold separator line */}
          <div style={{ borderTop: '2px solid #333', margin: '20px 0', width: '100%' }}></div>

          {/* NEW: Property Type, Bedrooms, Bathrooms, and Furnished Status */}
          <div className="view-property-features" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            {property.property_type && (
              <div className="view-feature">
                <i className="fas fa-home"></i>
                <span>{property.property_type.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</span>
              </div>
            )}
            {property.bedrooms && (
              <div className="view-feature">
                <i className="fas fa-bed"></i>
                <span>{property.bedrooms} Bedroom{property.bedrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="view-feature">
                <i className="fas fa-bath"></i>
                <span>{Math.floor(property.bathrooms)} Bathroom{Math.floor(property.bathrooms) !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.furnished !== undefined && property.furnished !== null && (
              <div className="view-feature">
                <i className="fas fa-couch"></i>
                <span>{property.furnished ? 'Furnished' : 'Unfurnished'}</span>
              </div>
            )}
          </div>

          {/* Border line after features */}
          <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

          <div className="view-property-description" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h3>Description</h3>
            <p>{property.description || 'No description available.'}</p>
          </div>

          {/* Border line after description */}
          <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

          {/* NEW: Property Information Section */}
          <h3 className="property-view-info-title">Property Details</h3>
          <div className="property-view-info-section" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            
            <div className="property-view-info-grid">
              {/* Row 1 */}
              <div className="property-view-info-row">
                {property.availability_date && (
                  <div className="property-view-info-item">
                    <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                    </svg>
                    <div className="property-view-info-content">
                      <span className="property-view-info-label">Available From</span>
                      <span className="property-view-info-value">
                        {new Date(property.availability_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                )}
                
                {property.lease_term && (
                  <div className="property-view-info-item">
                    <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <div className="property-view-info-content">
                      <span className="property-view-info-label">Tenancy Length</span>
                      <span className="property-view-info-value">
                        {property.lease_term === 'flexible' ? 'Flexible' : `${property.lease_term} months minimum`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2 */}
              <div className="property-view-info-row">
                <div className="property-view-info-item">
                  <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <div className="property-view-info-content">
                    <span className="property-view-info-label">Council Tax Band</span>
                    <span className="property-view-info-value">
                      {property.council_tax_band || property.councilTaxBand ? `Band ${property.council_tax_band || property.councilTaxBand}` : 'Not specified'}
                    </span>
                  </div>
                </div>
                
                <div className="property-view-info-item">
                  <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  <div className="property-view-info-content">
                    <span className="property-view-info-label">Council Tax Status</span>
                    <span className="property-view-info-value">
                      {(() => {
                        const status = property.council_tax_status || property.councilTaxStatus;
                        if (!status) return 'Not specified';
                        return status === 'included' ? 'Included in rent' :
                               status === 'exempt' ? 'Exempt' :
                               status === 'tenant_pays' ? 'Tenant pays' :
                               status === 'landlord_pays' ? 'Landlord pays' :
                               status;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 3 */}
              <div className="property-view-info-row">
                <div className="property-view-info-item">
                  <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <div className="property-view-info-content">
                    <span className="property-view-info-label">EPC Rating</span>
                    <span className="property-view-info-value">
                      {property.epc_rating || property.epcRating || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* NEW: Layout Upload Section */}
          {(property.layout_file_url || property.layout_file_name) && (
            <div className="property-layout-section">
              <h3 className="property-layout-title">Property Layout</h3>
              
              <div className="property-layout-content">
                {property.layout_file_url ? (
                  <div className="layout-display-container">
                    {/* Approximate Area Display */}
                    {property.apartment_size && (
                      <div className="layout-area-info">
                        <span className="layout-area-label">Approximate Area</span>
                        <span className="layout-area-value">{property.apartment_size} sq m</span>
                      </div>
                    )}
                    
                    {/* Layout Image Display with Zoom */}
                    <div className="layout-image-container">
                      <img 
                        src={property.layout_file_url} 
                        alt="Property Layout" 
                        className="layout-image"
                        onError={(e) => {
                          console.error('Layout image load error:', property.layout_file_url, e);
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                        onClick={(e) => {
                          // Toggle zoom functionality
                          const img = e.target;
                          if (img.classList.contains('layout-image--zoomed')) {
                            img.classList.remove('layout-image--zoomed');
                          } else {
                            img.classList.add('layout-image--zoomed');
                          }
                        }}
                      />
                      {/* Fallback for non-image files */}
                      <div className="layout-file-fallback" style={{ display: 'none' }}>
                        <svg className="layout-file-icon" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                          <polyline points="14,2 14,8 20,8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                          <polyline points="10,9 9,9 8,9"/>
                        </svg>
                        <span>PDF Document</span>
                      </div>
                    </div>
                    
                    {/* Floor Number Display */}
                    {property.floor_number && (
                      <div className="layout-floor-info">
                        <span className="layout-floor-value">
                          {(() => {
                            const floorNum = parseInt(property.floor_number);
                            if (isNaN(floorNum)) {
                              return property.floor_number; // Return as-is if not a number
                            }
                            
                            // Convert number to ordinal word
                            const ordinalWords = [
                              'Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 
                              'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
                              'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
                              'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
                              'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth', 'Twenty-Fifth',
                              'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth', 'Thirtieth',
                              'Thirty-First', 'Thirty-Second', 'Thirty-Third', 'Thirty-Fourth', 'Thirty-Fifth',
                              'Thirty-Sixth', 'Thirty-Seventh', 'Thirty-Eighth', 'Thirty-Ninth', 'Fortieth',
                              'Forty-First', 'Forty-Second', 'Forty-Third', 'Forty-Fourth', 'Forty-Fifth',
                              'Forty-Sixth', 'Forty-Seventh', 'Forty-Eighth', 'Forty-Ninth', 'Fiftieth'
                            ];
                            
                            if (floorNum === 0) {
                              return 'Ground Floor';
                            } else if (floorNum >= 1 && floorNum <= 50) {
                              return ordinalWords[floorNum] + ' Floor';
                            } else {
                              // For numbers beyond 50, use the original number
                              return floorNum + 'th Floor';
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="layout-file-placeholder">
                    <svg className="layout-file-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                      <polyline points="14,2 14,8 20,8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10,9 9,9 8,9"/>
                    </svg>
                    <span>No layout file uploaded</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Border line after property information */}
          <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

          {/* NEW: Property Features Section */}
          <div className="property-view-features-section" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h3 className="property-view-features-title">Property Features</h3>
            
            {/* Basic Property Features */}
            <div className="property-view-features-category">
              <h4 className="features-category-title">Basic Features</h4>
              
              <div className="property-view-features-grid">
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="has_garden" 
                    checked={property.has_garden || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="has_garden">Garden</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="parking_spaces" 
                    checked={(property.parking_spaces && property.parking_spaces > 0) || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="parking_spaces">Parking</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="balcony_terrace" 
                    checked={hasFeature(property.key_features, 'balcony_terrace')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="balcony_terrace">Balcony/Terrace</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="pets_allowed" 
                    checked={property.pets_allowed || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="pets_allowed">Pets Allowed</label>
                </div>

                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="student_housing" 
                    checked={property.student_housing || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="student_housing">Suitable for Students</label>
                </div>

                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="furnished" 
                    checked={property.furnished || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="furnished">Furnished</label>
                </div>

                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="has_garage" 
                    checked={property.has_garage || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="has_garage">Garage</label>
                </div>

                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="has_pool" 
                    checked={property.has_pool || false}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="has_pool">Pool</label>
                </div>
              </div>
            </div>

            {/* Key Property Features */}
            <div className="property-view-features-category">
              <h4 className="features-category-title">Key Features</h4>
              <div className="property-view-features-grid">
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="kitchen_white_goods" 
                    checked={hasFeature(property.key_features, 'kitchen_white_goods')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="kitchen_white_goods">Kitchen with white goods</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="allocated_parking" 
                    checked={hasFeature(property.key_features, 'allocated_parking')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="allocated_parking">Allocated parking</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="communal_garden" 
                    checked={hasFeature(property.key_features, 'communal_garden')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="communal_garden">Communal garden</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="storage_space" 
                    checked={hasFeature(property.key_features, 'storage_space')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="storage_space">Storage space</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="lift_access" 
                    checked={hasFeature(property.key_features, 'lift_access')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="lift_access">Lift access</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="intercom_entry" 
                    checked={hasFeature(property.key_features, 'intercom_entry')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="intercom_entry">Intercom entry system</label>
                </div>
              </div>
            </div>

            {/* Utilities & Bills */}
            <div className="property-view-features-category">
              <h4 className="features-category-title">Utilities & Bills</h4>
              <div className="property-view-features-grid">
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="bills_included" 
                    checked={hasFeature(property.key_features, 'bills_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="bills_included">Bills included</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="council_tax_included" 
                    checked={hasFeature(property.key_features, 'council_tax_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="council_tax_included">Council tax included</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="water_included" 
                    checked={hasFeature(property.key_features, 'water_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="water_included">Water included</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="electricity_included" 
                    checked={hasFeature(property.key_features, 'electricity_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="electricity_included">Electricity included</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="gas_included" 
                    checked={hasFeature(property.key_features, 'gas_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="gas_included">Gas included</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="internet_included" 
                    checked={hasFeature(property.key_features, 'internet_included')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="internet_included">Internet included</label>
                </div>
              </div>
            </div>

            {/* Financial Options */}
            <div className="property-view-features-category">
              <h4 className="features-category-title">Financial Options</h4>
              <div className="property-view-features-grid">
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="zero_deposit" 
                    checked={hasFeature(property.key_features, 'zero_deposit')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="zero_deposit">Zero deposit option</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="guarantor_accepted" 
                    checked={hasFeature(property.key_features, 'guarantor_accepted')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="guarantor_accepted">Guarantor accepted</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="dss_lha_accepted" 
                    checked={hasFeature(property.key_features, 'dss_lha_accepted')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="dss_lha_accepted">DSS/LHA accepted</label>
                </div>
                
                <div className="property-view-feature-item">
                  <input 
                    type="checkbox" 
                    id="short_term_lets" 
                    checked={hasFeature(property.key_features, 'short_term_lets')}
                    disabled
                    className="feature-checkbox"
                  />
                  <label htmlFor="short_term_lets">Short-term lets available</label>
                </div>
              </div>
            </div>
          </div>

          {/* Border line after property features */}
          <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

          <div className="view-property-contact" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h3>Contact Information</h3>
            <div className="view-contact-details">
              {property.contact_phone && (
                <div className="view-contact-item">
                  <i className="fas fa-phone"></i>
                  <span>{property.contact_phone}</span>
                </div>
              )}
              {property.contact_email && (
                <div className="view-contact-item">
                  <i className="fas fa-envelope"></i>
                  <span>{property.contact_email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyView; 