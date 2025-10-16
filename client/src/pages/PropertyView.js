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
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

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
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setGalleryIndex(currentMediaIndex);
                                setShowGalleryModal(true);
                              }}
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
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                if (!isVideo) {
                                  setGalleryIndex(index);
                                  setShowGalleryModal(true);
                                } else {
                                  setCurrentMediaIndex(index);
                                }
                              }}
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
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (!isVideo) {
                                setGalleryIndex(index);
                                setShowGalleryModal(true);
                              } else {
                                setCurrentMediaIndex(index);
                              }
                            }}
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
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setGalleryIndex(currentMediaIndex);
                              setShowGalleryModal(true);
                            }}
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
                <span className="property-details-category" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra-Medium, Tahoma, sans-serif" }}>
                  Property for {property.category ? property.category.charAt(0).toUpperCase() + property.category.slice(1) : ''}
                </span>
                <span className="property-details-dash" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra-Medium, Tahoma, sans-serif" }}> - </span>
                <span className="property-details-type" style={{ fontWeight: 'bold', fontSize: '1.3rem', fontFamily: "Effra-Medium, Tahoma, sans-serif" }}>
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
                        <span className="property-details-price-type" style={{ fontSize: '0.9rem', marginBottom: 4, fontFamily: "Effra, sans-serif", color: '#5b7ba8', fontWeight: '600' }}>
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
              
              // For lease category, hide this entire section
              if (property.category === 'lease') {
                return null; // Don't show view-property-features section for lease
              }
              
              // For all other cases (residential properties, commercial WITH residential, rent), show the section
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

            <div className="view-property-description" style={{ fontFamily: "Effra, sans-serif", marginBottom: '2rem' }}>
              <h3 style={{ 
                fontSize: '1.3rem', 
                fontWeight: '600', 
                color: '#1f2937',
                marginBottom: '1rem',
                textTransform: 'none',
                borderBottom: '2px solid #000000',
                paddingBottom: '0.5rem',
                fontFamily: "Effra-Medium, Tahoma, sans-serif"
              }}>Description</h3>
              <p style={{
                fontSize: '1rem',
                lineHeight: '1.8',
                color: '#374151',
                fontFamily: "Effra, sans-serif"
              }}>{property.description || 'No description available.'}</p>
            </div>

            {/* Custom Features Section - From AddList Form "Add Your Extra Features" - NOT FOR LEASE */}
            {property.category !== 'lease' && (() => {
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

            {/* Property Layout Section - NOT FOR LEASE */}
            {(property.layout_file_url || property.layout_file_name || property.layoutFileUrl || property.layoutFileName) && property.category !== 'lease' && (
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

            {/* =================================================================
                SALE CATEGORY ONLY: EPC DOCUMENTS SECTION (COLLAPSIBLE)
            ================================================================= */}
            {property.category === 'sale' && (property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl) && (
              <>
                {/* Border line before EPC Documents */}
                <div style={{ borderTop: '1px solid #c0c0c0', margin: '50px 0 30px 0', width: '100%' }}></div>
                
                <div className="property-epc-section" style={{ marginTop: '1.5rem' }}>
                  {/* Collapsible Header */}
                  <h3 
                    className="property-layout-title" 
                    style={{ 
                      fontFamily: "Effra-Medium, Tahoma, sans-serif",
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      userSelect: 'none',
                      transition: 'all 0.3s ease'
                    }}
                    onClick={() => {
                      const content = document.getElementById('epc-content');
                      const arrow = document.getElementById('epc-arrow');
                      if (content && arrow) {
                        if (content.style.display === 'none') {
                          content.style.display = 'block';
                          arrow.style.transform = 'rotate(180deg)';
                        } else {
                          content.style.display = 'none';
                          arrow.style.transform = 'rotate(0deg)';
                        }
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#2d3748';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <i className="fas fa-bolt" style={{ color: '#f59e0b', fontSize: '1.1rem' }}></i>
                      ENERGY PERFORMANCE CERTIFICATE
                    </span>
                    <i 
                      id="epc-arrow"
                      className="fas fa-chevron-down" 
                      style={{ 
                        transition: 'transform 0.3s ease',
                        fontSize: '1rem',
                        color: '#3b82f6',
                        fontWeight: 'bold'
                      }}
                    ></i>
                  </h3>
                  
                  {/* Collapsible Content - Hidden by default */}
                  <div id="epc-content" style={{ display: 'none' }}>
                    <div className="property-layout-content">
                      <div className="layout-display-container">
                        {/* EPC Image Display with Zoom */}
                        <div className="layout-image-container">
                          <img 
                            src={property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl} 
                            alt="EPC Document" 
                            className="layout-image"
                            onError={(e) => {
                              console.error('EPC image load error:', e);
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
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

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
                  {/* Property Information Section - ONLY FOR RENT */}
                  {!isSaleProperty && property.category !== 'lease' && (
                    <>
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

                      {/* Border line after property information */}
                      <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>
                    </>
                  )}
                </>
              );
                            })()}

            {/* NEW: Property Features Section - RENT CATEGORY ONLY */}
            {property.category === 'rent' && (
              <>
                {/* Border line before Property Features */}
                <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>
                
                <div className="rent-property-features-section" style={{ 
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

                  {/* Key Information Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Key Information</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
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

                      {/* Deposit Amount */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Deposit Amount:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.deposit_amount ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.deposit_amount 
                            ? `£${Number(property.deposit_amount).toLocaleString()}` 
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
                          color: property.has_garden ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_garden ? 'Yes' : 'Contact Us'}
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
                          color: (property.parking_spaces && property.parking_spaces > 0) ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.parking_spaces && property.parking_spaces > 0) ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Balcony/Terrace */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Balcony/Terrace:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'balcony_terrace') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'balcony_terrace') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Pets Allowed */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Pets Allowed:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.pets_allowed ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.pets_allowed ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Suitable for Students */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Suitable for Students:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.student_housing ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.student_housing ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Furnished */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Furnished:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.furnished ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.furnished ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Garage */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Garage:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.has_garage ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_garage ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Pool */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Pool:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.has_pool ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.has_pool ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

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
                      {/* Kitchen with white goods */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Kitchen with white goods:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'kitchen_white_goods') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'kitchen_white_goods') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Allocated parking */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Allocated parking:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'allocated_parking') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'allocated_parking') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Communal garden */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Communal garden:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'communal_garden') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'communal_garden') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Storage space */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Storage space:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'storage_space') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'storage_space') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Lift access */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Lift access:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'lift_access') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'lift_access') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Intercom entry system */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Intercom entry system:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'intercom_entry') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'intercom_entry') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Utilities & Bills Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Utilities & Bills</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Bills included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Bills included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'bills_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'bills_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Council tax included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Council tax included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'council_tax_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'council_tax_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Water included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Water included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'water_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'water_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Electricity included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Electricity included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'electricity_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'electricity_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Gas included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Gas included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'gas_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'gas_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Internet included */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Internet included:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'internet_included') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'internet_included') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Options Subsection */}
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Financial Options</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Zero deposit option */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Zero deposit option:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'zero_deposit') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'zero_deposit') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Guarantor accepted */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Guarantor accepted:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'guarantor_accepted') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'guarantor_accepted') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* DSS/LHA accepted */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>DSS/LHA accepted:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'dss_lha_accepted') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'dss_lha_accepted') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Short-term lets available */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Short-term lets available:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: hasFeature(property.key_features, 'short_term_lets') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {hasFeature(property.key_features, 'short_term_lets') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* =================================================================
                RENT CATEGORY ONLY: EPC DOCUMENTS SECTION (COLLAPSIBLE)
            ================================================================= */}
            {property.category === 'rent' && (property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl) && (
              <>
                {/* Border line before EPC Documents */}
                <div style={{ borderTop: '1px solid #c0c0c0', margin: '50px 0 30px 0', width: '100%' }}></div>
                
                <div className="property-epc-section" style={{ marginTop: '1.5rem' }}>
                  {/* Collapsible Header */}
                  <h3 
                    className="property-layout-title" 
                    style={{ 
                      fontFamily: "Effra-Medium, Tahoma, sans-serif",
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      userSelect: 'none',
                      transition: 'all 0.3s ease'
                    }}
                    onClick={() => {
                      const content = document.getElementById('rent-epc-content');
                      const arrow = document.getElementById('rent-epc-arrow');
                      if (content && arrow) {
                        if (content.style.display === 'none') {
                          content.style.display = 'block';
                          arrow.style.transform = 'rotate(180deg)';
                        } else {
                          content.style.display = 'none';
                          arrow.style.transform = 'rotate(0deg)';
                        }
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#2d3748';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <i className="fas fa-bolt" style={{ color: '#f59e0b', fontSize: '1.1rem' }}></i>
                      ENERGY PERFORMANCE CERTIFICATE
                    </span>
                    <i 
                      id="rent-epc-arrow"
                      className="fas fa-chevron-down" 
                      style={{ 
                        transition: 'transform 0.3s ease',
                        fontSize: '1rem',
                        color: '#3b82f6',
                        fontWeight: 'bold'
                      }}
                    ></i>
                  </h3>
                  
                  {/* Collapsible Content - Hidden by default */}
                  <div id="rent-epc-content" style={{ display: 'none' }}>
                    <div className="property-layout-content">
                      <div className="layout-display-container">
                        {/* EPC Image Display with Zoom */}
                        <div className="layout-image-container">
                          <img 
                            src={property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl} 
                            alt="EPC Document" 
                            className="layout-image"
                            onError={(e) => {
                              console.error('EPC image load error:', e);
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
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* =================================================================
                LEASE CATEGORY ONLY: COMPREHENSIVE PROPERTY FEATURES SECTION
            ================================================================= */}
            {property.category === 'lease' && (
              <>
                <div className="lease-property-features-section" style={{ 
                  fontFamily: "Effra, sans-serif",
                  marginBottom: '2rem'
                }}>
                  {/* Additional Features Subsection */}
                  {property.custom_features && JSON.parse(property.custom_features).length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                      <h4 style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        color: '#1f2937',
                        marginBottom: '1rem',
                        borderBottom: '2px solid #e5e7eb',
                        paddingBottom: '0.5rem',
                        fontFamily: "Effra-Medium, Tahoma, sans-serif"
                      }}>Additional Features</h4>
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        padding: '0.5rem 0'
                      }}>
                        {JSON.parse(property.custom_features).map((feature, index) => (
                          <div key={index} style={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>{feature}:</span>
                            <span style={{ 
                              fontWeight: '400', 
                              color: '#059669',
                              fontSize: '0.9rem' 
                            }}>
                              Yes
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Border line after Additional Features */}
                  <div style={{ borderTop: '1px solid #c0c0c0', margin: '20px 0', width: '100%' }}></div>

                  {/* Property Layout Subsection */}
                  {(property.layout_file_url || property.layout_file_name) && (
                    <div className="property-layout-section">
                      <h3 className="property-layout-title">Property Layout</h3>
                      
                      <div className="property-layout-content">
                        <div className="layout-display-container">
                          {/* Layout Image Display with Zoom */}
                          <div className="layout-image-container">
                            <img 
                              src={property.layout_file_url || property.layout_file_name} 
                              alt="Property Layout" 
                              className="layout-image"
                              onError={(e) => {
                                console.error('Layout image load error:', property.layout_file_url || property.layout_file_name, e);
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
                              <span>Layout Document</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Property Features Title */}
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

                  {/* Property Info Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Property Info</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Space Type */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Space Type:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.space_type ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.space_type || 'Contact Us'}
                        </span>
                      </div>

                      {/* Space Subtypes */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Space Subtypes:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.space_subtypes ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.space_subtypes || 'Contact Us'}
                        </span>
                      </div>

                      {/* Space Name */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Space Name:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.space_name ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.space_name || 'Contact Us'}
                        </span>
                      </div>

                      {/* Multiple Tenancy */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Multiple Tenancy:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.is_multiple_tenancy === true || property.is_multiple_tenancy === 'true') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.is_multiple_tenancy === true || property.is_multiple_tenancy === 'true') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Building Size */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Building Size:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.building_size ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.building_size ? `${property.building_size} sq ft` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Min Divisible */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Min Divisible:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.min_divisible ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.min_divisible ? `${property.min_divisible} sq ft` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Vacant Sqft */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Vacant Sqft:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.vacant_sqft ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.vacant_sqft ? `${property.vacant_sqft} sq ft` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Land Acres */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Land Acres:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.land_acres ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.land_acres ? `${property.land_acres} acres` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Lot Size */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Lot Size:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.lot_size ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.lot_size ? `${property.lot_size} ${property.lot_size_unit || 'sq ft'}` : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Location Info Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Location Info</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Taxes */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Taxes:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.taxes ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.taxes || 'Contact Us'}
                        </span>
                      </div>

                      {/* Parking Spaces */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Parking Spaces:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.parking_spaces ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.parking_spaces || 'Contact Us'}
                        </span>
                      </div>

                      {/* Power */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Power:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.power ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.power || 'Contact Us'}
                        </span>
                      </div>

                      {/* Zoning */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Zoning:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.zoning ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.zoning || 'Contact Us'}
                        </span>
                      </div>

                      {/* Lease Type */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Lease Type:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.lease_type ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.lease_type || 'Contact Us'}
                        </span>
                      </div>

                      {/* Lease Length */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Lease Length:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.lease_term ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.lease_term ? `${property.lease_term} months` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Rent Per Month */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Rent Per Month:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.monthly_rent ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.monthly_rent ? `£${Number(property.monthly_rent).toLocaleString()}` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Service Charge */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Service Charge:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.service_charges ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.service_charges ? `£${Number(property.service_charges).toLocaleString()}` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Break Clause */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Break Clause:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.break_clause === true || property.break_clause === 'true') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.break_clause === true || property.break_clause === 'true') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Deposit Required */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Deposit Required:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.deposit_required === true || property.deposit_required === 'true') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.deposit_required === true || property.deposit_required === 'true') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Deposit Amount */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Deposit Amount:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.deposit_amount ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.deposit_amount ? `£${Number(property.deposit_amount).toLocaleString()}` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Business Rate */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Business Rate:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.business_rate ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.business_rate || 'Contact Us'}
                        </span>
                      </div>

                      {/* Floor Loading Capacity */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Floor Loading Capacity:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.floor_loading_capacity ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.floor_loading_capacity || 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Utilities Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Financial Utilities</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* VAT on Rent */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>VAT on Rent:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.vat_on_rent ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.vat_on_rent || 'Contact Us'}
                        </span>
                      </div>

                      {/* Rent Review Frequency */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Rent Review Frequency:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.rent_review_frequency ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.rent_review_frequency ? `${property.rent_review_frequency} years` : 'Contact Us'}
                        </span>
                      </div>

                      {/* Repairing Obligations */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Repairing Obligations:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.repairing_obligation ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.repairing_obligation || 'Contact Us'}
                        </span>
                      </div>

                      {/* Insurance Responsibility */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Insurance Responsibility:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.insurance_responsibility ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.insurance_responsibility || 'Contact Us'}
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
                          color: property.epc_rating ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.epc_rating || 'Contact Us'}
                        </span>
                      </div>

                      {/* Heating/Cooling */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Heating/Cooling:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.heating_type ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.heating_type || 'Contact Us'}
                        </span>
                      </div>

                      {/* Toilet/Kitchen */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Toilet/Kitchen:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.toilet_kitchen ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.toilet_kitchen || 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Security & Access Subsection */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h4 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '1rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem',
                      fontFamily: "Effra-Medium, Tahoma, sans-serif"
                    }}>Security & Access</h4>
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0'
                    }}>
                      {/* Parking Availability */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Parking Availability:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.parking_availability ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.parking_availability || 'Contact Us'}
                        </span>
                      </div>

                      {/* Disability Access */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Disability Access:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.disability_access === true || property.disability_access === 'true') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.disability_access === true || property.disability_access === 'true') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>

                      {/* Permitted Use */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Permitted Use:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.permitted_use ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.permitted_use || 'Contact Us'}
                        </span>
                      </div>

                      {/* Opening Hours Allowed */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Opening Hours Allowed:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: property.opening_hours_allowed ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {property.opening_hours_allowed || 'Contact Us'}
                        </span>
                      </div>

                      {/* Signage Allowed */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontWeight: '500', color: '#374151', fontSize: '0.9rem' }}>Signage Allowed:</span>
                        <span style={{ 
                          fontWeight: '400', 
                          color: (property.signage_allowed === true || property.signage_allowed === 'true') ? '#059669' : '#5b7ba8',
                          fontSize: '0.9rem' 
                        }}>
                          {(property.signage_allowed === true || property.signage_allowed === 'true') ? 'Yes' : 'Contact Us'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* EPC Section with Dropdown */}
                {(property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl) && (
                  <>
                    {/* Border line before EPC Documents */}
                    <div style={{ borderTop: '1px solid #c0c0c0', margin: '50px 0 30px 0', width: '100%' }}></div>
                    
                    <div className="property-epc-section" style={{ marginTop: '1.5rem' }}>
                      {/* Collapsible Header */}
                      <h3 
                        className="property-layout-title" 
                        style={{ 
                          fontFamily: "Effra-Medium, Tahoma, sans-serif",
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          userSelect: 'none',
                          transition: 'all 0.3s ease'
                        }}
                        onClick={() => {
                          const content = document.getElementById('lease-epc-content');
                          const arrow = document.getElementById('lease-epc-arrow');
                          if (content && arrow) {
                            if (content.style.display === 'none') {
                              content.style.display = 'block';
                              arrow.style.transform = 'rotate(180deg)';
                            } else {
                              content.style.display = 'none';
                              arrow.style.transform = 'rotate(0deg)';
                            }
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#3b82f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#2d3748';
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <i className="fas fa-bolt" style={{ color: '#f59e0b', fontSize: '1.1rem' }}></i>
                          ENERGY PERFORMANCE CERTIFICATE
                        </span>
                        <i 
                          id="lease-epc-arrow"
                          className="fas fa-chevron-down" 
                          style={{ 
                            transition: 'transform 0.3s ease',
                            fontSize: '1rem',
                            color: '#3b82f6',
                            fontWeight: 'bold'
                          }}
                        ></i>
                      </h3>

                      {/* Collapsible Content - Hidden by default */}
                      <div id="lease-epc-content" style={{ display: 'none' }}>
                        <div className="property-layout-content">
                          <div className="layout-display-container">
                            {/* EPC Image Display with Zoom */}
                            <div className="layout-image-container">
                              <img 
                                src={property.epc_document_url || property.epc_url || property.epcDocumentUrl || property.epcUrl} 
                                alt="EPC Document" 
                                className="layout-image"
                                onError={(e) => {
                                  console.error('EPC image load error:', e);
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
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
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
                      <div 
                        className="property-map-content" 
                        onClick={() => {
                          const postcode = property.zip_code || property.postcode;
                          window.open(`https://www.google.com/maps/search/${encodeURIComponent(postcode)}`, '_blank');
                        }}
                        style={{ 
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                      >
                        <div id="map" className="property-map-frame"></div>
                        <div style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          background: 'rgba(255, 255, 255, 0.95)',
                          padding: '8px 14px',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          color: '#3b82f6',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                          zIndex: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          pointerEvents: 'none'
                        }}>
                          <i className="fas fa-external-link-alt"></i>
                          View in Google Maps
                        </div>
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

      {/* Full-Screen Gallery Modal */}
      {showGalleryModal && property.images && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'black',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setShowGalleryModal(false)}
        >
          {/* Close Button */}
          <button
            onClick={() => setShowGalleryModal(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: 'pointer',
              color: 'white',
              fontSize: '1.2rem',
              zIndex: 10000
            }}
          >
            <i className="fas fa-times"></i>
          </button>

          {/* Current Image */}
          <img
            src={property.images.filter(m => {
              const isVideo = m.type === 'video' || m.image_type === 'video' || 
                (m.url && (m.url.toLowerCase().endsWith('.mp4') || m.url.toLowerCase().endsWith('.mov') || 
                 m.url.toLowerCase().endsWith('.avi') || m.url.toLowerCase().endsWith('.webm') || 
                 m.url.toLowerCase().endsWith('.ogg')));
              return !isVideo;
            })[galleryIndex]?.url}
            alt="Full screen view"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Previous Button */}
          {property.images.filter(m => {
            const isVideo = m.type === 'video' || m.image_type === 'video' || 
              (m.url && (m.url.toLowerCase().endsWith('.mp4') || m.url.toLowerCase().endsWith('.mov') || 
               m.url.toLowerCase().endsWith('.avi') || m.url.toLowerCase().endsWith('.webm') || 
               m.url.toLowerCase().endsWith('.ogg')));
            return !isVideo;
          }).length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const images = property.images.filter(m => {
                  const isVideo = m.type === 'video' || m.image_type === 'video' || 
                    (m.url && (m.url.toLowerCase().endsWith('.mp4') || m.url.toLowerCase().endsWith('.mov') || 
                     m.url.toLowerCase().endsWith('.avi') || m.url.toLowerCase().endsWith('.webm') || 
                     m.url.toLowerCase().endsWith('.ogg')));
                  return !isVideo;
                });
                setGalleryIndex((galleryIndex - 1 + images.length) % images.length);
              }}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.3)',
                border: 'none',
                borderRadius: '50%',
                width: '45px',
                height: '45px',
                cursor: 'pointer',
                fontSize: '1.2rem',
                color: 'white',
                zIndex: 10000
              }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
          )}

          {/* Next Button */}
          {property.images.filter(m => {
            const isVideo = m.type === 'video' || m.image_type === 'video' || 
              (m.url && (m.url.toLowerCase().endsWith('.mp4') || m.url.toLowerCase().endsWith('.mov') || 
               m.url.toLowerCase().endsWith('.avi') || m.url.toLowerCase().endsWith('.webm') || 
               m.url.toLowerCase().endsWith('.ogg')));
            return !isVideo;
          }).length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const images = property.images.filter(m => {
                  const isVideo = m.type === 'video' || m.image_type === 'video' || 
                    (m.url && (m.url.toLowerCase().endsWith('.mp4') || m.url.toLowerCase().endsWith('.mov') || 
                     m.url.toLowerCase().endsWith('.avi') || m.url.toLowerCase().endsWith('.webm') || 
                     m.url.toLowerCase().endsWith('.ogg')));
                  return !isVideo;
                });
                setGalleryIndex((galleryIndex + 1) % images.length);
              }}
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.3)',
                border: 'none',
                borderRadius: '50%',
                width: '45px',
                height: '45px',
                cursor: 'pointer',
                fontSize: '1.2rem',
                color: 'white',
                zIndex: 10000
              }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertyView; 