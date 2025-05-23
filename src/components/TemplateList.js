import React, { useState, useMemo } from 'react';
import './TemplateList.css'; // Vamos criar este arquivo para os estilos

// Componente para mensagem de lista vazia
const EmptyListMessage = ({ onRefresh, isRefreshing }) => (
  <div className="template-list-container">
    <div className="template-list empty">
      <p className="empty-message">Nenhum template encontrado. Importe um template para começar.</p>
    </div>
  </div>
);

const TemplateList = ({ templates, onSelectTemplate, selectedTemplate, onExportTemplate, onConvertFormat, onDeleteTemplate }) => {
  // Estado para controlar a ordenação
  const [sortConfig, setSortConfig] = useState({
    key: null,  // coluna pela qual estamos ordenando
    direction: 'ascending' // direção da ordenação
  });

  // Funções utilitárias para substituir o módulo path
  const getBaseName = (filePath, extension) => {
    if (!filePath) return '';
    
    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop();
    
    if (extension && fileName.endsWith(extension)) {
      return fileName.slice(0, -extension.length);
    }
    
    return fileName;
  };
  
  const getExtension = (filePath) => {
    if (!filePath) return '';
    
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  };

  // Função para garantir que o nome do template seja sempre uma string válida
  const getTemplateName = (template) => {
    if (!template.name) return "Template sem nome";
    
    if (typeof template.name === 'object') {
      return template.file_path 
        ? getBaseName(template.file_path, getExtension(template.file_path)) 
        : `Template #${template.id}`;
    }
    
    return String(template.name);
  };

  // Função para alternar seleção (se clicar no mesmo template, ele será deselect)
  const toggleTemplateSelection = (template) => {
    if (selectedTemplate && selectedTemplate.id === template.id) {
      onSelectTemplate(null);
    } else {
      onSelectTemplate(template);
    }
  };

  // Função para lidar com a ordenação das colunas
  const requestSort = (key) => {
    let direction = 'ascending';
    
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    
    setSortConfig({ key, direction });
  };
  
  // Ordenar os templates de acordo com a configuração atual
  const sortedTemplates = useMemo(() => {
    let sortableItems = [...templates];
    
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue, bValue;
        
        switch(sortConfig.key) {
          case 'name':
            aValue = getTemplateName(a).toLowerCase();
            bValue = getTemplateName(b).toLowerCase();
            break;
          case 'version':
            aValue = (a.version || '0.0').split('.').map(num => parseInt(num, 10));
            bValue = (b.version || '0.0').split('.').map(num => parseInt(num, 10));
            
            for (let i = 0; i < Math.max(aValue.length, bValue.length); i++) {
              const aNum = i < aValue.length ? aValue[i] : 0;
              const bNum = i < bValue.length ? bValue[i] : 0;
              
              if (aNum !== bNum) {
                return sortConfig.direction === 'ascending' ? aNum - bNum : bNum - aNum;
              }
            }
            return 0;
          case 'format':
            aValue = (a.format || 'xml').toLowerCase();
            bValue = (b.format || 'xml').toLowerCase();
            break;
          case 'source':
            aValue = a.source === 'local' ? 'local' : 'github';
            bValue = b.source === 'local' ? 'local' : 'github';
            break;
          default:
            return 0;
        }
        
        if (sortConfig.key === 'version') return 0;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return sortableItems;
  }, [templates, sortConfig]);

  // Determina a classe CSS do cabeçalho com base no estado de ordenação
  const getClassNamesFor = (name) => {
    if (!sortConfig) return '';
    return sortConfig.key === name ? `sort-${sortConfig.direction}` : '';
  };
  
  // Se não há templates, renderizar a mensagem vazia
  if (templates.length === 0) {
    return <EmptyListMessage />;
  }
  
  // Renderizar a tabela com os templates
  return (
    <div className="template-list-container">
      <table className="template-list">
        <thead>
          <tr>
            <th 
              className={`name ${getClassNamesFor('name')}`} 
              onClick={() => requestSort('name')}
            >
              Nome
            </th>
            <th 
              className={`version ${getClassNamesFor('version')}`}
              onClick={() => requestSort('version')}
            >
              Versão
            </th>
            <th 
              className={`format ${getClassNamesFor('format')}`}
              onClick={() => requestSort('format')}
            >
              Formato
            </th>
            <th 
              className={`source ${getClassNamesFor('source')}`}
              onClick={() => requestSort('source')}
            >
              Origem
            </th>
            <th className="actions actions-header">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sortedTemplates.map(template => (
            <tr 
              key={template.id} 
              className={selectedTemplate && selectedTemplate.id === template.id ? 'selected' : ''}
              onClick={() => toggleTemplateSelection(template)}
            >
              <td className="name">{getTemplateName(template)}</td>
              <td className="version">{template.version || 'N/A'}</td>
              <td className="format">{(template.format || 'xml').toUpperCase()}</td>
              <td className="source">{template.source === 'local' ? 'Local' : 'GitHub'}</td>
              <td className="actions">
                <button 
                  className="action-btn export-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportTemplate(template.id);
                  }} 
                  title="Exportar template"
                >
                  Exportar
                </button>
                <button 
                  className="action-btn convert-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentFormat = (template.format || 'xml').toLowerCase();
                    const targetFormat = currentFormat === 'xml' ? 'yaml' : 'xml';
                    onConvertFormat(template.id, targetFormat);
                  }} 
                  title={`Converter para ${(template.format || 'xml').toLowerCase() === 'xml' ? 'YAML' : 'XML'}`}
                >
                  Converter
                </button>
                <button 
                  className="action-btn delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const templateName = getTemplateName(template);
                    if (window.confirm(`Tem certeza que deseja excluir o template "${templateName}"?`)) {
                      onDeleteTemplate(template.id);
                    }
                  }}
                  title="Excluir template"
                >
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TemplateList; 