import React from 'react';

const StatCard = ({ title, value, icon, color, trend }) => (
  <div className={`stat-card-modern ${color} fade-in`}>
    <div className="stat-header">
      <div className="stat-content-modern">
        <h3>{value}</h3>
        <p>{title}</p>
        {trend && (
          <div className="stat-trend">
            <i className="fas fa-arrow-up"></i>
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div className="stat-icon-modern">
        <i className={`fas ${icon}`}></i>
      </div>
    </div>
  </div>
);

const OverviewStats = ({ stats }) => {
  return (
    <div className="stats-section">
      <div className="stats-header">
        <h2>Property Statistics</h2>
      </div>
      <div className="stats-grid-modern">
        <StatCard 
          title="Total Properties" 
          value={stats.total || 0} 
          icon="fa-home" 
          color="primary"
        />
        <StatCard 
          title="Approved Listings" 
          value={stats.approved || 0} 
          icon="fa-check-circle" 
          color="success"
        />
        <StatCard 
          title="Pending Review" 
          value={stats.pending || 0} 
          icon="fa-clock" 
          color="warning"
        />
        <StatCard 
          title="Need Updates" 
          value={stats.rejected || 0} 
          icon="fa-edit" 
          color="danger"
        />
      </div>
    </div>
  );
};

export default OverviewStats; 