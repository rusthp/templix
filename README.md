# Templix - Gerenciador de Templates Zabbix

Templix é um aplicativo desktop para gerenciar, visualizar, buscar, importar e exportar templates do Zabbix.

## Funcionalidades

- **Gerenciamento de Templates Locais**
  - Importar arquivos de templates do Zabbix em formato XML e YAML
  - Armazenar dados localmente (nome, versão, descrição, caminho do arquivo)
  - Exportar templates para XML ou YAML

- **Visualização e Filtragem**
  - Listar todos os templates com detalhes
  - Busca por nome ou versão
  - Visualizar descrição/resumo

- **Integração com GitHub**
  - Buscar templates públicos no GitHub
  - Visualizar nome, descrição e estrelas
  - Importar diretamente do GitHub (suporte para arquivos XML e YAML)

## Tecnologias

- **Interface Gráfica**: Electron + React
- **Banco de Dados**: SQLite
- **API GitHub**: Axios
- **Parsing XML**: xml2js
- **Parsing YAML**: js-yaml

## Suporte a Formatos

Templix suporta os seguintes formatos de templates Zabbix:

- **XML**: formato tradicional usado em todas as versões do Zabbix
- **YAML**: formato introduzido no Zabbix 6.0, com sintaxe mais limpa e legível

## Instalação

1. Clone o repositório
   ```
   git clone https://github.com/seu-usuario/templix.git
   cd templix
   ```

2. Instale as dependências
   ```
   npm install
   ```

3. Execute o aplicativo
   ```
   npm start
   ```

## Build

Para criar um executável:

```
npm run build
```

Os arquivos de saída serão gerados na pasta `dist`.

## Capturas de Tela

*[Capturas de tela serão adicionadas futuramente]*

## Licença

Este projeto está licenciado sob a licença ISC.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou enviar pull requests. 