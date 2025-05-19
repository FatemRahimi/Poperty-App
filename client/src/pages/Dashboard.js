import React, { useState, useEffect } from "react";
import "./Dashboard.css";

const Dashboard = () => {
    const [savedProperties, setSavedProperties] = useState([]);

    // Load saved properties from localStorage
    useEffect(() => {
        const storedProperties = JSON.parse(localStorage.getItem("savedProperties")) || [];
        setSavedProperties(storedProperties);
    }, []);

    // Function to calculate rental yield
    const calculateRentalYield = (property) => {
        const annualRent = parseInt(property.rent.replace("£", "").replace(",", "").replace("/month", "")) * 12;
        const propertyPrice = parseInt(property.price.replace("£", "").replace(",", ""));
        return ((annualRent / propertyPrice) * 100).toFixed(2);
    };

    // Remove a saved property
    const handleRemoveProperty = (id) => {
        const updatedProperties = savedProperties.filter((property) => property.id !== id);
        setSavedProperties(updatedProperties);
        localStorage.setItem("savedProperties", JSON.stringify(updatedProperties));
    };

    return (
        <div className="dashboard-container">
            <h1>Your Saved Properties</h1>
            {savedProperties.length > 0 ? (
                savedProperties.map((property) => (
                    <div key={property.id} className="property-card">
                        <h3>{property.title}</h3>
                        <p>{property.location}</p>
                        <p><strong>Price:</strong> {property.price}</p>
                        <p><strong>Rent:</strong> {property.rent}</p>
                        <p><strong>Estimated Rental Yield:</strong> {calculateRentalYield(property)}%</p>
                        <button onClick={() => handleRemoveProperty(property.id)}>Remove</button>
                    </div>
                ))
            ) : (
                <p>No properties saved yet.</p>
            )}
        </div>
    );
};

export default Dashboard;
