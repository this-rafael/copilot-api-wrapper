#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "${SUDO_USER:-}" ]]; then
	SUDO_USER_PATH="$(sudo -iu "$SUDO_USER" sh -lc 'printf %s "$PATH"' 2>/dev/null || true)"
	if [[ -n "$SUDO_USER_PATH" ]]; then
		export PATH="$SUDO_USER_PATH:$PATH"
	fi
fi

MCP_PORT=3741
SKILL_DIR="$HOME/.copilot/skills/open-port"
SKILL_FILE="$SKILL_DIR/SKILL.md"
ENV_FILE="$SCRIPT_DIR/.env"
OPEN_PORT_NODE="${OPEN_PORT_NODE:-node}"
OPEN_PORT_SCRIPT="${OPEN_PORT_SCRIPT:-$SCRIPT_DIR/scripts/open-port.js}"
INTERNAL_PORT_MIN=30000
INTERNAL_PORT_MAX=60000

INTERNAL_WS_PORT=""
INTERNAL_CLIENT_PORT=""
EXTERNAL_WS_PORT=""
EXTERNAL_CLIENT_PORT=""
EXPOSED_PORTS=()

# Load .env files (vars already set in the environment take precedence)
load_env() {
  local file="$1"
  [[ -f "$file" ]] || return 0
	while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"
      [[ "$value" =~ ^\'(.*)\'$ ]] && value="${BASH_REMATCH[1]}"
      [[ "$value" =~ ^\"(.*)\"$ ]] && value="${BASH_REMATCH[1]}"
      [[ -z "${!key+x}" ]] && export "$key=$value"
    fi
	done < "$file" || true
}

load_env "$ENV_FILE"
load_env "$SCRIPT_DIR/packages/open-port-to-lan-mcp/.env"

PIDS=()
CLEANED_UP=0

usage() {
	echo "Usage: $0 [external_ws_port] [external_client_port]"
	echo "  With ports : $0 3000 3001"
	echo "  Auto ports : $0            (discovers two free external ports automatically)"
	echo ""
	echo "Internal ports are always random in range ${INTERNAL_PORT_MIN}-${INTERNAL_PORT_MAX}."
}

find_free_port_in_range() {
	local start="$1"
	local end="$2"
	shift 2
	python3 - "$start" "$end" "$@" <<'PYEOF'
import random
import socket
import sys

start = int(sys.argv[1])
end = int(sys.argv[2])
reserved = {int(value) for value in sys.argv[3:]}

if start < 1 or end > 65535 or start > end:
	raise SystemExit("invalid-range")

ports = list(range(start, end + 1))
random.shuffle(ports)

for port in ports:
	if port in reserved:
		continue
	with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
		sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
		try:
			sock.bind(("", port))
		except OSError:
			continue
		print(port)
		raise SystemExit(0)

raise SystemExit(1)
PYEOF
}

is_valid_port() {
	local port="$1"
	[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 ))
}

ensure_command() {
	local cmd="$1"
	if ! command -v "$cmd" >/dev/null 2>&1; then
		echo "[error] Missing command: $cmd"
		exit 1
	fi
}

ensure_open_port_command() {
	ensure_command "$OPEN_PORT_NODE"
	if [[ ! -f "$OPEN_PORT_SCRIPT" ]]; then
		echo "[error] open-port script not found in project: $OPEN_PORT_SCRIPT"
		exit 1
	fi
}

run_open_port() {
	"$OPEN_PORT_NODE" "$OPEN_PORT_SCRIPT" "$@"
}

ensure_skill_open_port() {
	mkdir -p "$SKILL_DIR"

	if [[ -f "$SKILL_FILE" ]]; then
		echo "[skill] Found existing skill, skipping: $SKILL_FILE"
		return
	fi

	cat > "$SKILL_FILE" <<'EOF'
---
name: open-port
description: Use the open-port-to-lan MCP server to open LAN access for local apps, proxies, and test services with temporary firewall rules.
---

Use this skill when you need to expose a local service to other devices on the same LAN.

What this MCP does:
- Opens a temporary inbound Windows Firewall rule for a local port.
- Returns LAN URLs and an expiration timestamp.
- Can list or close rules before expiry.

What this MCP does not do:
- It does not create internet tunnels.
- It does not proxy localhost by itself.
- It does not start your application automatically.

Recommended flow:
1. Start your local app (or proxy process) and bind it to 0.0.0.0 or LAN IP.
2. Confirm open-port-to-lan MCP server is reachable at http://localhost:3741/mcp.
3. Call open-port-to-lan with port, durationSeconds, and optional protocol/description.
4. Share one of the returned accessUrls with a device in the same LAN.
5. Call close-port when done, or rely on TTL cleanup.

Required MCP client configuration example:
{
	"servers": {
		"open-port-to-lan": {
			"type": "http",
			"url": "http://localhost:3741/mcp",
			"headers": {
				"Authorization": "Bearer <MCP_AUTH_TOKEN>"
			}
		}
	}
}

Primary tools:
- open-port-to-lan: open a local port for bounded time.
- list-open-ports: inspect active rules and remaining TTL.
- close-port: revoke a rule early using ruleId.

Safety checks before opening a port:
- Confirm service is listening on target port.
- Use shortest practical TTL.
- Prefer tcp unless udp is explicitly needed.
- Restrict ALLOWED_IPS when possible.
EOF

	echo "[skill] Created new skill: $SKILL_FILE"
}

build_if_missing() {
	local output_file="$1"
	shift

	if [[ -f "$output_file" ]]; then
		echo "[build] Skip (exists): $output_file"
		return
	fi

	echo "[build] Missing artifact: $output_file"
	echo "[build] Running: $*"
	"$@"
}

start_process() {
	local name="$1"
	shift

	echo "[start] $name"
	"$@" &
	local pid=$!
	PIDS+=("$pid")
	echo "[start] $name pid=$pid"
}

expose_port_with_open_port() {
	local local_port="$1"
	local public_port="$2"

	echo "[proxy] open-port ${local_port} -> ${public_port}"
	run_open_port "$local_port" "$public_port"
	EXPOSED_PORTS+=("$public_port")
}

close_exposed_ports() {
	if [[ "${#EXPOSED_PORTS[@]}" -eq 0 ]]; then
		return
	fi

	for public_port in "${EXPOSED_PORTS[@]}"; do
		echo "[proxy] stop open-port ${public_port}"
		run_open_port stop "$public_port" >/dev/null 2>&1 || true
	done
}

cleanup() {
	if [[ "$CLEANED_UP" -eq 1 ]]; then
		return
	fi
	CLEANED_UP=1

	if [[ "${#PIDS[@]}" -eq 0 ]]; then
		close_exposed_ports
		return
	fi

	echo "[shutdown] Stopping processes..."
	for pid in "${PIDS[@]}"; do
		if kill -0 "$pid" >/dev/null 2>&1; then
			kill "$pid" >/dev/null 2>&1 || true
		fi
	done

	wait "${PIDS[@]}" 2>/dev/null || true
	close_exposed_ports
	echo "[shutdown] Done"
}

on_signal() {
	echo "[signal] Received interruption"
	cleanup
	exit 130
}

first_run_setup() {
	if [[ -n "${WS_AUTH_TOKEN:-}" && -n "${ALLOWED_CWDS:-}" ]]; then
		return
	fi

	echo ""
	echo "┌─────────────────────────────────────────┐"
	echo "│       Primeira execução detectada       │"
	echo "└─────────────────────────────────────────┘"
	echo ""
	echo "[setup] Nenhum .env local com as variáveis obrigatórias foi encontrado."
	echo "[setup] O script vai criar um arquivo de ambiente somente neste projeto."

	echo ""
	read -rp "ALLOWED_CWDS (caminhos separados por vírgula): " _cwds
	[[ -z "$_cwds" ]] && _cwds="$SCRIPT_DIR"

	echo ""
	read -rsp "Token de acesso (WS_AUTH_TOKEN): " _token
	echo ""
	if [[ -z "$_token" ]]; then
		echo "[error] Token não pode ser vazio."
		exit 1
	fi

	cat > "$ENV_FILE" <<ENVEOF
# Port the WebSocket server listens on
PORT=3000

# Secret token clients must send in the Authorization header (Bearer <token>)
WS_AUTH_TOKEN=$_token

# Comma-separated list of absolute paths allowed as session cwd
ALLOWED_CWDS=$_cwds

# SQLite database used to persist custom workspaces added from the UI
CUSTOM_CWDS_DB_PATH=artifacts/custom-cwds.sqlite

# Session inactivity timeout in milliseconds
SESSION_TIMEOUT_MS=1800000

# Maximum number of concurrent sessions
MAX_SESSIONS=10

CLIENT_PORT=5173
CLIENT_HOST=0.0.0.0
ENVEOF

	echo "[setup] .env criado: $ENV_FILE"
	echo "[setup] Use: ./exec.sh [external_ws_port external_client_port]"
	echo "[setup] Reset local: pnpm cleanup"
	echo ""

	load_env "$ENV_FILE"
}

trap on_signal INT TERM
trap cleanup EXIT

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	usage
	exit 0
fi

if [[ $# -eq 0 ]]; then
	ensure_command python3
	EXTERNAL_WS_PORT="$(find_free_port_in_range 3000 65000)"
	EXTERNAL_CLIENT_PORT="$(find_free_port_in_range 3000 65000 "$EXTERNAL_WS_PORT")"
	echo "[port] Auto external: WS=$EXTERNAL_WS_PORT CLIENT=$EXTERNAL_CLIENT_PORT"
elif [[ $# -eq 2 ]]; then
	EXTERNAL_WS_PORT="$1"
	EXTERNAL_CLIENT_PORT="$2"
	if ! is_valid_port "$EXTERNAL_WS_PORT"; then
		echo "[error] Invalid external_ws_port: $EXTERNAL_WS_PORT"
		exit 1
	fi
	if ! is_valid_port "$EXTERNAL_CLIENT_PORT"; then
		echo "[error] Invalid external_client_port: $EXTERNAL_CLIENT_PORT"
		exit 1
	fi
else
	usage
	exit 1
fi

if [[ "$EXTERNAL_WS_PORT" == "$EXTERNAL_CLIENT_PORT" ]]; then
	echo "[error] external_ws_port and external_client_port must be different"
	exit 1
fi

ensure_command python3
INTERNAL_WS_PORT="$(find_free_port_in_range "$INTERNAL_PORT_MIN" "$INTERNAL_PORT_MAX" "$EXTERNAL_WS_PORT" "$EXTERNAL_CLIENT_PORT")"
INTERNAL_CLIENT_PORT="$(find_free_port_in_range "$INTERNAL_PORT_MIN" "$INTERNAL_PORT_MAX" "$INTERNAL_WS_PORT" "$EXTERNAL_WS_PORT" "$EXTERNAL_CLIENT_PORT")"

if [[ -z "$INTERNAL_WS_PORT" || -z "$INTERNAL_CLIENT_PORT" ]]; then
	echo "[error] could not allocate random internal ports in range ${INTERNAL_PORT_MIN}-${INTERNAL_PORT_MAX}"
	exit 1
fi

echo "[port] Internal: WS=$INTERNAL_WS_PORT CLIENT=$INTERNAL_CLIENT_PORT"
echo "[port] External: WS=$EXTERNAL_WS_PORT CLIENT=$EXTERNAL_CLIENT_PORT"

first_run_setup

ensure_command pnpm
ensure_open_port_command

echo "[phase] 0/4 Skill bootstrap"
ensure_skill_open_port

echo "[phase] 1/4 Build check"
build_if_missing "dist/server.js" pnpm build
build_if_missing "client/dist/index.html" pnpm --dir client build
build_if_missing "packages/open-port-to-lan-mcp/dist/server.js" pnpm --dir packages/open-port-to-lan-mcp build

echo "[phase] 2/4 Start services"
start_process "ws-server" env PORT="$INTERNAL_WS_PORT" pnpm start
start_process "client-preview" env CLIENT_PORT="$INTERNAL_CLIENT_PORT" VITE_BACKEND_PORT="$INTERNAL_WS_PORT" pnpm --dir client preview

if curl -sf "http://localhost:$MCP_PORT/health" >/dev/null 2>&1; then
	echo "[start] open-port-mcp already running on port $MCP_PORT, skipping"
else
	start_process "open-port-mcp" env PORT="$MCP_PORT" pnpm --dir packages/open-port-to-lan-mcp start
fi

echo "[phase] 3/4 Expose external ports"
expose_port_with_open_port "$INTERNAL_WS_PORT" "$EXTERNAL_WS_PORT"
expose_port_with_open_port "$INTERNAL_CLIENT_PORT" "$EXTERNAL_CLIENT_PORT"

echo "[phase] 4/4 Running"
echo "[service] WS (internal)      -> ws://localhost:$INTERNAL_WS_PORT"
echo "[service] Client (internal)  -> http://localhost:$INTERNAL_CLIENT_PORT"
echo "[service] WS (external)      -> ws://localhost:$EXTERNAL_WS_PORT"
echo "[service] Client (external)  -> http://localhost:$EXTERNAL_CLIENT_PORT"
echo "[service] MCP    -> http://localhost:$MCP_PORT/mcp"
echo "[service] Health -> http://localhost:$MCP_PORT/health"

set +e
wait -n "${PIDS[@]}"
FIRST_EXIT_CODE=$?
set -e

if [[ "$FIRST_EXIT_CODE" -ne 0 ]]; then
	echo "[error] A process exited with code $FIRST_EXIT_CODE"
else
	echo "[info] A process exited normally"
fi

exit "$FIRST_EXIT_CODE"
