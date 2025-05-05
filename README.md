# Templix - Gerenciador de Templates Zabbix

Templix é um aplicativo desktop para gerenciar, visualizar, buscar, importar e exportar templates do Zabbix. Desenvolvido com Electron e React, permite organizar e converter templates entre os formatos XML e YAML.

## Funcionalidades

- **Gerenciamento de Templates Locais**
  - Importar arquivos de templates do Zabbix em formato XML e YAML
  - Ordenar templates por nome, versão, formato ou origem
  - Exportar templates para formatos XML ou YAML
  - Converter templates entre formatos (XML ↔ YAML)

- **Visualização e Filtragem**
  - Listar todos os templates com detalhes
  - Busca por nome ou versão
  - Visualizar detalhes do template selecionado
  - Atualizar a lista com um clique

- **Integração com GitHub**
  - Buscar templates públicos no GitHub
  - Visualizar nome, descrição e estrelas
  - Importar diretamente do GitHub (suporte para arquivos XML e YAML)

## Tecnologias

- **Interface Gráfica**: Electron + React
- **Banco de Dados**: SQLite para armazenamento local
- **API GitHub**: Axios para comunicação
- **Parsing XML**: xml2js
- **Parsing YAML**: js-yaml

## Suporte a Formatos

Templix suporta os seguintes formatos de templates Zabbix:

- **XML**: formato tradicional usado em todas as versões do Zabbix
- **YAML**: formato introduzido no Zabbix 6.0, com sintaxe mais limpa e legível

## Instalação

1. Clone o repositório
   ```
   git clone https://github.com/rusthp/templix.git
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

## Desenvolvimento

Para iniciar o ambiente de desenvolvimento:

```
npm start
```

Este comando inicia o servidor React e o aplicativo Electron simultaneamente.

## Build

Para criar um executável:

```
npm run build
```

Os arquivos de saída serão gerados na pasta `dist`.


## Contribuição

Contribuições são bem-vindas! Para contribuir:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença ISC.

## Autor

- Desenvolvido por [rusthp](https://github.com/rusthp) 