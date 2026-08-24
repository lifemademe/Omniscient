#!/usr/bin/env bash
# Talk to the Genesys editor over its HTTP MCP endpoint, without the client.
#
# The Claude Code session's MCP connection can drop mid-session, and there is no way to
# re-establish it from inside the session - the tools simply stop existing. The SERVER is
# usually fine: Sandbox Studio keeps serving on 127.0.0.1:17351 the whole time. Verified by
# a bare `initialize`, which returned 200 and `Genesys-MCP 0.6.0` while the tools were gone.
#
# So this is the fallback. Same endpoint, same token out of .mcp.json (which is gitignored,
# and the token is loopback-only), one streamable-HTTP session per call.
#
#   scripts/dev/mcp.sh tools                      # list what the editor offers
#   scripts/dev/mcp.sh call action_build '{"action":"buildProject"}'
#   scripts/dev/mcp.sh call action_editor '{"action":"enterPlayMode"}'
#   scripts/dev/mcp.sh call query_editor '{"operation":"getPlayModeState"}'
#
# Each invocation initializes, sends `notifications/initialized`, makes the one call and
# exits. That is wasteful and it does not matter: these are localhost round trips measured
# in milliseconds, and a persistent session would need a background process to hold it.
set -euo pipefail

URL=http://127.0.0.1:17351/mcp
# cd rather than pass an absolute path: this runs under Git Bash, where `pwd` gives
# /c/Users/... and the Windows python this calls has never heard of that root.
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
TOKEN=$(python -c "import json;print(json.load(open('.mcp.json',encoding='utf-8'))['mcpServers']['sandbox-studio-genesys-staging']['headers']['Authorization'])")

HDR=$(mktemp)
trap 'rm -f "$HDR"' EXIT

post() {
  curl -s -D "$HDR" -X POST "$URL" \
    -H "Authorization: $TOKEN" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    ${SESSION:+-H "Mcp-Session-Id: $SESSION"} \
    -d "$1" --max-time 120
}

# `data:` lines only - the transport is server-sent events even for a single reply.
payload() { sed -n 's/^data: //p'; }

SESSION=""
post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"mcp.sh","version":"1"}}}' >/dev/null
SESSION=$(grep -i '^mcp-session-id:' "$HDR" | tr -d '\r' | awk '{print $2}')
[ -n "$SESSION" ] || { echo "no session id - is Sandbox Studio running?" >&2; exit 1; }
post '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

case "${1:-tools}" in
  tools)
    post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | payload |
      python -c "import sys,json;[print(' ',t['name']) for t in json.load(sys.stdin)['result']['tools']]"
    ;;
  call)
    ARGS=${3:-'{}'}
    post "$(python -c "
import json,sys
print(json.dumps({'jsonrpc':'2.0','id':3,'method':'tools/call',
                  'params':{'name':sys.argv[1],'arguments':json.loads(sys.argv[2])}}))
" "$2" "$ARGS")" | payload |
      python -c "
import sys,json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR', json.dumps(d['error'])); sys.exit(1)
for block in d['result'].get('content', []):
    print(block.get('text', json.dumps(block)))
"
    ;;
  *) echo "usage: mcp.sh tools | mcp.sh call <tool> '<json args>'" >&2; exit 2 ;;
esac
