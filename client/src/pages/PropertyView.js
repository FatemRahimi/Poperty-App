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
    if (property.property_type === 'sale' && property.price) {
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

  return (
    <div className="property-view-container">
      <div className="property-view-header">
        <button onClick={() => navigate(-1)} className="back-btn">
          <i className="fas fa-arrow-left"></i> Back
        </button>
        <div className="property-status">
          <span className={`status-badge status-${property.status}`}>
            {property.status}
          </span>
        </div>
      </div>

      <div className="property-view-content">
        {/* Media Gallery */}
        <div className="property-media-gallery">
          {property.images && property.images.length > 0 ? (
            <div className="media-viewer">
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
            </div>
          ) : (
            <div className="no-media">
              <i className="fas fa-home"></i>
              <p>No media available</p>
            </div>
          )}
        </div>

        {/* Property Details */}
        <div className="view-property-details">
          <div className="view-property-header">
            <h1 className="view-property-title">{property.title}</h1>
            <div className="view-property-price">{formatPrice(property)}</div>
          </div>

          <div className="view-property-address">
            <i className="fas fa-map-marker-alt"></i>
            <span>{formatAddress(property)}</span>
          </div>

          <div className="view-property-features">
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

          <div className="view-property-description">
            <h3>Description</h3>
            <p>{property.description || 'No description available.'}</p>
          </div>

          <div className="view-property-contact">
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