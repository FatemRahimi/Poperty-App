import React, { useState } from "react";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import Logo from "../components/Logo";
import "../styles/AddList.css";
import { useNavigate, Link } from "react-router-dom";
import useSessionStorage from "../Utils/useSessionStorage";

const leaseTypeOptions = [
  { value: "full-service", label: "Full-Service" },
  { value: "net-lease", label: "Net Lease" },
  { value: "modified-gross", label: "Modified Gross" },
];

const spaceTypeOptions = [
  { value: "retail", label: "Retail" },
  { value: "office", label: "Office" },
  { value: "industrial", label: "Industrial" },
  { value: "land", label: "Land" },
  { value: "restaurant", label: "Restaurant" },
  { value: "special-purpose", label: "Special Purpose" },
];

const lotSizeUnitOptions = [
  { value: "acres", label: "Acres" },
  { value: "sqft", label: "Square Feet" },
  { value: "sqm", label: "Square Meters" },
];

const AddLease = () => {
  const navigate = useNavigate();

  const [showAddress, setShowAddress] = useState(false);
  const [formData, setFormData] = useSessionStorage("addLeaseForm",{
    spaceType: "",
    spaceSubtypes: "",
    spaceName: "",
    country: "UK",
    city: "",
    postalCode: "",
    address: "",
    buildingSize: "",
    minDivisible: "",
    vacantSQFT: "",
    landAcres: "",
    lotSize: "",
    lotSizeUnit: "acres",
    taxesPerSQFT: "",
    parkingSpaces: "",
    power: "",
    zoning: "",
    leaseType: "",
    isMultipleTenancy: false,
  });

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const requiredFields = [
      "spaceType",
      "spaceSubtypes",
      "spaceName",
      "address",
      "buildingSize",
      "vacantSQFT",
      "leaseType",
    ];

    const isIncomplete = requiredFields.some((field) => !formData[field]);
    if (isIncomplete) {
      alert("\u274C Please complete all required fields before submitting.");
      return;
    }

    console.log("\u2705 Lease Form Submitted:", formData);
    navigate("/addleasenext");
  };

  return (
    <div className="form-sale-container">
      <div className="form-title">
        <div className="form-title-brand">
          <Logo />
        </div>
        <div className="form-title-add">ADD LISTING FOR LEASE</div>
        <ul className="form-title-find-link">
          <li><Link to="/seller">BACK TO ADD LISTING</Link></li>
        </ul>
      </div>

      <div className="form-wrapper">
        <form onSubmit={handleSubmit} className="property-form">
          <h3 className="section-title">Basic Space Info</h3>

          <div className="form-row">
            <SelectInput label="Space Type*" name="spaceType" value={formData.spaceType} onChange={handleChange} options={spaceTypeOptions} />
            <TextInput label="Space Subtypes*" name="spaceSubtypes" value={formData.spaceSubtypes} onChange={handleChange} />
          </div>

          <TextInput label="Space Name*" name="spaceName" value={formData.spaceName} onChange={handleChange} />

          <CheckboxInput label="Multiple Tenancy" name="isMultipleTenancy" checked={formData.isMultipleTenancy} onChange={handleChange} />

          <button type="button" className="form-sale-address" onClick={() => setShowAddress(!showAddress)}>
            {showAddress ? "Hide Address" : "Add Address"}
          </button>

          {showAddress && (
            <>
              <div className="form-row">
                <TextInput label="Address*" name="address" value={formData.address} onChange={handleChange} />
                <TextInput label="Postal Code" name="postalCode" value={formData.postalCode} onChange={handleChange} />
              </div>
              <div className="form-row">
                <TextInput label="City" name="city" value={formData.city} onChange={handleChange} />
                <TextInput label="Country" name="country" value={formData.country} onChange={handleChange} disabled />
              </div>
            </>
          )}

          <h3 className="section-title">Building Details</h3>
          <div className="form-row">
            <TextInput label="Building Size (sqft)*" name="buildingSize" value={formData.buildingSize} onChange={handleChange} type="number" />
            <TextInput label="Min Divisible (sqft)" name="minDivisible" value={formData.minDivisible} onChange={handleChange} type="number" />
            <TextInput label="Vacant SQFT*" name="vacantSQFT" value={formData.vacantSQFT} onChange={handleChange} type="number" />
          </div>

          <div className="form-row">
            <TextInput label="Land Acres" name="landAcres" value={formData.landAcres} onChange={handleChange} type="number" />
            <TextInput label="Lot Size" name="lotSize" value={formData.lotSize} onChange={handleChange} type="number" />
            <SelectInput label="Lot Size Unit" name="lotSizeUnit" value={formData.lotSizeUnit} onChange={handleChange} options={lotSizeUnitOptions} />
          </div>

          <h3 className="section-title">Building Specs</h3>
          <div className="form-row">
            <TextInput label="Taxes (per sqft)" name="taxesPerSQFT" value={formData.taxesPerSQFT} onChange={handleChange} type="number" />
            <TextInput label="Parking Spaces" name="parkingSpaces" value={formData.parkingSpaces} onChange={handleChange} type="number" />
            <TextInput label="Power" name="power" value={formData.power} onChange={handleChange} />
          </div>

          <h3 className="section-title">Location Info</h3>
          <div className="form-row">
            <TextInput label="Zoning (Use Class)" name="zoning" value={formData.zoning} onChange={handleChange} />
          </div>

          <SelectInput label="Lease Type*" name="leaseType" value={formData.leaseType} onChange={handleChange} options={leaseTypeOptions} />

          <button type="submit" className="submit-btn">Continue</button>
        </form>
      </div>
    </div>
  );
};

export default AddLease;
