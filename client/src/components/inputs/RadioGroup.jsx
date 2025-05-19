import React from "react";

const RadioGroup = ({ label, name, options, selectedValue, onChange }) => (
  <div className="form-group">
    <label>{label}</label>
    {options.map((opt) => (
      <label key={opt}>
        <input
          type="radio"
          name={name}
          value={opt}
          checked={selectedValue === opt}
          onChange={onChange}
        />
        {opt}
      </label>
    ))}
  </div>
);

export default RadioGroup;
