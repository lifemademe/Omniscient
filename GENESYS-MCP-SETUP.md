# Connecting an agent to the Sandbox Studio (Genesys) MCP

Written for another agent/tool ("Ornith") that cannot connect. This is what actually
works, verified on this machine on 2026-08-21 — including the failure that had just
silently disconnected *this* session.

---

## 1. What you are connecting to

Sandbox Studio runs a **local HTTP MCP gateway** in the desktop app. It is not a stdio
server you spawn — you do **not** launch a command; Studio is the server, and it only
listens while the app is running with a project open.

Three facts decide whether a connection works:

| Fact | Value on this machine | Stability |
|---|---|---|
| Transport | HTTP (`type: "http"`), path `/mcp` | fixed |
| Host | `127.0.0.1` — loopback only | fixed |
| Port | `17351` today (was `17350`) | **CHANGES between Studio launches** |
| Bearer token | `fc37b7b4-…` | stable per install |
| Channel id | `sandbox-studio-genesys-staging` | fixed per Studio channel (staging vs release) |

**The port moving is the number one cause of "it stopped working".** Everything else
tends to stay put.

---

## 2. The config

Put this in the MCP config your client reads (see §5 for where that is per client):

```json
{
  "mcpServers": {
    "sandbox-studio-genesys-staging": {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

Do not copy a port from any document, including this one. Read the live one (§3).

---

## 3. Finding the live port and token

### Port — read Studio's own log (authoritative)

```bash
grep "MCP prepared for external IDE clients" \
  "$APPDATA/Sandbox-Studio-Staging/logs/Sandbox-Studio-Staging.log" | tail -2
```

Each line is JSON-ish and contains exactly what you need:

```
{"channelId":"sandbox-studio-genesys-staging","host":"127.0.0.1",
 "mcpConfigWritten":false,"port":17351,"projectPath":"c:/users/paulm/documents/omniscient"}
```

Take `port` from the **last** line. Note `projectPath` too — see §4, it matters more than
people expect.

(Release-channel installs log under `Sandbox-Studio/` rather than
`Sandbox-Studio-Staging/`. Older Studio versions wrote a `*.mcp-port` file into the project
instead — this project's `.gitignore` still carries a rule for it. That mechanism is gone.)

### Token — from Studio's UI

The token is **not** in the log (deliberately). Get it from Studio's own MCP/integrations
settings panel, which shows the ready-made config block to copy. If a client already has a
working token, reuse it: it survives relaunches and project switches.

`mcpConfigWritten:false` in that log line means Studio did **not** write a client config
file for you on this launch — so hand-editing is expected, not a workaround.

### Verify before blaming the client

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:<PORT>/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

Read the result:

| Result | Meaning |
|---|---|
| `200` | Gateway is live and the token is good. Any remaining fault is client-side. |
| `000` | Nothing listening on that port — wrong port, or Studio is closed/crashed. |
| `401` / `403` | Port right, token wrong or stale. |

The `Accept: application/json, text/event-stream` header is **required** — streamable HTTP
MCP rejects the request without it, which reads like an auth failure if you're guessing.

---

## 4. The gotcha that is not in any documentation

**The gateway serves ONE project at a time — the one open in Studio.**

If Studio has a different project open, the connection succeeds and the tools answer:

```
{"error":"project_none","message":"...no project is open..."}
```

…or, worse, they answer *for the wrong project* — same tool names, same 200s, different
game. This session lost its connection exactly this way: the gateway had rebound to
`documents/test` while the agent was still talking to `documents/omniscient`.

So the connection checklist is three things, not two: **Studio running → correct project
open → port matches.**

---

## 5. Where the config file goes

- **Claude Code** — `.mcp.json` at the project root (what this project uses; it is
  gitignored because it holds a bearer token). User-level alternative: `~/.claude.json`.
- **Cursor** — `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally. This
  project has an empty `.cursor/mcp.json` (`{"mcpServers":{}}`) — a live one goes here.
- **Anything else** — same JSON under whatever key that client uses for MCP servers. The
  shape above is standard; only the file location differs.

**Most clients read MCP config once at startup.** After editing, restart the client — a
stale in-memory port is indistinguishable from a dead server.

---

## 6. Operating it once connected (hard-won, save yourself the afternoon)

These are not connection issues, but they are what makes an agent *think* the MCP is
broken.

**Always gate on readiness, and expect a dance.**
`query_editor(getState)` before any mutation. The editor reports `busy` for builds and for
play-mode transitions, and the sequence that actually works is:

```
exitPlayMode → poll getBusyState until not busy → buildProject → enterPlayMode
```

Calling `buildProject` while play mode is starting returns `editor_busy`; retrying
immediately then returns `editor_not_ready: Editor world is not loaded` — which is a
*play-mode-is-active* symptom, not a crash. Exit play mode and retry.

**The stale-bundle race is real.** Entering play mode too soon after a build serves the
previous bundle. Symptom: your newest code is provably in `.dist/game.js` (grep it) and the
running game plainly does not have it. Cure: exit play mode, confirm not-busy, rebuild,
*then* enter. This cost several hours before it was recognised.

**Studio's play-mode exit crashes.** `TypeError: Object has been destroyed at
BrowserWindow.emit` — an Electron main-process bug in the app, not in game code. It kills
the MCP connection (`app_offline`). Recovery:

```powershell
Get-Process | Where-Object { $_.ProcessName -like '*Sandbox*' } | Stop-Process -Force
Start-Process 'C:\Program Files\Sandbox-Studio-Staging\Sandbox-Studio-Staging.exe'
```

Then reopen the project (Home → "Open <project>"), and **re-check the port** — a relaunch
is precisely when it moves.

**Underused tools worth knowing:**
- `query_diagnostics(getConsole)` — reads editor *and play-mode* console errors. This is
  how you debug a game that renders nothing instead of bisecting your own code blind.
- `query_diagnostics(getBuildErrors)` — build failures without scraping logs.
- `run_script` — async JS against the live `genesys` API; only return values and console
  logs come back. Modes: `readOnly` (default), `dryRun`, `apply`.
- `search_tools` / `describe_tool` — enumerate the surface and get a tool's exact schema
  instead of guessing parameter names.

**Screenshots:** `action_editor(captureScreenshot)` grabs the *editor viewport*, not the
running game. To see play mode, capture the OS window — and on a high-DPI display call
`ctypes.windll.user32.SetProcessDPIAware()` first or every coordinate is off by the scale
factor.

---

## 7. Sixty-second triage

1. Is Studio running, with **the right project** open?
2. `grep "MCP prepared" <studio log> | tail -1` → note `port` and `projectPath`.
3. curl probe (§3) → `200`?
4. Does the client's config URL match that port? Fix it, then **restart the client**.
5. Still failing → `query_diagnostics(getConsole)` once connected; otherwise check for the
   Electron crash dialog and do the relaunch in §6.
