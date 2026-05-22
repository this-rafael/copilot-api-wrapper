# PRD: Copilot API Wrapper

**Data**: 2026-05-21  
**Status**: Documento de produto derivado do estado atual do repositório  
**Produto**: `copilot-api-wrapper`  
**Escopo primário**: backend WebSocket + frontend mobile-first para operar o GitHub Copilot CLI remotamente pelo navegador

---

## 1. Resumo executivo

O `copilot-api-wrapper` transforma o GitHub Copilot CLI, originalmente centrado em um terminal local, em uma experiência remota acessível por navegador. O produto combina um servidor Node.js que cria sessões PTY reais do Copilot CLI com um cliente React/Vite mobile-first que renderiza o terminal com xterm.js, envia input por WebSocket e oferece controles pensados para celular e tablet.

O objetivo do produto não é substituir o Copilot CLI nem criar uma API oficial para o Copilot. A proposta é criar uma camada operacional: abrir, controlar e encerrar sessões do CLI a partir de outro dispositivo, com guardrails de workspace, autenticação por token compartilhado, renderização ANSI real e uma UX que reduz o atrito de usar terminal em telas pequenas.

Em termos práticos, o app permite que um desenvolvedor use o Copilot CLI rodando em uma máquina host a partir do navegador de um celular, tablet ou desktop, desde que o host esteja configurado com o CLI autenticado e o workspace remoto esteja permitido.

---

## 2. O que este app é

O app é um wrapper remoto para o GitHub Copilot CLI. Ele expõe o processo do CLI por meio de uma ponte WebSocket autenticada e entrega uma interface web que se comporta como um terminal real, não como uma caixa de texto simulada.

Ele é composto por três partes principais:

| Parte                 | Descrição                                      | Responsabilidade                                                                                     |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend WebSocket     | Servidor Node.js/TypeScript na raiz do projeto | Autenticar conexões, validar workspaces, criar PTYs, gerenciar sessões e transmitir input/output     |
| Frontend mobile-first | SPA React/Vite em `client/`                    | Conectar ao backend, listar workspaces, iniciar sessões, renderizar terminal, facilitar input mobile |
| Persistência local    | SQLite via `sql.js`                            | Persistir workspaces customizados adicionados pela UI                                                |

Há também um pacote auxiliar em `packages/open-port-to-lan-mcp/`. Ele é um servidor MCP Windows separado que abre portas locais na LAN via Windows Firewall por tempo limitado. Ele apoia cenários de acesso mobile na mesma rede, mas não faz parte do fluxo principal de sessão Copilot.

---

## 3. O que este app faz

### 3.1 Capacidades principais

| Capacidade                 | Resultado para o usuário                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Terminal remoto do Copilot | O usuário opera o Copilot CLI do host a partir de um navegador                                                       |
| Sessão PTY real            | O output ANSI, o cursor e o comportamento de terminal são preservados por `node-pty` e xterm.js                      |
| WebSocket bidirecional     | Input, output, resize, fechamento de sessão e busca de contexto trafegam em tempo real                               |
| Autenticação simples       | O servidor exige `WS_AUTH_TOKEN` via `Authorization: Bearer` ou `?token=`                                            |
| Guardrails de workspace    | O backend só cria sessões em caminhos absolutos permitidos por `ALLOWED_CWDS` ou workspaces customizados persistidos |
| Workspaces customizados    | A UI pode cadastrar diretórios existentes no host e persisti-los em SQLite                                           |
| Perfis de comando          | O usuário escolhe entre `copilot-interactive` e `gh-copilot-suggest`                                                 |
| Busca de contexto          | O cliente pesquisa `@file`, `@folder` e `@workspace` dentro do workspace da sessão                                   |
| UX mobile                  | A aplicação oferece quick actions, composer, modo raw, resize com viewport mobile, temas e ajuste de fonte           |
| Histórico copiável         | O frontend extrai linhas visíveis do buffer do terminal para facilitar cópia de output                               |

### 3.2 Fluxo de uso esperado

1. O operador inicia o backend em uma máquina com Node.js, `pnpm`, Copilot CLI autenticado e `WS_AUTH_TOKEN` configurado.
2. O operador inicia o frontend Vite ou serve o build estático do cliente por uma estratégia externa.
3. O usuário abre a UI no navegador, informa URL WebSocket e token.
4. A UI conecta ao backend e carrega a lista de workspaces permitidos.
5. O usuário escolhe um workspace permitido ou adiciona um workspace customizado existente no host.
6. O usuário seleciona o perfil de comando e inicia a sessão.
7. O backend cria um PTY no `cwd` validado, executa o Copilot CLI ou GitHub CLI Copilot e retorna `session.ready`.
8. O frontend libera o input quando detecta output de prontidão do CLI.
9. O usuário interage com o terminal, envia prompts, usa comandos rápidos, menções e copia trechos do output.
10. Ao encerrar a sessão ou fechar o socket, o backend mata o PTY e remove a sessão do gerenciador.

---

## 4. O que este app não faz

Este produto tem fronteiras importantes. Elas são parte do desenho atual, não apenas ausência acidental de telas.

| Fora do escopo                                     | Implicação                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Não é uma API oficial do GitHub Copilot            | O sistema opera o CLI como processo de terminal; não chama endpoints privados do Copilot                     |
| Não autentica o usuário no GitHub                  | O host precisa ter `copilot` ou `gh copilot` instalado e autenticado previamente                             |
| Não substitui licenciamento do Copilot             | O usuário continua dependendo de uma conta/plano que permita uso do Copilot CLI                              |
| Não é um SaaS multi-tenant                         | O modelo atual é local/LAN/self-hosted, com token compartilhado simples                                      |
| Não fornece TLS, domínio ou reverse proxy          | Segurança de transporte fora de rede confiável depende de `wss://` configurado externamente                  |
| Não cria túnel para internet                       | O pacote MCP auxiliar abre firewall na LAN; ele não proxy, não cria túnel e não publica serviços globalmente |
| Não persiste histórico completo de conversa no app | Preferências e workspaces são persistidos; histórico de terminal é runtime/local e voltado a cópia           |
| Não multiplexa várias sessões em uma mesma UI      | O backend suporta múltiplas sessões globais, mas a interface atual opera uma sessão ativa por fluxo de uso   |
| Não faz busca semântica de código                  | `context.search` pesquisa arquivos e pastas por caminho/nome, não por significado do conteúdo                |
| Não oferece controle granular por arquivo          | A fronteira de segurança é o `cwd` permitido e a allowlist de workspaces                                     |
| Não é PWA offline                                  | A aplicação depende de WebSocket ativo e do CLI rodando no host                                              |
| Não oferece temas customizados arbitrários         | A UI suporta Dracula e VS Code Light                                                                         |

---

## 5. Problema que o produto resolve

Desenvolvedores que usam Copilot CLI precisam operar em um terminal local. Esse fluxo é eficiente no desktop, mas fica ruim quando o usuário quer acompanhar, pedir ajustes ou executar comandos a partir de um celular ou tablet. SSH e terminais mobile resolvem parte do problema, mas exigem setup próprio, têm ergonomia ruim para comandos especiais e não oferecem uma experiência desenhada para prompts, menções e contexto.

O produto resolve esse problema ao colocar uma camada web especializada entre o navegador e o Copilot CLI. Essa camada preserva o comportamento real do terminal, mas adiciona affordances de produto: seleção de workspace, perfis de comando, atalhos de teclas, busca de arquivos/pastas, cópia de output e estados visuais claros.

---

## 6. Público-alvo

### 6.1 Usuário primário

Desenvolvedor individual, power user ou avaliador de ferramentas agentic coding que quer operar o Copilot CLI remotamente em um ambiente controlado, especialmente a partir de dispositivo móvel na mesma rede.

### 6.2 Usuários secundários

| Persona                            | Necessidade                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Desenvolvedor mobile-first         | Acompanhar e interagir com tarefas de CLI sem abrir notebook/desktop                                        |
| Maintainer de projeto local        | Expor uma sessão de trabalho em uma máquina host sem dar acesso amplo ao shell                              |
| Avaliador de ferramentas agenticas | Testar ergonomia, custo-benefício e limites práticos de uso do Copilot CLI em fluxo remoto                  |
| Usuário Windows na LAN             | Usar o pacote MCP auxiliar para liberar temporariamente a porta do backend/frontend para acesso por celular |

---

## 7. Objetivos de produto

| Objetivo                     | Descrição                                           | Indicador de sucesso                                                                      |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Acesso remoto simples        | Permitir abrir sessão Copilot CLI via navegador     | Usuário conecta com URL/token e recebe output real do CLI                                 |
| Boa ergonomia mobile         | Reduzir fricção de usar terminal no celular         | Quick actions, composer, viewport resize e temas tornam o fluxo utilizável em 320px-430px |
| Segurança local previsível   | Evitar exposição irrestrita de filesystem e sessões | `cwd` validado, `MAX_SESSIONS`, timeout e token obrigatório                               |
| Contexto com menos digitação | Facilitar referência a arquivos/pastas              | `@file`, `@folder` e `@workspace` inserem referências relativas ao workspace              |
| Operação transparente        | Deixar claro o estado da conexão e sessão           | UI mostra conexão, criação, erro, reconexão, encerramento e sessão desconectada           |

---

## 8. Requisitos funcionais

### RF-01: Autenticar conexões WebSocket

O backend deve rejeitar clientes sem token ou com token incorreto. O token pode ser enviado por header `Authorization: Bearer <token>` ou por query string `?token=`, permitindo compatibilidade com `new WebSocket()` em browsers.

Critérios de aceite:

- Cliente sem token recebe fechamento com código `4401`.
- Cliente com token inválido é rejeitado.
- Cliente com token correto consegue estabelecer conexão.

### RF-02: Listar workspaces permitidos

O frontend deve solicitar a lista de workspaces após conexão aberta. O backend deve retornar diretórios configurados em `ALLOWED_CWDS` e workspaces customizados persistidos.

Critérios de aceite:

- Lista retorna nome e caminho absoluto de cada workspace.
- Entradas duplicadas são normalizadas.
- A UI impede iniciar sessão sem workspace selecionado.

### RF-03: Adicionar workspace customizado

O usuário deve poder cadastrar um caminho absoluto existente no host. O backend deve validar que o caminho existe e é diretório antes de persistir.

Critérios de aceite:

- Caminho relativo é rejeitado.
- Caminho inexistente é rejeitado.
- Arquivo não diretório é rejeitado.
- Diretório válido passa a aparecer na lista de workspaces.

### RF-04: Criar sessão Copilot

O frontend deve enviar `session.create` com `cwd`, `commandProfile`, `cols` e `rows`. O backend deve validar o `cwd`, respeitar `MAX_SESSIONS`, construir comando e criar o PTY.

Critérios de aceite:

- Sessão válida retorna `session.ready` com `sessionId`.
- `cwd` fora da allowlist retorna `session.error`.
- Limite de sessões retorna erro claro.
- Sessão recebe dimensões iniciais coerentes com o terminal xterm.

### RF-05: Transmitir input e output de terminal

O cliente deve enviar `terminal.input` com `sessionId` e bytes/texto de controle. O backend deve escrever no PTY. O backend deve emitir `terminal.output` para cada chunk de output do PTY.

Critérios de aceite:

- Texto digitado chega ao processo remoto.
- Sequências como setas, `Ctrl+C`, `Tab`, `Esc`, `Ctrl+D`, `Ctrl+L` chegam ao PTY.
- Output ANSI é renderizado no xterm.js.

### RF-06: Redimensionar terminal

O frontend deve recalcular colunas/linhas ao mudar viewport, orientação, fonte ou abertura de teclado virtual e enviar `terminal.resize`.

Critérios de aceite:

- Backend chama resize do PTY.
- UI não deixa o terminal escondido atrás do teclado virtual nos cenários suportados.
- Resize não é enviado sem sessão ativa.

### RF-07: Encerrar sessão

O frontend deve permitir encerramento explícito. O backend também deve encerrar sessão quando o socket fecha, quando o PTY sai ou quando há timeout de inatividade.

Critérios de aceite:

- `session.close` mata o PTY e limpa o gerenciador.
- Fechamento do socket encerra sessões pertencentes ao socket.
- Timeout encerra sessão inativa.
- UI retorna ao fluxo de nova sessão.

### RF-08: Buscar contexto remoto

Durante sessão ativa, o usuário deve poder usar menções para buscar arquivos, pastas e workspace atual.

Critérios de aceite:

- `@file` retorna arquivos relativos ao `cwd`.
- `@folder` retorna pastas relativas ao `cwd`.
- `@workspace` insere o workspace atual.
- Busca respeita limite máximo de 50 resultados.
- Respostas antigas são descartadas por sequência/query.

### RF-09: Suportar perfis de comando

O produto deve oferecer perfis predefinidos para diferentes modos de uso do Copilot CLI.

Perfis atuais:

| Perfil                | Execução esperada                                                         | Observação                 |
| --------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `copilot-interactive` | `copilot --log-level error --no-auto-update --yolo` ou fallback para `gh` | Perfil interativo padrão   |
| `gh-copilot-suggest`  | `gh suggest --log-level error`                                            | Fluxo direto da GitHub CLI |

Critérios de aceite:

- Flags proibidas como `--allow-all`, `--autopilot`, `--allow-all-tools` e `--allow-all-paths` não entram nos perfis.
- O perfil interativo mantém `--yolo` conforme decisão atual do projeto.
- Ausência de executável retorna erro claro.

### RF-10: Persistir preferências locais da UI

O frontend deve persistir URL WebSocket, token, workspace selecionado, modo raw, tamanho de fonte e tema em `localStorage`.

Critérios de aceite:

- Reabrir a UI recupera preferências anteriores.
- Alterar URL/token durante fluxo inicial reseta conexões antigas quando necessário.

---

## 9. Requisitos não funcionais

| Categoria        | Requisito                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segurança        | Token obrigatório, comparação de token em tempo constante por tamanho igual, allowlist de ambiente filho, validação de `cwd` absoluto             |
| Privacidade      | O processo filho recebe somente variáveis de ambiente explicitamente permitidas, como `HOME`, `PATH`, `TERM`, `COPILOT_GITHUB_TOKEN` e `GH_TOKEN` |
| Performance      | Streaming de output deve ser imperativo via xterm.js, sem renderizar cada chunk como estado React                                                 |
| Resiliência      | WebSocket client usa fila de mensagens enquanto conexão estabiliza e reconexão com backoff exponencial                                            |
| Observabilidade  | Backend registra eventos com `pino`, incluindo conexão, rejeição, sessão, saída e erros                                                           |
| Portabilidade    | Runtime principal exige Node.js 20+, `pnpm` e dependências nativas de PTY; alguns scripts assumem shell POSIX                                     |
| Acessibilidade   | Controles mobile devem manter área de toque adequada e contraste suficiente nos temas suportados                                                  |
| Manutenibilidade | Protocolo deve permanecer tipado no backend e espelhado no frontend até existir pacote compartilhado                                              |

---

## 10. UX e jornada do usuário

### 10.1 Tela de conexão

Objetivo: configurar acesso ao backend e preparar a sessão sem expor o usuário a detalhes internos do protocolo.

Elementos principais:

- URL do servidor WebSocket.
- Token de autenticação.
- Card de workspace remoto selecionado.
- Botão para conectar/listar workspaces.
- Botão para escolher workspace.
- Seletor de perfil de comando.
- Alternância de tema.
- Mensagens inline de erro.

### 10.2 Seleção de workspace

Objetivo: manter o usuário dentro de diretórios explicitamente permitidos, mas permitir cadastro de diretórios extras quando o host os aceita.

Comportamentos esperados:

- Lista workspaces do backend.
- Permite adicionar workspace customizado por caminho absoluto.
- Seleciona automaticamente o primeiro workspace disponível quando o anterior não existe na lista.

### 10.3 Tela de terminal

Objetivo: operar uma sessão real com controles confortáveis em mobile.

Elementos principais:

- Header com status de conexão e encerramento em dois toques.
- Toolbar de tamanho de fonte e cópia de output.
- Terminal xterm.js.
- Quick actions para teclas difíceis no mobile.
- Input bar com composer, comandos, modo raw e envio.
- Bottom sheets de comandos, menções e cópia.
- Banners de erro, criação de sessão e desconexão.

### 10.4 Modos de input

| Modo   | Uso                          | Comportamento                                                                           |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------- |
| Normal | Prompts e comandos compostos | Usuário edita texto no composer; envio dispara texto + sequência de submissão do perfil |
| Raw    | Controle direto do PTY       | Caracteres digitados são enviados ao terminal conforme entram                           |

### 10.5 Temas

Temas suportados:

- Dracula, como padrão escuro.
- VS Code Light, como opção clara.

O tema afeta tanto tokens CSS da UI quanto opções do xterm.js.

---

## 11. Métricas de sucesso sugeridas

Como o projeto atual é self-hosted e local, as métricas podem ser coletadas manualmente ou por logs locais, sem telemetria externa obrigatória.

| Métrica                              | Por que importa                                            |
| ------------------------------------ | ---------------------------------------------------------- |
| Tempo de conexão até `session.ready` | Mede fricção operacional                                   |
| Taxa de erro `SESSION_CREATE_FAILED` | Indica problemas de allowlist, CLI ausente ou configuração |
| Sessões encerradas por timeout       | Mostra se o timeout está adequado ao uso real              |
| Uso de quick actions                 | Indica valor dos controles mobile                          |
| Uso de `@file`/`@folder`             | Mede adoção da busca de contexto                           |
| Falhas de WebSocket/reconexão        | Ajuda a avaliar estabilidade em rede local                 |
| Feedback manual em 320px-430px       | Confirma qualidade do foco mobile-first                    |

---

## 12. Dependências e pré-requisitos

| Dependência                           | Necessidade                                                    |
| ------------------------------------- | -------------------------------------------------------------- |
| Node.js 20+                           | Runtime backend e build TypeScript                             |
| `pnpm`                                | Gerenciamento de pacotes e scripts                             |
| `node-pty`                            | Criação de terminal real no backend                            |
| `copilot` ou `gh`                     | Executável que será operado pela sessão                        |
| Copilot CLI autenticado               | O app não realiza login no GitHub por conta própria            |
| `rg` opcional                         | Busca rápida de arquivos; há fallback por filesystem           |
| Browser moderno                       | WebSocket, `localStorage`, viewport APIs e xterm.js            |
| TLS externo para redes não confiáveis | Necessário para uso seguro com `?token=` fora de LAN confiável |

---

## 13. Riscos de produto

| Risco                                     | Impacto                                   | Mitigação atual ou recomendada                                                         |
| ----------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Token em query string aparece em URL/logs | Exposição de segredo                      | Usar `wss://`, redes confiáveis e token forte; preferir header quando cliente permitir |
| CLI muda comportamento ou comandos        | Catálogo fica defasado                    | Versionar catálogo e revisar contra versão homologada                                  |
| `--yolo` amplia autonomia do CLI          | Ações podem ocorrer com menos confirmação | Restringir `ALLOWED_CWDS`, usar workspaces de baixo risco e documentar claramente      |
| Acesso LAN sem TLS                        | Tráfego e token podem ser observáveis     | Deploy com TLS/reverse proxy quando sair de localhost/LAN confiável                    |
| Mobile viewport inconsistente             | Terminal pode ficar difícil de usar       | Testes manuais Android/iOS e ajustes em `visualViewport`                               |
| Processo PTY fica órfão                   | Consumo de recursos                       | Cleanup no fechamento de socket, timeout e shutdown                                    |
| Busca de contexto em workspaces grandes   | Latência ou custo de IO                   | Limite de resultados, debounce e uso de `rg` quando disponível                         |

---

## 14. Backlog de produto recomendado

| Prioridade | Item                                                       | Justificativa                                                                                   |
| ---------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Alta       | Empacotar protocolo compartilhado entre backend e frontend | Evita drift de tipos duplicados                                                                 |
| Alta       | Documentar deploy com TLS/reverse proxy                    | Necessário para uso fora de localhost/LAN confiável                                             |
| Alta       | Revisar suporte Windows nativo do backend principal        | O projeto roda em workspace Windows, mas há scripts/resolução de binário com pressupostos POSIX |
| Média      | Histórico persistente opcional de sessões                  | Útil para auditoria e retomada, mas aumenta responsabilidade de privacidade                     |
| Média      | Health endpoint HTTP ou status diagnosticável              | Facilita operação e troubleshooting                                                             |
| Média      | Permissões por perfil/workspace                            | Reduz risco operacional em ambientes compartilhados                                             |
| Média      | Busca de conteúdo opcional                                 | Aumenta utilidade de menções, mantendo limites de escopo                                        |
| Baixa      | PWA/installability                                         | Conveniência mobile, mas não remove dependência do WebSocket                                    |
| Baixa      | Temas customizados                                         | Melhoria de preferência, sem impacto no núcleo do produto                                       |

---

## 15. Critérios de aceite do MVP atual

O MVP é considerado funcional quando os seguintes critérios estão satisfeitos:

- Backend inicia com configuração válida e rejeita configuração inválida.
- Cliente autenticado conecta por header ou query string.
- Cliente não autenticado é rejeitado.
- Usuário lista workspaces permitidos.
- Usuário adiciona workspace customizado válido.
- Sessão é criada somente em `cwd` permitido.
- Output do Copilot CLI aparece em streaming no terminal web.
- Input normal e raw chegam ao PTY.
- Quick actions controlam o terminal.
- Resize ajusta PTY e terminal visual.
- `@file`, `@folder` e `@workspace` operam dentro do workspace da sessão.
- Encerramento explícito, fechamento do socket e timeout limpam sessão.
- Testes automatizados de backend e frontend passam.
- Teste manual mobile valida teclado virtual, orientação, temas, comandos e menções.

---

## 16. Resumo de posicionamento

O `copilot-api-wrapper` deve ser tratado como uma camada local-first de acesso remoto ao Copilot CLI. Seu valor está em transformar uma ferramenta shell-first em uma experiência navegável, tocável e restrita por workspace, mantendo o poder do terminal real. O produto é mais próximo de um console remoto especializado do que de uma aplicação SaaS, API pública ou cliente alternativo oficial do Copilot.
