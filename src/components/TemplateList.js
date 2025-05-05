import React, { useState } from 'react';
import './TemplateList.css'; // Vamos criar este arquivo para os estilos

const TemplateList = ({ templates, onSelectTemplate, selectedTemplate, onExportTemplate, onConvertFormat, onDeleteTemplate, onRefresh }) => {
  // Estado para controlar a ordenação
  const [sortConfig, setSortConfig] = useState({
    key: null,  // coluna pela qual estamos ordenando
    direction: 'ascending' // direção da ordenação
  });

  // Estado para controlar a animação do botão de atualização
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handler para o botão de atualização
  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Se uma função de callback foi fornecida, chamá-la
    if (typeof onRefresh === 'function') {
      Promise.resolve(onRefresh())
        .finally(() => {
          // Após concluir (sucesso ou erro), parar a animação após 500ms
          setTimeout(() => setIsRefreshing(false), 500);
        });
    } else {
      // Se não houver callback, apenas animação visual por 1 segundo
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  if (templates.length === 0) {
    return (
      <div className="template-list-container">
        <div className="template-list empty">
          <p className="empty-message">Nenhum template encontrado. Importe um template para começar.</p>
        </div>
        <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
      </div>
    );
  }

  // Função para alternar seleção (se clicar no mesmo template, ele será deselect)
  const toggleTemplateSelection = (template) => {
    if (selectedTemplate && selectedTemplate.id === template.id) {
      // Está selecionando o mesmo template, então remove a seleção
      onSelectTemplate(null);
    } else {
      // Selecionando um template diferente
      onSelectTemplate(template);
    }
  };

  // Funções utilitárias para substituir o módulo path
  const getBaseName = (filePath, extension) => {
    if (!filePath) return '';
    
    // Normaliza os separadores para '/'
    const normalizedPath = filePath.replace(/\\/g, '/');
    // Pega a última parte do caminho após a última '/'
    const fileName = normalizedPath.split('/').pop();
    
    // Remove a extensão se fornecida
    if (extension && fileName.endsWith(extension)) {
      return fileName.slice(0, -extension.length);
    }
    
    return fileName;
  };
  
  const getExtension = (filePath) => {
    if (!filePath) return '';
    
    // Pega a extensão do arquivo (tudo após o último ponto)
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  };

  // Função para garantir que o nome do template seja sempre uma string válida
  const getTemplateName = (template) => {
    if (!template.name) return "Template sem nome";
    
    // Se o nome for um objeto, tentar extrair uma string ou usar um valor padrão
    if (typeof template.name === 'object') {
      return template.file_path 
        ? getBaseName(template.file_path, getExtension(template.file_path)) 
        : `Template #${template.id}`;
    }
    
    return String(template.name);
  };

  // Função para lidar com a ordenação das colunas
  const requestSort = (key) => {
    let direction = 'ascending';
    
    // Se já estamos ordenando por esta chave, apenas inverte a direção
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    
    setSortConfig({ key, direction });
  };
  
  // Ordenar os templates de acordo com a configuração atual
  const sortedTemplates = React.useMemo(() => {
    // Cria uma cópia para não modificar o array original
    let sortableItems = [...templates];
    
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        // Determina os valores a serem comparados com base na chave de ordenação
        let aValue, bValue;
        
        switch(sortConfig.key) {
          case 'name':
            aValue = getTemplateName(a).toLowerCase();
            bValue = getTemplateName(b).toLowerCase();
            break;
          case 'version':
            // Converte as versões em arrays de números para comparação correta
            aValue = (a.version || '0.0').split('.').map(num => parseInt(num));
            bValue = (b.version || '0.0').split('.').map(num => parseInt(num));
            
            // Compara cada parte da versão
            for (let i = 0; i < Math.max(aValue.length, bValue.length); i++) {
              const aNum = i < aValue.length ? aValue[i] : 0;
              const bNum = i < bValue.length ? bValue[i] : 0;
              
              if (aNum !== bNum) {
                return sortConfig.direction === 'ascending' ? aNum - bNum : bNum - aNum;
              }
            }
            return 0; // Versões são idênticas
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
        
        // Para a versão, já retornamos diretamente na switch
        if (sortConfig.key === 'version') return 0;
        
        // Comparação geral para strings
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
  
  return (
    <div className="template-list-container">
      <div className="template-list">
        <div className="template-list-header">
          <div 
            className={`header-cell template-name ${getClassNamesFor('name')}`} 
            onClick={() => requestSort('name')}
          >
            Nome
          </div>
          <div 
            className={`header-cell template-version ${getClassNamesFor('version')}`}
            onClick={() => requestSort('version')}
          >
            Versão
          </div>
          <div 
            className={`header-cell template-format ${getClassNamesFor('format')}`}
            onClick={() => requestSort('format')}
          >
            Formato
          </div>
          <div 
            className={`header-cell template-source ${getClassNamesFor('source')}`}
            onClick={() => requestSort('source')}
          >
            Origem
          </div>
          <div className="header-cell template-actions actions-header">Ações</div>
        </div>
        
        <div className="template-list-body">
          {sortedTemplates.map(template => (
            <div 
              key={template.id} 
              className={`template-item ${selectedTemplate && selectedTemplate.id === template.id ? 'selected' : ''}`}
              onClick={() => toggleTemplateSelection(template)}
            >
              <div className="template-cell template-name">{getTemplateName(template)}</div>
              <div className="template-cell template-version">{template.version || 'N/A'}</div>
              <div className="template-cell template-format">{(template.format || 'xml').toUpperCase()}</div>
              <div className="template-cell template-source">{template.source === 'local' ? 'Local' : 'GitHub'}</div>
              <div className="template-cell template-actions actions">
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
                    // Determinar o formato alvo (oposto ao formato atual)
                    const currentFormat = (template.format || 'xml').toLowerCase();
                    const targetFormat = currentFormat === 'xml' ? 'yaml' : 'xml';
                    onConvertFormat(template.id, targetFormat);
                  }} 
                  title={`Converter para ${(template.format || 'xml').toLowerCase() === 'xml' ? 'YAML' : 'XML'}`}
                >
                  Converter para {(template.format || 'xml').toLowerCase() === 'xml' ? 'YAML' : 'XML'}
                </button>
                <button 
                  className="action-btn delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Confirmação antes de excluir com nome limpo
                    const templateName = getTemplateName(template);
                    if (window.confirm(`Tem certeza que deseja excluir o template "${templateName}"?`)) {
                      onDeleteTemplate(template.id);
                    }
                  }}
                  title="Excluir template"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <RefreshButton onClick={handleRefresh} isRefreshing={isRefreshing} />
    </div>
  );
};

// Componente para o botão de atualização
const RefreshButton = ({ onClick, isRefreshing }) => (
  <button 
    className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`} 
    onClick={onClick}
    title="Atualizar lista de templates"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  </button>
);

export default TemplateList; 