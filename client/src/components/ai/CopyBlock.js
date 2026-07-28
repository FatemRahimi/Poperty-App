import React, { useState } from 'react';
import { FaCopy, FaCheck } from 'react-icons/fa';

const CopyBlock = ({ title, children, text }) => {
  const [copied, setCopied] = useState(false);
  const value = text ?? (typeof children === 'string' ? children : '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="ai-result-block">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <h3 style={{ marginBottom: 0 }}>{title}</h3>
        {value && (
          <button type="button" className="ai-btn ai-btn-ghost" style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }} onClick={handleCopy}>
            {copied ? <FaCheck /> : <FaCopy />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        {typeof children === 'string' ? <p>{children}</p> : children}
      </div>
    </div>
  );
};

export default CopyBlock;
