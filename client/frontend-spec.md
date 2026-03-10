# Especificação: Frontend Mobile-First para Copilot WebSocket Wrapper

**Data**: 2026-03-06  
**Backend de referência**: `plan/plan.md`, código em `src/`

---

## 1. Visão Geral

Aplicação web mobile-first que funciona como cliente do servidor WebSocket descrito no `plan.md`. O usuário abre a aplicação no celular, digita um prompt ou comando, e interage com o Copilot CLI remoto em tempo real, vendo o output streaming com formatação ANSI preservada.

### Público-alvo

Desenvolvedor que quer acessar o Copilot CLI de um dispositivo móvel (celular ou tablet) sem precisar de SSH ou terminal nativo.

### Metas

1. Experiência funcional e fluida em telas de 320px–430px de largura.
2. Input otimizado para teclado virtual (sem depender de teclas como Ctrl, Tab, Esc).
3. Output legível com cores ANSI renderizadas corretamente.
4. Conexão WebSocket gerenciada com reconexão automática.
5. Zero dependência de instalação — funciona no browser do celular.

### Não-metas (fora do escopo)

1. Versão desktop polida — funcionar é suficiente, mas o foco é mobile.
2. PWA offline — a aplicação depende do WebSocket ativo.
3. Historico persistente entre sessões.
4. Multiplexação de sessões — uma sessão por vez.
5. ~~Customização visual avançada (temas, fontes).~~ — **Incluído no escopo**: suportar dois temas (Dracula como padrão e VS Code Light) com switcher manual. Sem suporte a temas customizados além desses dois.

---

## 2. Arquitetura

```
┌──────────────────────────────┐
│  Browser Mobile              │
│                              │
│  ┌────────────────────────┐  │
│  │  App Shell (SPA)       │  │
│  │  ├── ConnectionManager │  │
│  │  ├── TerminalView      │  │
│  │  ├── InputBar          │  │
│  │  └── QuickActions      │  │
│  └────────────────────────┘  │
│            │ WebSocket       │
└────────────┼─────────────────┘
             │
┌────────────▼─────────────────┐
│  Backend WS (plan.md)        │
│  porta configurável          │
└──────────────────────────────┘
```

### Stack proposta

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Framework | **React 19** | Componentização simples, ecossistema maduro |
| Bundler | **Vite 6** | Dev server rápido, build otimizado |
| Terminal renderer | **@xterm/xterm** + **@xterm/addon-fit** + **@xterm/addon-webgl** | Renderiza ANSI real, suporta resize, usado pela indústria |
| Estilo | **CSS Modules** ou **Tailwind CSS** | Sem runtime, mobile-friendly |
| Estado | **React state + useRef** | Complexidade baixa, sem necessidade de state manager externo |
| Linguagem | **TypeScript** | Consistência com o backend |

### Decisão: por que xterm.js

O backend envia output bruto com sequências ANSI escape (cores, cursor, limpeza de tela). Parsear manualmente é frágil. O `@xterm/xterm` renderiza esse output nativamente, suporta resize, seleção de texto e funciona em mobile. É o padrão de facto para terminais web.

---

## 3. Protocolo de Comunicação

O frontend consome o protocolo atual do backend e adiciona a extensão proposta abaixo para suportar menções `@...` com busca remota.

### Mensagens que o frontend envia

| Tipo | Quando | Payload principal |
|------|--------|-------------------|
| `session.create` | Ao clicar "Conectar" / abrir a app | `cwd`, `cols`, `rows`, `commandProfile` |
| `terminal.input` | Cada tecla ou texto colado | `sessionId`, `data` |
| `terminal.resize` | Mudança de orientação ou teclado virtual abre/fecha | `sessionId`, `cols`, `rows` |
| `session.close` | Ao clicar "Encerrar" ou fechar a aba | `sessionId` |
| `context.search` | Ao digitar `@` ou escolher um comando de contexto | `sessionId`, `query`, `mentionType`, `limit` |

### Mensagens que o frontend recebe

| Tipo | Ação no UI |
|------|-----------|
| `session.ready` | Armazenar `sessionId`, habilitar input, foco no terminal |
| `terminal.output` | Escrever `data` no xterm.js via `terminal.write(data)` |
| `session.exit` | Mostrar badge "Sessão encerrada (código X)", desabilitar input |
| `session.error` | Mostrar toast/banner de erro com `message` |
| `context.search.results` | Mostrar sugestões de arquivos/pastas para completar uma menção `@...` |

### Extensão de protocolo para menções `@...`

Para suportar a UX mobile de menções com busca real, o backend deve estender o protocolo WebSocket atual com pesquisa de contexto.

**Cliente → servidor**

```json
{
     "type": "context.search",
     "payload": {
          "sessionId": "sess_123",
          "mentionType": "file",
          "query": "server",
          "limit": 20
     }
}
```

`mentionType` inicial do MVP:
- `file`
- `folder`
- `workspace`

**Servidor → cliente**

```json
{
     "type": "context.search.results",
     "payload": {
          "sessionId": "sess_123",
          "mentionType": "file",
          "query": "server",
          "items": [
               {
                    "id": "src/server.ts",
                    "kind": "file",
                    "label": "server.ts",
                    "path": "src/server.ts",
                    "description": "src/server.ts"
               }
          ]
     }
}
```

**Regras de backend**:
- A busca deve ser sempre restrita ao `cwd` da sessão ativa.
- O backend não pode buscar fora da allowlist de diretórios já validada para a sessão.
- A resposta deve retornar caminhos relativos ao `cwd` da sessão, não caminhos absolutos.
- O backend deve impor limite de resultados e debounce no cliente para evitar flood.

---

## 4. Telas e Componentes

A aplicação tem uma **tela única** com estados visuais diferentes.

### 4.1 Estado: Desconectado

```
┌──────────────────────────┐
│  🔌 Copilot Remote       │
│                          │
│  ┌────────────────────┐  │
│  │ Server URL          │  │
│  │ ws://192.168.1.5:3k │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ Token               │  │
│  │ ••••••••••••        │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ Diretório (cwd)     │  │
│  │ /home/user/projeto  │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │   [ Conectar ]      │  │
│  └────────────────────┘  │
│                          │
│  Último servidor usado:  │
│  ws://192.168.1.5:3000   │
└──────────────────────────┘
```

**Comportamento**:
- Campos de texto com tamanho adequado para toque (min 44px de altura).
- `Server URL` e `Token` persistidos em `localStorage` (token em campo `password`).
- `cwd` com valor padrão configurável ou último usado.
- Botão "Conectar" ocupa largura total, com tamanho mínimo de 48px de altura.
- Se houve um erro de conexão anterior, mostrar mensagem vermelha inline.

### 4.2 Estado: Conectando

- Botão muda para estado `loading` com spinner.
- Inputs desabilitados.
- Timeout visual de 10s — se não receber `session.ready`, mostrar erro e voltar para Desconectado.

### 4.3 Estado: Conectado (Terminal Ativo)

```
┌──────────────────────────┐
│ ● Copilot     [Encerrar] │  ← header compacto
├──────────────────────────┤
│                          │
│  Terminal xterm.js       │
│  (ocupa todo o espaço    │
│   disponível)            │
│                          │
│  $ copilot               │
│  > Como posso...         │
│  Output com cores ANSI   │
│                          │
│                          │
├──────────────────────────┤
│ [↑][↓][Ctrl+C][Tab][Esc] │  ← barra de teclas especiais
├──────────────────────────┤
│ ┌──────────────────┐ [⏎] │  ← input bar
│ │ Digite aqui...   │     │
│ └──────────────────┘     │
└──────────────────────────┘
```

**Comportamento detalhado**:

#### Header
- Indicador de conexão: bolinha verde (conectado), vermelha (erro), amarela (reconectando).
- Nome "Copilot" centralizado.
- Botão "Encerrar" no canto direito, com confirmação (tap duplo ou dialog simples).
- Ícone de tema (☀/🌙) no canto esquerdo, ao lado do indicador de status, para alternar entre Dracula e VS Code Light.
- Altura fixa de ~44px.
- Cores de fundo e texto do header seguem o tema ativo.

#### Terminal (xterm.js)
- Ocupa todo o espaço vertical entre header e input bar.
- Font size: 13px–14px para legibilidade mobile (configurável via pinch-to-zoom ou botão +/-).
- Cores definidas pelo tema ativo (Dracula por padrão, VS Code Light como alternativa). Ver seção **10.5 Temas**.
- Scroll vertical nativo do xterm.
- Ao receber output, auto-scroll para o final.
- Ao abrir teclado virtual, o terminal encolhe (não fica atrás do teclado).

#### Barra de Teclas Especiais (QuickActions)
- Horizontal, scrollável se necessário.
- Botões com tamanho mínimo de 44x44px.
- Teclas disponíveis:

| Botão | Envia ao PTY | Uso |
|-------|-------------|-----|
| `↑` | `\x1b[A` | Navegar histórico |
| `↓` | `\x1b[B` | Navegar histórico |
| `←` | `\x1b[D` | Mover cursor |
| `→` | `\x1b[C` | Mover cursor |
| `Ctrl+C` | `\x03` | Interromper processo |
| `Tab` | `\t` | Autocompletar |
| `Esc` | `\x1b` | Cancelar |
| `Ctrl+D` | `\x04` | EOF / sair |
| `Ctrl+L` | `\x0c` | Limpar tela |

- Feedback visual de toque (highlight no botão).
- Barra fixa, não some com scroll do terminal.

#### Seletor de Comandos (Command Picker)
- O header ou a Input Bar deve ter um botão `Commands`.
- Ao tocar em `Commands`, abre um bottom sheet mobile-first com a lista de comandos suportados pelo GitHub Copilot CLI para a versão homologada do projeto.
- Ao tocar em um item da lista, o comando é inserido no input atual, mas **não é enviado automaticamente**. O usuário ainda confirma no botão `Enter`.
- Se o input já tiver texto, o comando selecionado é inserido na posição atual do cursor ou anexado ao final com espaço automático quando necessário.
- O sheet pode ser fechado tocando novamente em `Commands`, arrastando para baixo ou tocando fora.
- O catálogo deve trazer nome curto, texto exato a inserir e descrição breve de uso.
- O catálogo inicial deve ser versionado no frontend, não inferido dinamicamente do terminal.
- O frontend deve permitir atualizar esse catálogo por configuração futura, sem exigir refactor do fluxo principal.

**Regras de UX**:
- Itens da lista precisam ter área de toque mínima de 44px.
- Busca local no catálogo por nome, alias ou texto do comando.
- Separar comandos por grupos: `Slash commands`, `@ contextos`, `Controle de sessão`.
- Itens potencialmente destrutivos ou sensíveis devem mostrar badge de atenção, mas ainda apenas inserem texto no input.

**Regra crítica para comandos `@...`**:
- O frontend deve suportar menções assistidas, com busca real de arquivos e pastas no workspace ativo.
- Ao escolher `@file` ou `@folder` no catálogo, a UI entra em modo de resolução de menção e abre uma lista de busca conectada ao backend.
- Ao digitar `@` manualmente no input, o frontend detecta o token ativo e pode abrir sugestões contextuais com base no texto após `@`.
- A busca de menções não é feita no browser; ela é delegada ao backend para garantir performance, escopo correto de workspace e consistência com o ambiente remoto.
- Ao selecionar um resultado, o frontend insere a menção resolvida no input, por exemplo `@file src/server.ts `.
- O catálogo deve marcar esses itens com descrição do tipo: `Busca arquivos/pastas no workspace remoto antes de inserir a menção`.

#### Menções assistidas (`@...`)

Fluxo esperado para menções:

1. Usuário toca em `Commands` e escolhe `@file`, ou simplesmente digita `@` no input.
2. O frontend identifica o tipo de menção e o texto digitado após `@`.
3. O frontend envia `context.search` ao backend com `sessionId`, `mentionType` e `query`.
4. O backend executa busca eficiente no `cwd` da sessão ativa.
5. O backend retorna `context.search.results` com itens ranqueados.
6. O usuário toca em um resultado.
7. O frontend insere a menção resolvida no input, preservando o restante do texto já digitado.
8. O usuário revisa o prompt final e envia com `Enter`.

Escopo inicial do MVP:
- `@file`: busca por nome e caminho relativo de arquivos.
- `@folder`: busca por diretórios.
- `@workspace`: insere token direto, sem busca adicional.

Fora do escopo inicial das menções:
- Preview do conteúdo do arquivo.
- Busca full-text dentro do conteúdo dos arquivos para a menção.
- Multi-select de vários arquivos em uma única interação.
- Ranking semântico por embeddings.

#### Input Bar
- **Decisão importante**: usar um `<input>` ou `<textarea>` nativo em vez de depender do input do xterm.js diretamente.
  - **Motivo**: o xterm.js captura teclado de desktop, mas em mobile o teclado virtual precisa de um elemento focável real para abrir. O input nativo garante que o teclado virtual sempre aparece, permite autocorreção, sugestões do teclado, dictation, e paste.
- Input de linha única com botão `Commands` e botão "Enter" (⏎) ao lado.
- Ao pressionar Enter ou tocar ⏎: envia o conteúdo + `\r` como `terminal.input`, limpa o campo.
- Cada caractere digitado **não** é enviado em tempo real ao PTY — apenas ao pressionar Enter.
  - Exceção: se o usuário ativar "modo raw" (toggle), cada keystroke é enviado imediatamente. Útil para prompts interativos do Copilot que esperam teclas individuais (y/n, setas).
- Placeholder: "Digite um comando ou prompt..."
- Altura mínima de 44px.
- `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`.
- Quando um comando vier do `Command Picker`, ele entra no input como texto editável antes do envio.
- Comandos inseridos pelo picker podem ser ajustados manualmente pelo usuário antes do `Enter`.
- Quando o cursor estiver sobre um token iniciado por `@`, a Input Bar pode abrir sugestões de menção logo acima do teclado ou em um sheet dedicado.
- A resolução da menção deve substituir apenas o token ativo, sem apagar o restante do texto digitado.

### 4.4 Estado: Sessão Encerrada

- Terminal fica em read-only (sem input).
- Banner na parte inferior: "Sessão encerrada (código 0)" ou "Sessão encerrada com erro".
- Botão "Nova Sessão" para voltar ao estado Desconectado.
- O output do terminal continua visível para scroll/leitura.

### 4.5 Estado: Erro de Conexão

- Se o WebSocket cair durante uso:
  - Banner amarelo "Conexão perdida. Reconectando..."
  - Tentativas de reconexão com backoff exponencial (1s, 2s, 4s, 8s, max 30s).
  - **Importante**: a reconexão reabre o WebSocket mas **não recria a sessão** automaticamente (o PTY no backend morreu com a desconexão). Após reconectar, mostrar botão "Criar nova sessão".
- Se falhar definitivamente (ex: servidor offline):
  - Banner vermelho: "Não foi possível conectar ao servidor".
  - Botão "Tentar novamente".

---

## 5. Gerenciamento de Conexão WebSocket

### ConnectionManager

Classe/hook responsável por:

1. **Abrir** WebSocket com URL e token (`Authorization: Bearer <token>` via protocolo do ws, ou como primeiro parâmetro de subprotocol se browsers não suportarem headers em WebSocket — nesse caso, enviar como query param `?token=` sobre TLS).
2. **Manter** heartbeat ping/pong padrão do protocolo WebSocket.
3. **Reconectar** automaticamente com backoff exponencial em caso de desconexão.
4. **Enfileirar** mensagens se a conexão estiver momentaneamente indisponível.
5. **Expor** callbacks: `onConnected`, `onDisconnected`, `onMessage`, `onError`.

### Decisão: autenticação no WebSocket do browser

Browsers não suportam headers customizados no construtor `new WebSocket()`. Duas opções:

- **Opção A (recomendada para MVP)**: enviar token como query parameter `?token=<TOKEN>`. O backend precisa aceitar isso além do header `Authorization`. A conexão DEVE ser sobre TLS (wss://) em produção para proteger o token.
- **Opção B**: usar subprotocols (`new WebSocket(url, ['bearer', token])`). Funcional mas semântica incorreta.

O frontend deve implementar **Opção A** e documentar que o backend precisa do handler para query param.

---

## 6. Resize e Adaptação a Teclado Virtual

### Problema

Em mobile, quando o teclado virtual abre, o viewport encolhe. O terminal xterm.js precisa ser redimensionado para refletir o espaço real disponível, e o backend precisa receber `terminal.resize` para que o PTY reflita o novo tamanho.

### Estratégia

1. Escutar `visualViewport.resize` (API moderna) ou `window.resize` como fallback.
2. Recalcular `cols` e `rows` com base na área visível do container do xterm usando `FitAddon.fit()`.
3. Enviar `terminal.resize` ao backend com os novos valores.
4. Debounce de 150ms para evitar flood de mensagens em animações de teclado.

### Layout CSS

- Usar `height: 100dvh` (`dynamic viewport height`) para responder corretamente ao teclado virtual.
- O container do terminal deve usar `flex: 1` dentro de um layout `flex-column` entre header e input bar.
- **Nunca** usar `100vh` fixo — isso causa sobreposição do teclado em iOS/Android.

---

## 7. Componentes React

### Árvore de componentes

```
<App>
  ├── <ConnectionScreen>       // Estado: Desconectado
  │   ├── <ServerUrlInput>
  │   ├── <TokenInput>
  │   ├── <CwdInput>
  │   └── <ConnectButton>
  │
  └── <TerminalScreen>         // Estado: Conectado
      ├── <Header>
      │   ├── <StatusIndicator>
      │   ├── <ThemeToggle>           // ícone ☀/🌙 para alternar tema
      │   └── <EndSessionButton>
      ├── <TerminalView>       // xterm.js wrapper
      ├── <QuickActions>       // barra de teclas especiais
               ├── <CommandPicker>      // bottom sheet com comandos do Copilot CLI
               ├── <MentionSearchSheet> // busca de arquivo/pasta para menções @...
      ├── <InputBar>           // input + botão Enter
               │   ├── <CommandsButton>
      │   └── <RawModeToggle>
      └── <StatusBanner>       // erros, reconexão, sessão encerrada
```

### Hooks customizados

| Hook | Responsabilidade |
|------|-----------------|
| `useWebSocket(url, token)` | Gerencia ciclo de vida do WebSocket, reconexão, parse de mensagens |
| `useSession(ws)` | Gerencia estado da sessão (idle, creating, active, closed, error) |
| `useTerminal(containerRef)` | Inicializa xterm.js, aplica addons, expõe `write()` e `fit()` |
| `useViewportResize(callback)` | Detecta mudanças no viewport (teclado virtual) |
| `useLocalStorage(key, default)` | Persiste/recupera preferências do usuário |
| `useTheme()` | Gerencia tema ativo (dracula/vscode-light), persiste em localStorage, aplica CSS vars e xterm ITheme |
| `useCommandCatalog()` | Expõe catálogo versionado de comandos do Copilot CLI, agrupamentos, busca local e metadados de itens sensíveis/`@...` |
| `useMentionSearch()` | Detecta token `@` ativo no input, faz debounce, consulta o backend e expõe resultados ranqueados |

### Catálogo de comandos homologado

O frontend deve sair de fábrica com **todos os comandos homologados para a versão escolhida do GitHub Copilot CLI** previamente disponíveis no `Command Picker`.

**Regras do catálogo**:
- O catálogo é uma fonte estática versionada em código, por exemplo `src/lib/commandCatalog.ts`.
- Cada atualização da versão homologada do Copilot CLI exige revisão explícita do catálogo.
- O frontend não tenta descobrir comandos lendo output do terminal, help text do CLI ou autocompletion em tempo real.
- Se algum comando deixar de existir em uma nova versão do CLI, ele deve ser removido do catálogo homologado antes do release do frontend.
- Itens de menção `@...` podem carregar metadados adicionais de resolução, como `mentionType`, `searchPlaceholder` e `requiresBackendSearch`.

**Estrutura sugerida de item**:

```typescript
type CommandCatalogItem = {
     id: string;
     group: 'slash' | 'mention' | 'session';
     label: string;
     insertText: string;
     description: string;
     aliases?: string[];
     requiresRepoContext?: boolean;
     mentionType?: 'file' | 'folder' | 'workspace';
     requiresBackendSearch?: boolean;
     warning?: string;
};
```

**Exemplos de itens do catálogo**:

```typescript
const commandCatalog: CommandCatalogItem[] = [
     {
          id: 'slash-explain',
          group: 'slash',
          label: '/explain',
          insertText: '/explain ',
          description: 'Pede ao Copilot para explicar um trecho, comando ou contexto.',
     },
     {
          id: 'slash-fix',
          group: 'slash',
          label: '/fix',
          insertText: '/fix ',
          description: 'Pede correção para erro ou comportamento descrito no prompt.',
     },
     {
          id: 'slash-tests',
          group: 'slash',
          label: '/tests',
          insertText: '/tests ',
          description: 'Pede geração ou ajuste de testes para o contexto informado.',
     },
     {
          id: 'mention-workspace',
          group: 'mention',
          label: '@workspace',
          insertText: '@workspace ',
          description: 'Insere o contexto do workspace atual.',
          requiresRepoContext: true,
          mentionType: 'workspace',
     },
     {
          id: 'mention-file',
          group: 'mention',
          label: '@file',
          insertText: '@file ',
          description: 'Abre busca eficiente de arquivos no workspace remoto.',
          requiresRepoContext: true,
          mentionType: 'file',
          requiresBackendSearch: true,
     },
     {
          id: 'mention-folder',
          group: 'mention',
          label: '@folder',
          insertText: '@folder ',
          description: 'Abre busca eficiente de diretórios no workspace remoto.',
          requiresRepoContext: true,
          mentionType: 'folder',
          requiresBackendSearch: true,
     },
     {
          id: 'session-clear',
          group: 'session',
          label: 'Limpar terminal',
          insertText: '\u000c',
          description: 'Envia Ctrl+L para limpar a tela atual.',
          warning: 'Enviado como caractere de controle.',
     },
];
```

**Observação importante**:
- Os exemplos acima são ilustrativos da estrutura.
- A implementação final deve conter a lista completa dos comandos homologados para a versão do CLI adotada no projeto.
- Itens `slash` e `mention` inserem texto editável no input.
- Itens `session` podem inserir texto especial ou atalhos de controle, mas ainda devem passar pelo mesmo fluxo de confirmação definido pela UX, salvo quando explicitamente mapeados para QuickActions.
- Itens com `requiresBackendSearch: true` devem disparar o fluxo de busca remota antes da inserção final da menção.

---

## 8. Fluxo de Dados

```
Usuário digita texto e pressiona Enter
         │
         ▼
    InputBar envia data + \r
         │
         ▼
    useSession.sendInput(data)
         │
         ▼
    WebSocket.send({ type: "terminal.input", sessionId, data })
         │
         ▼
    Backend escreve no PTY
         │
         ▼
    PTY ecoa output + resposta do Copilot
         │
         ▼
    Backend envia { type: "terminal.output", data }
         │
         ▼
    useWebSocket recebe mensagem
         │
         ▼
    TerminalView escreve no xterm: terminal.write(data)
         │
         ▼
    Usuário vê output colorido na tela
```

### Fluxo do Command Picker

```
Usuário toca em Commands
           │
           ▼
Bottom sheet abre com catálogo de comandos
           │
           ▼
Usuário escolhe um item, por exemplo /explain ou @workspace
           │
           ▼
Texto do comando é inserido no InputBar
           │
           ▼
Usuário revisa/edita complemento do comando
           │
           ▼
Usuário toca Enter
           │
           ▼
Frontend envia terminal.input com o texto final + \r
```

### Fluxo da menção `@file`

```
Usuário escolhe @file ou digita @ no input
          │
          ▼
Frontend identifica token de menção ativo
          │
          ▼
Frontend envia context.search com a query atual
          │
          ▼
Backend busca arquivos no cwd da sessão usando estratégia eficiente
          │
          ▼
Servidor responde com context.search.results
          │
          ▼
Usuário toca em um arquivo sugerido
          │
          ▼
InputBar substitui o token atual por @file caminho/relativo
          │
          ▼
Usuário finaliza o prompt e envia com Enter
```

---

## 9. Persistência Local

Usar `localStorage` para:

| Chave | Valor | Motivo |
|-------|-------|--------|
| `copilot_ws_url` | URL do servidor | Não precisar digitar toda vez |
| `copilot_ws_token` | Token de autenticação | Conveniência (aceito no MVP, melhorar depois) |
| `copilot_cwd` | Último cwd usado | Conveniência |
| `copilot_font_size` | Tamanho da fonte do terminal | Preferência visual |
| `copilot_raw_mode` | boolean | Última preferência de modo de input |
| `copilot_theme` | `"dracula"` \| `"vscode-light"` | Tema visual ativo (padrão: `"dracula"`) |
| `copilot_recent_commands` | lista curta de ids | Atalhos para os últimos comandos escolhidos no picker |
| `copilot_recent_mentions` | lista curta de caminhos | Sugestões recentes para `@file` e `@folder` |

**Atenção de segurança**: o token em `localStorage` é aceitável para um MVP interno. Em produção, considerar alternativas (session storage, token de curta duração).

---

## 10. Considerações Mobile Específicas

### Touch

- Todos os botões com `min-height: 44px` e `min-width: 44px` (guidelines Apple/Google).
- Espaçamento entre botões de pelo menos 8px para evitar tap acidental.
- `touch-action: manipulation` nos containers para desabilitar double-tap zoom.
- O bottom sheet de `Commands` deve abrir ocupando entre 55% e 75% da altura visível, preservando alcance do polegar.
- A lista de comandos deve suportar scroll interno próprio sem empurrar o terminal por trás.
- O sheet de busca de menções deve suportar digitação contínua sem perder foco do teclado virtual.
- Resultados de busca devem aparecer com caminho relativo completo e highlight do trecho encontrado.

### Scroll do Terminal

- O xterm.js gerencia seu próprio scroll. Não usar `overflow: scroll` no container.
- Para copiar texto do terminal: longo press seleciona e abre menu nativo do OS.

### Orientação

- Suportar portrait e landscape.
- Em landscape, a barra de teclas especiais pode ser condensada ou escondida para dar mais espaço ao terminal.
- Recalcular `cols`/`rows` ao mudar orientação.

### Performance

- Não re-renderizar React a cada `terminal.output` — o xterm.js é imperativo (`terminal.write()`), não declarativo.
- Usar `useRef` para a instância do terminal, não `useState`.
- Limitar re-renders ao estado de conexão e sessão, não ao output do terminal.

### iOS Safari

- Usar `position: fixed` com cuidado — Safari tem comportamento inconsistente com teclado virtual.
- Preferir layout com `dvh` e flexbox.
- Testar com `standalone` mode (add to home screen).

### Android Chrome

- `interactive-widget=resizes-content` no meta viewport para que o viewport encolha com teclado.

### Temas

Dois temas suportados com switcher manual no header. O tema ativo é persistido em `localStorage` e aplicado via CSS custom properties + configuração do xterm.js `ITheme`.

**Tema padrão: Dracula**

| Token CSS | Valor |
|-----------|-------|
| `--bg-primary` | `#282a36` |
| `--bg-secondary` | `#44475a` |
| `--text-primary` | `#f8f8f2` |
| `--text-secondary` | `#6272a4` |
| `--accent` | `#bd93f9` |
| `--accent-secondary` | `#50fa7b` |
| `--error` | `#ff5555` |
| `--warning` | `#f1fa8c` |
| `--border` | `#6272a4` |

xterm.js `ITheme` Dracula:

```typescript
const draculaTheme: ITheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};
```

**Tema alternativo: VS Code Light**

| Token CSS | Valor |
|-----------|-------|
| `--bg-primary` | `#ffffff` |
| `--bg-secondary` | `#f3f3f3` |
| `--text-primary` | `#1e1e1e` |
| `--text-secondary` | `#6a737d` |
| `--accent` | `#0066b8` |
| `--accent-secondary` | `#16825d` |
| `--error` | `#cd3131` |
| `--warning` | `#ddb100` |
| `--border` | `#d4d4d4` |

xterm.js `ITheme` VS Code Light:

```typescript
const vscodeLightTheme: ITheme = {
  background: '#ffffff',
  foreground: '#1e1e1e',
  cursor: '#1e1e1e',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#16825d',
  yellow: '#ddb100',
  blue: '#0066b8',
  magenta: '#bc05bc',
  cyan: '#2aa1b3',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};
```

**Implementação do switcher**:

1. `useTheme()` hook: lê/escreve `copilot_theme` em `localStorage`, retorna `{ theme, toggleTheme, isDark }`.
2. No `<App>`, aplicar `data-theme="dracula"` ou `data-theme="vscode-light"` no root element.
3. CSS usa `[data-theme="dracula"]` e `[data-theme="vscode-light"]` para definir as custom properties.
4. Ao trocar tema, chamar `terminal.options.theme = newTheme` no xterm.js para atualizar cores do terminal em tempo real.
5. O `<meta name="theme-color">` também é atualizado dinamicamente para combinar com o fundo do tema ativo.
6. QuickActions, InputBar, Header e StatusBanner usam as CSS custom properties — não têm cores hardcoded.

---

## 11. Meta Tags e Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content">
<meta name="theme-color" content="#282a36"> <!-- atualizado dinamicamente pelo JS conforme tema ativo -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

---

## 12. Estrutura do Projeto Frontend

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── global.css
    ├── components/
    │   ├── ConnectionScreen.tsx
    │   ├── TerminalScreen.tsx
    │   ├── Header.tsx
     │   ├── CommandPicker.tsx
     │   ├── MentionSearchSheet.tsx
    │   ├── TerminalView.tsx
    │   ├── QuickActions.tsx
    │   ├── InputBar.tsx
    │   └── StatusBanner.tsx
    ├── hooks/
     │   ├── useCommandCatalog.ts
     │   ├── useMentionSearch.ts
    │   ├── useWebSocket.ts
    │   ├── useSession.ts
    │   ├── useTerminal.ts
    │   ├── useViewportResize.ts
    │   └── useLocalStorage.ts
    ├── lib/
     │   ├── commandCatalog.ts  # catálogo versionado de comandos e menções do Copilot CLI
    │   ├── protocol.ts        # tipos espelhados do backend
    │   └── themes.ts          # definições ITheme e CSS tokens para Dracula e VS Code Light
    └── styles/
        ├── connection.module.css
        ├── terminal.module.css
        └── themes.css          # CSS custom properties por data-theme
```

---

## 13. Adaptação Necessária no Backend

Para o frontend funcionar em browsers e suportar menções `@...` com busca eficiente, o backend precisa de **duas alterações**:

### Aceitar token via query parameter

O construtor `new WebSocket(url)` em browsers não suporta headers customizados. O backend precisa aceitar autenticação via `?token=<TOKEN>` na URL de conexão, além do header `Authorization: Bearer`.

Mudança necessária em `websocketServer.ts`:

```typescript
// Extrair token do header OU do query parameter
const token = extractBearerToken(req) ?? new URL(req.url!, `http://${req.headers.host}`).searchParams.get('token');
```

**Requisito de segurança**: essa mudança só é segura se a conexão usar TLS (`wss://`). Documentar isso.

### Suportar busca eficiente para menções `@file` e `@folder`

O backend deve expor busca remota pelo mesmo WebSocket da sessão.

**Requisitos funcionais**:
- Nova mensagem `context.search` com escopo preso ao `sessionId` ativo.
- Resposta `context.search.results` com caminhos relativos, tipo do item e label amigável.
- Busca limitada ao `cwd` validado da sessão.
- Suporte inicial a `mentionType: file | folder | workspace`.

**Requisitos de performance**:
- Preferir busca com `rg` por ser a opção mais rápida e consistente no ambiente Linux alvo.
- Para `@file`, priorizar busca por caminho/nome de arquivo com limite de resultados.
- Para `@folder`, priorizar diretórios.
- Aplicar limite de 20 a 50 resultados por query.
- Cancelar ou descartar resultados de queries antigas quando uma nova busca chegar.
- O cliente deve aplicar debounce de 150ms a 250ms antes de disparar a busca.

**Diretriz de implementação**:
- No backend, usar `rg` de forma segura, sem shell interpolation insegura.
- Encapsular a busca em um serviço próprio, por exemplo `src/security/contextSearch.ts` ou `src/sessions/ContextSearchService.ts`.
- Em caso de workspace muito grande, considerar cache curto em memória por sessão ou índice temporário, mas isso é otimização posterior.

**Contrato de inserção final**:
- Depois que o usuário escolher um resultado, o frontend insere a menção resolvida no input; o backend não precisa reescrever o prompt final.
- Exemplo final inserido: `@file src/server.ts `.

---

## 14. Fases de Implementação

### Fase 1: Setup e layout estático
1. Inicializar projeto Vite + React + TypeScript.
2. Configurar CSS base mobile-first.
3. Implementar tela de conexão (formulário estático).
4. Implementar layout do terminal (sem xterm ainda).

### Fase 2: WebSocket e xterm.js
1. Implementar `useWebSocket` com reconexão.
2. Integrar `@xterm/xterm` com addon-fit.
3. Conectar WebSocket → xterm para output.
4. Implementar `session.create` e recepção de `session.ready`.
5. Estender o protocolo com `context.search` e `context.search.results`.

### Fase 3: Input e interação
1. Implementar InputBar com envio de texto.
2. Implementar QuickActions (teclas especiais).
3. Implementar Command Picker com catálogo inicial de comandos do Copilot CLI e inserção no input.
4. Implementar fluxo de menções `@...` com busca remota de arquivos/pastas e sheet de sugestões.
5. Implementar toggle raw mode.
6. Implementar resize responsivo ao teclado virtual.

### Fase 4: Backend para menções e polish
1. Implementar serviço de busca eficiente com `rg` no backend.
2. Restringir a busca ao `cwd` da sessão e à allowlist existente.
3. Descartar buscas antigas e limitar resultados.
4. Testar em dispositivos reais (iOS Safari, Android Chrome).

### Fase 5: Estados e polish
1. Implementar estados visuais (conectando, erro, encerrada).
2. Implementar reconexão automática.
3. Implementar persistência localStorage.
4. Refinar UX de menções recentes, highlight de match e empty states.

---

## 15. Critérios de Aceite

1. Usuário abre a app no celular, preenche URL/token/cwd e conecta.
2. Output do Copilot aparece com cores ANSI preservadas e legíveis.
3. Texto digitado no input chega ao processo remoto corretamente.
4. Botão `Commands` abre uma lista mobile-first com o catálogo homologado de comandos do Copilot CLI.
5. Selecionar um comando insere o texto no input sem executar automaticamente.
6. Comandos iniciados por `@file` e `@folder` disparam busca remota eficiente no workspace da sessão.
7. Selecionar um resultado de busca insere a menção resolvida no input sem perder o restante do prompt.
8. A busca de menções respeita o `cwd` da sessão e não retorna caminhos fora da allowlist.
9. Teclas especiais (setas, Ctrl+C, Tab, Esc) funcionam via barra de ações rápidas.
10. Ao abrir/fechar o teclado virtual, o terminal redimensiona e o PTY é atualizado.
11. Desconexão mostra feedback visual e oferece reconexão.
12. Encerrar sessão mata o processo no backend e mostra confirmação.
13. A aplicação é usável em telas de 320px de largura.
14. Todos os botões e inputs respeitam tamanho mínimo de toque (44px).
15. Mudar de portrait para landscape funciona sem quebrar o layout.

---

## 16. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| xterm.js input bugado em iOS Safari | Usar input nativo separado (InputBar) em vez de captura direta do xterm |
| Teclado virtual sobrepõe terminal | Usar `100dvh` e `visualViewport` API |
| Token exposto em query parameter | Exigir TLS (wss://) e documentar |
| Latência alta de rede torna terminal inutilizável | Mostrar indicador de latência, buffer input local |
| Colar texto longo trava o PTY | Chunk paste em pedaços de 256 bytes com delay de 10ms entre eles |
| Catálogo de comandos ficar defasado em relação à versão do CLI | Versionar `commandCatalog.ts` e revisar sempre que a versão homologada do Copilot CLI mudar |
| Busca de menções ficar lenta em repositórios grandes | Usar `rg`, debounce no cliente, limite de resultados e descarte de queries antigas |
| Menção retornar arquivos fora do escopo esperado | Restringir a busca ao `cwd` da sessão e validar contra allowlist no backend |
| UX de `@...` competir com teclado virtual e sheet móvel | Usar sheet leve, foco persistente e resultados incrementais |

---

## 17. Perguntas em Aberto

1. O backend deve servir o frontend como estático (ex: express.static) ou será deploy separado?
2. Permitir múltiplas conexões salvas (favoritos) ou apenas último servidor?
3. Incluir botão de "copiar output" que copia o conteúdo visível do terminal para clipboard?
4. Implementar font size ajustável via gesture (pinch-to-zoom) ou apenas botões +/-?
