import React from "react";

const CheckboxInput = ({ label, name, checked, onChange }) => (
  <div className="checkbox-only" style={{
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px'
  }}>
    <input 
      type="checkbox" 
      id={name}
      name={name} 
      checked={checked} 
      onChange={onChange}
      style={{
        width: '20px',
        height: '20px',
        cursor: 'pointer',
        accentColor: '#3b82f6',
        flexShrink: 0,
        margin: 0
      }}
    />
    <label 
      htmlFor={name}
      style={{
        cursor: 'pointer',
        fontSize: '0.95rem',
        fontWeight: '500',
        color: '#374151',
        userSelect: 'none',
        margin: 0,
        lineHeight: '1.4'
      }}
    >
      {label}
    </label>
  </div>
);

export default CheckboxInput;
