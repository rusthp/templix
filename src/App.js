import React, { useState, useEffect, useContext } from 'react';
import './App.css';
import TemplateList from './components/TemplateList';
import TemplateDetails from './components/TemplateDetails';
import Sidebar from './components/Sidebar';
import SearchGithub from './components/SearchGithub';
import ThemeToggle from './components/ThemeToggle';
import SettingsButton from './components/SettingsButton';
import SettingsModal from './components/SettingsModal';
import { ThemeContext } from './context/ThemeContext';
import { getAllTemplates, importTemplate, exportTemplate, searchGithub, convertTemplateFormat, deleteTemplate } from './utils/electronAPI';

const { ipcRenderer } = window.require('electron');

// RefreshButton component
const RefreshButton = ({ onClick, isRefreshing }) => (
  <button 
    className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`} 
    onClick={onClick}
    title="Atualizar lista de templates"
    disabled={isRefreshing}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  </button>
);

function App() {
  const { theme } = useContext(ThemeContext);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState('local'); // 'local' ou 'github'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [githubResults, setGithubResults] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Carregar templates ao iniciar
  useEffect(() => {
    loadTemplates();
  }, []);

  // Função para carregar todos os templates
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getAllTemplates();
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao carregar templates');
      console.error('Erro ao carregar templates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Função para importar um template
  const handleImportTemplate = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await importTemplate();
      
      if (result.error) {
        // Se o backend retornou um objeto de erro
        setError(`Erro: ${result.error}. ${result.message || ''}`);
        console.error('Erro ao importar template:', result);
      } else if (!result.canceled) {
        // Template importado com sucesso, atualizar a lista
        loadTemplates();
      }
    } catch (err) {
      console.error('Exceção ao importar template:', err);
      
      // Tentar extrair detalhes do erro se for um erro da IPC
      let errorMessage = err.message || 'Erro desconhecido ao importar template';
      
      // Se o erro contém "[object Object]", provavelmente é um objeto JSON mal formatado
      if (errorMessage.includes('[object Object]')) {
        errorMessage = 'Erro ao processar o template. Verifique se o formato do arquivo é válido.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Função para exportar um template
  const handleExportTemplate = async (templateId) => {
    try {
      await exportTemplate(templateId);
    } catch (err) {
      setError(err.message || 'Erro ao exportar template');
      console.error('Erro ao exportar template:', err);
    }
  };

  // Função para converter o formato de um template
  const handleConvertFormat = async (templateId, targetFormat) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await convertTemplateFormat(templateId, targetFormat);
      
      if (result.error) {
        setError(`Erro: ${result.error}. ${result.message || ''}`);
        console.error('Erro ao converter template:', result);
      } else if (result.warning) {
        setError(`Aviso: ${result.message}`);
      } else if (result.success) {
        // Se importou o template convertido, recarregar a lista
        if (result.imported) {
          loadTemplates();
        }
      }
    } catch (err) {
      console.error('Exceção ao converter template:', err);
      setError(err.message || 'Erro desconhecido ao converter template');
    } finally {
      setLoading(false);
    }
  };

  // Função para excluir um template
  const handleDeleteTemplate = async (templateId) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await deleteTemplate(templateId);
      
      if (result.error) {
        setError(`Erro: ${result.error}. ${result.message || ''}`);
        console.error('Erro ao excluir template:', result);
      } else if (result.success) {
        // Se o template excluído for o selecionado, limpar a seleção
        if (selectedTemplate && selectedTemplate.id === templateId) {
          setSelectedTemplate(null);
        }
        // Atualizar a lista de templates
        loadTemplates();
      }
    } catch (err) {
      console.error('Exceção ao excluir template:', err);
      setError(err.message || 'Erro desconhecido ao excluir template');
    } finally {
      setLoading(false);
    }
  };

  // Função para buscar no GitHub
  const handleSearchGithub = async (query) => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const results = await searchGithub(query);
      setGithubResults(results);
      setError(null);
    } catch (err) {
      setError(err.message || 'Erro ao buscar no GitHub');
      console.error('Erro ao buscar no GitHub:', err);
      setGithubResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Callback para quando um template é importado do GitHub
  const handleGithubImport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // A importação foi bem-sucedida (notificada pelo SearchGithub)
      // Apenas recarrega os templates e muda para a aba local
      console.log('handleGithubImport chamado. Recarregando templates...');
      await loadTemplates();
      setActiveTab('local');
      
      // Limpar qualquer mensagem de erro/sucesso anterior
      setError(null); 

    } catch (err) {
      console.error('Erro ao recarregar templates após importação do GitHub:', err);
      setError('Falha ao atualizar a lista após importação do GitHub.');
    } finally {
      setLoading(false);
    }
  };

  // Abrir modal de configurações
  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
  };

  // Fechar modal de configurações
  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  // Filtrar templates locais com base na busca
  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (template.version && template.version.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handle refresh button click
  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await loadTemplates();
    } finally {
      // Small delay for the animation to be visible
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className={`app ${theme}`}>
      <header className="app-header">
        <div className="header-content">
          <h1>Templix</h1>
          <p>Gerenciador de Templates Zabbix</p>
        </div>
        <div className="header-actions">
          <SettingsButton onClick={handleOpenSettings} />
          <ThemeToggle />
        </div>
      </header>
      
      <div className="app-content">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          onImportTemplate={handleImportTemplate}
          onRefresh={loadTemplates}
        />
        
        <main className="main-content">
          <div className="search-bar">
            <input
              type="text"
              placeholder={`Buscar ${activeTab === 'local' ? 'templates locais' : 'no GitHub'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && activeTab === 'github') {
                  handleSearchGithub(searchQuery);
                }
              }}
            />
            {activeTab === 'github' && (
              <button onClick={() => handleSearchGithub(searchQuery)}>Buscar</button>
            )}
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          {loading ? (
            <div className="loading">Carregando...</div>
          ) : (
            <>
              {activeTab === 'local' && (
                <>
                  <div className="center-refresh-container" onClick={handleRefreshClick}>
                    <RefreshButton onClick={(e) => {
                      e.stopPropagation(); // Prevenir duplo clique
                      handleRefreshClick();
                    }} isRefreshing={isRefreshing} />
                    <span className="refresh-label">Atualizar Lista de Templates</span>
                  </div>
                  
                  <div className="templates-container">
                    <TemplateList 
                      templates={filteredTemplates} 
                      onSelectTemplate={setSelectedTemplate}
                      selectedTemplate={selectedTemplate}
                      onExportTemplate={handleExportTemplate}
                      onConvertFormat={handleConvertFormat}
                      onDeleteTemplate={handleDeleteTemplate}
                    />
                    {selectedTemplate && (
                      <TemplateDetails template={selectedTemplate} />
                    )}
                  </div>
                </>
              )}
              
              {activeTab === 'github' && (
                <SearchGithub 
                  results={githubResults} 
                  onImport={handleGithubImport} 
                />
              )}
            </>
          )}
        </main>
      </div>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={handleCloseSettings} 
      />
    </div>
  );
}

export default App; 