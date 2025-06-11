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
    } else if (property.monthly_rent) {
      return `£${Number(property.monthly_rent).toLocaleString()}/month`;
    }
    return 'Price not available';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAddress = (property) => {
    const parts = [
      property.address_line1,
      property.city,
      property.state,
      property.postal_code
    ].filter(Boolean);
    return parts.join(', ');
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
        alert(`Property "${property.title}" has been deleted successfully.`);
        // Call the callback to refresh the properties list
        if (onPropertyDeleted) {
          onPropertyDeleted(property.id);
        }
      } else {
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
      {/* Image Section */}
      <div className="property-images">
        {property.images && property.images.length > 0 ? (
          <div className="image-carousel">
            {property.images.map((media, index) => {
              // Check if the file is a video based on image_type from database or URL extension as fallback
              const isVideo = media.type === 'video' || media.image_type === 'video' || 
                (media.url && (
                  media.url.toLowerCase().endsWith('.mp4') ||
                  media.url.toLowerCase().endsWith('.mov') ||
                  media.url.toLowerCase().endsWith('.avi') ||
                  media.url.toLowerCase().endsWith('.webm') ||
                  media.url.toLowerCase().endsWith('.ogg')
                ));
              
              return isVideo ? (
                <video
                  key={index}
                  src={media.url}
                  className={`carousel-image ${index === currentImageIndex ? 'active' : ''}`}
                  controls
                  muted
                  loop
                  preload="metadata"
                  onError={(e) => {
                    console.error('Video load error:', media.url, e);
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
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
              );
            })}
            
            {property.images.length > 1 && (
              <>
                <button className="carousel-controls carousel-prev" onClick={prevImage}>
                  <i className="fas fa-chevron-left"></i>
                </button>
                <button className="carousel-controls carousel-next" onClick={nextImage}>
                  <i className="fas fa-chevron-right"></i>
                </button>
                
                <div className="carousel-indicators">
                  {property.images.map((_, index) => (
                    <div
                      key={index}
                      className={`carousel-dot ${index === currentImageIndex ? 'active' : ''}`}
                      onClick={() => setCurrentImageIndex(index)}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Media type indicator */}
            {property.images && property.images.length > 0 && (
              <div className="media-type-indicator">
                {property.images[currentImageIndex]?.type === 'video' || 
                 property.images[currentImageIndex]?.image_type === 'video' || 
                 (property.images[currentImageIndex]?.url && (
                   property.images[currentImageIndex].url.toLowerCase().endsWith('.mp4') ||
                   property.images[currentImageIndex].url.toLowerCase().endsWith('.mov') ||
                   property.images[currentImageIndex].url.toLowerCase().endsWith('.avi') ||
                   property.images[currentImageIndex].url.toLowerCase().endsWith('.webm') ||
                   property.images[currentImageIndex].url.toLowerCase().endsWith('.ogg')
                 )) ? (
                  <i className="fas fa-video" title="Video"></i>
                ) : (
                  <i className="fas fa-image" title="Image"></i>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="no-image-modern">
            <i className="fas fa-home"></i>
            <span>No Images Available</span>
          </div>
        )}
      </div>
      
      {/* Status Badge */}
      {property.status && (
        <div className={`property-status-badge status-${property.status}`}>
          {property.status}
        </div>
      )}
      
      {/* Property Details */}
      <div className="property-details-modern">
        <h3 className="property-title-modern">{property.title}</h3>
        
        <p className="property-address-modern">
          <i className="fas fa-map-marker-alt"></i>
          {formatAddress(property)}
        </p>
        
        <div className="property-price-modern">{formatPrice(property)}</div>
        
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
        
        {showActions && (
          <div className="property-actions-modern">
            <button 
              className="action-btn-modern btn-edit"
              onClick={() => navigate(`/edit-property/${property.id}`)}
              disabled={isDeleting}
            >
              <i className="fas fa-edit"></i> Edit
            </button>
            {property.status === 'approved' && (
              <button 
                className="action-btn-modern btn-view"
                onClick={() => window.open(`/property/${property.slug}`, '_blank')}
                disabled={isDeleting}
              >
                <i className="fas fa-eye"></i> View
              </button>
            )}
            <button 
              className="action-btn-modern btn-delete"
              onClick={handleDelete}
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