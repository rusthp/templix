import React from 'react';

const Sidebar = ({ activeTab, setActiveTab, onImportTemplate }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-nav">
        <button 
          className={activeTab === 'local' ? 'active' : ''} 
          onClick={() => setActiveTab('local')}
        >
          Templates Locais
        </button>
        <button 
          className={activeTab === 'github' ? 'active' : ''} 
          onClick={() => setActiveTab('github')}
        >
          Buscar no GitHub
        </button>
      </div>
      
      <div className="sidebar-actions">
        {activeTab === 'local' && (
          <button onClick={onImportTemplate}>
            Importar Template
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar; 