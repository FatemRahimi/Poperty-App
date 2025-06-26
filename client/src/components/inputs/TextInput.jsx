import React from "react";

const TextInput = ({ 
  label, 
  name, 
  value, 
  onChange, 
  type = "text",
  placeholder = "",
  required = false,
  disabled = false,
  className = "",
  ...props 
}) => {
  // Determine if this is an address-related field that triggers Safari autofill icons
  const isAddressField = ['streetName', 'city', 'country', 'postcode', 'address'].some(field => 
    name.toLowerCase().includes(field.toLowerCase())
  );

  // Use custom names for address fields to prevent Safari autofill detection
  const getCustomName = (originalName) => {
    const customNames = {
      'streetName': 'customStreet',
      'city': 'customCity', 
      'country': 'customCountry',
      'postcode': 'customPostcode'
    };
    return customNames[originalName] || originalName;
  };

  const forceRepaintOnSafari = (e) => {
    // Safari fix: Trigger a reflow
    e.target.style.display = 'none';
    e.target.offsetHeight; // force reflow
    e.target.style.display = '';
  };

  return (
    <div className="form-group">
      <label htmlFor={name} className="form-label">
        {label} {required && <span style={{ color: "red" }}>*</span>}
      </label>
      <input
        type={type}
        id={name}
        name={name}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`form-input-base focus-ring ${className}`}
        onFocus={forceRepaintOnSafari}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        inputMode={type === "number" ? "numeric" : type === "tel" ? "tel" : "text"}
        pattern={type === "number" ? "[0-9]*" : undefined}
        {...props}
      />
    </div>
  );
};

export default TextInput;