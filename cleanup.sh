#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
SKILL_DIR="$HOME/.copilot/skills/open-port"
SKILL_FILE="$SKILL_DIR/SKILL.md"
LEGACY_BIN_PATH="/usr/local/bin/copilot-api"
OPEN_PORT_NODE="${OPEN_PORT_NODE:-node}"
OPEN_PORT_SCRIPT="$ROOT_DIR/scripts/open-port.js"
OPEN_PORT_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/open-port"
REMOVED_ANY=0

log() {
	echo "[cleanup] $*"
}

warn() {
	echo "[cleanup] $*" >&2
}

remove_file_if_present() {
	local path="$1"
	local label="$2"

	if [[ ! -e "$path" ]]; then
		log "Skip ${label}: not found"
		return
	fi

	rm -f "$path"
	log "Removed ${label}: $path"
	REMOVED_ANY=1
}

remove_dir_if_empty() {
	local path="$1"
	local label="$2"

	if [[ ! -d "$path" ]]; then
		return
	fi

	if rmdir "$path" 2>/dev/null; then
		log "Removed empty ${label}: $path"
		REMOVED_ANY=1
	fi
}

stop_open_port_mapping() {
	local public_port="$1"
	local pid_file="$OPEN_PORT_STATE_DIR/$public_port.pid"

	if [[ -f "$OPEN_PORT_SCRIPT" ]] && command -v "$OPEN_PORT_NODE" >/dev/null 2>&1; then
		if "$OPEN_PORT_NODE" "$OPEN_PORT_SCRIPT" stop "$public_port" >/dev/null 2>&1; then
			return
		fi
	fi

	if [[ ! -f "$pid_file" ]]; then
		return
	fi

	local pid
	pid="$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)"
	if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
		return
	fi

	if ! kill -0 "$pid" >/dev/null 2>&1; then
		return
	fi

	kill "$pid" >/dev/null 2>&1 || true
	for _ in {1..20}; do
		if ! kill -0 "$pid" >/dev/null 2>&1; then
			return
		fi
		sleep 0.1
	done

	kill -9 "$pid" >/dev/null 2>&1 || true
}

cleanup_open_port_state() {
	if [[ ! -d "$OPEN_PORT_STATE_DIR" ]]; then
		log "Skip open-port state: not found"
		return
	fi

	shopt -s nullglob
	local pid_files=("$OPEN_PORT_STATE_DIR"/*.pid)
	local state_files=("$OPEN_PORT_STATE_DIR"/*.pid "$OPEN_PORT_STATE_DIR"/*.log)
	shopt -u nullglob

	if [[ "${#pid_files[@]}" -gt 0 && -f "$OPEN_PORT_SCRIPT" ]] && command -v "$OPEN_PORT_NODE" >/dev/null 2>&1; then
		for pid_file in "${pid_files[@]}"; do
			local public_port
			public_port="$(basename "$pid_file" .pid)"

			if [[ "$public_port" =~ ^[0-9]+$ ]]; then
				log "Stopping open-port mapping: $public_port"
				stop_open_port_mapping "$public_port"
			fi
		done
	fi

	for state_file in "${state_files[@]}"; do
		rm -f "$state_file"
		log "Removed open-port state file: $state_file"
		REMOVED_ANY=1
	done

	remove_dir_if_empty "$OPEN_PORT_STATE_DIR" "open-port state directory"
}

cleanup_legacy_wrapper() {
	if [[ ! -e "$LEGACY_BIN_PATH" ]]; then
		log "Skip legacy wrapper: not found"
		return
	fi

	if [[ -f "$LEGACY_BIN_PATH" ]] && ! grep -Fq "$ROOT_DIR/exec.sh" "$LEGACY_BIN_PATH" 2>/dev/null; then
		log "Skip legacy wrapper: $LEGACY_BIN_PATH does not point to this project"
		return
	fi

	if [[ -w "$LEGACY_BIN_PATH" || -w "$(dirname "$LEGACY_BIN_PATH")" ]]; then
		rm -f "$LEGACY_BIN_PATH"
	elif command -v sudo >/dev/null 2>&1; then
		log "Removing legacy wrapper with sudo: $LEGACY_BIN_PATH"
		sudo rm -f "$LEGACY_BIN_PATH"
	else
		warn "Could not remove legacy wrapper (permission denied and sudo unavailable): $LEGACY_BIN_PATH"
		return
	fi

	log "Removed legacy wrapper: $LEGACY_BIN_PATH"
	REMOVED_ANY=1
}

main() {
	log "Resetting exec local state..."

	cleanup_open_port_state
	remove_file_if_present "$ENV_FILE" "local env file"
	remove_file_if_present "$SKILL_FILE" "open-port skill file"
	remove_dir_if_empty "$SKILL_DIR" "open-port skill directory"
	cleanup_legacy_wrapper

	if [[ "$REMOVED_ANY" -eq 0 ]]; then
		log "Nothing to clean."
	else
		log "Reset complete."
	fi
}

main "$@"
