import React from 'react';

const StatCard = ({ title, value, icon, color, description, actionText }) => (
  <div className={`stat-card-modern ${color} fade-in`}>
    <div className="stat-header">
      <div className="stat-content-modern">
        <div className="stat-number">
          <h3>{value || 0}</h3>
          {value > 0 && (
            <div className="stat-badge">
              <i className={`fas ${icon}`}></i>
            </div>
          )}
        </div>
        <div className="stat-info">
          <p className="stat-title">{title}</p>
          {description && (
            <span className="stat-description">{description}</span>
          )}
          {actionText && value > 0 && (
            <span className="stat-action">{actionText}</span>
          )}
        </div>
      </div>
      <div className="stat-icon-modern">
        <i className={`fas ${icon}`}></i>
      </div>
    </div>
  </div>
);

const OverviewStats = ({ stats }) => {
  const getStatusDescription = (type, count) => {
    if (count === 0) return '';
    
    switch(type) {
      case 'pending':
        return count === 1 ? 'property awaiting admin approval' : 'properties awaiting admin approval';
      case 'approved':
        return count === 1 ? 'property live and visible' : 'properties live and visible';
      case 'rejected':
        return count === 1 ? 'property needs your attention' : 'properties need your attention';
      default:
        return '';
    }
  };

  const getActionText = (type, count) => {
    if (count === 0) return '';
    
    switch(type) {
      case 'pending':
        return 'Review in progress...';
      case 'approved':
        return 'View live listings';
      case 'rejected':
        return 'Update required';
      default:
        return '';
    }
  };

  return (
    <div className="stats-section">
      <div className="stats-header">
        <h2>
          <i className="fas fa-chart-bar"></i>
          Property Dashboard Overview
        </h2>
        <p>Track your property listings and their current status</p>
      </div>
      <div className="stats-grid-modern">
        <StatCard 
          title="Total Properties" 
          value={stats.total || 0} 
          icon="fa-home" 
          color="primary"
          description={stats.total === 1 ? 'property in your portfolio' : 'properties in your portfolio'}
        />
        <StatCard 
          title="Live Listings" 
          value={stats.approved || 0} 
          icon="fa-check-circle" 
          color="success"
          description={getStatusDescription('approved', stats.approved)}
          actionText={getActionText('approved', stats.approved)}
        />
        <StatCard 
          title="Under Review" 
          value={stats.pending || 0} 
          icon="fa-clock" 
          color="warning"
          description={getStatusDescription('pending', stats.pending)}
          actionText={getActionText('pending', stats.pending)}
        />
        <StatCard 
          title="Needs Attention" 
          value={stats.rejected || 0} 
          icon="fa-exclamation-triangle" 
          color="danger"
          description={getStatusDescription('rejected', stats.rejected)}
          actionText={getActionText('rejected', stats.rejected)}
        />
      </div>
    </div>
  );
};

export default OverviewStats; 