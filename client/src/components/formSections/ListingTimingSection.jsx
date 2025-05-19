import React from "react";
import TextInput from "../inputs/TextInput";

const ListingTimingSection = ({ formData, handleChange }) => (
  <>
    <TextInput
      label="Due Diligence Period (Days)"
      name="dueDiligencePeriod"
      type="number"
      value={formData.dueDiligencePeriod}
      onChange={handleChange}
    />
    <TextInput
      label="Closing Period (Days)"
      name="closingPeriod"
      type="number"
      value={formData.closingPeriod}
      onChange={handleChange}
    />
    <TextInput
      label="Listing Expiration Date"
      name="expirationDate"
      type="date"
      value={formData.expirationDate}
      onChange={handleChange}
    />
    <TextInput
      label="Send Reminder (Days before expiration)"
      name="reminderDays"
      type="number"
      value={formData.reminderDays}
      onChange={handleChange}
    />
  </>
);

export default ListingTimingSection;