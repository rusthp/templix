import React from 'react';
import './SelectTemplateModal.css';

const SelectTemplateModal = ({ isOpen, files, onSelect, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}> {/* Fecha ao clicar fora */}
      <div className="modal-content" onClick={(e) => e.stopPropagation()}> {/* Previne fechar ao clicar dentro */}
        <h2>Selecionar Template</h2>
        <p>Múltiplos arquivos de template foram encontrados. Selecione qual deseja importar:</p>
        
        <ul className="file-list">
          {files.map((file, index) => (
            <li key={index} onClick={() => onSelect(file)}>
              <span className="file-path">{file.path}</span>
              <span className="file-format">({file.format})</span>
            </li>
          ))}
        </ul>
        
        <button className="close-button" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
};

export default SelectTemplateModal; 