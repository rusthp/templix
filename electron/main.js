const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { parseString } = require('xml2js');
const yaml = require('js-yaml');
const axios = require('axios');
require('@electron/remote/main').initialize();

// Mantenha uma referência global do objeto da janela
let mainWindow;

// Caminho para o banco de dados
const dbPath = path.join(app.getPath('userData'), 'templix.db');

// Inicializar o banco de dados
function initializeDatabase() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
      console.log('Conectado ao banco de dados SQLite.');
      
      // Criar tabela de templates se não existir
      db.run(`CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        version TEXT,
        description TEXT,
        file_path TEXT,
        source TEXT,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Erro ao criar tabela:', err.message);
        } else {
          console.log('Tabela de templates está pronta.');
          
          // Verificar se a coluna 'format' existe e adicioná-la se necessário
          db.all("PRAGMA table_info(templates)", [], (err, rows) => {
            if (err) {
              console.error('Erro ao verificar estrutura da tabela:', err.message);
              return;
            }
            
            // Verificar se a coluna 'format' já existe
            const formatColumnExists = rows.some(row => row.name === 'format');
            
            if (!formatColumnExists) {
              console.log('Adicionando coluna "format" à tabela templates...');
              db.run("ALTER TABLE templates ADD COLUMN format TEXT DEFAULT 'xml'", (err) => {
                if (err) {
                  console.error('Erro ao adicionar coluna format:', err.message);
                } else {
                  console.log('Coluna "format" adicionada com sucesso!');
                }
              });
            } else {
              console.log('Coluna "format" já existe na tabela templates.');
            }
          });
        }
      });
    }
  });
  
  return db;
}

// Criar a janela do aplicativo
function createWindow() {
  // Determinar o caminho do ícone baseado no sistema operacional
  let iconPath;
  if (process.platform === 'win32') {
    // No Windows, precisamos usar ICO
    iconPath = path.join(__dirname, '../assets/icon.ico');
    // Se o ICO não existir, tentar usar PNG ou SVG
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '../assets/icon.png');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '../assets/icon.svg');
      }
    }
  } else if (process.platform === 'darwin') {
    // No macOS, ICNS é preferível
    iconPath = path.join(__dirname, '../assets/icon.icns');
    // Se ICNS não existir, tentar PNG ou SVG
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '../assets/icon.png');
      if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '../assets/icon.svg');
      }
    }
  } else {
    // Linux e outros, tentar PNG ou SVG
    iconPath = path.join(__dirname, '../assets/icon.png');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, '../assets/icon.svg');
    }
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'Templix - Gerenciador de Templates Zabbix',
    icon: iconPath
  });

  // Definir uma Content Security Policy adequada
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"]
      }
    });
  });

  // Carregar aplicativo React ou arquivo HTML
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Abrir DevTools se estiver em desenvolvimento
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Remover referência quando a janela for fechada
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Iniciar o aplicativo quando o Electron estiver pronto
app.whenReady().then(() => {
  const db = initializeDatabase();
  createWindow();

  // Manipuladores de eventos IPC
  
  // Importar template XML/YAML local
  ipcMain.handle('import-template', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Zabbix Templates', extensions: ['xml', 'yaml', 'yml'] },
          { name: 'XML', extensions: ['xml'] },
          { name: 'YAML', extensions: ['yaml', 'yml'] }
        ]
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        const results = [];
        const errors = [];
        let duplicates = 0;
        
        // Função para verificar se um template já existe
        const templateExists = (name) => {
          return new Promise((resolve, reject) => {
            db.get('SELECT id FROM templates WHERE name = ?', [name], (err, row) => {
              if (err) {
                reject(err);
              } else {
                resolve(!!row); // retorna true se o template existir
              }
            });
          });
        };
        
        // Processar cada arquivo selecionado
        for (const filePath of result.filePaths) {
          try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileExt = path.extname(filePath).toLowerCase();
            
            // Verificar se é XML ou YAML
            const isXml = fileExt === '.xml';
            
            let templateData;
            
            if (isXml) {
              // Processamento de XML
              templateData = await new Promise((resolve, reject) => {
                parseString(fileContent, async (err, result) => {
                  if (err) {
                    console.error('Erro ao analisar XML:', err);
                    reject({ error: 'Erro ao analisar XML', message: err.message });
                  } else {
                    try {
                      // Extrair informações do template XML
                      if (!result.zabbix_export) {
                        console.error('Estrutura XML inválida: zabbix_export não encontrado');
                        reject({ error: 'Estrutura XML inválida', message: 'zabbix_export não encontrado no arquivo XML' });
                        return;
                      }
                      
                      const zabbixExport = result.zabbix_export;
                      
                      if (!zabbixExport.templates || !zabbixExport.templates[0]) {
                        console.error('Estrutura XML inválida: templates não encontrado');
                        reject({ error: 'Estrutura XML inválida', message: 'templates não encontrado no arquivo XML' });
                        return;
                      }
                      
                      const templates = zabbixExport.templates[0];
                      
                      if (!templates.template || !templates.template[0]) {
                        console.error('Estrutura XML inválida: nome do template não encontrado');
                        reject({ error: 'Estrutura XML inválida', message: 'Nome do template não encontrado no arquivo XML' });
                        return;
                      }
                      
                      const name = templates.template[0];
                      
                      // Verificar se o template já existe
                      const exists = await templateExists(name);
                      if (exists) {
                        duplicates++;
                        console.log(`Template "${name}" já existe no banco de dados. Ignorando.`);
                        resolve({ name, skipped: true, reason: 'duplicate' });
                        return;
                      }
                      
                      const data = {
                        name: name,
                        version: zabbixExport.version ? zabbixExport.version[0] : 'N/A',
                        description: templates.description ? templates.description[0] : '',
                        filePath: filePath,
                        source: 'local',
                        format: 'xml'
                      };
                      
                      // Salvar no banco de dados
                      db.run(
                        `INSERT INTO templates (name, version, description, file_path, source, format) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [data.name, data.version, data.description, data.filePath, data.source, data.format],
                        function(err) {
                          if (err) {
                            console.error('Erro SQL ao salvar no banco de dados:', err.message);
                            reject({ error: 'Erro ao salvar no banco de dados', message: err.message });
                          } else {
                            console.log(`Template "${name}" importado com sucesso (ID: ${this.lastID})`);
                            data.id = this.lastID;
                            resolve(data);
                          }
                        }
                      );
                    } catch (error) {
                      console.error('Erro ao processar XML:', error);
                      reject({ error: 'Estrutura XML inválida', message: error.message });
                    }
                  }
                });
              });
            } else {
              // Processamento de YAML
              templateData = await new Promise((resolve, reject) => {
                try {
                  // Analisar YAML
                  const yamlData = yaml.load(fileContent);
                  
                  // Extrair informações do template YAML
                  if (!yamlData || !yamlData.zabbix_export) {
                    console.error('Estrutura YAML inválida: zabbix_export não encontrado');
                    reject({ error: 'Estrutura YAML inválida', message: 'zabbix_export não encontrado no arquivo YAML' });
                    return;
                  }
                  
                  console.log('Estrutura do YAML:', JSON.stringify(yamlData.zabbix_export, null, 2).substring(0, 500) + '...');
                  
                  if (!yamlData.zabbix_export.templates) {
                    console.error('Estrutura YAML inválida: templates não encontrado');
                    reject({ error: 'Estrutura YAML inválida', message: 'templates não encontrado no arquivo YAML' });
                    return;
                  }
                  
                  // Lidar com diferentes estruturas possíveis do YAML
                  const templateObj = Array.isArray(yamlData.zabbix_export.templates) 
                    ? yamlData.zabbix_export.templates[0] 
                    : yamlData.zabbix_export.templates;
                  
                  // Extrair nome do template a partir dos vários formatos possíveis
                  const templateName = templateObj.template || templateObj.name;
                  
                  if (!templateName) {
                    console.error('Estrutura YAML inválida: nome do template não encontrado');
                    console.log('Objeto do template:', JSON.stringify(templateObj, null, 2));
                    reject({ error: 'Estrutura YAML inválida', message: 'Nome do template não encontrado no arquivo YAML' });
                    return;
                  }
                  
                  // Verificar se o template já existe
                  templateExists(templateName).then(exists => {
                    if (exists) {
                      duplicates++;
                      console.log(`Template "${templateName}" já existe no banco de dados. Ignorando.`);
                      resolve({ name: templateName, skipped: true, reason: 'duplicate' });
                      return;
                    }
                    
                    const data = {
                      name: templateName,
                      version: yamlData.zabbix_export.version || 'N/A',
                      description: templateObj.description || '',
                      filePath: filePath,
                      source: 'local',
                      format: 'yaml'
                    };
                    
                    console.log('Dados extraídos do template:', data);
                    
                    // Salvar no banco de dados
                    db.run(
                      `INSERT INTO templates (name, version, description, file_path, source, format) 
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [data.name, data.version, data.description, data.filePath, data.source, data.format],
                      function(err) {
                        if (err) {
                          console.error('Erro SQL ao salvar no banco de dados:', err.message);
                          reject({ error: 'Erro ao salvar no banco de dados', message: err.message });
                        } else {
                          console.log(`Template "${data.name}" importado com sucesso (ID: ${this.lastID})`);
                          data.id = this.lastID;
                          resolve(data);
                        }
                      }
                    );
                  }).catch(err => {
                    reject({ error: 'Erro ao verificar template existente', message: err.message });
                  });
                } catch (error) {
                  console.error('Erro ao processar YAML:', error);
                  reject({ error: 'Erro ao analisar YAML', message: error.message });
                }
              });
            }
            
            results.push(templateData);
          } catch (fileError) {
            console.error(`Erro ao processar arquivo ${filePath}:`, fileError);
            errors.push({ file: path.basename(filePath), error: fileError.message || 'Erro desconhecido' });
          }
        }
        
        return {
          success: true,
          total: result.filePaths.length,
          imported: results.filter(r => !r.skipped).length,
          duplicates,
          errors: errors.length,
          details: { results, errors }
        };
      }
      return { canceled: true };
    } catch (mainError) {
      console.error('Erro geral na importação:', mainError);
      return { error: 'Erro na importação', message: mainError.message };
    }
  });
  
  // Função auxiliar para salvar template no banco de dados
  function saveTemplateToDb(db, templateData, resolve, reject) {
    console.log('Salvando template no banco de dados:', templateData);
    
    // Verificar se o nome do template está definido
    if (!templateData.name) {
      console.error('Nome do template não definido');
      reject({ error: 'Dados do template inválidos', message: 'Nome do template não definido' });
      return;
    }
    
    // Verificar se o caminho do arquivo está definido
    if (!templateData.filePath) {
      console.error('Caminho do arquivo não definido');
      reject({ error: 'Dados do template inválidos', message: 'Caminho do arquivo não definido' });
      return;
    }
    
    try {
      db.run(
        `INSERT INTO templates (name, version, description, file_path, source, format) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          templateData.name, 
          templateData.version || 'N/A', 
          templateData.description || '', 
          templateData.filePath, 
          templateData.source || 'local', 
          templateData.format || 'xml'
        ],
        function(err) {
          if (err) {
            console.error('Erro SQL ao salvar no banco de dados:', err.message);
            reject({ error: 'Erro ao salvar no banco de dados', message: err.message });
          } else {
            console.log('Template salvo com sucesso, ID:', this.lastID);
            templateData.id = this.lastID;
            resolve(templateData);
          }
        }
      );
    } catch (error) {
      console.error('Exceção ao salvar no banco de dados:', error);
      reject({ error: 'Exceção ao salvar no banco de dados', message: error.message });
    }
  }
  
  // Obter todos os templates
  ipcMain.handle('get-templates', () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM templates ORDER BY date_added DESC', [], (err, rows) => {
        if (err) {
          reject({ error: 'Erro ao buscar templates', message: err.message });
        } else {
          resolve(rows);
        }
      });
    });
  });
  
  // Buscar templates no GitHub
  ipcMain.handle('search-github', async (event, query) => {
    try {
      const response = await axios.get(`https://api.github.com/search/repositories`, {
        params: {
          q: `zabbix template ${query}`,
          sort: 'stars',
          order: 'desc'
        }
      });
      
      return response.data.items.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        url: item.html_url,
        stars: item.stargazers_count
      }));
    } catch (error) {
      return { error: 'Erro ao buscar no GitHub', message: error.message };
    }
  });
  
  // Exportar template
  ipcMain.handle('export-template', async (event, templateId) => {
    return new Promise((resolve, reject) => {
      // Buscar template no banco de dados
      db.get('SELECT * FROM templates WHERE id = ?', [templateId], async (err, template) => {
        if (err || !template) {
          reject({ error: 'Template não encontrado', message: err ? err.message : 'ID inválido' });
          return;
        }
        
        // Determinar a extensão correta com base no formato do template
        const fileFormat = template.format || 'xml';
        const fileExt = fileFormat === 'yaml' ? '.yaml' : '.xml';
        
        // Definir o local para salvar o arquivo exportado
        const result = await dialog.showSaveDialog(mainWindow, {
          title: 'Exportar Template',
          defaultPath: path.join(app.getPath('documents'), `${template.name}${fileExt}`),
          filters: [
            { name: 'Todos os formatos', extensions: ['xml', 'yaml', 'yml'] },
            { name: 'XML', extensions: ['xml'] },
            { name: 'YAML', extensions: ['yaml', 'yml'] }
          ]
        });
        
        if (!result.canceled && result.filePath) {
          // Se for um template local, só copie o arquivo
          if (template.source === 'local' && template.file_path) {
            try {
              fs.copyFileSync(template.file_path, result.filePath);
              resolve({ success: true, path: result.filePath });
            } catch (error) {
              reject({ error: 'Erro ao exportar o arquivo', message: error.message });
            }
          } else {
            // Para templates baixados do GitHub, o conteúdo já deve estar no banco
            // ou em algum local temporário - dependendo da implementação
            reject({ error: 'Operação não implementada para templates do GitHub' });
          }
        } else {
          resolve({ canceled: true });
        }
      });
    });
  });
  
  // Importar template do GitHub
  ipcMain.handle('import-from-github', async (event, repoUrl) => {
    try {
      console.log(`Iniciando busca em: ${repoUrl}`);
      
      // Validar URL do GitHub
      const urlParts = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
      if (!urlParts || urlParts.length < 3) {
        return { error: 'URL inválida', message: 'URL do repositório GitHub não reconhecida' };
      }
      
      const owner = urlParts[1];
      const repo = urlParts[2].replace(/\.git$/, '');
      
      // Configurar autenticação para API GitHub
      // NOTA: Este é um token temporário apenas para testes
      // Em ambiente de produção, use variáveis de ambiente ou um sistema de armazenamento seguro
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      const TEMP_TOKEN = 'ghp_HMhFQ7aLdkgcpvJ7YSN0R3fpQRRBbf2FnHVZ';
      
      if (TEMP_TOKEN) {
        headers['Authorization'] = `token ${TEMP_TOKEN}`;
        console.log('Usando token para autenticação GitHub');
      } else {
        console.warn('Nenhum token GitHub configurado - limite de requisições será baixo');
      }
      
      // Abordagem alternativa se a busca não funcionar: tentar buscar o conteúdo do repositório diretamente
      const repoContentUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
      console.log(`Buscando conteúdo do repositório em: ${repoContentUrl}`);
      
      try {
        const contentResponse = await axios.get(repoContentUrl, { headers });
        if (contentResponse.data && Array.isArray(contentResponse.data)) {
          const files = contentResponse.data
            .filter(item => {
              if (item.type !== 'file') return false;
              const ext = path.extname(item.name).toLowerCase();
              return ['.xml', '.yaml', '.yml'].includes(ext);
            })
            .map(item => ({
              name: item.name,
              path: item.path,
              api_url: item.url,
              sha: item.sha
            }));
            
          if (files.length > 0) {
            console.log(`Encontrados ${files.length} arquivos diretamente no repositório`);
            
            // Se encontrou múltiplos arquivos, pedir para o usuário selecionar
            if (files.length > 1) {
              console.log('Múltiplos arquivos encontrados, retornando para seleção do usuário');
              const fileOptions = files.map(file => {
                const ext = path.extname(file.name).toLowerCase();
                return {
                  name: file.name,
                  path: file.path,
                  api_url: file.url, // Usar a URL retornada direto da API
                  format: (ext === '.xml') ? 'XML' : 'YAML'
                };
              });
              
              return { filesToSelect: fileOptions, repoUrl };
            }
            
            // Se encontrou apenas um arquivo, baixa e importa diretamente
            console.log('Apenas um arquivo encontrado, baixando:', files[0].name);
            return await importAndProcessSelectedFile(
              files[0].api_url, 
              files[0].name,
              repoUrl, 
              headers
            );
          }
        }
      } catch (contentError) {
        console.error('Erro ao buscar conteúdo do repositório:', contentError.message);
        // Continue para a próxima abordagem
      }
      
      // Buscar arquivos XML e YAML no repositório usando Search API (com retry em diferentes formatos)
      const extensions = ['xml', 'yaml', 'yml'];
      let templateFiles = [];
      let authError = false;
      
      for (const ext of extensions) {
        try {
          const searchQuery = `filename:*.${ext}+repo:${owner}/${repo}`;
          console.log(`Buscando arquivos .${ext} com query: ${searchQuery}`);
          
          const response = await axios.get('https://api.github.com/search/code', {
            params: { q: searchQuery },
            headers
          });
          
          if (response.data && response.data.items && response.data.items.length > 0) {
            const files = response.data.items.map(item => ({
              name: item.name,
              path: item.path,
              api_url: item.url,
              sha: item.sha
            }));
            
            templateFiles.push(...files);
            console.log(`Encontrados ${files.length} arquivos .${ext}`);
          }
        } catch (error) {
          console.error(`Erro ao buscar .${ext}:`, error.message);
          if (error.response && error.response.status === 401) {
            authError = true;
          }
        }
      }
      
      // Se não encontrou arquivos
      if (templateFiles.length === 0) {
        if (authError) {
          return { 
            error: 'Erro de autenticação', 
            message: 'Não foi possível autenticar com a API do GitHub. Limite de requisições excedido.' 
          };
        }
        
        // Tentar uma última abordagem - buscar padrões comuns de diretórios
        const commonPaths = [
          'templates', 'zabbix', 'monitoring', 'config', 'configs',
          'xml', 'yaml', 'yml', 'scripts', 'docs'
        ];
        
        for (const commonPath of commonPaths) {
          try {
            const pathUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${commonPath}`;
            console.log(`Tentando caminho comum: ${commonPath}`);
            
            const pathResponse = await axios.get(pathUrl, { headers });
            if (pathResponse.data && Array.isArray(pathResponse.data)) {
              const files = pathResponse.data
                .filter(item => {
                  if (item.type !== 'file') return false;
                  const ext = path.extname(item.name).toLowerCase();
                  return ['.xml', '.yaml', '.yml'].includes(ext);
                })
                .map(item => ({
                  name: item.name,
                  path: item.path,
                  api_url: item.url,
                  sha: item.sha
                }));
                
              if (files.length > 0) {
                templateFiles.push(...files);
                console.log(`Encontrados ${files.length} arquivos em /${commonPath}`);
              }
            }
          } catch (pathError) {
            // Ignorar erros de caminhos específicos
          }
        }
        
        // Se ainda não encontrou arquivos após todas as abordagens
        if (templateFiles.length === 0) {
          return { 
            error: 'Nenhum template encontrado', 
            message: 'Não foram encontrados arquivos .xml, .yaml ou .yml neste repositório' 
          };
        }
      }
      
      // Remover duplicatas por SHA
      templateFiles = Array.from(new Map(templateFiles.map(file => [file.sha, file])).values());
      console.log(`Total de ${templateFiles.length} arquivos únicos encontrados`);
      
      // Se encontrou múltiplos arquivos, pedir para o usuário selecionar
      if (templateFiles.length > 1) {
        console.log('Múltiplos arquivos encontrados, retornando para seleção do usuário');
        const fileOptions = templateFiles.map(file => {
          const ext = path.extname(file.name).toLowerCase();
          return {
            name: file.name,
            path: file.path,
            api_url: file.api_url,
            format: (ext === '.xml') ? 'XML' : 'YAML'
          };
        });
        
        return { filesToSelect: fileOptions, repoUrl };
      }
      
      // Se encontrou apenas um arquivo, baixa e importa diretamente
      console.log('Apenas um arquivo encontrado, baixando:', templateFiles[0].name);
      return await importAndProcessSelectedFile(
        templateFiles[0].api_url, 
        templateFiles[0].name, 
        repoUrl, 
        headers
      );
    } catch (error) {
      console.error('Erro ao importar do GitHub:', error);
      let errorMessage = 'Erro desconhecido ao importar do GitHub';
      
      if (error.response) {
        const status = error.response.status;
        errorMessage = `Erro na API GitHub (${status}): ${error.response.data?.message || 'Erro de comunicação'}`;
        
        if (status === 403) {
          errorMessage = 'Limite de requisições do GitHub excedido. Tente novamente mais tarde.';
        } else if (status === 404) {
          errorMessage = 'Repositório ou arquivo não encontrado no GitHub.';
        } else if (status === 401) {
          errorMessage = 'Erro de autenticação com o GitHub. Token inválido ou expirado.';
        }
      } else if (error.request) {
        errorMessage = 'Erro de rede. Verifique sua conexão com a internet.';
      }
      
      return { error: 'Falha na importação', message: errorMessage };
    }
  });
  
  // NOVO HANDLER: Importa um arquivo específico selecionado pelo usuário
  ipcMain.handle('import-selected-github-file', async (event, fileApiUrl, fileName, originalRepoUrl) => {
    console.log(`Iniciando importação do arquivo selecionado: ${fileName}`);
    try {
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      const githubToken = process.env.GITHUB_TOKEN;
      
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }
      
      return await importAndProcessSelectedFile(fileApiUrl, fileName, originalRepoUrl, headers);
    } catch (error) {
      console.error(`Erro ao importar arquivo selecionado (${fileName}):`, error);
      let errorMessage = 'Erro desconhecido ao importar arquivo';
      
      if (error.response) {
        errorMessage = `Erro na API GitHub (${error.response.status}): ${error.response.data?.message || 'Erro de comunicação'}`;
      } else if (error.request) {
        errorMessage = 'Erro de rede. Verifique sua conexão com a internet.';
      }
      
      return { error: 'Falha na importação', message: errorMessage };
    }
  });

  // FUNÇÃO AUXILIAR: Baixa e processa um arquivo específico
  async function importAndProcessSelectedFile(fileApiUrl, fileName, repoUrl, headers) {
    try {
      console.log("Baixando conteúdo de:", fileApiUrl);
      
      // Configurar headers específicos para baixar conteúdo raw
      const downloadHeaders = { 
        ...headers, 
        'Accept': 'application/vnd.github.v3.raw' 
      };
      
      // Fazer requisição para baixar o arquivo
      const contentResponse = await axios.get(fileApiUrl, { headers: downloadHeaders });
      const fileContent = contentResponse.data;
      
      // Salvar arquivo temporariamente
      const tempDir = path.join(app.getPath('temp'), 'templix-imports');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const uniqueFilename = `${Date.now()}-${fileName}`;
      const tempPath = path.join(tempDir, uniqueFilename);
      
      // Converter para string se for objeto
      const contentToWrite = typeof fileContent === 'object' 
        ? JSON.stringify(fileContent, null, 2) 
        : fileContent;
        
      fs.writeFileSync(tempPath, contentToWrite);
      console.log("Arquivo salvo temporariamente em:", tempPath);
      
      // Determinar tipo de arquivo
      const fileExt = path.extname(fileName).toLowerCase();
      const isXml = fileExt === '.xml';
      
      return new Promise((resolve, reject) => {
        try {
          if (isXml) {
            // Processar XML
            parseString(fileContent, { explicitArray: false }, (err, result) => {
              if (err) {
                fs.unlinkSync(tempPath);
                return reject({ error: 'Erro ao analisar XML', message: err.message });
              }
              
              processTemplateData(result, 'xml', tempPath, repoUrl, fileName, resolve, reject);
            });
          } else {
            // Processar YAML
            try {
              const yamlData = yaml.load(fileContent);
              processTemplateData(yamlData, 'yaml', tempPath, repoUrl, fileName, resolve, reject);
            } catch (yamlError) {
              fs.unlinkSync(tempPath);
              reject({ error: 'Erro ao analisar YAML', message: yamlError.message });
            }
          }
        } catch (processingError) {
          fs.unlinkSync(tempPath);
          reject({ error: 'Erro ao processar arquivo', message: processingError.message });
        }
      });
    } catch (downloadError) {
      console.error("Erro ao baixar arquivo:", downloadError);
      throw downloadError;
    }
  }

  // Função para extrair dados e salvar template no banco de dados
  function processTemplateData(data, format, tempPath, repoUrl, originalFileName, resolve, reject) {
    try {
      // Verificar estrutura do template
      if (!data || !data.zabbix_export) {
        throw new Error(`Estrutura de arquivo inválida: 'zabbix_export' não encontrado`);
      }
      
      const zabbixExport = data.zabbix_export;
      let templateName, templateVersion, templateDescription;
      
      // Tentar extrair template de diferentes estruturas possíveis
      if (zabbixExport.templates) {
        // Manipular diferentes estruturas de templates no XML/YAML
        const templates = Array.isArray(zabbixExport.templates) 
          ? zabbixExport.templates[0] 
          : zabbixExport.templates;
        
        if (!templates) {
          throw new Error("Estrutura de template inválida");
        }
        
        // Tentar extrair nome do template de diferentes formatos de dados
        if (templates.template) {
          templateName = Array.isArray(templates.template) ? templates.template[0] : templates.template;
        } else if (templates.name) {
          templateName = templates.name;
        } else {
          throw new Error("Nome do template não encontrado");
        }
        
        // Extrair descrição
        templateDescription = templates.description || '';
        if (Array.isArray(templateDescription)) {
          templateDescription = templateDescription[0] || '';
        }
      } else {
        // Fallback para nome do arquivo
        templateName = path.basename(originalFileName, path.extname(originalFileName));
        templateDescription = '';
      }
      
      // Versão do Zabbix
      templateVersion = zabbixExport.version || 'N/A';
      if (Array.isArray(templateVersion)) {
        templateVersion = templateVersion[0] || 'N/A';
      }
      
      // Verificar se o template já existe
      db.get('SELECT id FROM templates WHERE name = ?', [templateName], (err, row) => {
        if (err) {
          fs.unlinkSync(tempPath);
          return reject({ error: 'Erro ao verificar template', message: err.message });
        }
        
        if (row) {
          // Template já existe
          fs.unlinkSync(tempPath);
          return resolve({ 
            skipped: true, 
            reason: 'duplicate', 
            name: templateName 
          });
        }
        
        // Preparar dados para salvar
        const templateData = {
          name: templateName,
          version: templateVersion,
          description: templateDescription,
          filePath: tempPath,
          source: 'github',
          repoUrl: repoUrl,
          format: format
        };
        
        // Salvar no banco de dados
        db.run(
          `INSERT INTO templates (name, version, description, file_path, source, format) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            templateData.name, 
            templateData.version, 
            templateData.description, 
            templateData.filePath, 
            templateData.source, 
            templateData.format
          ],
          function(err) {
            if (err) {
              fs.unlinkSync(tempPath);
              reject({ error: 'Erro ao salvar', message: err.message });
            } else {
              console.log(`Template "${templateName}" importado com sucesso (ID: ${this.lastID})`);
              templateData.id = this.lastID;
              resolve({ success: true, ...templateData });
            }
          }
        );
      });
      
    } catch (error) {
      console.error("Erro ao processar dados do template:", error);
      
      // Tentar salvar mesmo com erro, usando nome do arquivo
      const fallbackName = path.basename(originalFileName, path.extname(originalFileName));
      
      db.get('SELECT id FROM templates WHERE name = ?', [fallbackName], (err, row) => {
        if (err || row) {
          fs.unlinkSync(tempPath);
          return reject({ 
            error: 'Erro no processamento', 
            message: error.message 
          });
        }
        
        const fallbackData = {
          name: fallbackName,
          version: 'N/A',
          description: `Importado com avisos: ${error.message}`,
          filePath: tempPath,
          source: 'github',
          format: format
        };
        
        db.run(
          `INSERT INTO templates (name, version, description, file_path, source, format) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            fallbackData.name, 
            fallbackData.version, 
            fallbackData.description, 
            fallbackData.filePath, 
            'github', 
            format
          ],
          function(err) {
            if (err) {
              fs.unlinkSync(tempPath);
              reject({ error: 'Erro ao salvar', message: err.message });
            } else {
              console.log(`Template salvo com nome alternativo: ${fallbackName}`);
              fallbackData.id = this.lastID;
              fallbackData.warning = error.message;
              resolve({ success: true, ...fallbackData });
            }
          }
        );
      });
    }
  }

  // Converter template entre formatos XML e YAML
  ipcMain.handle('convert-template-format', async (event, options) => {
    try {
      const { templateId, targetFormat } = options;
      
      if (!templateId || !targetFormat || !['xml', 'yaml'].includes(targetFormat.toLowerCase())) {
        return { 
          error: 'Parâmetros inválidos', 
          message: 'ID do template e formato alvo (xml ou yaml) são obrigatórios' 
        };
      }
      
      // Buscar o template no banco de dados
      const template = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM templates WHERE id = ?', [templateId], (err, row) => {
          if (err) {
            reject(err);
          } else if (!row) {
            reject(new Error('Template não encontrado'));
          } else {
            resolve(row);
          }
        });
      });
      
      // Verificar se o template já está no formato desejado
      if (template.format.toLowerCase() === targetFormat.toLowerCase()) {
        return { 
          warning: 'Conversão desnecessária', 
          message: `O template já está no formato ${targetFormat.toUpperCase()}` 
        };
      }
      
      // Ler o conteúdo do arquivo original
      const fileContent = fs.readFileSync(template.file_path, 'utf8');
      
      // Converter para o formato desejado
      let convertedContent;
      let convertedFileName;
      
      if (template.format.toLowerCase() === 'xml' && targetFormat.toLowerCase() === 'yaml') {
        // Converter de XML para YAML
        convertedContent = await convertXmlToYaml(fileContent);
        convertedFileName = path.basename(template.file_path, '.xml') + '.yaml';
      } else if (template.format.toLowerCase() === 'yaml' && targetFormat.toLowerCase() === 'xml') {
        // Converter de YAML para XML
        convertedContent = await convertYamlToXml(fileContent);
        convertedFileName = path.basename(template.file_path, path.extname(template.file_path)) + '.xml';
      } else {
        return { 
          error: 'Conversão não suportada', 
          message: `Conversão de ${template.format} para ${targetFormat} não é suportada` 
        };
      }
      
      // Perguntar onde salvar o arquivo convertido
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: `Salvar como ${targetFormat.toUpperCase()}`,
        defaultPath: path.join(path.dirname(template.file_path), convertedFileName),
        filters: [
          { name: 'Todos os Arquivos', extensions: ['*'] },
          { name: targetFormat.toUpperCase(), extensions: [targetFormat.toLowerCase()] }
        ]
      });
      
      if (saveResult.canceled) {
        return { canceled: true };
      }
      
      // Salvar o arquivo convertido
      fs.writeFileSync(saveResult.filePath, convertedContent);
      
      // Perguntar se deseja importar o template convertido
      const importResult = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Importar Template Convertido',
        message: 'Deseja importar o template convertido para o Templix?',
        buttons: ['Sim', 'Não'],
        defaultId: 0
      });
      
      if (importResult.response === 0) {
        // Importar o template convertido
        const templateExists = (name) => {
          return new Promise((resolve, reject) => {
            db.get('SELECT id FROM templates WHERE name = ?', [template.name + ` (${targetFormat.toUpperCase()})` ], (err, row) => {
              if (err) {
                reject(err);
              } else {
                resolve(!!row);
              }
            });
          });
        };
        
        const exists = await templateExists(template.name);
        if (!exists) {
          const newTemplate = {
            name: template.name + ` (${targetFormat.toUpperCase()})`,
            version: template.version,
            description: template.description,
            filePath: saveResult.filePath,
            source: 'local',
            format: targetFormat.toLowerCase()
          };
          
          await new Promise((resolve, reject) => {
            saveTemplateToDb(db, newTemplate, resolve, reject);
          });
        }
      }
      
      return { 
        success: true, 
        path: saveResult.filePath, 
        imported: importResult.response === 0 
      };
    } catch (error) {
      console.error('Erro ao converter formato do template:', error);
      return { 
        error: 'Erro ao converter formato do template', 
        message: error.message 
      };
    }
  });

  // Função para converter XML para YAML
  async function convertXmlToYaml(xmlContent) {
    return new Promise((resolve, reject) => {
      parseString(xmlContent, (err, result) => {
        if (err) {
          reject(new Error(`Erro ao analisar XML: ${err.message}`));
        } else {
          try {
            // Converter JSON para YAML
            const yamlContent = yaml.dump(result, {
              indent: 2,
              lineWidth: 120,
              noRefs: true,
              sortKeys: false
            });
            resolve(yamlContent);
          } catch (error) {
            reject(new Error(`Erro ao converter para YAML: ${error.message}`));
          }
        }
      });
    });
  }

  // Função para converter YAML para XML
  async function convertYamlToXml(yamlContent) {
    try {
      // Analisar YAML para JavaScript object
      const data = yaml.load(yamlContent);
      
      // Converter JavaScript object para XML (formato string)
      const builder = require('xmlbuilder');
      const xmlObj = builder.create(data, { encoding: 'utf-8' });
      const xmlContent = xmlObj.end({ pretty: true, indent: '  ', newline: '\n' });
      
      return xmlContent;
    } catch (error) {
      throw new Error(`Erro ao converter para XML: ${error.message}`);
    }
  }

  // Deletar template
  ipcMain.handle('delete-template', async (event, templateId) => {
    if (!templateId) {
      return { error: 'ID inválido', message: 'É necessário informar o ID do template' };
    }

    try {
      // Buscar informações do template antes de excluir (para verificar se existe)
      const template = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM templates WHERE id = ?', [templateId], (err, row) => {
          if (err) {
            reject(err);
          } else if (!row) {
            reject(new Error('Template não encontrado'));
          } else {
            resolve(row);
          }
        });
      });
      
      // Excluir o template
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM templates WHERE id = ?', [templateId], function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes === 0) {
              reject(new Error('Nenhum template foi excluído'));
            } else {
              resolve(true);
            }
          }
        });
      });
      
      return { 
        success: true, 
        message: `Template "${template.name}" excluído com sucesso` 
      };
    } catch (error) {
      console.error('Erro ao excluir template:', error);
      return { 
        error: 'Erro ao excluir template', 
        message: error.message
      };
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
}); 