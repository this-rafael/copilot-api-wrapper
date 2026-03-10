# open-port-to-lan-mcp

A Windows MCP HTTP server that temporarily opens local ports for inbound LAN access via Windows
Firewall. Designed to be distributed as a standalone `.exe` so a developer can run it once,
elevated, and then let any MCP client call its tools without needing Administrator privileges.

---

## How it works

1. You start the server as Administrator on your Windows machine.
2. GitHub Copilot (or any MCP client) calls the `open-port-to-lan` tool with a port and a TTL.
3. The server adds an inbound Windows Firewall rule for that port.
4. Devices on the same LAN (phone, tablet, etc.) can now reach the service running on that port.
5. When the TTL expires the server removes the rule automatically.
6. You can also call `close-port` to remove a rule early, or `list-open-ports` to see what is open.

The target service must already be listening on `0.0.0.0` or the machine's LAN IP.
This tool does **not** proxy `localhost` traffic, create tunnels, or expose anything to the
internet.

---

## Requirements

- Windows (the firewall rules are Windows-specific)
- The EXE or `node` process must be started as **Administrator**
- The target service must listen on `0.0.0.0` or the machine LAN IP (not `127.0.0.1` only)

---

## Quick start

### Option A – Run as EXE (recommended for production)

1. Download `open-port-to-lan-mcp.exe` from the release folder.
2. Create a `.env` file next to the EXE (see `.env.example`).
3. Right-click the EXE → **Run as administrator**, or from an elevated terminal:

```powershell
.\open-port-to-lan-mcp.exe
```

### Option B – Run with Node.js (development)

```bash
cd packages/open-port-to-lan-mcp
pnpm install
cp .env.example .env
# Edit .env and set MCP_AUTH_TOKEN
pnpm dev
```

---

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3741` | Port the MCP HTTP server listens on |
| `MCP_AUTH_TOKEN` | *(required)* | Shared secret for `Authorization: Bearer <token>` |
| `ALLOWED_IPS` | *(any)* | Comma-separated IPv4 allowlist; leave empty to allow any IP |
| `STATE_PATH` | `state/open-rules.json` | Path to the JSON file storing active rule metadata |
| `MAX_TTL_SECONDS` | `3600` | Maximum allowed TTL per `open-port-to-lan` call |
| `MIN_TTL_SECONDS` | `60` | Minimum required TTL per `open-port-to-lan` call |
| `CLEANUP_INTERVAL_MS` | `30000` | How often to scan for and remove expired rules |

---

## MCP client registration

Add to your VS Code `mcp.json` (or equivalent):

```json
{
  "servers": {
    "open-port-to-lan": {
      "type": "http",
      "url": "http://127.0.0.1:3741/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

Replace `127.0.0.1` with the LAN IP of the machine running the server if you are calling it from
another machine.

---

## Available tools

### `open-port-to-lan`

Opens an inbound Windows Firewall rule for a local port for a bounded duration.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `port` | integer 1–65535 | yes | Port to open |
| `durationSeconds` | integer | yes | TTL in seconds (MIN_TTL_SECONDS – MAX_TTL_SECONDS) |
| `protocol` | `tcp` \| `udp` | no (default `tcp`) | Transport protocol |
| `description` | string ≤120 chars | no | Label for the audit log |

Response fields: `ruleId`, `ruleName`, `port`, `protocol`, `openedAt`, `expiresAt`,
`durationSeconds`, `lanAddresses`, `accessUrls`.

### `close-port`

Revokes a previously opened port rule before its TTL expires.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ruleId` | string | yes | The `ruleId` returned by `open-port-to-lan` |

### `list-open-ports`

Returns all active port rules with remaining seconds.

*No parameters.*

---

## Building the EXE

```bash
pnpm install
pnpm package:exe
# Output: release/open-port-to-lan-mcp.exe
```

This bundles the server and all dependencies into a single Windows executable using
`esbuild` + `@yao-pkg/pkg`.

---

## Running tests

```bash
pnpm test
```

Tests run on any OS (firewall operations use a dry-run mode on non-Windows).

---

## Security notes

- The server must start as Administrator; tool calls do **not** require per-request elevation.
- Set a strong `MCP_AUTH_TOKEN` and restrict `ALLOWED_IPS` for untrusted networks.
- This opens Windows Firewall inbound access only. For internet-facing exposure, add TLS and
  stricter auth separately.
- On shutdown (`Ctrl+C` / SIGTERM), all active firewall rules are removed automatically.
