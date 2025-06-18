import React, { useState } from "react";
import axios from "axios";
import "./Signup.css";
import { useNavigate, useLocation, Link } from "react-router-dom";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const error = params.get('error');

  // Get the redirect path from location state
  const from = location.state?.from?.pathname || "/find";

  const handleSignup = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");
  
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      
      if (response.ok) {
        // Signup successful, redirect to login with success message AND preserve redirect path
        navigate('/login?signup=success', { 
          state: { from: { pathname: from } } 
        });
      } else {
        // If user already exists, redirect to login AND preserve redirect path
        if (data.error === 'User already exists') {
          navigate('/login?error=user_exists', { 
            state: { from: { pathname: from } } 
          });
        } else {
          setErrorMsg(data.error);
          setIsLoading(false);
        }
      }
    } catch (err) {
      setErrorMsg('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };
  
  return (
    <div className="login-container">
      <div className="login-box">
        {/* Left Side - Video Background */}
        <div className="video-container">
          <video autoPlay loop muted playsInline className="backgroundlogin-video">
            <source src="/assets/background2.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Right Side - Signup Form */}
        <div className="login-form-container">
          <form className="login-form text-center" onSubmit={handleSignup}>
            <h2>Sign up with Email</h2>

            {error === 'user_exists' && (
              <div className="alert alert-info">
                This email is already registered. Please log in.
              </div>
            )}

            {/* Email Input */}
            <div className="mb-3 text-start">
              <label className="signup-form-label">Enter Email</label>
              <input
                type="email"
                className="signup-form-control"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password Input */}
            <div className="signup-form-group">
              <label htmlFor="password" className="signup-form-label">Password</label>
              <input
                type="password"
                className="signup-form-control"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <small className="signup-form-text signup-text-info">
                 Password must be at least 8 characters long
              </small>
            </div>
            
            {/* Submit Button */}
            {errorMsg && (
              <div className="error-box text-center mb-3">
                {errorMsg}
              </div>
            )}

            <button 
              type="submit" 
              className="signup-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? "Signing up..." : "Sign up"}
            </button>
            
            <p className="login-text mt-4">
              Already have an account? <Link 
                to="/login" 
                state={{ from: { pathname: from } }}
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;
