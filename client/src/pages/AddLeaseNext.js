import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import TextInput from "../components/inputs/TextInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import SelectInput from "../components/inputs/SelectInput";
import useSessionStorage from "../Utils/useSessionStorage";
import "../styles/AddLease.css";


const heatingCoolingOptions = [
  { value: "central", label: "Central HVAC" },
  { value: "individual", label: "Individual Units" },
  { value: "none", label: "None" },
];

const toiletKitchenOptions = [
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
  { value: "none", label: "None" },
];

const useClassOptions = [
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "E", label: "E" },
];

const AddLeaseNext = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useSessionStorage("addLeaseNextForm",{
    leaseLength: "",
    breakClause: false,
    rentPerMonth: "",
    serviceCharge: "",
    depositRequired: false,
    depositAmount: "",
    businessRates: "",
    utilities: {
      water: false,
      gas: false,
      internet: false,
      electricity: false,
    },
    heatingCooling: "",
    toiletKitchen: "",
    security: {
      cctv: false,
      keyFob: false,
      secureAccess: false,
    },
    parkingAvailable: false,
    disabilityAccess: false,
    floorLoadCapacity: "",
    useClass: "",
    openingHours: "",
    signageAllowed: false,
  });

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    const isUtility = ["water", "gas", "internet", "electricity"].includes(name);
    const isSecurity = ["cctv", "keyFob", "secureAccess"].includes(name);

    if (isUtility) {
      setFormData((prev) => ({
        ...prev,
        utilities: { ...prev.utilities, [name]: checked },
      }));
    } else if (isSecurity) {
      setFormData((prev) => ({
        ...prev,
        security: { ...prev.security, [name]: checked },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const requiredFields = ["leaseLength", "rentPerMonth", "useClass"];
    const isIncomplete = requiredFields.some((field) => !formData[field]);

    if (isIncomplete) {
      alert("\u274C Please complete all required fields.");
      return;
    }

    console.log("\u2705 Lease Details Submitted:", formData);
    navigate("/additional-listing/lease");
  };

  return (
    <div className="addleasing-container">
      <div className="form-title">
        <div className="form-title-brand">Sh.R.Property</div>
        <div className="form-title-add">ADD LISTING FOR LEASE</div>
        <ul className="form-title-find-link">
          <li>
            <Link to="/seller">Add for Sale</Link>
          </li>
        </ul>
      </div>
      <div className="addleasing-wrapper">
        <form onSubmit={handleSubmit} className="addleasing-form">
          <h3 className="section-title">Lease Terms</h3>

          <div className="addleasing-form-row">
            <TextInput type="number" label="Lease Length (years)" name="leaseLength" value={formData.leaseLength} onChange={handleChange} />
            <TextInput type="number" label="Rent per Month (£)" name="rentPerMonth" value={formData.rentPerMonth} onChange={handleChange} />
            <TextInput type="number" label="Service Charge (£)" name="serviceCharge" value={formData.serviceCharge} onChange={handleChange} />
            {formData.depositRequired && (
              <TextInput type="number" label="Deposit Amount (£)" name="depositAmount" value={formData.depositAmount} onChange={handleChange} />
            )}
            <TextInput type="number" label="Business Rates (£)" name="businessRates" value={formData.businessRates} onChange={handleChange} />
            <TextInput type="number" label="Floor Loading Capacity" name="floorLoadCapacity" value={formData.floorLoadCapacity} onChange={handleChange} />
          </div>

          <h3 className="section-title">Features & Utilities</h3>
          <div className="checkbox-group">
            {Object.keys(formData.utilities).map((util) => (
              <CheckboxInput
                key={util}
                label={`Includes ${util.charAt(0).toUpperCase() + util.slice(1)}`}
                name={util}
                checked={formData.utilities[util]}
                onChange={handleChange}
              />
            ))}
          </div>

          <SelectInput label="Heating/Cooling" name="heatingCooling" value={formData.heatingCooling} onChange={handleChange} options={heatingCoolingOptions} />
          <SelectInput label="Toilets/Kitchen" name="toiletKitchen" value={formData.toiletKitchen} onChange={handleChange} options={toiletKitchenOptions} />

          <h3 className="section-title">Security & Access</h3>
          <div className="security-access-group">
            {Object.keys(formData.security).map((sec) => (
              <CheckboxInput
                key={sec}
                label={sec === "keyFob" ? "Key Fob Access" : sec.charAt(0).toUpperCase() + sec.slice(1)}
                name={sec}
                checked={formData.security[sec]}
                onChange={handleChange}
              />
            ))}
            <CheckboxInput label="Parking Available" name="parkingAvailable" checked={formData.parkingAvailable} onChange={handleChange} />
            <CheckboxInput label="Disability Access" name="disabilityAccess" checked={formData.disabilityAccess} onChange={handleChange} />
          </div>

          <h3 className="section-title">Use and Regulations</h3>
          <SelectInput label="Permitted Use (Use Class)" name="useClass" value={formData.useClass} onChange={handleChange} options={useClassOptions} />
          <TextInput label="Opening Hours Allowed" name="openingHours" value={formData.openingHours} onChange={handleChange} />
          <CheckboxInput label="Signage Allowed" name="signageAllowed" checked={formData.signageAllowed} onChange={handleChange} />

          <div className="section-submit">
            <Link to="/addlease"><div className="linkto-previous">Previous</div></Link>
            <button type="submit" className="submit-btn">Continue </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLeaseNext;
