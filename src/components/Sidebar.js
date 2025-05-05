import React, { useState } from 'react';

// Componente RefreshButton movido para cá
const RefreshButton = ({ onClick, isRefreshing }) => (
  <button 
    className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`} 
    onClick={onClick}
    title="Atualizar lista de templates"
    disabled={isRefreshing} // Desabilitar enquanto atualiza
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  </button>
);

const Sidebar = ({ activeTab, setActiveTab, onImportTemplate, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Wrapper para a função onRefresh para controlar o estado isRefreshing
  const handleRefreshClick = async () => {
    if (isRefreshing || typeof onRefresh !== 'function') return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // Pequeno delay para a animação ser visível
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

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
          <>
            <button onClick={onImportTemplate} className="import-button full-width">
              Importar Template
            </button>
            <div className="refresh-button-container">
              <RefreshButton onClick={handleRefreshClick} isRefreshing={isRefreshing} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Sidebar; 