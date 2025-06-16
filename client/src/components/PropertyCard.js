import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './PropertyCard.css';

const PropertyCard = ({ property, showActions = true, compact = false, onPropertyDeleted }) => {
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Separate function to get both weekly and monthly prices for display
  const getPriceDetails = (property) => {
    const prices = [];
    
    if (property.price) {
      prices.push({ type: 'sale', amount: property.price, label: 'Asking Price' });
    }
    if (property.weekly_rent) {
      prices.push({ type: 'weekly', amount: property.weekly_rent, label: 'Weekly' });
    }
    if (property.monthly_rent) {
      prices.push({ type: 'monthly', amount: property.monthly_rent, label: 'Monthly' });
    }
    
    return prices;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAddress = (property) => {
    const parts = [];
    
    // Add street name only (without house number)
    if (property.street_name) {
      // Use the separate street_name field (new format)
      parts.push(property.street_name);
    } else if (property.address_line1) {
      // Fallback: if street_name is not available, try to extract street name from address_line1
      // by removing potential house numbers and flat numbers at the beginning
      let cleanedAddress = property.address_line1
        .replace(/^[0-9]+[a-zA-Z]?\s+/, '')  // Remove numbers like "123 ", "45A "
        .replace(/^Flat\s+[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Flat 2A "
        .replace(/^Apartment\s+[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Apartment 5B "
        .replace(/^Unit\s+[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Unit 7 "
        .trim();
      
      if (cleanedAddress && cleanedAddress !== property.address_line1) {
        parts.push(cleanedAddress);
      } else {
        // If we couldn't clean it, use the original address_line1
        parts.push(property.address_line1);
      }
    }
    
    // Add country
    if (property.country) {
      parts.push(property.country);
    }
    
    // Add first 3 characters of postcode
    const postcode = property.zip_code || property.postcode;
    if (postcode && postcode.length >= 3) {
      parts.push(postcode.substring(0, 3));
    }
    
    return parts.length > 0 ? parts.join(', ') : 'Location not specified';
  };

  const nextImage = () => {
    if (property.images && property.images.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % property.images.length);
    }
  };

  const prevImage = () => {
    if (property.images && property.images.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + property.images.length) % property.images.length);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${property.title}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/properties/${property.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        // Call the callback to refresh the properties list and show success
        if (onPropertyDeleted) {
          onPropertyDeleted(property.id, property.title);
        }
      } else {
        console.error('Delete failed:', data.message);
        // Only show alert for errors, not success
        alert(`Failed to delete property: ${data.message}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete property. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`property-card-modern ${compact ? 'compact' : ''} fade-in`}>
      <div className="property-card-content">
        {/* Left Column - Images and Rental Prices */}
        <div className="property-left-column">
          {/* Image Section */}
          <div className="property-images">
            {property.images && property.images.length > 0 ? (
              <div className="image-carousel">
                {property.images
                  .filter((media) => {
                    // Filter to show only images, exclude videos
                    const isVideo = media.type === 'video' || media.image_type === 'video' || 
                      (media.url && (
                        media.url.toLowerCase().endsWith('.mp4') ||
                        media.url.toLowerCase().endsWith('.mov') ||
                        media.url.toLowerCase().endsWith('.avi') ||
                        media.url.toLowerCase().endsWith('.webm') ||
                        media.url.toLowerCase().endsWith('.ogg')
                      ));
                    return !isVideo; // Return only non-video media
                  })
                  .map((media, index) => (
                    <img
                      key={index}
                      src={media.url}
                      alt={`${property.title} - Image ${index + 1}`}
                      className={`carousel-image ${index === currentImageIndex ? 'active' : ''}`}
                      onError={(e) => {
                        console.error('Image load error:', media.url, e);
                        e.target.style.display = 'none';
                      }}
                    />
                  ))}
                
                {property.images.filter(media => {
                  const isVideo = media.type === 'video' || media.image_type === 'video' || 
                    (media.url && (
                      media.url.toLowerCase().endsWith('.mp4') ||
                      media.url.toLowerCase().endsWith('.mov') ||
                      media.url.toLowerCase().endsWith('.avi') ||
                      media.url.toLowerCase().endsWith('.webm') ||
                      media.url.toLowerCase().endsWith('.ogg')
                    ));
                  return !isVideo;
                }).length > 1 && (
                  <>
                    <button className="carousel-controls carousel-prev" onClick={prevImage}>
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    <button className="carousel-controls carousel-next" onClick={nextImage}>
                      <i className="fas fa-chevron-right"></i>
                    </button>
                    
                    {/* Image counter on the left */}
                    <div className="image-counter">
                      {currentImageIndex + 1}/{property.images.filter(media => {
                        const isVideo = media.type === 'video' || media.image_type === 'video' || 
                          (media.url && (
                            media.url.toLowerCase().endsWith('.mp4') ||
                            media.url.toLowerCase().endsWith('.mov') ||
                            media.url.toLowerCase().endsWith('.avi') ||
                            media.url.toLowerCase().endsWith('.webm') ||
                            media.url.toLowerCase().endsWith('.ogg')
                          ));
                        return !isVideo;
                      }).length}
                    </div>
                    
                    <div className="carousel-indicators">
                      {property.images.filter(media => {
                        const isVideo = media.type === 'video' || media.image_type === 'video' || 
                          (media.url && (
                            media.url.toLowerCase().endsWith('.mp4') ||
                            media.url.toLowerCase().endsWith('.mov') ||
                            media.url.toLowerCase().endsWith('.avi') ||
                            media.url.toLowerCase().endsWith('.webm') ||
                            media.url.toLowerCase().endsWith('.ogg')
                          ));
                        return !isVideo;
                      }).map((_, index) => (
                        <div
                          key={index}
                          className={`carousel-dot ${index === currentImageIndex ? 'active' : ''}`}
                          onClick={() => setCurrentImageIndex(index)}
                        />
                      ))}
                    </div>
                  </>
                )}
                
                {/* Media type indicator - show image count */}
                <div className="media-type-indicator">
                  <i className="fas fa-camera" title="Photos"></i>
                  <span className="image-count">
                    {property.images.filter(media => {
                      const isVideo = media.type === 'video' || media.image_type === 'video' || 
                        (media.url && (
                          media.url.toLowerCase().endsWith('.mp4') ||
                          media.url.toLowerCase().endsWith('.mov') ||
                          media.url.toLowerCase().endsWith('.avi') ||
                          media.url.toLowerCase().endsWith('.webm') ||
                          media.url.toLowerCase().endsWith('.ogg')
                        ));
                      return !isVideo;
                    }).length}
                  </span>
                </div>
              </div>
            ) : (
              <div className="no-image-modern">
                <i className="fas fa-home"></i>
                <span>No Images Available</span>
              </div>
            )}
          </div>
          
          {/* Rental Prices Text Section - Below images in left column */}
          <div className="property-rental-text">
            {property.property_type === 'rent' && (
              <>
                {(property.monthly_rent || property.monthlyRent) ? (
                  <div className="rental-text-item monthly">
                    <span className="rental-amount monthly">£{Number(property.monthly_rent || property.monthlyRent).toLocaleString()} pcm</span>
                  </div>
                ) : null}
                {(property.weekly_rent || property.weeklyRent) ? (
                  <div className="rental-text-item weekly">
                    <span className="rental-amount weekly">£{Number(property.weekly_rent || property.weeklyRent).toLocaleString()} pw</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
        
        {/* Property Details */}
        <div 
          className="property-details-modern"
          onClick={() => navigate(`/property/${property.slug || property.id}`)}
          style={{ cursor: 'pointer' }}
        >
          {/* Status Badge */}
          {property.status && (
            <div className={`property-status-badge status-${property.status}`}>
              {property.status}
            </div>
          )}
          
          <h3 className="property-title-modern">{property.title}</h3>
          
          <p className="property-address-modern">
            <i className="fas fa-map-marker-alt"></i>
            {formatAddress(property)}
          </p>
          
          {/* Short Description */}
          {property.short_description && (
            <div className="property-short-description">
              {property.short_description}
            </div>
          )}
          
          <div className="property-features">
            {property.bedrooms && (
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fas fa-bed"></i>
                </div>
                <span>{property.bedrooms} Bed{property.bedrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fas fa-bath"></i>
                </div>
                <span>{property.bathrooms} Bath{property.bathrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.square_feet && (
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fas fa-ruler-combined"></i>
                </div>
                <span>{Number(property.square_feet).toLocaleString()} sqft</span>
              </div>
            )}
            {property.parking_spots && (
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fas fa-car"></i>
                </div>
                <span>{property.parking_spots} Parking</span>
              </div>
            )}
            {property.student_housing && (
              <div className="feature-item">
                <div className="feature-icon">
                  <i className="fas fa-graduation-cap"></i>
                </div>
                <span>Student-Friendly</span>
              </div>
            )}
          </div>
          
          <div className="property-meta-modern">
            <span className="property-type-badge">
              {property.property_type?.charAt(0).toUpperCase() + property.property_type?.slice(1)}
            </span>
            {property.created_at && (
              <small>Added: {formatDate(property.created_at)}</small>
            )}
          </div>
        </div>
        
        {/* Action Buttons - Outside clickable area */}
        {showActions && (
          <div className="property-actions-modern" onClick={(e) => e.stopPropagation()}>
            <button 
              className="action-btn-modern btn-edit"
              onClick={(e) => {
                e.stopPropagation();
                // Redirect to appropriate form based on property type
                if (property.property_type === 'rent') {
                  navigate('/addrent', { state: { editMode: true, propertyData: property } });
                } else if (property.property_type === 'lease') {
                  navigate('/addlease', { state: { editMode: true, propertyData: property } });
                } else if (property.property_type === 'sale') {
                  navigate('/addlist', { state: { editMode: true, propertyData: property } });
                } else {
                  alert('Edit functionality not available for this property type');
                }
              }}
              disabled={isDeleting}
            >
              <i className="fas fa-edit"></i> Edit
            </button>
            {property.status === 'approved' && (
              <button 
                className="action-btn-modern btn-view"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/property/${property.slug || property.id}`);
                }}
                disabled={isDeleting}
              >
                <i className="fas fa-eye"></i> View
              </button>
            )}
            <button 
              className="action-btn-modern btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Deleting...
                </>
              ) : (
                <>
                  <i className="fas fa-trash"></i> Delete
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyCard; 