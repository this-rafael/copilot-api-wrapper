# Plano de Implementação: Frontend Mobile-First para o Copilot WebSocket Wrapper

**Data**: 2026-03-06  
**Entrada**: [client/frontend-spec.md](client/frontend-spec.md), [plan/plan.md](plan/plan.md) e estado atual do backend em `src/`

## Resumo

Objetivo: entregar um cliente web mobile-first para operar o servidor WebSocket deste repositório a partir de celular ou tablet, com terminal ANSI real, barra de input nativa, catálogo homologado de comandos do Copilot CLI, temas Dracula e VS Code Light, e suporte a menções `@file` e `@folder` com busca remota no workspace da sessão.

O plano precisa cobrir duas frentes em paralelo:

1. **Frontend novo**: hoje não existe aplicação React/Vite no repositório.
2. **Extensões no backend**: o servidor atual já suporta `session.create`, `terminal.input`, `terminal.resize` e `session.close`, mas ainda não aceita token via query string, não tem `context.search` e não implementa heartbeat/reconexão orientada a browser.

Decisão pragmática: implementar o frontend dentro de `client/` como pacote independente, em vez de criar um novo diretório `frontend/`. A especificação usa `frontend/` como nome ilustrativo; reaproveitar `client/` reduz churn no repositório e preserva a documentação já existente.

## Estado Atual do Repositório

### Backend já pronto

1. Servidor WebSocket funcional com autenticação por header `Authorization: Bearer`.
2. Sessões PTY via `node-pty` com stream de output ANSI.
3. Protocolo básico para criar sessão, enviar input, redimensionar e encerrar.
4. Testes de integração para fluxo WebSocket e bridge PTY.

### Lacunas para a especificação do cliente

1. Browser não consegue autenticar com headers customizados no `new WebSocket()`; o backend precisa aceitar `?token=`.
2. Não existe mensagem `context.search` nem resposta `context.search.results`.
3. Não existe serviço de busca restrita ao `cwd` da sessão.
4. Não existe heartbeat/reconexão orientada ao fluxo mobile.
5. Não existe frontend React/Vite, nem catálogo de comandos, nem tema, nem integração com xterm.js.

## Decisões de Implementação

### Estrutura do projeto

Implementar o frontend como pacote isolado em `client/`, com `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` e `src/`. O backend continua no pacote raiz.

### Modelo de desenvolvimento

1. **Dev local**: backend na raiz e frontend via `pnpm --dir client dev`.
2. **Build**: frontend gera assets estáticos independentes; servir pelo backend fica fora do MVP.
3. **Contrato de protocolo**: manter tipos espelhados no frontend no MVP, com checklist explícito de sincronização quando o protocolo mudar.

### Ordem de execução

1. Desbloquear o backend para browser.
2. Criar shell do frontend e fluxo mínimo de conexão.
3. Integrar terminal e ciclo real da sessão.
4. Adicionar UX mobile avançada: comandos, menções, temas e resize com teclado virtual.
5. Fechar com testes, validação manual em dispositivos e polimento.

## Arquitetura de Entrega

```text
client/
├── package.json
├── index.html
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── global.css
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── styles/
└── tests/

src/
├── protocol/
├── security/
├── sessions/
└── transport/
```

Separação de responsabilidades:

1. O backend continua dono do ciclo de vida da sessão, autenticação e busca de contexto.
2. O frontend fica responsável por estado visual, reconexão, input mobile e renderização do terminal.
3. `context.search` passa a ser uma extensão de protocolo do backend consumida apenas quando houver sessão ativa.

## Fases de Implementação

## Fase 0: Contrato e fundação do frontend

**Objetivo**: preparar o terreno sem quebrar o backend atual.

### Entregas

1. Criar `client/package.json` com React 19, Vite 6, TypeScript, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` e dependências de teste do frontend.
2. Criar `client/src/` com app shell mínima, CSS global mobile-first e layout com `100dvh`.
3. Definir tipos locais do frontend para o protocolo atual e para a extensão `context.search`.
4. Adicionar scripts raiz de conveniência para `client:dev`, `client:build` e `client:test` usando `pnpm --dir client ...`.

### Critério de saída

1. O frontend sobe localmente com tela de conexão estática.
2. O repositório continua buildando e testando o backend sem regressão.

## Fase 1: Desbloqueios de backend para uso em browser

**Objetivo**: tornar o servidor consumível por navegador mobile real.

### Entregas

1. Aceitar token por query parameter no handshake WebSocket, preservando compatibilidade com `Authorization: Bearer`.
2. Documentar explicitamente que produção exige `wss://` quando usar `?token=`.
3. Estender `src/protocol/messages.ts` e `src/protocol/validators.ts` com:
	- `context.search`
	- `context.search.results`
4. Implementar serviço de busca restrita ao `cwd` da sessão:
	- busca por arquivos para `mentionType=file`
	- busca por diretórios para `mentionType=folder`
	- resposta direta para `mentionType=workspace`
5. Garantir que a busca só opere dentro do `cwd` validado e nunca retorne caminho absoluto.
6. Adicionar descarte de resultados obsoletos por sessão e limite de resultados por query.
7. Incluir heartbeat no servidor e regras para limpar conexões mortas de maneira previsível.

### Testes

1. Teste de integração cobrindo autenticação via query param.
2. Teste de validação do novo protocolo.
3. Teste do serviço de busca garantindo escopo por `cwd`, limite e formato relativo dos caminhos.

### Critério de saída

1. Um navegador consegue abrir o WebSocket com `?token=`.
2. O backend responde corretamente a `context.search` para `file`, `folder` e `workspace`.

## Fase 2: Fluxo mínimo ponta a ponta

**Objetivo**: colocar uma sessão real no browser antes de investir em polish.

### Entregas

1. Implementar `useLocalStorage` para URL, token, `cwd`, tema, fonte e raw mode.
2. Implementar `ConnectionScreen` com validação básica e estados `idle`, `connecting` e `error`.
3. Implementar `useWebSocket` com:
	- conexão inicial
	- parse de mensagens
	- fila curta de mensagens enquanto a conexão estabiliza
	- reconexão com backoff exponencial
4. Implementar `useSession` para `session.create`, `session.close`, tracking de `sessionId` e estado da sessão.
5. Integrar tela de conexão com criação de sessão real.
6. Exibir estados de erro de conexão, reconexão e sessão encerrada.

### Testes

1. Testes unitários dos hooks de conexão/sessão com mensagens fake.
2. Smoke test manual: conectar, receber `session.ready`, encerrar e reconectar.

### Critério de saída

1. Usuário consegue conectar pelo celular e ver o estado da sessão mudar corretamente.
2. Após uma queda de socket, a UI indica reconexão mas não tenta ressuscitar sessão morta.

## Fase 3: Terminal real e input mobile

**Objetivo**: tornar o terminal realmente utilizável em mobile.

### Entregas

1. Implementar `useTerminal` e `TerminalView` com xterm.js, `FitAddon` e fallback seguro caso `WebGLAddon` falhe.
2. Aplicar escrita imperativa de output via `terminal.write()` sem acoplar React ao stream.
3. Implementar `InputBar` com elemento nativo focável, botão `Commands`, botão `Enter` e toggle de raw mode.
4. No modo normal, enviar apenas no `Enter` com `\r`.
5. No raw mode, enviar keystrokes imediatamente ao backend.
6. Implementar `QuickActions` com setas, `Ctrl+C`, `Tab`, `Esc`, `Ctrl+D` e `Ctrl+L`.
7. Preservar terminal como área de leitura/scroll e input nativo como fonte principal do teclado virtual.

### Testes

1. Testes de componente para `InputBar` e `QuickActions`.
2. Teste manual ponta a ponta com input simples, `Ctrl+C`, setas e limpar tela.

### Critério de saída

1. Output ANSI aparece corretamente no celular.
2. Input por teclado virtual e botões rápidos chega ao PTY sem exigir teclado físico.

## Fase 4: Resize, viewport e adaptação ao teclado virtual

**Objetivo**: corrigir o principal risco de usabilidade mobile.

### Entregas

1. Implementar `useViewportResize` com `visualViewport.resize` e fallback para `window.resize`.
2. Debounce de 150 ms para `FitAddon.fit()` e envio de `terminal.resize`.
3. Ajustar layout para `100dvh`, flex column e áreas fixas de header, quick actions e input.
4. Garantir que abrir/fechar teclado virtual não esconda o terminal atrás da viewport.
5. Suportar troca portrait/landscape sem inconsistência de `cols` e `rows`.

### Testes

1. Teste manual em Android Chrome.
2. Teste manual em iOS Safari.
3. Checklist de landscape com quick actions condensadas ou scroll horizontal utilizável.

### Critério de saída

1. O terminal encolhe corretamente quando o teclado abre.
2. O backend recebe resize coerente com a área visível.

## Fase 5: Command Picker e catálogo homologado

**Objetivo**: reduzir dependência de digitação longa em mobile.

### Entregas

1. Criar `lib/commandCatalog.ts` com catálogo versionado da versão homologada do Copilot CLI.
2. Criar `useCommandCatalog()` com busca local por label, alias e texto inserido.
3. Implementar `CommandPicker` como bottom sheet mobile-first com grupos:
	- Slash commands
	- @ contextos
	- Controle de sessão
4. Inserir texto do catálogo no input sem enviar automaticamente.
5. Marcar itens sensíveis com badge de atenção.
6. Persistir comandos recentes em `localStorage`.

### Dependência crítica

Antes de fechar esta fase, é preciso definir qual versão do Copilot CLI será a versão homologada do projeto. O catálogo não deve ser inferido do terminal.

### Testes

1. Testes de busca local no catálogo.
2. Testes de inserção no input preservando cursor e texto existente.

### Critério de saída

1. O usuário encontra rapidamente comandos homologados e os insere no input com um toque.

## Fase 6: Menções assistidas `@file`, `@folder` e `@workspace`

**Objetivo**: entregar a extensão mais sensível do protocolo com UX viável no celular.

### Entregas

1. Implementar detecção de token ativo `@...` no input.
2. Implementar `useMentionSearch()` com debounce de 150 ms a 250 ms.
3. Criar `MentionSearchSheet` com resultados incrementais, highlight do match e empty state claro.
4. Chamar `context.search` apenas com sessão ativa.
5. Inserir a menção resolvida substituindo somente o token atual.
6. Persistir menções recentes em `localStorage`.
7. Tratar `@workspace` como inserção direta, sem busca remota.

### Regras de robustez

1. Descartar respostas que não correspondam à query atual.
2. Nunca apagar o restante do prompt quando uma menção for resolvida.
3. Fechar o sheet quando a sessão for encerrada ou a conexão cair.

### Testes

1. Testes do parser do token ativo no input.
2. Testes da substituição parcial do texto com cursor no meio da frase.
3. Teste manual com `@file src/server.ts` e `@folder src/`.

### Critério de saída

1. Selecionar um resultado insere a menção correta sem perder o texto restante.
2. A busca respeita o escopo do `cwd` da sessão.

## Fase 7: Temas, acessibilidade e polimento final

**Objetivo**: fechar a experiência para uso recorrente em dispositivos móveis.

### Entregas

1. Implementar `useTheme()` com persistência em `localStorage`.
2. Definir tokens CSS para Dracula e VS Code Light.
3. Atualizar o tema do xterm.js em tempo real.
4. Atualizar dinamicamente a meta tag `theme-color`.
5. Refinar header, banners, botões e estados com áreas de toque de pelo menos 44 px.
6. Ajustar feedback visual de reconexão, erro e encerramento.
7. Revisar contraste, legibilidade e navegação por toque.

### Testes

1. Verificação visual dos dois temas.
2. Checklist de acessibilidade básica: contraste, foco visível e área de toque.

### Critério de saída

1. A experiência é utilizável em telas de 320 px a 430 px.
2. Tema troca sem recriar a sessão nem quebrar o terminal.

## Backlog Técnico por Área

### Backend

1. Aceitar `token` na query string.
2. Adicionar mensagens `context.search` e `context.search.results`.
3. Criar serviço de busca com `rg` sem interpolation insegura.
4. Associar `context.search` a uma sessão já existente e validada.
5. Cobrir novo fluxo com testes de integração.

### Frontend

1. Criar app React/Vite em `client/`.
2. Implementar hooks de estado e comunicação.
3. Integrar xterm.js e viewport resize.
4. Implementar command picker e mention search.
5. Implementar temas, persistência e banners.

### QA

1. Atualizar [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md) com fluxo browser/mobile.
2. Criar checklist para Android Chrome e iOS Safari.
3. Validar cenário de rede instável e retomada de conexão.

## Sequência Recomendada de Execução

1. Criar o pacote `client/` e o layout estático.
2. Adaptar o backend para autenticação via query param.
3. Entregar o fluxo mínimo de sessão real no browser.
4. Integrar xterm.js e input mobile.
5. Fechar resize de viewport/teclado virtual.
6. Adicionar command picker.
7. Adicionar menções assistidas.
8. Finalizar temas, polish e documentação.

Essa ordem minimiza retrabalho porque resolve primeiro os bloqueios de browser e estabiliza o ciclo da sessão antes das features de UX mais caras.

## Critérios de Aceite por Marco

### Marco A: Browser conectado

1. O frontend abre o WebSocket com `?token=`.
2. Consegue criar sessão e mostrar estado ativo.

### Marco B: Terminal operacional

1. Output ANSI renderiza corretamente.
2. Input nativo e quick actions controlam o PTY.
3. Resize acompanha teclado virtual e orientação.

### Marco C: UX assistida

1. Command picker insere comandos homologados.
2. Menções `@file` e `@folder` buscam no backend e inserem caminhos relativos.
3. Temas e persistência local funcionam sem quebrar a sessão.

## Riscos Principais e Mitigações

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Autenticação por query string exposta sem TLS | Alto | Exigir `wss://` em produção e documentar claramente |
| xterm.js ou input mobile se comportar mal no Safari | Alto | Manter input nativo separado do terminal e testar cedo em iOS |
| Busca remota ficar lenta em workspaces grandes | Médio | Usar `rg`, limitar resultados e descartar queries obsoletas |
| Drift entre catálogo homologado e CLI real | Médio | Versionar catálogo e revisar a cada atualização do CLI |
| Reconexão recriar sessão incorretamente | Médio | Separar estado de socket do estado de sessão e exigir nova sessão após queda |
| App frontend em pacote separado aumentar fricção de build | Baixo | Usar scripts raiz de conveniência com `pnpm --dir client` |

## Perguntas em Aberto e Decisões Recomendadas

1. **Deploy do frontend**: recomendação para o MVP é deploy separado; servir assets pelo backend pode entrar depois se houver necessidade operacional.
2. **Múltiplos servidores salvos**: manter apenas o último usado no MVP. Favoritos aumentam escopo de UX sem destravar valor principal.
3. **Copiar output do terminal**: deixar fora do primeiro corte. O valor principal está em conectar, operar e usar comandos/menções.
4. **Ajuste de fonte**: implementar primeiro via botões `A-` e `A+` ou configuração simples; pinch-to-zoom fica para depois.

## Definição de Pronto

O trabalho pode ser considerado concluído quando:

1. Um usuário consegue abrir a aplicação no celular, conectar ao backend e operar uma sessão real do Copilot.
2. O terminal preserva ANSI, responde a quick actions e redimensiona ao abrir o teclado virtual.
3. `Commands`, `@file`, `@folder` e `@workspace` funcionam conforme a especificação.
4. Os dois temas suportados trocam em tempo real e ficam persistidos.
5. O backend continua restrito ao `cwd` validado e não expõe busca fora da allowlist.
6. Os testes automatizados relevantes e o checklist manual mobile passam sem regressão.
