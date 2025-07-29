import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './PropertyView.css';

const PropertyView = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

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

  const fetchProperty = async () => {
    try {
      const response = await fetch(`/api/properties/property/${slug}`);
      const data = await response.json();
      
      if (data.success) {
        setProperty(data.property);
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
            <i className="fas fa-arrow-left"></i> Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!property) {
    return null;
  }

  const handleBack = () => {
    if (window.history.state?.fromDashboard) {
      navigate(`/dashboard?tab=${window.history.state.tab || 'overview'}&propertyId=${window.history.state.propertyId}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="property-view-container">
      <div className="property-view-header">
        <button onClick={handleBack} className="back-btn">
          <i className="fas fa-arrow-left"></i> Back
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

          <div className="view-property-features" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            {property.bedrooms && (
              <div className="view-feature">
                <i className="fas fa-bed"></i>
                <span>{property.bedrooms} Bedroom{property.bedrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="view-feature">
                <i className="fas fa-bath"></i>
                <span>{property.bathrooms} Bathroom{property.bathrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.square_feet && (
              <div className="view-feature">
                <i className="fas fa-ruler-combined"></i>
                <span>{Number(property.square_feet).toLocaleString()} sqft</span>
              </div>
            )}
            {property.parking_spaces && (
              <div className="view-feature">
                <i className="fas fa-car"></i>
                <span>{property.parking_spaces} Parking Space{property.parking_spaces !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          <div className="view-property-description" style={{ fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <h3>Description</h3>
            <p>{property.description || 'No description available.'}</p>
          </div>

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