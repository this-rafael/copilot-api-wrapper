# Pré-condições para Teste Manual

## Ambiente

1. **Node.js 20+** instalado e disponível no PATH
2. **pnpm** instalado (`npm i -g pnpm`)
3. **Copilot CLI autenticado**: execute `copilot login` ou `gh auth login` e verifique com `copilot --version`
4. **Variável `COPILOT_GITHUB_TOKEN`** disponível no ambiente (token GitHub com escopo Copilot)

## Configuração

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

Configurações mínimas em `.env`:

```env
PORT=3000
WS_AUTH_TOKEN=meu-token-secreto
ALLOWED_CWDS=/home/user/projects
SESSION_TIMEOUT_MS=1800000
MAX_SESSIONS=10
```

O diretório definido em `ALLOWED_CWDS` deve ser o mesmo que será enviado como `cwd` no `session.create`.

## Build e inicialização

```bash
pnpm build
pnpm start
```

Ou em modo desenvolvimento:

```bash
pnpm dev
```

## Teste manual via wscat

Instale wscat:

```bash
npm i -g wscat
```

Conecte-se ao servidor:

```bash
wscat -c ws://localhost:3000 -H "Authorization: Bearer meu-token-secreto"
```

Para simular o comportamento do browser, tambem e valido autenticar via query string:

```bash
wscat -c "ws://localhost:3000?token=meu-token-secreto"
```

Envie `session.create`:

```json
{"type":"session.create","cwd":"/home/user/projects","commandProfile":"copilot-interactive","cols":120,"rows":40}
```

Após receber `session.ready`, envie input:

```json
{"type":"terminal.input","sessionId":"<session_id_from_ready>","data":"hello\n"}
```

Redimensione o terminal:

```json
{"type":"terminal.resize","sessionId":"<session_id>","cols":160,"rows":50}
```

Envie Ctrl+C:

```json
{"type":"terminal.input","sessionId":"<session_id>","data":"\u0003"}
```

Encerre a sessão:

```json
{"type":"session.close","sessionId":"<session_id>"}
```

## Critérios de aceite

- [ ] Cliente remoto abre sessão e recebe output em tempo real com ANSI preservado
- [ ] Input com `Enter`, `Ctrl+C` e setas chega corretamente ao processo
- [ ] Resize do terminal remoto altera o PTY
- [ ] Fechamento do socket mata o processo e limpa a sessão
- [ ] `cwd` inválido retorna `session.error` com code `SESSION_CREATE_FAILED`
- [ ] Cliente sem token é rejeitado com close code `4401`
- [ ] Perfil `copilot-interactive` sobe com `--yolo` e nao exibe prompt interativo de permissao para editar arquivos

## Teste manual via frontend mobile

1. Instale as dependencias do frontend:

```bash
pnpm --dir client install
```

2. Suba o backend e o frontend em terminais separados:

```bash
pnpm dev
pnpm client:dev
```

3. Abra a URL exibida pelo Vite em um celular ou emulador no mesmo ambiente de rede.
4. Informe a URL do servidor, por exemplo `ws://IP-DA-MAQUINA:3000`.
5. Informe o token configurado em `WS_AUTH_TOKEN`.
6. Informe um `cwd` incluido em `ALLOWED_CWDS`.
7. Conecte e valide:
	- o terminal recebe output ANSI
	- `Commands` abre o catalogo local do Copilot CLI
	- `@file` e `@folder` retornam resultados do workspace remoto
	- no modo normal, `Enter` insere uma nova linha apenas no composer web
	- no modo normal, `Ctrl+Enter` e o botao `Enviar` submetem o texto acumulado ao terminal remoto
	- o botao `Linha` insere quebra local sem enviar o prompt
	- no modo raw, `Enter` volta a agir como tecla de envio direto para o terminal
	- abrir o teclado virtual redimensiona o terminal sem cobrir o output
	- alternar entre Dracula e VS Code Light atualiza a interface e o terminal

## Nota de segurança

Autenticacao via `?token=` existe para compatibilidade com browsers. Em producao, use apenas `wss://` para evitar exposicao do token em conexoes sem TLS.
