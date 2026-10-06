#!/usr/bin/env bash
# Forwards this Claude Code hook's JSON input (stdin) to the memory server and prints its JSON answer.
# Settings come from the plugin's options, which Claude Code exports as CLAUDE_PLUGIN_OPTION_*.
# A failure here never blocks Claude Code: on any error the script prints nothing and exits 0.

url="${CLAUDE_PLUGIN_OPTION_MEMORY_URL:-https://weaverai-api.platform.weaversoft.io/api/mcp-proxy/memory-mcp}"
args=(-s -m "${AGENT_MEMORY_HOOK_TIMEOUT:-15}" -X POST
  -H "Content-Type: application/json")
# Production identifies you by your WAIP token; only a local server needs the memory key.
if [ -n "${CLAUDE_PLUGIN_OPTION_MEMORY_KEY:-}" ]; then
  args+=(-H "X-Memory-User-Key: ${CLAUDE_PLUGIN_OPTION_MEMORY_KEY}")
fi
if [ -n "${CLAUDE_PLUGIN_OPTION_AGENT_ID:-}" ]; then
  args+=(-H "X-Memory-Agent-Id: ${CLAUDE_PLUGIN_OPTION_AGENT_ID}")
fi
if [ -n "${CLAUDE_PLUGIN_OPTION_PLATFORM_TOKEN:-}" ]; then
  args+=(-H "Authorization: Bearer ${CLAUDE_PLUGIN_OPTION_PLATFORM_TOKEN}")
fi

curl "${args[@]}" --data-binary @- "${url%/}/hooks/claude-code" || true
exit 0
