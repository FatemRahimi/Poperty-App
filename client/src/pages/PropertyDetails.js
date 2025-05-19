import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import "./PropertyDetails.css";

const PropertyDetails = () => {
    const { id } = useParams();
    const [property, setProperty] = useState(null);
    const [saved, setSaved] = useState(false);
    const [loanAmount, setLoanAmount] = useState("");
    const [interestRate, setInterestRate] = useState("");
    const [loanTerm, setLoanTerm] = useState("");
    const [monthlyPayment, setMonthlyPayment] = useState(null);

    // Hardcoded property data
    const allProperties = [
        { id: "1", title: "Luxury Apartment in London", price: "£500,000", location: "London", image: "https://via.placeholder.com/600", rent: "£2,000/month", description: "A modern luxury apartment in the heart of London." },
        { id: "2", title: "Modern House in Manchester", price: "£300,000", location: "Manchester", image: "https://via.placeholder.com/600", rent: "£1,500/month", description: "Spacious modern house with a garden." },
        { id: "3", title: "Studio Flat in Birmingham", price: "£200,000", location: "Birmingham", image: "https://via.placeholder.com/600", rent: "£1,000/month", description: "Affordable studio flat, ideal for city living." }
    ];

    // Find the selected property
    useEffect(() => {
        const foundProperty = allProperties.find((p) => p.id === id);
        setProperty(foundProperty);
    }, [id]);

    // Check if property is already saved
    useEffect(() => {
        const savedProperties = JSON.parse(localStorage.getItem("savedProperties")) || [];
        setSaved(savedProperties.some((p) => p.id === id));
    }, [id]);

    // Save property to localStorage
    const handleSaveProperty = () => {
        const savedProperties = JSON.parse(localStorage.getItem("savedProperties")) || [];
        if (!savedProperties.some((p) => p.id === id)) {
            savedProperties.push(property);
            localStorage.setItem("savedProperties", JSON.stringify(savedProperties));
            setSaved(true);
        }
    };

    // Mortgage Calculation Function
    const calculateMortgage = () => {
        if (!loanAmount || !interestRate || !loanTerm) return;

        const principal = parseFloat(loanAmount);
        const monthlyInterest = parseFloat(interestRate) / 100 / 12;
        const numberOfPayments = parseFloat(loanTerm) * 12;

        if (monthlyInterest === 0) {
            setMonthlyPayment((principal / numberOfPayments).toFixed(2));
        } else {
            const monthlyPaymentValue =
                (principal * monthlyInterest) /
                (1 - Math.pow(1 + monthlyInterest, -numberOfPayments));
            setMonthlyPayment(monthlyPaymentValue.toFixed(2));
        }
    };

    if (!property) {
        return <h2>Property not found</h2>;
    }

    return (
        <div className="property-container">
            <h1>{property.title}</h1>
            <img src={property.image} alt={property.title} className="property-image" />
            <p><strong>Location:</strong> {property.location}</p>
            <p><strong>Price:</strong> {property.price}</p>
            <p><strong>Rent:</strong> {property.rent}</p>
            <p><strong>Description:</strong> {property.description}</p>

            {/* Save Property Button */}
            <button onClick={handleSaveProperty} disabled={saved}>
                {saved ? "Saved" : "Save Property"}
            </button>

            {/* Mortgage Calculator */}
            <div className="mortgage-calculator">
                <h2>Mortgage Calculator</h2>
                <input
                    type="number"
                    placeholder="Loan Amount (£)"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                />
                <input
                    type="number"
                    placeholder="Interest Rate (%)"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                />
                <input
                    type="number"
                    placeholder="Loan Term (years)"
                    value={loanTerm}
                    onChange={(e) => setLoanTerm(e.target.value)}
                />
                <button onClick={calculateMortgage}>Calculate</button>
                {monthlyPayment && <p><strong>Monthly Payment:</strong> £{monthlyPayment}</p>}
            </div>
        </div>
    );
};

export default PropertyDetails;
