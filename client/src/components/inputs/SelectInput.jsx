import React from "react";

const SelectInput = ({ label, name, value, onChange, options, required = false }) => {
  return (
    <div className="form-group">
      <label htmlFor={name}>
        {label} {required && <span style={{ color: "red" }}>*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SelectInput;
