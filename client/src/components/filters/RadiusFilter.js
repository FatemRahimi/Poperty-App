import React, { useState, useEffect, useCallback } from 'react';
import { isPropertyWithinRadius } from '../../Utils/GeocodingService';

/**
 * RadiusFilter Component
 * Handles radius-based filtering of properties using geocoding
 */
const RadiusFilter = ({ 
  properties, 
  searchQuery, 
  radiusInMiles, 
  onFilteredProperties,
  isActive = true 
}) => {
  const [isFiltering, setIsFiltering] = useState(false);
  const [filterStats, setFilterStats] = useState({
    total: 0,
    filtered: 0,
    geocoded: 0,
    textMatched: 0
  });

  // Debounced filtering function
  const filterProperties = useCallback(async () => {
    if (!isActive || !properties || properties.length === 0) {
      onFilteredProperties(properties || []);
      return;
    }

    if (!searchQuery || !radiusInMiles || radiusInMiles === '0') {
      // No location filter - return all properties
      onFilteredProperties(properties);
      setFilterStats({
        total: properties.length,
        filtered: properties.length,
        geocoded: 0,
        textMatched: 0
      });
      return;
    }

    setIsFiltering(true);

    try {
      const filteredResults = [];
      let geocodedCount = 0;
      let textMatchedCount = 0;

      // Process properties in batches to avoid blocking the UI
      const batchSize = 10;
      for (let i = 0; i < properties.length; i += batchSize) {
        const batch = properties.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (property) => {
          const isWithin = await isPropertyWithinRadius(property, searchQuery, radiusInMiles);
          
          if (isWithin) {
            // Check if it was geocoded or text matched
            // This is a simple heuristic - you could make it more sophisticated
            if (property.postcode || property.zip_code) {
              geocodedCount++;
            } else {
              textMatchedCount++;
            }
            return property;
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        filteredResults.push(...batchResults.filter(Boolean));

        // Allow UI to update between batches
        if (i + batchSize < properties.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      setFilterStats({
        total: properties.length,
        filtered: filteredResults.length,
        geocoded: geocodedCount,
        textMatched: textMatchedCount
      });

      onFilteredProperties(filteredResults);
    } catch (error) {
      console.error('Radius filtering error:', error);
      // Fallback to all properties on error
      onFilteredProperties(properties);
    } finally {
      setIsFiltering(false);
    }
  }, [properties, searchQuery, radiusInMiles, isActive, onFilteredProperties]);

  // Effect to trigger filtering when dependencies change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      filterProperties();
    }, 300); // Debounce by 300ms

    return () => clearTimeout(timeoutId);
  }, [filterProperties]);

  // Don't render anything - this is a logic-only component
  // But we can optionally show filtering status for debugging
  if (process.env.NODE_ENV === 'development' && isFiltering) {
    return (
      <div style={{
        position: 'fixed',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 10000
      }}>
        🔍 Filtering properties by location...
      </div>
    );
  }

  return null;
};

/**
 * Hook for using radius filtering
 * @param {Array} properties - Array of properties to filter
 * @param {string} searchQuery - Search location (postcode or city)
 * @param {string|number} radiusInMiles - Radius in miles
 * @returns {Object} - { filteredProperties, isFiltering, stats }
 */
export const useRadiusFilter = (properties, searchQuery, radiusInMiles) => {
  const [filteredProperties, setFilteredProperties] = useState(properties || []);
  const [isFiltering, setIsFiltering] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    filtered: 0,
    geocoded: 0,
    textMatched: 0
  });

  const handleFilteredProperties = useCallback((filtered) => {
    setFilteredProperties(filtered);
  }, []);

  return {
    filteredProperties,
    isFiltering,
    stats,
    RadiusFilterComponent: (
      <RadiusFilter
        properties={properties}
        searchQuery={searchQuery}
        radiusInMiles={radiusInMiles}
        onFilteredProperties={handleFilteredProperties}
        isActive={true}
      />
    )
  };
};

export default RadiusFilter; 