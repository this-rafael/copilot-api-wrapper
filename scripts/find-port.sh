#!/usr/bin/env bash
# Usage: find-port.sh [start_port]
# Prints the first free TCP port starting from start_port (default: 3000).
# Relies on python3 for reliable socket bind check — no external deps needed.

set -euo pipefail

start="${1:-3000}"

python3 - "$start" <<'PYEOF'
import socket
import sys

start = int(sys.argv[1])

for port in range(start, 65536):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("", port))
            print(port)
            break
        except OSError:
            continue
PYEOF
