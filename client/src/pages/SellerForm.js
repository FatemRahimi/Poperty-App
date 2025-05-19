import React, { useEffect } from "react";
import "./SellerForm.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const listings = [
  {
    title: "For Sale",
    image: "/assets/add-property-myself-sale.svg",
    link: "/addlist"
  },
  {
    title: "For Lease",
    image: "/assets/add-property-myself-lease.svg",
    link: "/addlease"
  },
  {
    title: "For Rent",
    image: "/assets/add-property-myself-rent.svg",
    link: "/addrent"
  }
];

const SellerForm = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login', { state: { from: location.pathname } });
    }
  }, [loading, isAuthenticated, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="seller-form-container">
      <div className="seller-form-content">
        <h1 className="seller-form-title">Add Your Property</h1>
        <div className="seller-form-grid">
          {listings.map((listing, index) => (
            <Link key={index} to={listing.link} className="seller-form-card-link">
              <div className="seller-form-card">
                <img src={listing.image} alt={listing.title} className="seller-form-card-image" />
                <h2 className="seller-form-card-title">{listing.title}</h2>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SellerForm;
