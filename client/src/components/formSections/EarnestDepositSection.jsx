import React from "react";

const EarnestDepositSection = ({ formData, handleChange }) => (
  <div className="form-group">
    <label className="field-title">Earnest Money Deposit</label>
    <div className="input-with-addon">
      <input
        type="text"
        name="earnestDepositAmount"
        value={formData.earnestDepositAmount}
        onChange={handleChange}
        placeholder={formData.earnestDepositType} // 👈 Dynamic placeholder
      />
      <div className="addon-box">
        <label className="radio-label">
          <input
            type="radio"
            name="earnestDepositType"
            value="$"
            checked={formData.earnestDepositType === "$"}
            onChange={handleChange}
          />
          $
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name="earnestDepositType"
            value="%"
            checked={formData.earnestDepositType === "%"}
            onChange={handleChange}
          />
          %
        </label>
      </div>
    </div>
  </div>
);

export default EarnestDepositSection;
