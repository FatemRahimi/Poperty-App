import React, { useState, useRef, useEffect } from "react";

const SearchDropdown = ({ 
  value, 
  onChange, 
  options, 
  placeholder = "Select option",
  className = "",
  style = {}
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const dropdownRef = useRef(null);

  // Find the label for the selected value
  useEffect(() => {
    if (value) {
      const selectedOption = options.find(opt => opt.value === value);
      setSelectedLabel(selectedOption ? selectedOption.label : "");
    } else {
      setSelectedLabel("");
    }
  }, [value, options]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add/remove z-index classes when dropdown opens/closes
  useEffect(() => {
    const container = dropdownRef.current;
    
    if (isOpen) {
      container?.classList.add('dropdown-open');
    } else {
      container?.classList.remove('dropdown-open');
    }
    
    // Cleanup on unmount
    return () => {
      container?.classList.remove('dropdown-open');
    };
  }, [isOpen]);

  const handleOptionSelect = (option) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div 
      className={`search-dropdown-container ${className}`} 
      ref={dropdownRef}
      style={style}
    >
      {/* Custom Select Box */}
      <div 
        className={`search-select-box ${isOpen ? 'open' : ''} ${!value ? 'placeholder' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="search-select-value">
          {selectedLabel || placeholder}
        </span>
        <span className={`search-select-arrow ${isOpen ? 'open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.646 6.646a.5.5 0 0 1 .708 0L8 9.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/>
          </svg>
        </span>
      </div>

      {/* Custom Dropdown Options - Positioned below */}
      {isOpen && (
        <div className="search-dropdown-options" role="listbox">
          {options.map((option) => (
            <div
              key={option.value}
              className={`search-option ${value === option.value ? 'selected' : ''}`}
              onClick={() => handleOptionSelect(option)}
              role="option"
              aria-selected={value === option.value}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchDropdown; 