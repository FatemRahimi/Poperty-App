import React from "react";

const TextInput = ({ label, name, value, onChange, type = "text", placeholder }) => (
  <div className="form-group">
    <label>{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={type !== "date"}
    />
  </div>
);

export default TextInput;