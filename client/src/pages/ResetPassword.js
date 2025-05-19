import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import "./PasswordReset.css"; // Reuse the same CSS

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { token } = useParams();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    // Password validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post("/api/auth/reset-password", {
        token,
        password,
      });
      setMessage(response.data.message);
      // After 3 seconds, redirect to login
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-password-container">
      <div className="auth-box row w-100">
        {/* Left Side - Video Background */}
        <div className="col-md-4 d-none d-md-block video-container-auth">
          <video autoPlay loop muted playsInline className="backgroundlogin-video">
            <source src="/assets/background2.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Right Side - Form */}
        <div className="auth-content">
          <h2>Reset Your Password</h2>
          
          {message && (
            <div className="alert alert-success">
              {message}
            </div>
          )}
          
          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}
          
          <div className="password-instructions">
            <p>
              Please enter your new password below.
            </p>
          </div>
      
          <div className="auth-form reset-password-form">
            <form onSubmit={handleSubmit}>
              <fieldset>
                <label htmlFor="password">New Password</label>
                <input
                  type="password"
                  name="password"
                  id="password"
                  className="text-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)} 
                  required
                  disabled={loading}
                  minLength="8"
                />
                <small className="form-text text-muted">
                  Password must be at least 8 characters long.
                </small>
              </fieldset>
              
              <fieldset>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  id="confirmPassword"
                  className="text-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  required
                  disabled={loading}
                />
              </fieldset>
              
              <input 
                className="button form-sub" 
                type="submit" 
                value={loading ? "Resetting..." : "Reset Password"} 
                disabled={loading}
              />
            </form>
            <div className="back-to-login">
              <Link to="/login">Back to Login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>    
  );
};

export default ResetPassword; 