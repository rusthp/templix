import React, { useState } from 'react';
import { importFromGithub, importSelectedGithubFile } from '../utils/electronAPI';
import SelectTemplateModal from './SelectTemplateModal';

const SearchGithub = ({ results, onImport }) => {
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const [success, setSuccess] = useState({});
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filesForSelection, setFilesForSelection] = useState([]);
  const [currentRepoUrl, setCurrentRepoUrl] = useState('');
  const [currentRepoId, setCurrentRepoId] = useState(null);

  const handleInitialImport = async (repoUrl, repoId) => {
    // Limpar estados anteriores
    setError(prev => ({ ...prev, [repoId]: null }));
    setSuccess(prev => ({ ...prev, [repoId]: false }));
    setLoading(prev => ({ ...prev, [repoId]: true }));
    
    // Armazenar dados do repositório atual
    setCurrentRepoUrl(repoUrl);
    setCurrentRepoId(repoId);
    
    try {
      console.log('Iniciando busca de arquivos em:', repoUrl);
      const result = await importFromGithub(repoUrl);
      
      // Verificar se ocorreu erro
      if (result.error) {
        let errorMsg = result.message || result.error;
        
        // Mensagens mais amigáveis para erros comuns
        if (errorMsg.includes('Limite de requisições')) {
          errorMsg = 'Limite de requisições do GitHub excedido. Tente novamente mais tarde.';
        } else if (errorMsg.includes('não foram encontrados')) {
          errorMsg = 'Não encontramos templates Zabbix válidos neste repositório. Verifique se o repositório contém arquivos XML ou YAML.';
        } else if (errorMsg.includes('autenticação')) {
          errorMsg = 'Erro de autenticação com o GitHub. Entre em contato com o administrador.';
        }
        
        throw new Error(errorMsg);
      }
      
      // Se encontrou múltiplos arquivos, mostrar modal de seleção
      if (result.filesToSelect && result.filesToSelect.length > 0) {
        console.log('Múltiplos arquivos encontrados, abrindo modal:', result.filesToSelect.length);
        setFilesForSelection(result.filesToSelect);
        setIsModalOpen(true);
        
        // Mantém o loading state enquanto o usuário está selecionando
        return;
      } 
      
      // Se importou diretamente (caso de arquivo único)
      if (result.success) {
        console.log('Importação direta bem-sucedida:', result);
        setSuccess(prev => ({ ...prev, [repoId]: true }));
        
        // Atualizar a lista de templates
        if (onImport) onImport();
      } else if (result.skipped) {
        // Se o template foi pulado (duplicata)
        console.log('Template duplicado:', result.name);
        setError(prev => ({ ...prev, [repoId]: `Template "${result.name}" já existe.` }));
      } else {
        // Resposta inesperada
        console.warn('Resposta inesperada na importação:', result);
        throw new Error('Resposta inesperada do servidor');
      }
    } catch (err) {
      console.error('Erro na importação:', err);
      setError(prev => ({ 
        ...prev, 
        [repoId]: err.message || 'Erro ao importar do GitHub' 
      }));
    } finally {
      // Finalizar loading apenas se não abriu o modal
      if (!isModalOpen) {
        setLoading(prev => ({ ...prev, [repoId]: false }));
      }
    }
  };
  
  const handleModalFileSelect = async (selectedFile) => {
    // Fechar o modal imediatamente
    setIsModalOpen(false);
    
    const repoId = currentRepoId;
    if (!repoId) {
      console.error("ID do repositório não encontrado");
      setError(prev => ({ ...prev, general: 'Erro interno: ID do repositório não encontrado' }));
      setLoading({});
      return;
    }
    
    try {
      console.log('Importando arquivo selecionado:', selectedFile.path);
      
      const importResult = await importSelectedGithubFile(
        selectedFile.api_url, 
        selectedFile.name, 
        currentRepoUrl
      );
      
      if (importResult.error) {
        throw new Error(importResult.message || importResult.error);
      }
      
      if (importResult.skipped) {
        console.log('Importação pulada (duplicata):', importResult.name);
        setError(prev => ({ ...prev, [repoId]: `Template "${importResult.name}" já existe.` }));
      } else if (importResult.success) {
        console.log('Arquivo importado com sucesso:', importResult.name);
        setSuccess(prev => ({ ...prev, [repoId]: true }));
        
        // Atualizar a lista de templates
        if (onImport) onImport();
      } else {
        throw new Error('Resposta inesperada ao importar arquivo');
      }
    } catch (err) {
      console.error('Erro ao importar arquivo selecionado:', err);
      setError(prev => ({ 
        ...prev, 
        [repoId]: err.message || 'Erro ao importar arquivo selecionado' 
      }));
    } finally {
      setLoading(prev => ({ ...prev, [repoId]: false }));
      setFilesForSelection([]);
      setCurrentRepoUrl('');
      setCurrentRepoId(null);
    }
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    
    // Resetar loading state para o repositório atual
    if (currentRepoId) {
      setLoading(prev => ({ ...prev, [currentRepoId]: false }));
    }
    
    // Limpar os dados temporários
    setFilesForSelection([]);
    setCurrentRepoUrl('');
    setCurrentRepoId(null);
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
              className="github-link"
            >
              Ver no GitHub
            </a>
            
            <button
              className={`primary ${loading[repo.id] ? 'loading' : ''} ${success[repo.id] ? 'success' : ''}`}
              onClick={() => handleInitialImport(repo.url, repo.id)}
              disabled={loading[repo.id]}
              title="Importar template deste repositório para o Templix"
            >
              {loading[repo.id] ? 'Importando...' : 
               success[repo.id] ? 'Importado!' : 'Importar'}
            </button>
          </div>
          
          {error[repo.id] && (
            <div className="error-message">
              <i className="fas fa-exclamation-circle"></i> {error[repo.id]}
              {error[repo.id].includes('Limite de requisições') && (
                <p className="error-help">Tente novamente mais tarde ou use outro repositório.</p>
              )}
              {error[repo.id].includes('Não encontramos templates') && (
                <p className="error-help">
                  Certifique-se que o repositório contém arquivos XML ou YAML do Zabbix.
                </p>
              )}
            </div>
          )}
          
          {success[repo.id] && !error[repo.id] && (
            <div className="success-message">
              <i className="fas fa-check-circle"></i> Template importado com sucesso!
            </div>
          )}
        </div>
      ))}
      
      <SelectTemplateModal 
        isOpen={isModalOpen}
        files={filesForSelection}
        onSelect={handleModalFileSelect}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default SearchGithub; 