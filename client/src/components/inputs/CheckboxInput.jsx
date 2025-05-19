import React from "react";

const CheckboxInput = ({ label, name, checked, onChange }) => (
  <div className="checkbox-only">
    <input type="checkbox" name={name} checked={checked} onChange={onChange} />
    <label>{label}</label>
  </div>
);

export default CheckboxInput;
