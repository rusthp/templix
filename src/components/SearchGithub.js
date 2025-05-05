import React, { useState } from 'react';
import { importFromGithub } from '../utils/electronAPI';

const SearchGithub = ({ results, onImport }) => {
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});

  const handleImport = async (url, id) => {
    setLoading(prev => ({ ...prev, [id]: true }));
    setError(prev => ({ ...prev, [id]: null }));
    
    try {
      await importFromGithub(url);
      onImport(); // Atualizar a lista de templates após importação
    } catch (err) {
      setError(prev => ({ 
        ...prev, 
        [id]: err.message || 'Erro ao importar template do GitHub' 
      }));
      console.error('Erro ao importar do GitHub:', err);
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  if (results.length === 0) {
    return (
      <div className="github-results empty">
        <p className="empty-message">
          Busque por templates do Zabbix no GitHub. Os resultados serão exibidos aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="github-results">
      {results.map(repo => (
        <div key={repo.id} className="github-item">
          <h3>{repo.name}</h3>
          <p>{repo.description || 'Sem descrição disponível.'}</p>
          
          <div className="stars">
            ⭐ {repo.stars} estrelas
          </div>
          
          <div className="actions">
            <a 
              href={repo.url} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Ver no GitHub
            </a>
            
            <button
              className="primary"
              onClick={() => handleImport(repo.url, repo.id)}
              disabled={loading[repo.id]}
            >
              {loading[repo.id] ? 'Importando...' : 'Importar'}
            </button>
          </div>
          
          {error[repo.id] && (
            <div className="error-message">
              {error[repo.id]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SearchGithub; 