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
        autoComplete={type === "email" ? "email" : type === "tel" ? "tel" : "off"}
        inputMode={type === "number" ? "numeric" : undefined}
        pattern={type === "number" ? "[0-9]*" : undefined}
        {...props}
      />
    </div>
  );
};

export default TextInput;