import React, { useState } from "react";
import SelectInput from "../components/inputs/SelectInput";
import TextInput from "../components/inputs/TextInput";
import CheckboxInput from "../components/inputs/CheckboxInput";
import "../styles/AddListNext.css"; // CSS just for AddListNext
import useSessionStorage from "../Utils/useSessionStorage";
import { Link, useNavigate } from "react-router-dom";
import "../styles/CrossBrowserReset.css"; // Cross-browser consistency

const parkingOptions = [
  { value: "garage", label: "Garage" },
  { value: "driveway", label: "Driveway" },
  { value: "street", label: "Street Parking" },
  { value: "none", label: "None" },
];

const furnishedOptions = [
  { value: "furnished", label: "Furnished" },
  { value: "unfurnished", label: "Unfurnished" },
];

const epcOptions = ["A", "B", "C", "D", "E", "F", "G"].map((r) => ({ value: r, label: r }));
const councilTaxOptions = ["A", "B", "C", "D", "E", "F", "G", "H"].map((b) => ({ value: b, label: `Band ${b}` }));

const AddListNext = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useSessionStorage("addListnextForm",{
    bedrooms: "",
    bathrooms: "",
    receptionRooms: "",
    floorArea: "",
    tenure: "",
    chainFree: false,
    garden: false,
    parking: "",
    furnished: "",
    epcRating: "",
    councilTaxBand: "",
    builtYear: "",
    nearestStation: "",
    primarySchoolNearby: "",
    secondarySchoolNearby: "",
    interestRate: "",
    mortgageEstimate: "",
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
      "bedrooms",
      "bathrooms",
      "receptionRooms",
      "floorArea",
      "tenure",
      "parking",
      "furnished",
      "epcRating",
      "councilTaxBand",
      "builtYear",
      "nearestStation",
      "interestRate",
      "mortgageEstimate",
    ];
  
    const missingFields = requiredFields.filter((field) => {
      return formData[field] === "" || formData[field] === null;
    });
  
    if (missingFields.length > 0) {
      alert("❌ Please fill in all required fields before continuing.");
      return;
    }
  
    console.log("✅ AddListNext Form Submitted:", formData);
  
    // Navigate to Additional Listing page for SALE
    navigate("/additional-listing/sale");
  };
  
  return (
    <div className="addlist2-container">
       <div className="form-title">
              <div className="form-title-brand">Sh.R.Property</div>
              <div className="form-title-add">ADD LISTING FOR SALE</div>
              <ul className="form-title-find-link">
                <li><Link to="/find">Find a Property</Link></li>
              </ul>
       </div>
      <div className="addlist2-wrapper">
        <form onSubmit={handleSubmit} className="addlist2-form">

          {/* SECTION 1 */}
          <h3 className="section-title"> Basic Property Details</h3>
          <div className="addlist2-form-row">
            <TextInput label="Bedrooms" name="bedrooms" value={formData.bedrooms} onChange={handleChange} type="number" />
            <TextInput label="Bathrooms" name="bathrooms" value={formData.bathrooms} onChange={handleChange} type="number" />
            <TextInput label="Reception Rooms" name="receptionRooms" value={formData.receptionRooms} onChange={handleChange} type="number" />
            <TextInput label="Floor Area (m² or ft²)" name="floorArea" value={formData.floorArea} onChange={handleChange} type="number" />
          </div>

          {/* SECTION 2 */}
          <h3 className="section-title"> Ownership and Selling Info</h3>
          <SelectInput
            label="Tenure"
            name="tenure"
            value={formData.tenure}
            onChange={handleChange}
            options={[
              { value: "freehold", label: "Freehold" },
              { value: "leasehold", label: "Leasehold" },
              { value: "share_of_freehold", label: "Share of Freehold" },
            ]}
          />
          <div className="checkbox-row">
            <CheckboxInput label="Chain Free" name="chainFree" checked={formData.chainFree} onChange={handleChange} />
          </div>

          {/* SECTION 3 */}
          <h3 className="section-title"> Features</h3>
          <div className="checkbox-row">
            <CheckboxInput label="Garden" name="garden" checked={formData.garden} onChange={handleChange} />
          </div>

          <div className="addlist2-form-row">
            <SelectInput label="Parking" name="parking" value={formData.parking} onChange={handleChange} options={parkingOptions} />
            <SelectInput label="Furnished" name="furnished" value={formData.furnished} onChange={handleChange} options={furnishedOptions} />
          </div>

          <div className="addlist2-form-row">
            <SelectInput label="EPC Rating" name="epcRating" value={formData.epcRating} onChange={handleChange} options={epcOptions} />
            <SelectInput label="Council Tax Band" name="councilTaxBand" value={formData.councilTaxBand} onChange={handleChange} options={councilTaxOptions} />
          </div>

          <TextInput label="Built Year" name="builtYear" value={formData.builtYear} onChange={handleChange} type="number" />

          {/* SECTION 4 */}
          <h3 className="section-title"> Transport Info</h3>
          <TextInput label="Nearest Train/Tube Station" name="nearestStation" value={formData.nearestStation} onChange={handleChange} />

          {/* SECTION 5 */}
          <h3 className="section-title">Schools (Optional)</h3>
          <TextInput label="Primary School Nearby" name="primarySchoolNearby" value={formData.primarySchoolNearby} onChange={handleChange} />
          <TextInput label="Secondary School Nearby" name="secondarySchoolNearby" value={formData.secondarySchoolNearby} onChange={handleChange} />

          {/* SECTION 6 */}
          <h3 className="section-title"> Mortgage Estimation(If it is mortgaged)</h3>
          <div className="addlist2-form-row">
            <TextInput label="Interest Rate (%)" name="interestRate" value={formData.interestRate} onChange={handleChange} type="number" />
            <TextInput label="Monthly Mortgage Estimate (£)" name="mortgageEstimate" value={formData.mortgageEstimate} onChange={handleChange} type="number" />
          </div>

          {/* Submit Button */}
          <div className="section-submit"> 
            <Link to="/addlist">
              <div className="linkto-previous">Go to Back</div>
            </Link>

            <button type="submit" className="submit-btn">Continue</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddListNext;
