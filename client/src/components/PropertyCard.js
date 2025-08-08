import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './PropertyCard.css';

const PropertyCard = ({ property, showActions = true, compact = false, onPropertyDeleted, sourcePage }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);



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

  // Helper function to format description text with proper capitalization
  const formatDescription = (text) => {
    if (!text || !text.trim()) return text;
    
    let formattedText = text.trim();
    
    // Capitalize first character of the entire text
    formattedText = formattedText.charAt(0).toUpperCase() + formattedText.slice(1);
    
    // Capitalize first character after each dot followed by space
    formattedText = formattedText.replace(/\.\s+([a-z])/g, (match, char) => {
      return '. ' + char.toUpperCase();
    });
    
    // Capitalize first character after paragraph breaks (double newlines)
    formattedText = formattedText.replace(/\n\s*\n\s*([a-z])/g, (match, char) => {
      return match.slice(0, -1) + char.toUpperCase();
    });
    
    // Capitalize first character after single newlines (new lines)
    formattedText = formattedText.replace(/\n\s*([a-z])/g, (match, char) => {
      return match.slice(0, -1) + char.toUpperCase();
    });
    
    return formattedText;
  };

  const formatAddress = (property) => {
    const parts = [];
    
    // Helper function to convert text to title case (capitalize first letter of each word)
    const toTitleCase = (str) => {
      return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
    };
    
    // Get street name parts only (up to 2 parts separated by comma)
    if (property.street_name) {
      // Use the separate street_name field (new format) and apply title case
      const streetParts = property.street_name.split(',').map(part => toTitleCase(part.trim()));
      parts.push(...streetParts.slice(0, 2)); // Take only first 2 parts
    } else if (property.address_line1) {
      // Fallback: if street_name is not available, try to extract street name from address_line1
      // by removing potential house numbers and flat numbers at the beginning
      let cleanedAddress = property.address_line1
        .replace(/^[0-9]+[a-zA-Z]?\s+/, '')  // Remove numbers like "123 ", "45A "
        .replace(/^Flat\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Flat 2A, 67 "
        .replace(/^Apartment\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Apartment 5B, 67 "
        .replace(/^Unit\s+[0-9]+[a-zA-Z]?\s*,?\s*[0-9]+[a-zA-Z]?\s+/, '')  // Remove "Unit 7, 67 "
        .trim();
      
      if (cleanedAddress && cleanedAddress !== property.address_line1) {
        // Split by comma and take up to 2 parts
        const streetParts = cleanedAddress.split(',').map(part => toTitleCase(part.trim()));
        parts.push(...streetParts.slice(0, 2));
      } else {
        // If we couldn't clean it, use the original address_line1 with title case
        const streetParts = property.address_line1.split(',').map(part => toTitleCase(part.trim()));
        parts.push(...streetParts.slice(0, 2));
      }
    }
    
    // Add city after street name parts
    if (property.city) {
      parts.push(toTitleCase(property.city));
    }
    
    // Add first 3 characters of postcode (ignoring spaces) if available
    if (property.zip_code || property.postcode) {
      const postcode = property.zip_code || property.postcode;
      const postcodeNoSpaces = postcode.replace(/\s+/g, ''); // Remove all spaces
      const postcodePrefix = postcodeNoSpaces.substring(0, 3).toUpperCase();
      parts.push(postcodePrefix);
    }
    
    // Join all parts with comma and space
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
                    <div
                      key={index}
                      className={`image-container ${index === currentImageIndex ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Capture current location as returnPath
                        const returnPath = location.pathname.includes('/dashboard')
                          ? '/dashboard?tab=properties'
                          : location.pathname + location.search;
                        
                        // Also store in sessionStorage as backup
                        sessionStorage.setItem('lastDashboardPath', returnPath);
                        
                        console.log('🔍 PropertyCard Image Click Debug:', {
                          currentLocation: location.pathname + location.search,
                          returnPath: returnPath,
                          propertyId: property.id,
                          propertySlug: property.slug,
                          fullUrl: window.location.href,
                          pathname: location.pathname,
                          search: location.search,
                          sessionStorage: sessionStorage.getItem('lastDashboardPath')
                        });
                        navigate(`/property/${property.slug || property.id}`, {
                          state: { returnPath: returnPath }
                        });
                      }}
                    >
                      <img
                        src={media.url}
                        alt={`${property.title} - Image ${index + 1}`}
                        className="carousel-image"
                        onError={(e) => {
                          console.error('Image load error:', media.url, e);
                          e.target.style.display = 'none';
                        }}
                      />
                      <div className="image-zoom-overlay">
                        <i className="fas fa-search-plus"></i>
                     
                      </div>
                    </div>
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
                    <button 
                      className="carousel-controls carousel-prev" 
                      onClick={(e) => {
                        e.stopPropagation();
                        prevImage();
                      }}
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    <button 
                      className="carousel-controls carousel-next" 
                      onClick={(e) => {
                        e.stopPropagation();
                        nextImage();
                      }}
                    >
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
                
                {/* Media type indicator */}
                <div className="media-type-indicator">
                  <i className="fas fa-camera" title="Photos"></i>
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
            {property.category === 'rent' && (
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
        <div className="property-details-modern">
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
          
          {/* Property Features - Limited to 3 essential features only */}
          <div className="property-features">
            {property.property_type && (
              <div className="property-feature-item property-building-type">
                <div className="feature-icon">
                  <i className="fas fa-building"></i>
                </div>
                <span>{property.property_type.replace('-', ' ').replace(/\b\w/g, char => char.toUpperCase())}</span>
              </div>
            )}
            {property.bedrooms && (
              <div className="property-feature-item">
                <div className="feature-icon">
                  <i className="fas fa-bed"></i>
                </div>
                <span>{property.bedrooms} Bed{property.bedrooms !== 1 ? 's' : ''}</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="property-feature-item">
                <div className="feature-icon">
                  <i className="fas fa-bath"></i>
                </div>
                <span>{Math.floor(property.bathrooms)} Bath{Math.floor(property.bathrooms) !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Short Description - Moved below features */}
          <div 
            className="property-short-description"
            onClick={() => {
              // Capture current location as returnPath
              const returnPath = location.pathname.includes('/dashboard')
                ? '/dashboard?tab=properties'
                : location.pathname + location.search;
              
              // Also store in sessionStorage as backup
              sessionStorage.setItem('lastDashboardPath', returnPath);
              
              console.log('🔍 PropertyCard Description Click Debug:', {
                currentLocation: location.pathname + location.search,
                returnPath: returnPath,
                propertyId: property.id,
                propertySlug: property.slug,
                fullUrl: window.location.href,
                pathname: location.pathname,
                search: location.search,
                sessionStorage: sessionStorage.getItem('lastDashboardPath')
              });
              navigate(`/property/${property.slug || property.id}`, {
                state: { returnPath: returnPath }
              });
            }}
            style={{ cursor: 'pointer' }}
          >
            {property.description && property.description.trim() ? (
              (() => {
                const formattedDesc = formatDescription(property.description);
                const words = formattedDesc.split(/\s+/);
                
                // If description has more than 80 words, truncate to 80 words
                if (words.length > 80) {
                  const truncatedWords = words.slice(0, 80);
                  return formatDescription(truncatedWords.join(' ')) + '...';
                }
                
                return formattedDesc;
              })()
            ) : (
              <span style={{ fontStyle: 'italic', color: '#999' }}>
                No description available
              </span>
            )}
          </div>
          
          <div className="property-meta-modern">
            <span className="property-type-badge">
              {property.category?.charAt(0).toUpperCase() + property.category?.slice(1)}
            </span>
            {property.created_at && (
              <small>Added: {formatDate(property.created_at)}</small>
            )}
          </div>

          {/* Contact Information Section */}
          <div className="property-contact-info">
            <div className="contact-item">
              <i className="fas fa-user"></i>
              <span className="contact-name">
                {property.first_name && property.last_name 
                  ? `${property.first_name} ${property.last_name}` 
                  : property.owner_name || property.contact_name || 'Owner'}
              </span>
            </div>
            {(property.contact_phone || property.user_phone || property.phone || property.contact_number) && (
              <div className="contact-item">
                <i className="fas fa-phone"></i>
                <span className="contact-phone">
                  {property.contact_phone || property.user_phone || property.phone || property.contact_number}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Action Icons - Outside clickable area */}
        {showActions && (
          <div className="property-actions-modern" onClick={(e) => e.stopPropagation()}>
            <i 
              className="property-action-icon edit-icon fas fa-edit"
              onClick={(e) => {
                e.stopPropagation();
                // Redirect to appropriate form based on property category
                if (property.category === 'rent') {
                  const currentPath = window.location.pathname;
                  const defaultReturnPath = currentPath === '/advisor-profile' ? '/find' : currentPath;
                  navigate('/addrent', { 
                    state: { 
                      editMode: true, 
                      propertyData: property,
                      returnPath: sourcePage || defaultReturnPath
                    } 
                  });
                } else if (property.category === 'lease') {
                  const currentPath = window.location.pathname;
                  const defaultReturnPath = currentPath === '/advisor-profile' ? '/find' : currentPath;
                  navigate('/addlease', { 
                    state: { 
                      editMode: true, 
                      propertyData: property,
                      returnPath: sourcePage || defaultReturnPath
                    } 
                  });
                } else if (property.category === 'sale') {
                  const currentPath = window.location.pathname;
                  const defaultReturnPath = currentPath === '/advisor-profile' ? '/find' : currentPath;
                  navigate('/addlist', { 
                    state: { 
                      editMode: true, 
                      propertyData: property,
                      returnPath: sourcePage || defaultReturnPath
                    } 
                  });
                } else {
                  alert('Edit functionality not available for this property category');
                }
              }}
              title="Edit Property"
            ></i>
            {property.status === 'approved' && (
              <i 
                className="property-action-icon view-icon fas fa-eye"
                onClick={(e) => {
                  e.stopPropagation();
                  // Capture current location as returnPath
                  const returnPath = location.pathname.includes('/dashboard')
                    ? '/dashboard?tab=properties'
                    : location.pathname + location.search;
                  
                  // Also store in sessionStorage as backup
                  sessionStorage.setItem('lastDashboardPath', returnPath);
                  
                  console.log('🔍 PropertyCard View Icon Click Debug:', {
                    currentLocation: location.pathname + location.search,
                    returnPath: returnPath,
                    propertyId: property.id,
                    propertySlug: property.slug,
                    fullUrl: window.location.href,
                    pathname: location.pathname,
                    search: location.search,
                    sessionStorage: sessionStorage.getItem('lastDashboardPath')
                  });
                  navigate(`/property/${property.slug || property.id}`, {
                    state: { returnPath: returnPath }
                  });
                }}
                title="View Property"
              ></i>
            )}
            <i 
              className={`property-action-icon delete-icon ${isDeleting ? 'fas fa-spinner fa-spin' : 'fas fa-trash'}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isDeleting) {
                  handleDelete();
                }
              }}
              title={isDeleting ? "Deleting..." : "Delete Property"}
            ></i>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyCard; 