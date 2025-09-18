import React, { useState } from 'react';
import './CustomFeaturesInput.css';

const CustomFeaturesInput = ({ 
  customFeatures = [], 
  setCustomFeatures, 
  label = "Add Custom Features",
  placeholder = "Type a custom feature (e.g., Sea view, Garden shed, etc.)",
  maxFeatures = 10 
}) => {
  const [newFeature, setNewFeature] = useState("");

  const handleAddFeature = () => {
    const trimmedFeature = newFeature.trim();
    
    // Validation checks
    if (trimmedFeature === "") return;
    if (customFeatures.length >= maxFeatures) return;
    if (customFeatures.includes(trimmedFeature)) return; // Prevent duplicates
    
    setCustomFeatures([...customFeatures, trimmedFeature]);
    setNewFeature(""); // Clear input
  };

  const handleRemoveFeature = (indexToRemove) => {
    setCustomFeatures(customFeatures.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddFeature();
    }
  };

  return (
    <div className="custom-features-input-container">
      <label className="custom-features-label">{label}</label>
      
      <div className="custom-features-input-wrapper">
        <input
          type="text"
          className="custom-features-input-field"
          value={newFeature}
          onChange={(e) => setNewFeature(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          maxLength={100}
        />
        <button 
          type="button" 
          className="custom-features-add-btn"
          onClick={handleAddFeature}
          disabled={!newFeature.trim() || customFeatures.length >= maxFeatures}
        >
          Add Feature
        </button>
      </div>

      {customFeatures.length >= maxFeatures && (
        <div className="custom-features-limit-warning">
          Maximum {maxFeatures} custom features allowed
        </div>
      )}

      {/* Display added custom features */}
      {customFeatures.length > 0 && (
        <div className="custom-features-list-container">
          <h4 className="custom-features-list-title">Added Features:</h4>
          <ul className="custom-features-list">
            {customFeatures.map((feature, index) => (
              <li key={index} className="custom-features-list-item">
                <span className="custom-features-text">{feature}</span>
                <button 
                  type="button" 
                  className="custom-features-remove-btn"
                  onClick={() => handleRemoveFeature(index)}
                  title="Remove feature"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomFeaturesInput; 