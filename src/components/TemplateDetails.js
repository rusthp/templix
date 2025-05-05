import React from 'react';

const TemplateDetails = ({ template }) => {
  // Formatar a data de adição
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="template-details">
      <h2>{template.name}</h2>
      
      <div className="info-grid">
        <div className="info-label">Versão:</div>
        <div>{template.version || 'N/A'}</div>
        
        <div className="info-label">Formato:</div>
        <div>{(template.format || 'xml').toUpperCase()}</div>
        
        <div className="info-label">Origem:</div>
        <div>{template.source === 'local' ? 'Local' : 'GitHub'}</div>
        
        <div className="info-label">Adicionado em:</div>
        <div>{formatDate(template.date_added)}</div>
        
        {template.file_path && (
          <>
            <div className="info-label">Caminho do arquivo:</div>
            <div className="file-path">{template.file_path}</div>
          </>
        )}
      </div>
      
      <div className="description">
        <h3>Descrição</h3>
        <p>{template.description || 'Nenhuma descrição disponível.'}</p>
      </div>
    </div>
  );
};

export default TemplateDetails; 