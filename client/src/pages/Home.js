import React from "react";
import { Link } from "react-router-dom";
import "./Home.css"; // ✅ Import the external CSS file

const Home = () => {
    return (
        <div className="home-container">
            <h1 className="home-heading">Find the Best Property Investments</h1>
            <p className="home-text">
                Use AI-powered insights to identify high-yield investment properties.
            </p>
            <Link to="/search">
                <button className="home-button">Start Searching</button>
            </Link>
        </div>
    );
};

export default Home;

