# Tarefas: Frontend Mobile-First para o Copilot WebSocket Wrapper

**Entrada**: `client/plan.md`

## Formato: `[ID] [P?] Descrição`

- **[P]**: Pode executar em paralelo, desde que os pré-requisitos da fase já estejam concluídos

---

## Fase 0: Fundação do frontend

**Objetivo**: criar o pacote `client/` com toolchain, estrutura e contrato mínimo para começar o desenvolvimento sem impactar o backend atual.

**Pré-requisito de bloqueio**: nenhuma fase seguinte deve começar antes desta fase estar concluída.

- [ ] T001 Criar `client/package.json` com React 19, React DOM, Vite 6, TypeScript, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` e dependências de teste do frontend
- [ ] T002 [P] Criar `client/tsconfig.json`, `client/vite.config.ts` e `client/index.html` com configuração mínima para SPA mobile-first
- [ ] T003 [P] Criar estrutura inicial `client/src/`, `client/src/components/`, `client/src/hooks/`, `client/src/lib/`, `client/src/styles/` e `client/tests/`
- [ ] T004 Criar `client/src/main.tsx`, `client/src/App.tsx` e `client/src/global.css` com app shell mínima e layout base usando `100dvh`
- [ ] T005 Criar `client/src/lib/protocol.ts` espelhando o protocolo atual e a extensão planejada para `context.search` e `context.search.results`
- [ ] T006 [P] Adicionar scripts de conveniência no `package.json` da raiz: `client:dev`, `client:build` e `client:test` usando `pnpm --dir client ...`

**Ponto de Verificação**: `pnpm --dir client dev` sobe com tela estática de conexão e `pnpm test` do backend continua passando.

---

## Fase 1: Backend desbloqueado para browser e menções

**Objetivo**: adaptar o servidor WebSocket atual para funcionar em navegador e suportar a extensão de protocolo necessária para `@file`, `@folder` e `@workspace`.

- [ ] T007 Atualizar `src/transport/websocketServer.ts` para aceitar autenticação por query parameter `?token=` além do header `Authorization: Bearer`
- [ ] T008 [P] Atualizar a documentação do backend e de testes manuais para deixar explícito que uso de `?token=` em produção exige `wss://`
- [ ] T009 Estender `src/protocol/messages.ts` com `context.search` no cliente e `context.search.results` no servidor
- [ ] T010 [P] Estender `src/protocol/validators.ts` com schemas Zod para as novas mensagens de busca de contexto
- [ ] T011 Criar um serviço dedicado de busca de contexto, por exemplo `src/sessions/ContextSearchService.ts`, com suporte inicial a `mentionType=file|folder|workspace`
- [ ] T012 Implementar busca por arquivo restrita ao `cwd` da sessão usando `rg` de forma segura, sem shell interpolation insegura
- [ ] T013 [P] Implementar busca por diretório restrita ao `cwd` da sessão e resposta direta para `mentionType=workspace`
- [ ] T014 Garantir que toda resposta de busca retorne caminhos relativos ao `cwd` da sessão e nunca caminhos absolutos ou fora da allowlist
- [ ] T015 Implementar limite configurável de resultados e descarte de buscas obsoletas por sessão para evitar flood e race conditions
- [ ] T016 Integrar `context.search` ao roteamento do `websocketServer.ts`, validando existência da sessão antes de responder
- [ ] T017 [P] Adicionar heartbeat/ping-pong e política de cleanup para conexões mortas sem deixar sessões órfãs
- [ ] T018 Criar teste de integração cobrindo autenticação via query param no handshake WebSocket
- [ ] T019 [P] Criar testes unitários/integração para `context.search`, incluindo escopo por `cwd`, limites, formato relativo e rejeição de tipos inválidos

**Ponto de Verificação**: um browser consegue autenticar com `?token=` e o backend responde corretamente a `context.search` para `file`, `folder` e `workspace`.

---

## Fase 2: Fluxo mínimo de conexão e sessão no frontend

**Objetivo**: permitir que o usuário conecte, crie sessão real, acompanhe o estado da conexão e lide com falhas sem depender ainda do terminal completo.

- [ ] T020 Criar `client/src/hooks/useLocalStorage.ts` para persistir URL, token, `cwd`, raw mode, fonte, tema e itens recentes
- [ ] T021 Criar `client/src/components/ConnectionScreen.tsx` com campos de URL, token e `cwd`, validação básica e feedback inline de erro
- [ ] T022 Criar `client/src/hooks/useWebSocket.ts` com conexão inicial, parse de mensagens, fila curta de mensagens e callbacks de ciclo de vida
- [ ] T023 Implementar reconexão com backoff exponencial em `useWebSocket.ts`, sem recriar automaticamente a sessão após perda do socket
- [ ] T024 Criar `client/src/hooks/useSession.ts` para orquestrar `session.create`, `session.close`, `sessionId`, `ready`, `closed` e erros de sessão
- [ ] T025 Integrar `ConnectionScreen` e `useSession` em `client/src/App.tsx` para suportar o fluxo conectar → criar sessão → mostrar estado ativo
- [ ] T026 [P] Criar `client/src/components/StatusBanner.tsx` para estados de conectando, reconectando, erro de conexão e sessão encerrada
- [ ] T027 [P] Persistir o último servidor, token e `cwd` usados com recuperação automática ao abrir a aplicação
- [ ] T028 Criar testes unitários para `useWebSocket.ts` e `useSession.ts` cobrindo mensagens fake, reconexão e separação entre estado do socket e estado da sessão

**Ponto de Verificação**: o usuário consegue abrir o frontend, conectar ao backend, receber `session.ready`, encerrar a sessão e ver corretamente os estados de erro e reconexão.

---

## Fase 3: Terminal real e input mobile

**Objetivo**: tornar a sessão operável em celular com terminal ANSI, input nativo e teclas especiais sem depender do teclado físico.

- [ ] T029 Criar `client/src/hooks/useTerminal.ts` para inicializar xterm.js, aplicar `FitAddon` e tentar `WebGLAddon` com fallback seguro
- [ ] T030 Criar `client/src/components/TerminalView.tsx` como wrapper imperativo do xterm.js, expondo `write()`, `fit()` e atualização de tema
- [ ] T031 Integrar `terminal.output` do WebSocket ao `terminal.write()` sem acoplar o stream ao estado declarativo do React
- [ ] T032 Criar `client/src/components/InputBar.tsx` com input nativo, botão `Commands`, botão `Enter` e toggle de raw mode
- [ ] T033 Implementar envio de input em modo normal apenas no `Enter`, anexando `\r` ao conteúdo final antes de chamar `terminal.input`
- [ ] T034 [P] Implementar raw mode em `InputBar.tsx`, enviando keystrokes individualmente quando o toggle estiver ativo
- [ ] T035 Criar `client/src/components/QuickActions.tsx` com `↑`, `↓`, `←`, `→`, `Ctrl+C`, `Tab`, `Esc`, `Ctrl+D` e `Ctrl+L`
- [ ] T036 Integrar `QuickActions` ao envio de sequências de controle do PTY e garantir feedback visual de toque em áreas mínimas de 44 px
- [ ] T037 [P] Criar testes de componente para `InputBar.tsx` e `QuickActions.tsx` cobrindo envio, toggle de raw mode e mapeamento de sequências especiais

**Ponto de Verificação**: o frontend renderiza ANSI corretamente, envia input com teclado virtual e controla o PTY com quick actions.

---

## Fase 4: Viewport, resize e adaptação ao teclado virtual

**Objetivo**: resolver o principal risco de usabilidade mobile ao abrir teclado virtual, mudar orientação e recalcular o tamanho real do terminal.

- [ ] T038 Criar `client/src/hooks/useViewportResize.ts` usando `visualViewport.resize` com fallback para `window.resize`
- [ ] T039 Integrar `useViewportResize.ts` ao `useTerminal.ts` e aplicar debounce de 150 ms para `FitAddon.fit()`
- [ ] T040 Enviar `terminal.resize` ao backend sempre que `cols` e `rows` mudarem após teclado virtual, rotação ou resize do container
- [ ] T041 Ajustar layout global e da tela de terminal para `100dvh`, `flex-column` e áreas fixas de header, quick actions e input
- [ ] T042 Implementar comportamento responsivo para portrait e landscape, incluindo scroll horizontal ou condensação das quick actions quando necessário
- [ ] T043 [P] Criar checklist manual de validação para Android Chrome e iOS Safari cobrindo teclado virtual, scroll e orientação

**Ponto de Verificação**: abrir e fechar o teclado virtual não cobre o terminal, e o backend recebe resize coerente com a área visível em portrait e landscape.

---

## Fase 5: Command Picker e catálogo homologado

**Objetivo**: reduzir digitação longa no mobile com um catálogo local, versionado e pesquisável de comandos homologados do Copilot CLI.

**Pré-requisito de bloqueio**: antes de fechar esta fase, a versão homologada do Copilot CLI deve estar definida.

- [ ] T044 Definir e documentar a versão homologada do GitHub Copilot CLI que servirá de base para o catálogo do frontend
- [ ] T045 Criar `client/src/lib/commandCatalog.ts` com a lista versionada de comandos homologados, incluindo grupos, aliases, warnings e metadados de menção
- [ ] T046 Criar `client/src/hooks/useCommandCatalog.ts` com busca local por `label`, `aliases` e `insertText`
- [ ] T047 Criar `client/src/components/CommandPicker.tsx` como bottom sheet mobile-first com grupos `Slash commands`, `@ contextos` e `Controle de sessão`
- [ ] T048 Integrar o `CommandPicker.tsx` ao `InputBar.tsx`, inserindo texto no cursor atual sem enviar automaticamente o comando
- [ ] T049 [P] Destacar comandos sensíveis com badge de atenção e descrição curta de risco, mantendo o fluxo apenas de inserção e não execução imediata
- [ ] T050 [P] Persistir comandos recentes em `localStorage` e exibi-los como atalhos no picker quando fizer sentido para a UX
- [ ] T051 Criar testes de busca e inserção do catálogo, cobrindo preservação do cursor, concatenação com espaço e edição posterior pelo usuário

**Ponto de Verificação**: o usuário encontra comandos homologados, filtra por nome ou alias e insere o texto no input com um toque, sem disparar execução automática.

---

## Fase 6: Menções assistidas `@file`, `@folder` e `@workspace`

**Objetivo**: implementar a UX de menções com busca remota, debounce, substituição parcial do texto e respeito estrito ao workspace da sessão.

- [ ] T052 Criar lógica de parsing do token ativo `@...` no input, identificando tipo de menção, query parcial e posição do cursor
- [ ] T053 Criar `client/src/hooks/useMentionSearch.ts` com debounce de 150 ms a 250 ms e descarte de respostas obsoletas
- [ ] T054 Criar `client/src/components/MentionSearchSheet.tsx` com resultados incrementais, empty state claro e highlight do trecho encontrado
- [ ] T055 Integrar `useMentionSearch.ts` ao `InputBar.tsx` e ao `CommandPicker.tsx`, disparando `context.search` apenas quando houver sessão ativa
- [ ] T056 Implementar inserção da menção resolvida substituindo somente o token ativo e preservando o restante do prompt e a posição do cursor
- [ ] T057 [P] Tratar `@workspace` como inserção direta sem busca remota, respeitando o mesmo fluxo de edição antes do envio
- [ ] T058 [P] Persistir menções recentes em `localStorage` para sugerir caminhos usados recentemente em `@file` e `@folder`
- [ ] T059 Criar testes unitários para parser do token ativo e para a substituição parcial do texto quando o cursor está no meio da frase
- [ ] T060 [P] Criar testes de integração de UI cobrindo seleção de resultado remoto e inserção final de `@file caminho/relativo ` e `@folder caminho/relativo `

**Ponto de Verificação**: selecionar um resultado de busca insere a menção correta no input sem apagar o restante do prompt, e as respostas do backend nunca extrapolam o `cwd` da sessão.

---

## Fase 7: Temas, acabamento visual e acessibilidade

**Objetivo**: finalizar a experiência de uso recorrente em mobile com temas, feedback visual consistente e ergonomia de toque adequada.

- [ ] T061 Criar `client/src/lib/themes.ts` com os tokens visuais e temas do xterm.js para Dracula e VS Code Light
- [ ] T062 Criar `client/src/hooks/useTheme.ts` com persistência em `localStorage` e API para alternar entre os dois temas suportados
- [ ] T063 Criar `client/src/styles/themes.css` e aplicar `data-theme` no root da aplicação para controlar variáveis CSS por tema
- [ ] T064 Integrar a troca de tema ao xterm.js em tempo real, sem recriar a sessão nem perder o histórico renderizado
- [ ] T065 Atualizar dinamicamente a meta tag `theme-color` conforme o tema ativo
- [ ] T066 Refinar `Header`, `StatusBanner`, `QuickActions` e `InputBar` para garantir contraste, consistência visual e áreas mínimas de toque de 44 px
- [ ] T067 [P] Implementar controle simples de tamanho da fonte do terminal e persistência local da preferência do usuário
- [ ] T068 [P] Revisar estados visuais de conexão, reconexão, erro e sessão encerrada para evitar ambiguidades em uso móvel
- [ ] T069 Criar verificação visual/manual dos dois temas em telas de 320 px a 430 px, incluindo portrait e landscape

**Ponto de Verificação**: o usuário alterna entre Dracula e VS Code Light em tempo real, mantendo sessão ativa, terminal legível e layout usável em telas pequenas.

---

## Fase 8: Documentação, QA final e aceite

**Objetivo**: consolidar documentação operacional, cobertura de teste e checklist final de aceite do frontend e das extensões de backend.

- [ ] T070 Atualizar `docs/MANUAL_TEST.md` com fluxo completo de uso browser/mobile, incluindo conexão via `?token=`, criação de sessão, quick actions, command picker e menções
- [ ] T071 Criar checklist manual específico para Android Chrome e iOS Safari cobrindo teclado virtual, orientação, reconexão, temas e menções
- [ ] T072 [P] Executar `pnpm test` na raiz para garantir que o backend continua sem regressão após as mudanças de protocolo
- [ ] T073 [P] Executar `pnpm --dir client test` para validar hooks, componentes e utilitários do frontend
- [ ] T074 Executar validação ponta a ponta com backend real + frontend real em dispositivo móvel ou emulação confiável
- [ ] T075 Consolidar critérios de aceite do MVP no `client/tasks.md` ou documentação correlata, marcando explicitamente o que foi validado por teste automatizado e o que depende de teste manual

**Ponto de Verificação (Critérios de Aceite)**:

- [ ] O usuário abre a aplicação no celular, conecta ao backend e cria uma sessão real
- [ ] O terminal renderiza ANSI corretamente e permanece utilizável com teclado virtual
- [ ] Quick actions enviam sequências corretas para o PTY
- [ ] O command picker insere comandos homologados sem execução automática
- [ ] `@file`, `@folder` e `@workspace` funcionam conforme o protocolo estendido
- [ ] O terminal redimensiona corretamente com abertura de teclado virtual e mudança de orientação
- [ ] Reconexão informa corretamente a perda de sessão e orienta a criação de uma nova sessão
- [ ] Os temas Dracula e VS Code Light funcionam em tempo real e ficam persistidos
