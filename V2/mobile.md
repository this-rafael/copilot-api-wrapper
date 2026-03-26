# Plano de Implementação: App Mobile V2

**Data**: 2026-03-16  
**Base de entrada**: [V2/V2.MD](V2.MD), [client/frontend-spec.md](../client/frontend-spec.md), [docs/MOBILE_FRONTEND_REVIEW.md](../docs/MOBILE_FRONTEND_REVIEW.md)

## Resumo Executivo

Objetivo: criar um aplicativo mobile nativo para iOS e Android que permita operar o backend V2 via WebSocket, iniciar e controlar sessões remotas do Copilot, visualizar o terminal com rendering ANSI real e usar comandos, menções e autocomplete em uma experiência otimizada para toque.

Decisão de stack para mobile:

1. **Expo + React Native + Expo Router** para shell nativo, navegação, build e distribuição.
2. **WebView com xterm.js** para o terminal, em vez de tentar emular terminal nativamente.
3. **Pacote compartilhado** para protocolo, parsing, hooks de conexão e regras de negócio comuns entre web e mobile.
4. **Backend V2 em Go** como alvo principal, mantendo compatibilidade com o protocolo WebSocket da V1 durante a transição.

O app mobile não deve ser tratado como um wrapper visual do frontend web. Ele precisa ter UX própria para teclado virtual, safe areas, reconexão, estado de sessão, input de prompt e ações rápidas. O terminal será embutido em WebView porque isso reduz risco técnico, mantém compatibilidade com ANSI/xterm e preserva a maior parte da lógica já validada no frontend atual.

## Objetivos do Produto

### Objetivo principal

Permitir que um usuário abra o app no celular, selecione um servidor, autentique-se, escolha um workspace permitido, inicie uma sessão remota do Copilot e interaja com ela de forma estável e confortável.

### Metas funcionais

1. Conectar em backend via `ws://` ou `wss://` com token.
2. Criar, acompanhar e encerrar uma sessão remota.
3. Renderizar terminal com ANSI, scroll, seleção de texto e resize real.
4. Enviar comandos e prompts por input nativo otimizado para touch.
5. Oferecer quick actions para teclas que não existem no teclado virtual.
6. Suportar catálogo de comandos homologados do Copilot.
7. Suportar menções `@file`, `@folder` e `@workspace` com busca remota.
8. Persistir servidores, workspaces recentes, preferências visuais e comandos recentes.

### Metas não funcionais

1. Abrir rapidamente em rede local ou internet com baixa fricção.
2. Funcionar bem em telas de 320 px a tablets.
3. Tolerar perda temporária de conectividade sem corromper o estado da UI.
4. Não depender de teclado físico.
5. Ser distribuível via Expo/EAS.

### Fora do escopo do MVP

1. Multiplexação de várias sessões simultâneas no app.
2. Execução offline.
3. Notificações push completas com reanexação automática à sessão.
4. Terminal nativo sem WebView.
5. Sincronização em nuvem de servidores salvos.

## Decisões Técnicas

### Por que Expo

1. Reduz tempo de setup para iOS e Android.
2. Simplifica distribuição por EAS.
3. Resolve bem assets, fontes, permissões, ícones e build pipeline.
4. É suficiente para o nível de integração nativa exigido neste app.

### Por que WebView + xterm.js

1. O terminal atual já depende de semântica ANSI e do ecossistema xterm.
2. Reescrever renderer de terminal em React Native seria caro e arriscado.
3. A bridge entre React Native e WebView é adequada para input/output incremental se houver batching.
4. O pacote `@fressh/react-native-xtermjs-webview` ou uma implementação própria com `react-native-webview` viabilizam o terminal com menor risco.

### Por que shared package

1. O protocolo WebSocket deve permanecer consistente entre web e mobile.
2. Parsing de menções, catálogo de comandos, autocomplete e regras de sessão não devem ser duplicados.
3. Hooks como `useWebSocket`, `useSession` e `useWorkspaceCatalog` podem ser compartilhados com pequenas abstrações de plataforma.

## Requisitos de Produto

### Perfis de uso

1. Usuário em rede local operando o wrapper em uma máquina da mesma LAN.
2. Usuário acessando um backend exposto com `wss://` por reverse proxy.
3. Usuário alternando entre celular e tablet.
4. Usuário operando sessões curtas de prompt e inspeção de output, não trabalho intensivo de shell geral.

### Cenários críticos

1. Abrir o app e reconectar rápido ao último servidor usado.
2. Abrir o teclado virtual sem perder o terminal da área visível.
3. Enviar `Ctrl+C`, `Tab`, `Esc`, setas e `Ctrl+L` com um toque.
4. Pesquisar um `@file` e inserir a menção correta no prompt.
5. Alternar tema e tamanho da fonte sem resetar a sessão.
6. Detectar saída de sessão e devolver o usuário para um estado seguro.

## Arquitetura Mobile

```text
mobile/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── connect.tsx
│   ├── terminal.tsx
│   └── settings.tsx
├── components/
│   ├── ConnectionForm.tsx
│   ├── ServerPicker.tsx
│   ├── WorkspacePicker.native.tsx
│   ├── CommandPicker.native.tsx
│   ├── MentionSheet.native.tsx
│   ├── InputBar.native.tsx
│   ├── QuickActions.native.tsx
│   ├── SessionHeader.native.tsx
│   ├── TerminalWebView.tsx
│   ├── TerminalStatusBanner.tsx
│   └── ConfirmCloseSheet.tsx
├── hooks/
│   ├── useKeyboardInsets.ts
│   ├── useTerminalBridge.ts
│   ├── useAppLifecycle.ts
│   └── useSavedServers.ts
├── lib/
│   ├── storage/
│   ├── bridge/
│   ├── native/
│   └── theme/
├── assets/
│   ├── terminal.html
│   └── fonts/
└── package.json
```

### Dependências de responsabilidade

1. O shell React Native controla navegação, formulários, armazenamento local, permissões, UX de toque e lifecycle do app.
2. O WebView controla apenas rendering de terminal, captura de input do terminal e aplicação de temas/resize.
3. O pacote compartilhado controla protocolo, parsing, hooks de sessão, menções, autocomplete, catálogo e normalização de dados.

## Estrutura do Monorepo

```text
packages/
├── shared/
│   ├── src/
│   │   ├── protocol.ts
│   │   ├── mentions.ts
│   │   ├── autocomplete.ts
│   │   ├── commandCatalog.ts
│   │   ├── terminalInput.ts
│   │   ├── terminalOutput.ts
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useSession.ts
│   │   │   ├── useWorkspaceCatalog.ts
│   │   │   ├── useMentionSearch.ts
│   │   │   └── usePromptAutocomplete.ts
│   │   └── platform/
│   │       ├── storage.ts
│   │       └── timers.ts
│   └── package.json
├── terminal-html/
│   ├── src/
│   │   ├── index.html
│   │   ├── terminal.ts
│   │   ├── bridge.ts
│   │   └── themes.ts
│   └── package.json
└── open-port-to-lan-mcp/
```

### Estratégia de reaproveitamento do código atual

Migrar ou adaptar do frontend atual para `packages/shared`:

1. `protocol.ts`
2. `mentions.ts`
3. `autocomplete.ts`
4. `terminalOutput.ts`
5. `terminalInput.ts`
6. `commandCatalog.ts`
7. `useWebSocket`
8. `useSession`
9. `useWorkspaceCatalog`
10. `useMentionSearch`
11. `usePromptAutocomplete`

Reescrever especificamente para mobile:

1. `InputBar`
2. `WorkspacePicker`
3. `CommandPicker`
4. `TerminalScreen`
5. `Header`
6. `QuickActions`
7. Persistência local e servidor recente
8. Bridge do terminal

## Fluxos de Navegação

### Fluxo 1: Onboarding inicial

1. Usuário abre o app.
2. App carrega servidores recentes e preferências locais.
3. Se não houver servidor salvo, abre tela de conexão vazia.
4. Usuário informa URL, token e nome do servidor.
5. App valida formato básico e salva rascunho local.
6. Usuário toca em conectar.

### Fluxo 2: Conexão e seleção de workspace

1. App abre socket autenticado.
2. Busca catálogo de workspaces disponíveis.
3. Usuário escolhe workspace permitido ou cadastra um customizado.
4. Usuário escolhe perfil de comando.
5. App envia `session.create`.
6. Ao receber `session.ready`, navega para a tela do terminal.

### Fluxo 3: Sessão ativa

1. Terminal recebe output incremental.
2. Usuário digita no composer nativo.
3. Usuário pode abrir catálogo de comandos.
4. Usuário pode abrir sheet de menções.
5. Usuário usa quick actions para teclas especiais.
6. App acompanha status da sessão, reconexão e eventuais erros.

### Fluxo 4: Encerramento

1. Usuário toca em encerrar.
2. App pede confirmação.
3. App envia `session.close`.
4. Ao receber `session.exit`, limpa estado ativo e retorna para a tela anterior.

### Fluxo 5: Falha de conexão

1. Socket cai.
2. Banner informa perda de conexão.
3. App tenta reconexão do socket apenas se ainda fizer sentido.
4. Sessão anterior não é assumida como recuperável até confirmação explícita do backend.
5. Se a sessão morreu, usuário deve criar nova sessão.

## Design de Telas

### Tela de conexão

Campos:

1. Nome do servidor
2. URL do backend
3. Token
4. Workspace inicial opcional
5. Perfil de comando padrão

Ações:

1. Conectar
2. Carregar workspaces
3. Adicionar workspace customizado
4. Gerenciar servidores salvos

Comportamentos:

1. `Token` deve ter opção de mostrar/ocultar.
2. URL deve ser normalizada e validada.
3. Últimos servidores devem aparecer como lista rápida.
4. Erros devem ser inline e objetivos.

### Tela de terminal

Áreas fixas:

1. Header de sessão
2. Banner de status
3. Área do terminal
4. Quick actions
5. Composer nativo

Comportamentos:

1. Header mostra servidor, workspace e estado da conexão.
2. Terminal ocupa o máximo da área útil respeitando safe area.
3. Quick actions ficam sempre acessíveis.
4. Composer não pode ser encoberto pelo teclado virtual.
5. O app precisa funcionar bem em portrait e landscape.

### Tela de configurações

Preferências:

1. Tema
2. Tamanho da fonte
3. Mostrar timestamps no output local
4. Vibração tátil em ações rápidas
5. Limpar servidores recentes
6. Limpar cache local

## Contrato com o Backend

### Mensagens obrigatórias do MVP

Cliente para servidor:

1. `session.create`
2. `terminal.input`
3. `terminal.resize`
4. `session.close`
5. `workspace.list`
6. `workspace.addCustom`
7. `workspace.discoverGit`
8. `context.search`
9. `autocomplete.request`
10. `autocomplete.accept`

Servidor para cliente:

1. `session.ready`
2. `terminal.output`
3. `session.exit`
4. `session.error`
5. `workspace.list.results`
6. `context.search.results`
7. `autocomplete.results`
8. `autocomplete.status`

### Regras de compatibilidade

1. O protocolo deve permanecer compatível com o frontend atual.
2. O mobile deve tratar mensagens desconhecidas de forma tolerante.
3. Falhas de parsing não podem derrubar a tela inteira.
4. Campos opcionais devem ter fallback local.

## Bridge React Native ↔ Terminal WebView

### Responsabilidades do WebView

1. Inicializar xterm.js.
2. Aplicar tema, tamanho de fonte e addons.
3. Renderizar output incremental com `terminal.write()`.
4. Coletar `onData`, seleção, foco e métricas de terminal.
5. Receber comandos do app por `postMessage`.

### Responsabilidades do app nativo

1. Enviar chunks de output ao WebView.
2. Enviar eventos de resize e tema.
3. Receber dados digitados dentro do terminal, caso habilitado.
4. Coordenar input nativo com input do terminal.
5. Detectar readiness da bridge.

### Contrato de mensagens da bridge

App para WebView:

```json
{
	"type": "write",
	"data": "...ansi..."
}
```

```json
{
	"type": "resize",
	"cols": 80,
	"rows": 24
}
```

```json
{
	"type": "theme",
	"theme": "dracula"
}
```

```json
{
	"type": "fontSize",
	"value": 14
}
```

WebView para app:

```json
{
	"type": "ready"
}
```

```json
{
	"type": "input",
	"data": "ls\r"
}
```

```json
{
	"type": "metrics",
	"cols": 80,
	"rows": 24
}
```

```json
{
	"type": "selection",
	"text": "..."
}
```

### Decisões importantes da bridge

1. Output do backend deve ser acumulado e enviado em lotes curtos para evitar excesso de `postMessage`.
2. O WebView não deve ser recriado a cada mudança de estado de React.
3. Tema e fonte devem ser atualizados in-place.
4. Se o WebView falhar, a UI deve indicar erro recuperável e permitir recriação controlada.

## Gestão de Estado

### Estado persistente

Armazenar com `AsyncStorage` ou `SecureStore` conforme o tipo de dado:

1. Servidores salvos
2. Último servidor usado
3. Último workspace usado por servidor
4. Tema
5. Tamanho da fonte
6. Comandos recentes
7. Menções recentes

### Estado sensível

Guardar em `expo-secure-store`:

1. Token por servidor
2. Credenciais de ambientes protegidos

### Estado volátil

Manter apenas em memória:

1. Socket ativo
2. Sessão ativa
3. Output acumulado da sessão atual
4. Sugestões de menção abertas
5. Estado de autocomplete
6. Estado de reconexão

## Segurança

### Requisitos mínimos

1. Nunca logar token em texto puro.
2. Não mostrar token completo na UI após salvar.
3. Exigir `wss://` ou warning explícito para conexões externas.
4. Permitir `ws://` apenas para ambientes locais ou explícitos.
5. Validar URL e impedir formatos perigosos ou inválidos.

### Requisitos recomendados

1. Desbloqueio biométrico para revelar token salvo.
2. Timeout local para ocultar dados sensíveis quando o app vai para background.
3. Opção para limpar todos os tokens armazenados.
4. Sanitização de logs e eventos analíticos.

## UX Mobile Específica

### Input

1. O input principal deve ser um composer nativo, não o campo interno do terminal.
2. O composer precisa suportar multiline curto, cursor, colagem e edição confortável.
3. Deve existir botão explícito de envio.
4. Raw mode precisa ser visualmente claro e difícil de ativar por acidente.

### Quick actions

Botões mínimos:

1. `↑`
2. `↓`
3. `←`
4. `→`
5. `Tab`
6. `Esc`
7. `Ctrl+C`
8. `Ctrl+D`
9. `Ctrl+L`
10. `Paste`

### Safe area e teclado virtual

1. Usar `react-native-safe-area-context`.
2. Usar `KeyboardAvoidingView` ou solução equivalente baseada em insets reais.
3. Tratar Android e iOS separadamente quando necessário.
4. Garantir que o composer nunca desapareça sob o teclado.

### Feedback

1. Haptic feedback em quick actions e ações destrutivas.
2. Banner persistente em reconexão.
3. Empty states claros para menções e workspaces.
4. Diálogos de confirmação curtos e inequívocos.

## Autocomplete e Menções

### Menções

Fluxo:

1. Usuário digita `@`.
2. App detecta token ativo no cursor.
3. App aciona `context.search` com debounce.
4. Sheet mostra resultados compatíveis.
5. Usuário seleciona item.
6. App substitui apenas o token ativo no texto.

Regras:

1. `@workspace` pode ser resolvido localmente ou com resposta trivial.
2. Resultados devem usar caminhos relativos.
3. Busca obsoleta deve ser descartada.
4. Se não houver sessão, a busca não deve ser disparada.

### Prompt autocomplete

Fluxo:

1. Usuário digita no composer.
2. App envia `autocomplete.request` com cursor, texto e linguagem.
3. Sugestão aparece como preview inline ou assist card acima do composer.
4. Usuário aceita com `Tab` virtual ou botão `Aceitar`.
5. App envia `autocomplete.accept` e atualiza o texto.

## Integração com Workspaces

### Capacidades do app

1. Listar workspaces disponíveis.
2. Adicionar custom workspace.
3. Disparar descoberta de repositórios Git quando suportado.
4. Mostrar histórico de workspaces recentes por servidor.

### Regras de UX

1. Não expor paths absolutos de forma desnecessária na UI principal.
2. Mostrar label amigável, mantendo path completo apenas em detalhe expandido.
3. Separar workspaces padrão de workspaces customizados.
4. Manter o último workspace escolhido como default do servidor.

## Observabilidade

### Logs locais

Registrar localmente, com redaction:

1. Ciclo de vida do socket
2. Criação e encerramento de sessão
3. Erros da bridge do WebView
4. Falhas de parsing de protocolo
5. Tempo de carregamento da tela inicial

### Métricas úteis

1. Tempo até `session.ready`
2. Latência média de output até render
3. Taxa de reconexão
4. Taxa de falha de criação de sessão
5. Taxa de falha da bridge WebView

## Plano de Implementação por Fases

## Fase 0: Fundamentos do monorepo e shared code

### Objetivo

Preparar o repositório para compartilhar código entre web e mobile e isolar o bundle HTML do terminal.

### Entregas

1. Criar `pnpm-workspace.yaml` se ainda não existir.
2. Criar `packages/shared`.
3. Criar `packages/terminal-html`.
4. Extrair libs e hooks reaproveitáveis do frontend atual.
5. Ajustar imports do frontend atual para consumir `shared`.

### Critério de saída

1. Web atual continua funcionando.
2. `shared` compila isoladamente.
3. `terminal-html` gera um bundle utilizável.

## Fase 1: Scaffold do app mobile

### Objetivo

Criar o shell do app e a estrutura base do projeto.

### Entregas

1. `create-expo-app` com TypeScript.
2. Configurar `expo-router`.
3. Instalar `react-native-webview`.
4. Instalar `react-native-safe-area-context`.
5. Instalar `expo-secure-store`, `@react-native-async-storage/async-storage`, `expo-haptics` e `expo-clipboard`.
6. Definir tema base e fontes.

### Critério de saída

1. App abre no simulador e dispositivo.
2. Navegação entre `connect`, `terminal` e `settings` funciona.

## Fase 2: Persistência local e conexão

### Objetivo

Permitir cadastrar servidores, salvar tokens com segurança e abrir socket com resiliência.

### Entregas

1. Modelo de `SavedServer`.
2. Camada de storage com `SecureStore` + `AsyncStorage`.
3. `useSavedServers`.
4. `ConnectionForm`.
5. Validação de URL/token.
6. Integração com `useWebSocket` compartilhado ou adaptado.

### Critério de saída

1. Usuário consegue salvar e reutilizar servidores.
2. App conecta e mostra estado claro de sucesso ou erro.

## Fase 3: Workspaces e criação de sessão

### Objetivo

Concluir o fluxo que sai da conexão e entra em sessão ativa.

### Entregas

1. `WorkspacePicker.native.tsx`.
2. Integração com `workspace.list`.
3. Suporte a `workspace.addCustom`.
4. Suporte a `workspace.discoverGit`.
5. Seleção de perfil de comando.
6. Criação de sessão e navegação para terminal.

### Critério de saída

1. Usuário consegue criar uma sessão real a partir do app.

## Fase 4: Terminal WebView funcional

### Objetivo

Ter rendering real do terminal e envio/recebimento estáveis.

### Entregas

1. `terminal-html` com xterm.js e bridge.
2. `TerminalWebView.tsx`.
3. `useTerminalBridge.ts`.
4. Batching de output.
5. Resize via métricas do terminal.
6. Tema e fonte configuráveis.

### Critério de saída

1. Output ANSI é renderizado corretamente.
2. O terminal não reinicia a cada render.

## Fase 5: Composer, quick actions e ergonomia

### Objetivo

Substituir a dependência do input do terminal por uma UX mobile de verdade.

### Entregas

1. `InputBar.native.tsx`.
2. `QuickActions.native.tsx`.
3. Raw mode explícito.
4. Clipboard paste.
5. Haptics.
6. Ajuste fino com teclado virtual.

### Critério de saída

1. O app é utilizável sem teclado físico.

## Fase 6: Catálogo de comandos, menções e autocomplete

### Objetivo

Adicionar produtividade e reduzir digitação longa no mobile.

### Entregas

1. `CommandPicker.native.tsx`.
2. `MentionSheet.native.tsx`.
3. `useMentionSearch` conectado ao backend.
4. `usePromptAutocomplete` adaptado ao composer nativo.
5. Histórico de comandos e menções.

### Critério de saída

1. O usuário consegue montar prompts complexos sem digitar tudo manualmente.

## Fase 7: Sessão robusta e lifecycle do app

### Objetivo

Tratar background, foreground, rotação, perda de rede e erros sem degradar a sessão silenciosamente.

### Entregas

1. `useAppLifecycle.ts`.
2. Tratamento de background/foreground.
3. Política de reconexão.
4. Re-hidratação parcial da UI.
5. Alertas de sessão encerrada.

### Critério de saída

1. O usuário entende claramente o estado real da sessão após interrupções.

## Fase 8: Polimento, QA e release

### Objetivo

Fechar qualidade, documentação e pipeline de distribuição.

### Entregas

1. Testes automatizados.
2. Checklist manual Android/iOS.
3. Ícones, splash e metadata.
4. EAS build.
5. Estratégia de release interno.

### Critério de saída

1. App instalável em dispositivos reais com fluxo end-to-end validado.

## Backlog Detalhado de Implementação

## Fase 0

- [ ] M001 Criar `packages/shared/package.json`, `tsconfig.json` e `src/`
- [ ] M002 Extrair `protocol.ts` do frontend atual para `packages/shared/src/protocol.ts`
- [ ] M003 Extrair `mentions.ts` para `packages/shared/src/mentions.ts`
- [ ] M004 Extrair `autocomplete.ts` para `packages/shared/src/autocomplete.ts`
- [ ] M005 Extrair `terminalInput.ts` e `terminalOutput.ts`
- [ ] M006 Extrair `commandCatalog.ts`
- [ ] M007 Extrair hooks compartilháveis para `packages/shared/src/hooks`
- [ ] M008 Criar `packages/terminal-html`
- [ ] M009 Implementar build single-file do HTML do terminal
- [ ] M010 Ajustar frontend web atual para consumir `shared`

## Fase 1

- [ ] M011 Criar projeto Expo em `mobile/`
- [ ] M012 Configurar `expo-router`
- [ ] M013 Configurar aliases de import para `@copilot-wrapper/shared`
- [ ] M014 Instalar WebView e dependências de storage/secure storage
- [ ] M015 Criar layout base com safe areas
- [ ] M016 Criar tela `connect`
- [ ] M017 Criar tela `terminal`
- [ ] M018 Criar tela `settings`
- [ ] M019 Configurar tema inicial
- [ ] M020 Configurar fontes e assets

## Fase 2

- [ ] M021 Definir tipo `SavedServer`
- [ ] M022 Criar storage para metadados de servidor
- [ ] M023 Criar storage seguro para tokens
- [ ] M024 Criar `useSavedServers`
- [ ] M025 Criar formulário de conexão com validação
- [ ] M026 Implementar adicionar/editar/remover servidor salvo
- [ ] M027 Implementar abrir conexão a partir de servidor salvo
- [ ] M028 Exibir feedback de loading/erro de socket

## Fase 3

- [ ] M029 Integrar `workspace.list`
- [ ] M030 Criar UI de seleção de workspace
- [ ] M031 Implementar `workspace.addCustom`
- [ ] M032 Implementar `workspace.discoverGit`
- [ ] M033 Criar picker de perfil de comando
- [ ] M034 Enviar `session.create`
- [ ] M035 Navegar para `terminal` ao receber `session.ready`
- [ ] M036 Lidar com `session.error` na tela de conexão

## Fase 4

- [ ] M037 Criar `packages/terminal-html/src/index.html`
- [ ] M038 Inicializar xterm.js com addons necessários
- [ ] M039 Implementar bridge `postMessage`
- [ ] M040 Criar `TerminalWebView.tsx`
- [ ] M041 Criar `useTerminalBridge.ts`
- [ ] M042 Implementar batching de output do backend
- [ ] M043 Implementar tema dinâmico
- [ ] M044 Implementar mudança dinâmica de font size
- [ ] M045 Implementar resize sincronizado app/WebView/backend
- [ ] M046 Tratar erro de bridge e fallback de recriação

## Fase 5

- [ ] M047 Criar `InputBar.native.tsx`
- [ ] M048 Criar `QuickActions.native.tsx`
- [ ] M049 Mapear sequências de controle
- [ ] M050 Implementar enviar prompt normal com `\r`
- [ ] M051 Implementar raw mode
- [ ] M052 Integrar paste do clipboard
- [ ] M053 Adicionar haptic feedback configurável
- [ ] M054 Ajustar teclado virtual com `KeyboardAvoidingView`
- [ ] M055 Garantir layout estável em portrait e landscape

## Fase 6

- [ ] M056 Integrar catálogo de comandos do pacote compartilhado
- [ ] M057 Criar `CommandPicker.native.tsx`
- [ ] M058 Integrar inserção no cursor do composer
- [ ] M059 Integrar parser de menções
- [ ] M060 Criar `MentionSheet.native.tsx`
- [ ] M061 Ligar `context.search` ao backend
- [ ] M062 Implementar substituição do token ativo
- [ ] M063 Integrar autocomplete de prompt
- [ ] M064 Implementar aceitar sugestão com botão e `Tab`
- [ ] M065 Persistir comandos e menções recentes

## Fase 7

- [ ] M066 Criar `useAppLifecycle.ts`
- [ ] M067 Detectar background e foreground
- [ ] M068 Pausar ações não essenciais em background
- [ ] M069 Restaurar UI ao voltar ao foreground
- [ ] M070 Exibir estado de reconexão
- [ ] M071 Impedir falsa impressão de sessão viva após perda de conexão
- [ ] M072 Implementar warning para sessão encerrada remotamente
- [ ] M073 Implementar encerramento seguro ao sair da tela

## Fase 8

- [ ] M074 Configurar testes unitários e de componente
- [ ] M075 Testar bridge do terminal em ambiente controlado
- [ ] M076 Criar checklist manual Android
- [ ] M077 Criar checklist manual iOS
- [ ] M078 Configurar build EAS para preview interna
- [ ] M079 Gerar ícones, splash e assets finais
- [ ] M080 Documentar setup, uso e troubleshooting do app mobile

## Estratégia de Testes

### Testes unitários

Cobrir:

1. Parsing de menções
2. Inserção no cursor
3. Catálogo de comandos
4. Persistência local
5. Mapeamento de quick actions

### Testes de componente

Cobrir:

1. Formulário de conexão
2. Pickers e sheets
3. Composer
4. Banners de estado
5. Header de sessão

### Testes de integração

Cobrir:

1. Conexão com backend fake
2. Ciclo `session.create` → `session.ready`
3. Streaming de output para WebView
4. Menções com resposta do backend
5. Encerramento de sessão

### Testes manuais obrigatórios

Android:

1. Conectar em servidor local na mesma rede
2. Abrir teclado virtual e digitar prompt longo
3. Usar quick actions
4. Alternar orientation
5. Encerrar e recriar sessão

iOS:

1. Repetir todos os fluxos críticos
2. Validar `KeyboardAvoidingView`
3. Validar scroll e safe area
4. Validar seleção e cópia de texto do terminal

## Critérios de Aceite do MVP

1. Usuário salva um servidor com token e reconecta sem reconfiguração manual.
2. Usuário escolhe um workspace e inicia uma sessão real.
3. O terminal renderiza ANSI corretamente em WebView.
4. O composer nativo envia prompts com estabilidade.
5. Quick actions cobrem o conjunto mínimo de teclas especiais.
6. O teclado virtual não inutiliza a tela.
7. Menções `@file`, `@folder` e `@workspace` funcionam.
8. Catálogo de comandos insere comandos corretamente.
9. O app informa de forma confiável quando a sessão morreu.
10. O app roda em Android e iOS com comportamento consistente.

## Cronograma Sugerido

| Fase | Escopo | Estimativa |
|---|---|---|
| 0 | Shared code + terminal-html | 2-3 dias |
| 1 | Scaffold Expo + navegação | 1-2 dias |
| 2 | Persistência + conexão | 2 dias |
| 3 | Workspaces + sessão | 2 dias |
| 4 | Terminal WebView | 3-4 dias |
| 5 | Composer + quick actions | 2-3 dias |
| 6 | Comandos + menções + autocomplete | 3-4 dias |
| 7 | Lifecycle + robustez | 2 dias |
| 8 | QA + release interna | 2-3 dias |
| Total | MVP mobile | 17-23 dias |

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Performance ruim do WebView em aparelhos fracos | Médio | Batching de output, desabilitar efeitos visuais supérfluos, medir throughput |
| Teclado virtual quebrar layout | Alto | Tratar iOS/Android separadamente, usar insets reais, validar em device físico |
| Bridge do WebView perder mensagens sob alto volume | Médio | Fila local, batching curto e monitoramento de erro da bridge |
| Divergência entre protocolo web e mobile | Alto | Extrair protocolo para `packages/shared` e testar contrato |
| Armazenamento inseguro de token | Alto | `expo-secure-store`, redaction e limpeza explícita |
| Reconexão transmitir falsa sensação de sessão viva | Alto | Separar estado do socket e estado da sessão; exigir confirmação do backend |

## Pós-MVP Recomendado

1. Biometria para revelar ou reutilizar tokens sensíveis.
2. Compartilhamento de logs de diagnóstico.
3. Push notification para término de sessão longa.
4. Modo tablet com layout de duas colunas.
5. Histórico local de sessões recentes.
6. Deep links para abrir servidor específico.
7. Distribuição beta via TestFlight e Play Internal Testing.

## Ordem Recomendada de Execução

1. Extrair `packages/shared` e `packages/terminal-html`.
2. Subir o app Expo com rotas vazias.
3. Implementar persistência de servidores e conexão.
4. Implementar seleção de workspace e criação de sessão.
5. Integrar terminal WebView e streaming de output.
6. Fechar composer, quick actions e teclado virtual.
7. Adicionar catálogo de comandos, menções e autocomplete.
8. Endurecer lifecycle, reconexão e tratamento de erro.
9. Finalizar QA, docs e release preview.

## Veredicto

O caminho tecnicamente mais seguro para o app mobile V2 é Expo + React Native com terminal em WebView e lógica compartilhada em pacote comum. Essa abordagem preserva a semântica do terminal real, minimiza duplicação com o frontend web e ataca o problema correto: UX mobile de sessão remota, e não apenas “mostrar o site dentro de um app”.
