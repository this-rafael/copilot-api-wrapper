#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

BACKEND_PID=""
CLIENT_PID=""
CLEANED_UP=0
BACKEND_DEV_BIN="$ROOT_DIR/node_modules/.bin/tsx"
CLIENT_DEV_BIN="$ROOT_DIR/client/node_modules/.bin/vite"

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

log() {
	echo "[dev:all] $*"
}

fail() {
	echo "[dev:all] $*" >&2
	exit 1
}

require_command() {
	local cmd="$1"
	command -v "$cmd" >/dev/null 2>&1 || fail "Missing command: $cmd"
}

ensure_port_available() {
	local port="$1"
	local label="$2"

	python3 - "$port" <<'PYEOF' || fail "$label port $port is already in use"
import socket
import sys

port = int(sys.argv[1])

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
	try:
		sock.bind(("", port))
	except OSError:
		raise SystemExit(1)
PYEOF
}

terminate_pid() {
	local pid="$1"
	[[ -n "$pid" ]] || return 0
	if ! kill -0 "$pid" >/dev/null 2>&1; then
		return 0
	fi

	kill -INT "$pid" >/dev/null 2>&1 || true
	for _ in {1..30}; do
		if ! kill -0 "$pid" >/dev/null 2>&1; then
			return 0
		fi
		sleep 0.1
	done

	kill "$pid" >/dev/null 2>&1 || true
	for _ in {1..20}; do
		if ! kill -0 "$pid" >/dev/null 2>&1; then
			return 0
		fi
		sleep 0.1
	done

	kill -9 "$pid" >/dev/null 2>&1 || true
}

cleanup() {
	if [[ "$CLEANED_UP" -eq 1 ]]; then
		return 0
	fi

	CLEANED_UP=1
	terminate_pid "$BACKEND_PID"
	terminate_pid "$CLIENT_PID"
	wait "$BACKEND_PID" 2>/dev/null || true
	wait "$CLIENT_PID" 2>/dev/null || true
}

main() {
	require_command python3
	[[ -x "$BACKEND_DEV_BIN" ]] || fail "Missing backend dev binary: $BACKEND_DEV_BIN. Run pnpm install"
	[[ -x "$CLIENT_DEV_BIN" ]] || fail "Missing frontend dev binary: $CLIENT_DEV_BIN. Run pnpm install"

	load_env "$ENV_FILE"

	: "${PORT:=3000}"
	: "${CLIENT_PORT:=5173}"
	: "${CLIENT_HOST:=0.0.0.0}"

	[[ -n "${WS_AUTH_TOKEN:-}" ]] || fail "WS_AUTH_TOKEN is required. Configure it in .env or the environment"
	[[ -n "${ALLOWED_CWDS:-}" ]] || fail "ALLOWED_CWDS is required. Configure it in .env or the environment"
	[[ "$PORT" =~ ^[0-9]+$ ]] || fail "PORT must be numeric"
	[[ "$CLIENT_PORT" =~ ^[0-9]+$ ]] || fail "CLIENT_PORT must be numeric"
	[[ "$PORT" != "$CLIENT_PORT" ]] || fail "PORT and CLIENT_PORT must be different"

	ensure_port_available "$PORT" "Backend"
	ensure_port_available "$CLIENT_PORT" "Frontend"

	trap cleanup EXIT INT TERM

	log "Starting backend watch on port $PORT"
	(
		cd "$ROOT_DIR"
		"$BACKEND_DEV_BIN" watch src/server.ts
	) &
	BACKEND_PID="$!"

	log "Starting frontend watch on $CLIENT_HOST:$CLIENT_PORT"
	(
		cd "$ROOT_DIR/client"
		"$CLIENT_DEV_BIN" --host "$CLIENT_HOST" --port "$CLIENT_PORT" --strictPort
	) &
	CLIENT_PID="$!"

	set +e
	wait -n "$BACKEND_PID" "$CLIENT_PID"
	local exit_code=$?
	set -e

	if [[ "$exit_code" -ne 0 ]]; then
		fail "A development process exited unexpectedly"
	fi
	cleanup
	log "A development process finished, shutting down the remaining services"
	return 0
}

main "$@"