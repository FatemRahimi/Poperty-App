import React, { useState } from "react";
import "./PasswordReset.css";
import { Link } from "react-router-dom";

const PasswordReset = () => {
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate API call or navigate to next step
    console.log("Reset instructions sent to:", email);
    // You can add actual logic here using fetch/Axios to talk to your backend
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
                               onChange={(e) => setEmail(e.target.value)} required/>
                        </fieldset>
                         <input className="button form-sub" type="submit" value="Send Reset Instructions" />
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
