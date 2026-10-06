# MemoryMcp (memory-mcp)

An MCP server that gives coding agents (Claude Code, Cursor, Codex, opencode) direct read and write access to Agent Memory.

With it, the agent keeps its own model and login (your Claude subscription, Cursor plan, or API key). Memory is reached through MCP tools instead of routing the LLM through Memory Proxy.

```
Claude Code / Cursor ──(own login)──> its usual model
        │
        └── MCP (X-Memory-User-Key: sk-mem-…) ──> memory-mcp :8080 ──> Memory Hub panel API ──> memory-core
```

The server is stateless and holds no secrets. Each request carries the caller's own `sk-mem` key and is passed to the Memory Hub panel API with that key. The panel's normal permission checks therefore apply: team membership, and agent ownership for edits.

## Tools (chat memory)

| Tool | What it does | Panel endpoint |
|---|---|---|
| `memory_whoami` | Your user, the agents you own, and the default agent | `meta/auth/verify`, `meta/team/list`, `meta/agent/list` |
| `memory_search` | Keyword search in L1 facts (default) or L0 raw history | `chat-memory/search` |
| `memory_list` | List L0 / L1 / L2 / L3; read one L2 scene with `path` | `chat-memory/layer` |
| `memory_add` | Save one L1 memory right away | `chat-memory/layer-add` |
| `memory_update` | Replace an L1 memory, an L2 scene or the L3 profile | `chat-memory/layer-update` |
| `memory_delete` | Delete L1 memories or L0 messages/sessions | `chat-memory/layer-delete` |
| `memory_save_conversation` | Save messages to L0; facts are extracted into L1 in the background | `chat-memory/import` |

Edits and deletes only work on agents you own. Skills, wiki and code graph tools are planned next.

### Hook endpoints (save every turn)

MCP tools only run when the model decides to call them. To save every turn and load memory at session start, the coding agent's own hooks forward their JSON input here (same headers as `/mcp`):

| Endpoint | Events | Answer |
|---|---|---|
| `POST /hooks/claude-code` | `SessionStart` (adds profile + scene index, or recent facts), `UserPromptSubmit` (saves the prompt to L0), `Stop` (saves `last_assistant_message` to L0) | Claude Code hook JSON |
| `POST /hooks/cursor` | `sessionStart` (`additional_context`), `beforeSubmitPrompt` (saves `prompt`), `afterAgentResponse` (saves `text`) | Cursor hook JSON; `beforeSubmitPrompt` always answers `{"continue": true}` |

Turns are saved to the session `claude-code-<session_id>` / `cursor-<conversation_id>`, split into ≤8000-character messages, with obvious secrets masked. Hooks always answer 200 so a memory problem never blocks the user. The ready-made client setup is in [`plugins/agent-memory`](../plugins/agent-memory/README.md): a Claude Code plugin and a Cursor installer.

### Which agent's memory?

1. The tool call's own `agent_id` (plus `team_id` for an agent you don't own)
2. Otherwise the `X-Memory-Agent-Id` header (plus optional `X-Memory-Team-Id`) from your MCP config
3. Otherwise your only agent, if you own exactly one

If none of these settles it, the tool answers with the list of your agents to choose from.

## Headers

| Header | Required | Meaning |
|---|---|---|
| `X-Memory-User-Key` | yes | Your `sk-mem-…` key from the panel's API Key page. `Authorization: Bearer sk-mem-…` also works when connecting directly (not through WAIP, which removes `Authorization`). |
| `X-Memory-Agent-Id` | no | Default agent for every tool call |
| `X-Memory-Team-Id` | no | Team of that agent (only for an agent you don't own) |
| `X-Memory-Service-Id` | no | Memory instance ID; defaults to `MEMORY_SERVICE_ID` |

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `PORT` (or `MCP_HTTP_PORT`) | `8080` | Listen port; MCP endpoint is `/mcp`, health is `/healthz` |
| `MEMORY_HUB_URL` | `http://127.0.0.1:8125` | Memory Hub panel base URL |
| `MEMORY_SERVICE_ID` | `default` | Default memory instance |
| `MEMORY_HUB_TIMEOUT_MS` | `15000` | Timeout per panel call |
| `MEMORY_IDENTITY_CACHE_MS` | `60000` | How long a user's agent list is cached |

## Run locally

Next to the local stack from `deploy/global-images` (panel on port 8125):

```bash
docker run -d --name tdai-memory-mcp -p 8097:8080 \
  -e MEMORY_HUB_URL=http://host.docker.internal:8125 \
  zot.platform.weaversoft.io/apps/agent-memory-mcp:<tag>
```

Or from source: `npm install && npm run dev` (with `MEMORY_HUB_URL` set).

### Connect Claude Code

```bash
claude mcp add --transport http agent-memory http://localhost:8097/mcp \
  --header "X-Memory-User-Key: <your sk-mem key>"
```

Add `--header "X-Memory-Agent-Id: <agent id>"` if you own more than one agent. Start `claude` normally (no `ANTHROPIC_BASE_URL`); run `/mcp` inside Claude Code to check the connection.

### Connect Cursor

In `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agent-memory": {
      "url": "http://localhost:8097/mcp",
      "headers": { "X-Memory-User-Key": "<your sk-mem key>" }
    }
  }
}
```

## On WAIP (MCP store)

Published as an `http` MCP store entry named `memory-mcp` (image only, port 8080). The store's publish form has no env field, so the hub URL is baked in at build time:

```bash
docker build \
  --build-arg MEMORY_HUB_URL=http://agent-memory-hub.apps.svc.cluster.local:8125 \
  -t zot.platform.weaversoft.io/apps/agent-memory-mcp:<commit>-waip MemoryMcp
```

Never name the store entry `agent-memory` (or anything else already used as a Helm release name). WAIP's chart install uninstalls same-name releases in other namespaces, so that name deletes the Agent Memory app itself.

Clients connect through the platform proxy, `https://weaverai-api.platform.weaversoft.io/api/mcp-proxy/memory-mcp/mcp`. The entry's **Connection** tab in the platform UI generates the Claude / Cursor / Codex command with a WAIP service token in `Authorization`. Add your memory key to it as an extra header: `X-Memory-User-Key: <your sk-mem key>`.

## Development

```bash
npm install
npm test          # MCP client ↔ server tests against a fake Memory Hub
npm run typecheck
```
