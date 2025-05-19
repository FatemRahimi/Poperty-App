import React, { useState } from "react";
import "./PasswordReset.css";

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
      <div className="auth-box row w-100">
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
                     Enter the email address you used when you joined and we’ll send you instructions to reset your password.
                   </p>
                    <p>
                    For security reasons, we do NOT store your password. So rest assured that we will never send your password via email.
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
                  </div>
            </div>
        </div>
    </div>    
  );
};

export default PasswordReset;
