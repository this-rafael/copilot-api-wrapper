#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm nao encontrado no PATH." >&2
	exit 1
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
	while IFS= read -r line || [[ -n "$line" ]]; do
		[[ "$line" =~ ^[[:space:]]*# ]] && continue
		[[ "$line" =~ ^[[:space:]]*$ ]] && continue

		if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
			key="${BASH_REMATCH[1]}"
			value="${BASH_REMATCH[2]}"

			if [[ "$value" =~ ^\'(.*)\'$ ]]; then
				value="${BASH_REMATCH[1]}"
			elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
				value="${BASH_REMATCH[1]}"
			fi

			if [[ -z "${!key+x}" ]]; then
				export "$key=$value"
			fi
		fi
	done < "$ROOT_DIR/.env"
fi

: "${PORT:=3000}"
: "${CLIENT_PORT:=
}"
: "${CLIENT_HOST:=0.0.0.0}"
: "${WS_AUTH_TOKEN:=dev-token}"
: "${ALLOWED_CWDS:=$ROOT_DIR}"
: "${CUSTOM_CWDS_DB_PATH:=$ROOT_DIR/artifacts/custom-cwds.sqlite}"
: "${SESSION_TIMEOUT_MS:=1800000}"
: "${MAX_SESSIONS:=10}"

export PORT
export CLIENT_PORT
export CLIENT_HOST
export WS_AUTH_TOKEN
export ALLOWED_CWDS
export CUSTOM_CWDS_DB_PATH
export SESSION_TIMEOUT_MS
export MAX_SESSIONS

SERVER_PID=""
CLIENT_PID=""

port_in_use() {
	local port="$1"

	if command -v lsof >/dev/null 2>&1; then
		lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
		return $?
	fi

	if command -v fuser >/dev/null 2>&1; then
		fuser "$port"/tcp >/dev/null 2>&1
		return $?
	fi

	if command -v ss >/dev/null 2>&1; then
		ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)$port$"
		return $?
	fi

	return 1
}

kill_group() {
	local pid="$1"

	if [[ -z "$pid" ]]; then
		return
	fi

	if kill -0 "$pid" >/dev/null 2>&1; then
		kill -TERM -- "-$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true
	fi
}

cleanup() {
	local exit_code=$?

	trap - EXIT INT TERM

	kill_group "$SERVER_PID"
	kill_group "$CLIENT_PID"

	wait >/dev/null 2>&1 || true
	exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ "$PORT" == "$CLIENT_PORT" ]]; then
	echo "PORT e CLIENT_PORT nao podem usar a mesma porta ($PORT)." >&2
	exit 1
fi

if port_in_use "$PORT"; then
	echo "A porta do server ($PORT) ja esta em uso. Ajuste PORT no .env ou finalize o processo atual." >&2
	exit 1
fi

if port_in_use "$CLIENT_PORT"; then
	echo "A porta do client ($CLIENT_PORT) ja esta em uso. Ajuste CLIENT_PORT no .env ou finalize o processo atual." >&2
	exit 1
fi

echo "Iniciando server em modo desenvolvimento..."
echo "PORT=$PORT"
echo "CLIENT_PORT=$CLIENT_PORT"
echo "CLIENT_HOST=$CLIENT_HOST"
echo "WS_AUTH_TOKEN=$WS_AUTH_TOKEN"
echo "ALLOWED_CWDS=$ALLOWED_CWDS"
echo "CUSTOM_CWDS_DB_PATH=$CUSTOM_CWDS_DB_PATH"
setsid pnpm dev &
SERVER_PID=$!

echo "Iniciando client em modo desenvolvimento..."
setsid pnpm client:dev &
CLIENT_PID=$!

echo "Server PID: $SERVER_PID"
echo "Client PID: $CLIENT_PID"
echo "Pressione Ctrl+C para encerrar os dois processos."

if ! wait -n "$SERVER_PID" "$CLIENT_PID"; then
	echo "Um dos processos encerrou com erro. Ambos serao finalizados." >&2
	exit 1
fi
