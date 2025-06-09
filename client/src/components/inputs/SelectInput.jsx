import React, { useState, useRef, useEffect } from "react";
import "../../styles/SelectInput.css";

const SelectInput = ({ label, name, value, onChange, options, required = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const dropdownRef = useRef(null);
  const selectRef = useRef(null);

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
    const formGroup = container?.closest('.form-group');
    const formRow = container?.closest('.form-row');
    
    if (isOpen) {
      container?.classList.add('dropdown-open');
      formGroup?.classList.add('has-open-dropdown');
      formRow?.classList.add('has-open-dropdown');
    } else {
      container?.classList.remove('dropdown-open');
      formGroup?.classList.remove('has-open-dropdown');
      formRow?.classList.remove('has-open-dropdown');
    }
    
    // Cleanup on unmount
    return () => {
      container?.classList.remove('dropdown-open');
      formGroup?.classList.remove('has-open-dropdown');
      formRow?.classList.remove('has-open-dropdown');
    };
  }, [isOpen]);

  const handleOptionSelect = (option) => {
    // Create a synthetic event to match the expected onChange signature
    const syntheticEvent = {
      target: {
        name: name,
        value: option.value
      }
    };
    onChange(syntheticEvent);
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
    <div className="form-group">
      <label htmlFor={name}>
        {label} {required && <span style={{ color: "red" }}>*</span>}
      </label>
      
      <div className="custom-select-container" ref={dropdownRef}>
        {/* Custom Select Box */}
        <div 
          className={`custom-select-box ${isOpen ? 'open' : ''} ${!value ? 'placeholder' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          ref={selectRef}
        >
          <span className="select-value">
            {selectedLabel || `Select ${label.replace(/\*/g, '').trim()}`}
          </span>
          <span className={`select-arrow ${isOpen ? 'open' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 6.646a.5.5 0 0 1 .708 0L8 9.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/>
            </svg>
          </span>
        </div>

        {/* Custom Dropdown Options - Absolutely positioned */}
        {isOpen && (
          <div className="custom-dropdown-options" role="listbox">
            {options.map((option) => (
              <div
                key={option.value}
                className={`custom-option ${value === option.value ? 'selected' : ''}`}
                onClick={() => handleOptionSelect(option)}
                role="option"
                aria-selected={value === option.value}
              >
                {option.label}
              </div>
            ))}
          </div>
        )}

        {/* Hidden input for form submission */}
        <input 
          type="hidden" 
          name={name} 
          value={value} 
          required={required}
        />
      </div>
    </div>
  );
};

export default SelectInput;
