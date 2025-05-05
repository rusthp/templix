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
      // Obter o nome do repositório do URL
      const repoName = repoUrl.split('/').pop();
      const apiUrl = repoUrl.replace('github.com', 'api.github.com/repos') + '/contents';
      
      // Buscar arquivos do repositório
      const response = await axios.get(apiUrl);
      
      // Procurar arquivos XML e YAML
      const templateFiles = response.data.filter(file => 
        (file.name.toLowerCase().endsWith('.xml') || 
         file.name.toLowerCase().endsWith('.yaml') || 
         file.name.toLowerCase().endsWith('.yml')) && 
        file.type === 'file'
      );
      
      if (templateFiles.length === 0) {
        return { error: 'Nenhum arquivo de template (XML/YAML) encontrado no repositório' };
      }
      
      // Se encontrou mais de um arquivo de template, perguntar qual o usuário quer
      let selectedFile;
      if (templateFiles.length > 1) {
        const fileOptions = templateFiles.map(file => {
          // Extrair extensão para determinar o formato
          const ext = path.extname(file.name).toLowerCase();
          const format = (ext === '.xml') ? 'XML' : 'YAML';
          
          return {
            name: file.name,
            url: file.download_url,
            info: `${file.name} (${format})`
          };
        });
        
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Selecionar Template',
          message: 'Múltiplos arquivos de template encontrados:',
          detail: 'Selecione o arquivo que deseja importar. Se não tiver certeza, escolha o arquivo mais recente ou com o nome mais específico.',
          buttons: fileOptions.map(file => file.info),
          cancelId: -1,
          noLink: true
        });
        
        if (result.response === -1) {
          return { canceled: true };
        }
        
        selectedFile = fileOptions[result.response];
      } else {
        selectedFile = {
          name: templateFiles[0].name,
          url: templateFiles[0].download_url
        };
      }
      
      // Determinar formato do arquivo
      const fileExt = path.extname(selectedFile.name).toLowerCase();
      const isXml = fileExt === '.xml';
      
      // Baixar o conteúdo do arquivo
      const fileResponse = await axios.get(selectedFile.url);
      const fileContent = fileResponse.data;
      
      // Salvar o arquivo temporariamente
      const tempPath = path.join(app.getPath('temp'), selectedFile.name);
      fs.writeFileSync(tempPath, typeof fileContent === 'object' ? JSON.stringify(fileContent) : fileContent);
      
      // Processar o XML ou YAML
      return new Promise((resolve, reject) => {
        if (isXml) {
          // Processar XML
          parseString(fileContent, (err, result) => {
            if (err) {
              reject({ error: 'Erro ao analisar XML', message: err.message });
            } else {
              processTemplateData(result, 'xml');
            }
          });
        } else {
          // Processar YAML
          try {
            const yamlData = yaml.load(fileContent);
            processTemplateData(yamlData, 'yaml');
          } catch (error) {
            reject({ error: 'Erro ao analisar YAML', message: error.message });
          }
        }
        
        // Função interna para processar os dados extraídos e salvar no banco
        function processTemplateData(data, format) {
          try {
            let templateData = {};
            
            if (format === 'xml') {
              const zabbixExport = data.zabbix_export;
              const templates = zabbixExport.templates[0];
              
              // Corrigir a extração do nome do template
              let templateName = '';
              if (templates.template && templates.template[0]) {
                // Se for string diretamente
                if (typeof templates.template[0] === 'string') {
                  templateName = templates.template[0];
                } 
                // Se for um objeto com propriedade _
                else if (templates.template[0]._ && typeof templates.template[0]._ === 'string') {
                  templateName = templates.template[0]._;
                }
                // Se for um objeto com propriedade name
                else if (templates.template[0].name && typeof templates.template[0].name === 'string') {
                  templateName = templates.template[0].name;
                }
                // Usar o nome do arquivo como último recurso
                else {
                  templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
                }
              } else if (templates.name) {
                // Alguns formatos usam 'name' diretamente
                templateName = templates.name;
              } else {
                // Fallback para o nome do arquivo
                templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
              }

              // Se ainda assim for um objeto, use o nome do arquivo
              if (typeof templateName === 'object') {
                templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
              }
              
              templateData = {
                name: templateName,
                version: zabbixExport.version ? (typeof zabbixExport.version[0] === 'string' ? zabbixExport.version[0] : 'N/A') : 'N/A',
                description: templates.description ? (typeof templates.description[0] === 'string' ? templates.description[0] : '') : '',
                filePath: tempPath,
                source: 'github',
                repoUrl: repoUrl,
                format: 'xml'
              };
            } else {
              // YAML
              const templates = data.zabbix_export.templates[0] || data.zabbix_export.templates;
              
              // Corrigir a extração do nome do template de YAML
              let templateName = '';
              if (templates.template) {
                // Se for string diretamente
                if (typeof templates.template === 'string') {
                  templateName = templates.template;
                } 
                // Se for um array
                else if (Array.isArray(templates.template) && templates.template.length > 0) {
                  templateName = typeof templates.template[0] === 'string' ? templates.template[0] : 'Template';
                }
                // Se for um objeto
                else if (typeof templates.template === 'object') {
                  templateName = templates.template.name || 'Template';
                }
              } else if (templates.name) {
                // Alguns formatos usam 'name' diretamente
                templateName = templates.name;
              } else {
                // Fallback para o nome do arquivo
                templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
              }

              // Se ainda assim for um objeto, use o nome do arquivo
              if (typeof templateName === 'object') {
                templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
              }
              
              templateData = {
                name: templateName,
                version: typeof data.zabbix_export.version === 'string' ? data.zabbix_export.version : 'N/A',
                description: typeof templates.description === 'string' ? templates.description : '',
                filePath: tempPath,
                source: 'github',
                repoUrl: repoUrl,
                format: 'yaml'
              };
            }
            
            // Salvar no banco de dados
            saveTemplateToDb(db, templateData, resolve, reject);
          } catch (error) {
            console.error("Erro ao processar dados do template:", error);
            // Em caso de erro, usar nome do arquivo para o template
            const templateName = path.basename(selectedFile.name, path.extname(selectedFile.name));
            
            const templateData = {
              name: templateName,
              version: 'N/A',
              description: 'Erro ao processar detalhes do template',
              filePath: tempPath,
              source: 'github',
              repoUrl: repoUrl,
              format: fileExt === '.xml' ? 'xml' : 'yaml'
            };
            
            // Salvar com dados básicos
            saveTemplateToDb(db, templateData, resolve, reject);
          }
        }
      });
    } catch (error) {
      return { error: 'Erro ao importar do GitHub', message: error.message };
    }
  });
  
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