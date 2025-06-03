import React, { useState } from "react";
import "./PasswordReset.css";
import { Link } from "react-router-dom";

const PasswordReset = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");
    
    try {
      const response = await fetch("http://localhost:5050/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setIsSuccess(true);
        setMessage("Password reset instructions have been sent to your email address.");
      } else {
        setIsSuccess(false);
        setMessage(data.message || "Failed to send reset instructions. Please try again.");
      }
    } catch (error) {
      console.error("Password reset error:", error);
      setIsSuccess(false);
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-password-container">
      {/* Left Side - Video Background */}
      <div className="auth-box">
            <div className="col-md-4 d-none d-md-block video-container-auth">
             <video autoPlay loop muted playsInline className="backgroundlogin-video">
              <source src="/assets/background2.mp4" type="video/mp4" />
                Your browser does not support the video tag.
             </video>
            </div>

           {/* Right Side - Form */}
           <div className="auth-content">
                 <h2>Forgot Password?</h2>
                 <div className="password-instructions">
                   <p>
                     Please enter the email address associated with your account. We'll send you a link to reset your password and regain access.
                   </p>
                    <p>
                     For your security, we never store or send your password by email. If you need further assistance, please contact our support team.
                    </p>
                 </div>
           
                  {/* Message Display */}
                  {message && (
                    <div className={`message ${isSuccess ? 'success-message' : 'error-message'}`} style={{
                      padding: '12px',
                      marginBottom: '20px',
                      borderRadius: '4px',
                      backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
                      color: isSuccess ? '#155724' : '#721c24',
                      border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`
                    }}>
                      {message}
                    </div>
                  )}

                  <div className="auth-form forgot-password-form">
                      <form onSubmit={handleSubmit}>
                         <fieldset>
                          <label htmlFor="email">Email Address</label>
                           <input
                              type="email"
                              name="email"
                              id="email"
                              className="text-input"
                               value={email}
                               onChange={(e) => setEmail(e.target.value)} 
                               disabled={isLoading}
                               required/>
                        </fieldset>
                         <input 
                           className="button form-sub" 
                           type="submit" 
                           value={isLoading ? "Sending..." : "Send Reset Instructions"}
                           disabled={isLoading}
                         />
                      </form>
                      <div className="back-to-signin">
                        <span>Remembered your password? </span>
                        <Link to="/login">Back to Sign In</Link>
                      </div>
                  </div>
            </div>
        </div>
    </div>    
  );
};

export default PasswordReset;
