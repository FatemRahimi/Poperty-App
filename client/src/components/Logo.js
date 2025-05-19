import React from 'react';

const Logo = ({ className }) => {
  return (
    <div className={`logo-container ${className || ''}`}>
      <svg 
        width="120" 
        height="40" 
        viewBox="0 0 120 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* House Icon */}
        <path 
          d="M22 10L10 20V32H34V20L22 10Z" 
          fill="#3498db" 
          stroke="#2c3e50" 
          strokeWidth="1.5"
        />
        
        {/* Roof */}
        <path 
          d="M7 22L22 8L37 22" 
          stroke="#2c3e50" 
          strokeWidth="2.5" 
          strokeLinecap="round"
        />
        
        {/* Door */}
        <path 
          d="M19 32V24H25V32" 
          stroke="#2c3e50" 
          strokeWidth="1.5" 
          fill="#ffffff"
        />
        
        {/* Window */}
        <rect 
          x="15" 
          y="16" 
          width="5" 
          height="5" 
          fill="#ffffff" 
          stroke="#2c3e50" 
          strokeWidth="1"
        />
        <rect 
          x="24" 
          y="16" 
          width="5" 
          height="5" 
          fill="#ffffff" 
          stroke="#2c3e50" 
          strokeWidth="1"
        />
        
        {/* Text */}
        <text x="44" y="21" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="14" fill="#2c3e50">Sh.R</text>
        <text x="44" y="32" fontFamily="Open Sans, sans-serif" fontWeight="400" fontSize="10" fill="#555555">PROPERTY</text>
      </svg>
    </div>
  );
};

export default Logo; 