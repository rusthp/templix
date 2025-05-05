const { ipcRenderer } = window.require('electron');

/**
 * Obtém todos os templates armazenados no banco de dados
 * @returns {Promise<Array>} Lista de templates
 */
export const getAllTemplates = () => {
  return ipcRenderer.invoke('get-templates');
};

/**
 * Abre um diálogo para importar um arquivo XML de template Zabbix
 * @returns {Promise<Object>} Informações do template importado
 */
export const importTemplate = () => {
  return ipcRenderer.invoke('import-template');
};

/**
 * Exporta um template para um arquivo XML
 * @param {number} templateId - ID do template a ser exportado
 * @returns {Promise<Object>} Resultado da exportação
 */
export const exportTemplate = (templateId) => {
  return ipcRenderer.invoke('export-template', templateId);
};

/**
 * Busca templates no GitHub
 * @param {string} query - Termo de busca
 * @returns {Promise<Array>} Lista de resultados do GitHub
 */
export const searchGithub = (query) => {
  return ipcRenderer.invoke('search-github', query);
};

/**
 * Importa um template do GitHub
 * @param {string} url - URL do repositório ou arquivo XML
 * @returns {Promise<Object>} Informações do template importado
 */
export const importFromGithub = (url) => {
  return ipcRenderer.invoke('import-from-github', url);
};

/**
 * Converte um template entre os formatos XML e YAML
 * @param {number} templateId - ID do template a ser convertido
 * @param {string} targetFormat - Formato alvo ('xml' ou 'yaml')
 * @returns {Promise<Object>} Resultado da conversão
 */
export const convertTemplateFormat = (templateId, targetFormat) => {
  return ipcRenderer.invoke('convert-template-format', { templateId, targetFormat });
};

/**
 * Deleta um template do banco de dados
 * @param {number} templateId - ID do template a ser excluído
 * @returns {Promise<Object>} Resultado da operação
 */
export const deleteTemplate = (templateId) => {
  return ipcRenderer.invoke('delete-template', templateId);
};

/**
 * Importa um arquivo específico do GitHub após seleção do usuário
 * @param {string} fileApiUrl - URL da API de conteúdo do arquivo selecionado
 * @param {string} fileName - Nome do arquivo selecionado
 * @param {string} originalRepoUrl - URL do repositório original
 * @returns {Promise<Object>} Informações do template importado
 */
export const importSelectedGithubFile = (fileApiUrl, fileName, originalRepoUrl) => {
  return ipcRenderer.invoke('import-selected-github-file', fileApiUrl, fileName, originalRepoUrl);
};

/**
 * Salva o token de acesso pessoal do GitHub para uso nas requisições
 * @param {string} token - Token de acesso pessoal do GitHub
 * @returns {Promise<Object>} Resultado da operação
 */
export const saveGithubToken = (token) => {
  return ipcRenderer.invoke('save-github-token', token);
};

/**
 * Obtém o token de acesso pessoal do GitHub salvo
 * @returns {Promise<Object>} Objeto contendo o token se existir
 */
export const getGithubToken = () => {
  return ipcRenderer.invoke('get-github-token');
}; 