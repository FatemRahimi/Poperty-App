import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import PropertyAdvisorCard from '../components/PropertyAdvisorCard';
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

  // Initialize map when property loads
  useEffect(() => {
    if (property && (property.zip_code || property.postcode)) {
      initializeMap();
    }
  }, [property]);

  const initializeMap = () => {
    const postcode = property.zip_code || property.postcode;
    if (!postcode) return;

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      // Geocode postcode to get coordinates
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(postcode)}&countrycodes=gb`)
        .then(response => response.json())
        .then(data => {
          if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);

            const map = window.L.map('map').setView([lat, lon], 15);
            
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            // Add marker
            const marker = window.L.marker([lat, lon]).addTo(map);
            marker.bindPopup(`<b>${postcode}</b>`).openPopup();
          }
        })
        .catch(error => {
          console.error('Error geocoding postcode:', error);
          // Fallback to London coordinates
          const map = window.L.map('map').setView([51.505, -0.09], 10);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);
        });
    };
    document.head.appendChild(script);
  };

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

  // Helper function to capitalize first character of each word
  const toTitleCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // Helper function to capitalize only first word
  const toSentenceCase = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  // Helper function to limit words to 50
  const limitWords = (str, maxWords = 50) => {
    if (!str) return '';
    const words = str.split(' ');
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '...';
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
        // Extract property_type properly from database
        const propertyData = data.property;
        
        // Ensure property_type is a string (not array or object)
        if (propertyData.property_type) {
          if (Array.isArray(propertyData.property_type)) {
            propertyData.property_type = propertyData.property_type[0]; // Take first element if array
          } else if (typeof propertyData.property_type === 'object') {
            propertyData.property_type = Object.values(propertyData.property_type)[0]; // Take first value if object
          }
          propertyData.property_type = String(propertyData.property_type); // Ensure it's a string
        }
        
        setProperty(propertyData);
        
        // Debug: Log property features received
        console.log('🔍 Frontend Property Features Debug:');
        console.log('📋 Property ID:', propertyData.id);
        console.log('📋 property_type RAW:', data.property.property_type, 'TYPE:', typeof data.property.property_type);
        console.log('📋 property_type CLEANED:', propertyData.property_type);
        console.log('📋 has_residential_accommodation:', propertyData.has_residential_accommodation);
        console.log('📋 has_garden:', propertyData.has_garden);
        console.log('📋 parking_spaces:', propertyData.parking_spaces);
        console.log('📋 pets_allowed:', propertyData.pets_allowed);
        console.log('📋 student_housing:', propertyData.student_housing);
        console.log('📋 furnished:', propertyData.furnished);
        console.log('📋 has_garage:', propertyData.has_garage);
        console.log('📋 has_pool:', propertyData.has_pool);
        console.log('📋 key_features RAW:', propertyData.key_features);
        console.log('📋 key_features TYPE:', Object.prototype.toString.call(propertyData.key_features));
        console.log('📋 key_features JSON:', JSON.stringify(propertyData.key_features, null, 2));
        console.log('🔍 Property Consultant Debug:');
        console.log('📋 property_consultant:', propertyData.property_consultant);
        console.log('📋 contact_name:', propertyData.contact_name);
        console.log('📋 contact_email:', propertyData.contact_email);
        console.log('📋 contact_phone:', propertyData.contact_phone);
        console.log('🔍 PropertyAdvisorCard Props Debug:');
        console.log('📋 propertyConsultantData being passed:', propertyData.property_consultant ? {
          fullName: propertyData.property_consultant,
          jobTitle: 'Property Consultant',
          contactEmail: propertyData.contact_email,
          contactPhone: propertyData.contact_phone
        } : null);
        console.log('🔍 PropertyAdvisorCard fallbackContact Debug:');
        console.log('📋 fallbackContact being passed:', {
          name: propertyData.contact_name,
          firstName: propertyData.first_name,
          lastName: propertyData.last_name,
          email: propertyData.contact_email,
          phone: propertyData.contact_phone
        });
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
        {/* Top Row: Media Gallery + Property Details */}
        <div className="property-view-top-row">
          {/* Media Gallery */}
          <div className="property-media-gallery property-media-gallery--short">
            {property.images && property.images.length > 0 ? (
              <div className="media-viewer">
                {property.images.length >= 2 ? (
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
                  // Original layout for less than 2 images
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

          {/* Property Details Section */}
          <div className="view-property-details">
            {/* Heading with property for rent/sale/lease - property type - address - prices */}
            <div className="property-details-heading" style={{ fontFamily: "Effra, sans-serif" }}>
              <div className="property-details-main-row">
                <span className="property-details-category" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra, sans-serif" }}>
                  Property for {property.category ? property.category.charAt(0).toUpperCase() + property.category.slice(1) : ''}
                </span>
                <span className="property-details-dash" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra, sans-serif" }}> - </span>
                <span className="property-details-type" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra, sans-serif" }}>
                  {(() => {
                    // Extract property type safely
                    let propType = property.property_type || property.propertyType || 'Property';
                    
                    // Handle if it's an array or object (shouldn't happen but defensive)
                    if (Array.isArray(propType)) {
                      propType = propType[0] || 'Property';
                    } else if (typeof propType === 'object' && propType !== null) {
                      propType = Object.values(propType)[0] || 'Property';
                    }
                    
                    // Convert to string and format
                    return String(propType).replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                  })()}
                </span>
              </div>
              <div className="property-details-location-prices" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
                <div className="property-details-address" style={{ fontFamily: "Effra, sans-serif", fontWeight: 500, fontSize: '1.1rem', flex: 1 }}>
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
                  {/* Sale Property - Asking Price */}
                  {property.category === 'sale' && property.price ? (
                    <>
                      <span className="property-details-price" style={{ fontWeight: 'bold', fontSize: '1.3rem', marginBottom: 4, fontFamily: "Effra, sans-serif", color: '#059669' }}>
                        £{Number(property.price).toLocaleString()}
                      </span>
                      {property.price_type && (
                        <span className="property-details-price-type" style={{ fontSize: '0.9rem', marginBottom: 4, fontFamily: "Effra, sans-serif", color: '#5b7ba8', fontWeight: '500' }}>
                          {property.price_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                        </span>
                      )}
                    </>
                  ) : null}
                  
                  {/* Rent Property - Monthly & Weekly Rent */}
                  {property.category === 'rent' && (property.monthly_rent || property.monthlyRent) ? (
                    <span className="property-details-price" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 4, fontFamily: "Effra, sans-serif" }}>
                      £{Number(property.monthly_rent || property.monthlyRent).toLocaleString()}/month
                    </span>
                  ) : null}
                  {property.category === 'rent' && (property.weekly_rent || property.weeklyRent) ? (
                    <span className="property-details-price" style={{ fontSize: '1rem', marginBottom: 4, fontFamily: "Effra, sans-serif" }}>
                      £{Number(property.weekly_rent || property.weeklyRent).toLocaleString()}/week
                    </span>
                  ) : null}
                  {property.category === 'rent' && (property.deposit_amount || property.depositAmount) ? (
                    <span className="property-details-price" style={{ fontSize: '0.9rem', color: '#059669', fontFamily: "Effra, sans-serif" }}>
                      £{Number(property.deposit_amount || property.depositAmount).toLocaleString()} deposit
                    </span>
                  ) : null}
                  
                  {/* Lease Property - Monthly Rent */}
                  {property.category === 'lease' && (property.monthly_rent || property.monthlyRent) ? (
                    <span className="property-details-price" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 4, fontFamily: "Effra, sans-serif" }}>
                      £{Number(property.monthly_rent || property.monthlyRent).toLocaleString()}/month
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Bold separator line */}
            <div style={{ borderTop: '2px solid #333', margin: '20px 0', width: '100%' }}></div>

            {/* NEW: Property Type, Bedrooms, Bathrooms, and Furnished Status */}
            {(() => {
              // Check if this is a commercial property (warehouse, retail, office, commercial)
              const isCommercial = ['warehouse', 'commercial', 'office', 'retail'].includes(property.property_type);
              const hasResidential = property.has_residential_accommodation || property.hasResidentialAccommodation;
              
              // For commercial properties WITHOUT residential accommodation, hide this entire section
              if (isCommercial && !hasResidential) {
                return null; // Don't show view-property-features section at all
              }
              
              // For all other cases (residential properties, commercial WITH residential, rent, lease), show the section
              return (
                <>
                  <div className="view-property-features" style={{ fontFamily: "Effra, sans-serif" }}>
                    {property.property_type && (
                      <div className="view-feature">
                        <i className="fas fa-home"></i>
                        <span>{property.property_type.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</span>
                      </div>
                    )}
                    {property.bedrooms && Number(property.bedrooms) > 0 && (
                      <div className="view-feature">
                        <i className="fas fa-bed"></i>
                        <span>{property.bedrooms} Bedroom{property.bedrooms !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {property.bathrooms && Number(property.bathrooms) > 0 && (
                      <div className="view-feature">
                        <i className="fas fa-bath"></i>
                        <span>{Math.floor(property.bathrooms)} Bathroom{Math.floor(property.bathrooms) !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {!property.property_type === 'land' && property.reception_rooms && Number(property.reception_rooms) > 0 && (
                      <div className="view-feature">
                        <i className="fas fa-door-open"></i>
                        <span>{property.reception_rooms} Reception Room{property.reception_rooms !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {property.category === 'rent' && property.furnished !== undefined && property.furnished !== null && (
                      <div className="view-feature">
                        <i className="fas fa-couch"></i>
                        <span>{property.furnished ? 'Furnished' : 'Unfurnished'}</span>
                      </div>
                    )}
                  </div>

                  {/* Border line after features */}
                  <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>
                </>
              );
            })()}

            <div className="view-property-description" style={{ fontFamily: "Effra, sans-serif" }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937', textTransform: 'none', fontFamily: "Effra-Medium, Tahoma, sans-serif" }}>Description</h3>
              <p>{property.description || 'No description available.'}</p>
            </div>

            {/* Custom Features Section - From AddList Form "Add Your Extra Features" */}
            {(() => {
              // Parse custom_features from database
              let customFeatures = [];
              
              if (property.custom_features) {
                if (Array.isArray(property.custom_features)) {
                  customFeatures = property.custom_features;
                } else if (typeof property.custom_features === 'string') {
                  try {
                    customFeatures = JSON.parse(property.custom_features);
                  } catch (e) {
                    console.error('Error parsing custom_features:', e);
                  }
                }
              }
              
              // Only show section if there are custom features
              if (customFeatures && customFeatures.length > 0) {
                // Limit to first 20 features (10 rows × 2 columns)
                const displayFeatures = customFeatures.slice(0, 20);
                
                return (
                  <>
                    {/* Border line before custom features */}
                    <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>
                    
                    <div className="view-property-custom-features" style={{ 
                      fontFamily: "Effra, sans-serif",
                      marginBottom: '1.5rem'
                    }}>
                      <h3 style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        marginBottom: '1rem',
                        color: '#1f2937',
                        textTransform: 'none',
                        fontFamily: "Effra-Medium, Tahoma, sans-serif"
                      }}>
                        Additional Features
                      </h3>
                      <ul className="custom-features-list" style={{ 
                        listStyleType: 'disc',
                        paddingLeft: '1.5rem',
                        margin: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.5rem 2rem',
                        columnGap: '2rem',
                        rowGap: '0.5rem'
                      }}>
                        {displayFeatures.map((feature, index) => (
                          <li key={index} style={{ 
                            fontSize: '1rem',
                            color: '#374151',
                            lineHeight: '1.8',
                            marginBottom: '0.25rem'
                          }}>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                );
              }
              
              return null; // Don't show section if no custom features
            })()}

            {/* Border line after Additional Features */}
            <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

            {/* Property Layout Section */}
            {(property.layout_file_url || property.layout_file_name || property.layoutFileUrl || property.layoutFileName) && (
              <div className="property-layout-section">
                <h3 className="property-layout-title">Property Layout</h3>
                
                <div className="property-layout-content">
                  {(property.layout_file_url || property.layoutFileUrl) ? (
                    <div className="layout-display-container">
                      {/* Area Display - ABOVE PICTURE */}
                      {property.apartment_size && (
                        <div className="layout-area-info" style={{
                          marginBottom: '0.5rem',
                          padding: '0.5rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <span className="layout-area-value" style={{
                            display: 'block',
                            fontSize: '1.25rem',
                            color: '#1f2937',
                            fontWeight: '700'
                          }}>{property.apartment_size} sq m</span>
                        </div>
                      )}
                      
                      {/* Layout Image Display with Zoom */}
                      <div className="layout-image-container">
                        <img 
                          src={property.layout_file_url || property.layoutFileUrl} 
                          alt="Property Layout" 
                          className="layout-image"
                          onError={(e) => {
                            console.error('Layout image load error:', property.layout_file_url || property.layoutFileUrl, e);
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
                      
                      {/* Floor Display - BELOW PICTURE */}
                      {property.floor_number && (
                        <div className="layout-floor-info" style={{
                          marginTop: '0.5rem',
                          padding: '0.3rem',
                          backgroundColor: '#f8fafc',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <span className="layout-floor-value" style={{
                            display: 'block',
                            fontSize: '1.25rem',
                            color: '#1f2937',
                            fontWeight: '700'
                          }}>
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

            {/* =================================================================
                SALE CATEGORY ONLY: PROPERTY FEATURES SECTION
            ================================================================= */}
            {property.category === 'sale' && (
              <>
                {/* Border line before Property Features */}
                <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>
                
                <div className="sale-property-features-section" style={{ 
                  fontFamily: "Effra, sans-serif",
                  marginBottom: '2rem'
                }}>
                  <h3 style={{ 
                    fontSize: '1.3rem', 
                    fontWeight: '600', 
                    color: '#1f2937',
                    marginBottom: '1rem',
                    textTransform: 'none',
                    borderBottom: '2px solid #000000',
                    paddingBottom: '0.5rem',
                    fontFamily: "Effra-Medium, Tahoma, sans-serif"
                  }}>Property Features</h3>

                  {/* Key Features Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Key Features</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Tenure */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Tenure:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.tenure ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.tenure ? property.tenure.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'Contact Us'}
                        </span>
                      </div>

                      {/* EPC Rating */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>EPC Rating:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.epc_rating || property.epcRating) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.epc_rating || property.epcRating || 'Contact Us'}
                        </span>
                      </div>

                      {/* Local Authority */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Local Authority:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.local_authority || property.localAuthority) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.local_authority || property.localAuthority || 'Contact Us'}
                        </span>
                      </div>

                      {/* Nearest Transport Link */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Nearest Transport Link:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.nearest_transport_links || property.nearestTransportLinks) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.nearest_transport_links || property.nearestTransportLinks || 'Contact Us'}
                        </span>
                      </div>

                      {/* Service Charges */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Service Charges:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.service_charges || property.serviceCharges) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.service_charges || property.serviceCharges) 
                            ? `£${Number(property.service_charges || property.serviceCharges).toLocaleString()}/month` 
                            : 'Contact Us'}
                        </span>
                      </div>

                      {/* Ground Rent */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Ground Rent:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.ground_rent || property.groundRent) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.ground_rent || property.groundRent) 
                            ? `£${Number(property.ground_rent || property.groundRent).toLocaleString()}/year` 
                            : 'Contact Us'}
                        </span>
                      </div>

                      {/* Council Tax Band */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Council Tax Band:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.council_tax_band || property.councilTaxBand) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.council_tax_band || property.councilTaxBand) 
                            ? `Band ${property.council_tax_band || property.councilTaxBand}` 
                            : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Basic Features Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Basic Features</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Garden */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Garden:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.has_garden || property.hasGarden ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_garden || property.hasGarden ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Parking */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Parking:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.has_parking || property.hasParking ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_parking || property.hasParking ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Balcony */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Balcony:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.has_balcony_terrace || property.hasBalconyTerrace ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_balcony_terrace || property.hasBalconyTerrace ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* New Build */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>New Build:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.is_new_build || property.isNewBuild ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.is_new_build || property.isNewBuild ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Chain Free */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Chain Free:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.is_chain_free || property.isChainFree ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.is_chain_free || property.isChainFree ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Recently Renovated */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Recently Renovated:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.is_recently_renovated || property.isRecentlyRenovated) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.is_recently_renovated || property.isRecentlyRenovated) ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* More Vision Subsection */}
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>More Vision</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Recently Renovated */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Recently Renovated:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.is_recently_renovated || property.isRecentlyRenovated) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.is_recently_renovated || property.isRecentlyRenovated) ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Accessible/Step-Free Access */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Accessible/Step-Free:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.has_accessible_access || property.hasAccessibleAccess) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.has_accessible_access || property.hasAccessibleAccess) ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Year Built */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Year Built:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.year_built || property.yearBuilt) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.year_built || property.yearBuilt || 'Contact Us'}
                        </span>
                      </div>

                      {/* Heating Type */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Heating Type:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.heating_type || property.heatingType) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.heating_type || property.heatingType) 
                            ? (property.heating_type || property.heatingType).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) 
                            : 'Contact Us'}
                        </span>
                      </div>

                      {/* Broadband Availability */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Broadband:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.broadband_availability || property.broadbandAvailability) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.broadband_availability || property.broadbandAvailability) 
                            ? (property.broadband_availability || property.broadbandAvailability).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) 
                            : 'Contact Us'}
                        </span>
                      </div>

                      {/* Accessibility Features */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Accessibility Features:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.accessibility_features || property.accessibilityFeatures) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.accessibility_features || property.accessibilityFeatures || 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Border line before Property Details */}
            <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

            {/* =================================================================
                PROPERTY DETAILS SECTION - CATEGORY SPECIFIC RENDERING
                - isSaleProperty: property.category === 'sale'
                - isRentProperty: property.category === 'rent' 
                - isLeaseProperty: property.category === 'lease'
                Use these filters for category-specific layouts
            ================================================================= */}
            
            {(() => {
              const isSaleProperty = property.category === 'sale';
              const isRentProperty = property.category === 'rent';
              const isLeaseProperty = property.category === 'lease';
              
              /* 
                EXAMPLE USAGE FOR CATEGORY-SPECIFIC RENDERING:
                
                {isSaleProperty && (
                  <div>This only shows for SALE properties</div>
                )}
                
                {(isRentProperty || isLeaseProperty) && (
                  <div>This shows for RENT or LEASE properties</div>
                )}
                
                {!isSaleProperty && (
                  <div>This shows for everything EXCEPT SALE</div>
                )}
              */
              
              return (
                <>
                  {/* Property Information Section */}
            <h3 className="property-view-info-title">Property Details</h3>
            <div className="property-view-info-section" style={{ fontFamily: "Effra, sans-serif" }}>
              
              <div className="property-view-info-grid">
                {/* Row 1: Basic Property Info */}
                <div className="property-view-info-row">
                  {(property.floor_area || property.square_feet) && (
                    <div className="property-view-info-item">
                      <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                      </svg>
                      <div className="property-view-info-content">
                        <span className="property-view-info-label">{property.property_type === 'land' ? 'Land Size' : 'Floor Area'}</span>
                        <span className="property-view-info-value">
                          {property.floor_area || property.square_feet} {property.floor_area_unit === 'sq_ft' || property.square_feet ? 'sq ft' : 'sq m'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {property.tenure && (
                    <div className="property-view-info-item">
                      <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <div className="property-view-info-content">
                        <span className="property-view-info-label">Tenure</span>
                        <span className="property-view-info-value">
                          {property.tenure.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Row 2: Financial Info (Sale/Rent specific) */}
                {property.category === 'sale' && (
                  <>
                    {property.price_type && (
                      <div className="property-view-info-row">
                        <div className="property-view-info-item">
                          <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                          </svg>
                          <div className="property-view-info-content">
                            <span className="property-view-info-label">Price Type</span>
                            <span className="property-view-info-value">
                              {property.price_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                            </span>
                          </div>
                        </div>
                        
                        {(property.service_charges || property.serviceCharges) && (
                          <div className="property-view-info-item">
                            <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                            </svg>
                            <div className="property-view-info-content">
                              <span className="property-view-info-label">Service Charges</span>
                              <span className="property-view-info-value">
                                £{Number(property.service_charges || property.serviceCharges).toLocaleString()}/month
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(property.ground_rent || property.groundRent) && (
                      <div className="property-view-info-row">
                        <div className="property-view-info-item">
                          <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                          </svg>
                          <div className="property-view-info-content">
                            <span className="property-view-info-label">Ground Rent</span>
                            <span className="property-view-info-value">
                              £{Number(property.ground_rent || property.groundRent).toLocaleString()}/year
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {/* Row 3: Rent-specific fields */}
                {property.category === 'rent' && (
                  <>
                    {property.availability_date && (
                      <div className="property-view-info-row">
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
                    )}
                  </>
                )}

                {/* Row 4: Council Tax & EPC */}
                <div className="property-view-info-row">
                  {(property.council_tax_band || property.councilTaxBand) && (
                    <div className="property-view-info-item">
                      <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <div className="property-view-info-content">
                        <span className="property-view-info-label">Council Tax Band</span>
                        <span className="property-view-info-value">
                          Band {property.council_tax_band || property.councilTaxBand}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {property.category === 'rent' && property.council_tax_status && (
                    <div className="property-view-info-item">
                      <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      <div className="property-view-info-content">
                        <span className="property-view-info-label">Council Tax Status</span>
                        <span className="property-view-info-value">
                          {(() => {
                            const status = property.council_tax_status || property.councilTaxStatus;
                            return status === 'included' ? 'Included in rent' :
                                   status === 'exempt' ? 'Exempt' :
                                   status === 'tenant_pays' ? 'Tenant pays' :
                                   status === 'landlord_pays' ? 'Landlord pays' :
                                   status;
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {(property.epc_rating || property.epcRating) && (
                    <div className="property-view-info-item">
                      <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <div className="property-view-info-content">
                        <span className="property-view-info-label">EPC Rating</span>
                        <span className="property-view-info-value">
                          {property.epc_rating || property.epcRating}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Row 5: Additional Details */}
                {(property.year_built || property.heating_type || property.broadband_availability) && (
                  <div className="property-view-info-row">
                    {property.year_built && (
                      <div className="property-view-info-item">
                        <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                        </svg>
                        <div className="property-view-info-content">
                          <span className="property-view-info-label">Year Built</span>
                          <span className="property-view-info-value">{property.year_built}</span>
                        </div>
                      </div>
                    )}
                    
                    {property.heating_type && (
                      <div className="property-view-info-item">
                        <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <div className="property-view-info-content">
                          <span className="property-view-info-label">Heating</span>
                          <span className="property-view-info-value">
                            {property.heating_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {property.broadband_availability && (
                      <div className="property-view-info-item">
                        <svg className="property-view-info-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <div className="property-view-info-content">
                          <span className="property-view-info-label">Broadband</span>
                          <span className="property-view-info-value">
                            {property.broadband_availability.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
                </>
              );
                            })()}

            {/* Border line after property information */}
            <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

            {/* NEW: Property Features Section - RENT CATEGORY ONLY */}
            {property.category === 'rent' && (
            <div className="property-view-features-section" style={{ fontFamily: "Effra, sans-serif" }}>
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
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="has_garden">Garden</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="parking_spaces" 
                      checked={(property.parking_spaces && property.parking_spaces > 0) || false}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="parking_spaces">Parking</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="balcony_terrace" 
                      checked={hasFeature(property.key_features, 'balcony_terrace')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="balcony_terrace">Balcony/Terrace</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="pets_allowed" 
                      checked={property.pets_allowed || false}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="pets_allowed">Pets Allowed</label>
                  </div>

                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="student_housing" 
                      checked={property.student_housing || false}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="student_housing">Suitable for Students</label>
                  </div>

                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="furnished" 
                      checked={property.furnished || false}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="furnished">Furnished</label>
                  </div>

                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="has_garage" 
                      checked={property.has_garage || false}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="has_garage">Garage</label>
                  </div>

                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="has_pool" 
                      checked={property.has_pool || false}
                      disabled
                      className="property-view-feature-checkbox"
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
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="kitchen_white_goods">Kitchen with white goods</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="allocated_parking" 
                      checked={hasFeature(property.key_features, 'allocated_parking')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="allocated_parking">Allocated parking</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="communal_garden" 
                      checked={hasFeature(property.key_features, 'communal_garden')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="communal_garden">Communal garden</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="storage_space" 
                      checked={hasFeature(property.key_features, 'storage_space')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="storage_space">Storage space</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="lift_access" 
                      checked={hasFeature(property.key_features, 'lift_access')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="lift_access">Lift access</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="intercom_entry" 
                      checked={hasFeature(property.key_features, 'intercom_entry')}
                      disabled
                      className="property-view-feature-checkbox"
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
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="bills_included">Bills included</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="council_tax_included" 
                      checked={hasFeature(property.key_features, 'council_tax_included')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="council_tax_included">Council tax included</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="water_included" 
                      checked={hasFeature(property.key_features, 'water_included')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="water_included">Water included</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="electricity_included" 
                      checked={hasFeature(property.key_features, 'electricity_included')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="electricity_included">Electricity included</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="gas_included" 
                      checked={hasFeature(property.key_features, 'gas_included')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="gas_included">Gas included</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="internet_included" 
                      checked={hasFeature(property.key_features, 'internet_included')}
                      disabled
                      className="property-view-feature-checkbox"
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
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="zero_deposit">Zero deposit option</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="guarantor_accepted" 
                      checked={hasFeature(property.key_features, 'guarantor_accepted')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="guarantor_accepted">Guarantor accepted</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="dss_lha_accepted" 
                      checked={hasFeature(property.key_features, 'dss_lha_accepted')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="dss_lha_accepted">DSS/LHA accepted</label>
                  </div>
                  
                  <div className="property-view-feature-item">
                    <input 
                      type="checkbox" 
                      id="short_term_lets" 
                      checked={hasFeature(property.key_features, 'short_term_lets')}
                      disabled
                      className="property-view-feature-checkbox"
                    />
                    <label htmlFor="short_term_lets">Short-term lets available</label>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Border line after property features */}
            <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

          </div>
        </div>

        {/* Map and Advisor Section */}
        <div className="property-info-section">
          {/* Postcode Location Display */}
          <div className="property-map-container">
            
            <div className="property-map-wrapper">
              {(() => {
                const postcode = property.zip_code || property.postcode;
                if (postcode) {
                  return (
                    <div className="property-map-static">
                      <div className="property-map-info">
                        <i className="fas fa-map-marker-alt"></i>
                        <span className="property-postcode">{postcode}</span>
                      </div>
                      <div className="property-map-content">
                        <div id="map" className="property-map-frame"></div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="property-map-placeholder">
                      <i className="fas fa-map-marker-alt"></i>
                      <p>Postcode not available</p>
                    </div>
                  );
                }
              })()}
            </div>
          </div>

          {/* Property Advisor Card */}
          <PropertyAdvisorCard 
            userId={property?.user_id} 
            fallbackContact={{
              name: property?.contact_name,
              firstName: property?.first_name,
              lastName: property?.last_name,
              email: property?.contact_email,
              phone: property?.contact_phone
            }}
            propertyConsultantData={property?.property_consultant ? {
              fullName: property.property_consultant,
              jobTitle: 'Property Consultant',
              contactEmail: property?.contact_email,
              contactPhone: property?.contact_phone
            } : null}
          />
        </div>
      </div>
    </div>
  );
};

export default PropertyView; 