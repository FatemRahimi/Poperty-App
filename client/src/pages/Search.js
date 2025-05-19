import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Search.css"; // ✅ Import CSS file

const Search = () => {
    const [query, setQuery] = useState(""); // Search input state
    const [properties, setProperties] = useState([]); // Stores filtered results
    const [searched, setSearched] = useState(false); // ✅ Track if search was performed

    // Dummy property data (later we fetch from an API)
    const allProperties = [
        { id: 1, title: "Luxury Apartment in London", price: "£500,000", location: "London" },
        { id: 2, title: "Modern House in Manchester", price: "£300,000", location: "Manchester" },
        { id: 3, title: "Studio Flat in Birmingham", price: "£200,000", location: "Birmingham" },
    ];

    // Function to handle search
    const handleSearch = () => {
        if (!query.trim()) {
            setProperties([]); // Clears results if search is empty
            setSearched(true); // ✅ User has searched (prevents default "No results found")
            return;
        }

        // Filter properties based on user input
        const results = allProperties.filter((property) =>
            property.title.toLowerCase().includes(query.toLowerCase()) ||
            property.location.toLowerCase().includes(query.toLowerCase())
        );

        setProperties(results);
        setSearched(true); // ✅ User has searched
    };

    return (
        <div className="search-container">
            <h1>Search for Investment Properties</h1>
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="Enter city or property name..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <button onClick={handleSearch}>Search</button>
            </div>

            <div className="search-results">
                {searched && properties.length === 0 && <p>No results found</p>}

                {properties.length > 0 && properties.map((property) => (
                    <div key={property.id} className="property-card">
                        <Link to={`/property/${property.id}`} style={{ textDecoration: "none", color: "black" }}>
                            <h3>{property.title}</h3>
                            <p>{property.location}</p>
                            <p><strong>{property.price}</strong></p>
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Search;
