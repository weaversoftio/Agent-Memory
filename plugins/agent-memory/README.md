# Agent Memory for Claude Code and Cursor

Connects your coding agent to the team's Agent Memory while it keeps its own model and login:

- **Memory tools (MCP):** search, add, edit and delete memory (`memory_search`, `memory_add`, …)
- **Every turn saved:** your message and the agent's reply go to your agent's raw history (L0), and the memory pipeline extracts facts from them in the background
- **Memory at session start:** each new chat starts with your agent's profile and scene list (or its most recent facts)

Everything goes through the `agent-memory` entry in the WAIP MCP store with **your own** memory key, so you only reach memory you're allowed to see. Obvious secrets (API keys, tokens, private keys) are masked before anything is saved.

## Before you start: two values

| Value | Where to get it |
|---|---|
| **Memory key** (`sk-mem-…`) | Memory Hub panel, https://agent-memory.platform.weaversoft.io → API Key page |
| **WAIP token** | WAIP → MCP Store → `agent-memory` → Connection tab |

The server URL is preset to production: `https://weaverai-api.platform.weaversoft.io/api/mcp-proxy/memory-mcp`.

## Claude Code

In Claude Code:

```
/plugin marketplace add weaversoftio/Agent-Memory
/plugin install agent-memory@weaversoft
```

When asked, keep the server URL as it is, paste your memory key and your WAIP token, and leave agent ID empty unless you own more than one agent. The key and token go into your system's secure credential store.

Restart Claude Code. `/mcp` should list `agent-memory`, and `/hooks` shows the three hooks. Updates: `/plugin marketplace update weaversoft`.

If you added the MCP by hand before (`claude mcp add … agent-memory …`), remove that one: `claude mcp remove agent-memory`.

## Cursor

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/weaversoftio/Agent-Memory/main/plugins/agent-memory/cursor/install-cursor.ps1 -OutFile "$env:TEMP\install-cursor.ps1"
powershell -ExecutionPolicy Bypass -File "$env:TEMP\install-cursor.ps1"
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/weaversoftio/Agent-Memory/main/plugins/agent-memory/cursor/install-cursor.sh -o /tmp/install-cursor.sh
bash /tmp/install-cursor.sh
```

It asks for your memory key and WAIP token. If you own more than one agent, add `-AgentId <id>` (`--agent-id <id>` on macOS).

Restart Cursor. Settings → MCP should show `agent-memory` as connected.

The installer writes, at user level so it applies to every project, and keeps a backup of anything already there:

| File | What it adds |
|---|---|
| `~/.cursor/mcp.json` | the `agent-memory` MCP server |
| `~/.cursor/hooks.json` | `sessionStart`, `beforeSubmitPrompt`, `afterAgentResponse` hooks that send the hook data with `curl` |

Remove it again with `-Uninstall` (`--uninstall`).

## Check that it works

1. Tell the agent something worth remembering, e.g. "our staging database is on port 5433".
2. In the panel → Chat Memory → your agent: the conversation shows up under **L0** right away, and extracted facts under **L1** after a few turns or 10 quiet minutes.
3. Start a new chat and ask about it.

## How it works

```
Claude Code / Cursor ──(own login)──> its usual model
   ├─ MCP tools ──────────────┐  (the model decides)
   └─ hooks ──────────────────┤  (every turn, always)
                              ▼
   WAIP MCP proxy (WAIP token) ──> memory-mcp  /mcp  /hooks/claude-code  /hooks/cursor
                              ▼
   Memory Hub panel API (your memory key, your permissions) ──> memory-core L0 → L1 → L2 → L3
```

| Moment | Claude Code hook | Cursor hook | What happens |
|---|---|---|---|
| chat starts | `SessionStart` | `sessionStart` | profile + scenes (or recent facts) added to the chat |
| you send a message | `UserPromptSubmit` | `beforeSubmitPrompt` | your message saved to L0 |
| the agent finishes | `Stop` | `afterAgentResponse` | the reply saved to L0 |

Saving runs in the background in Claude Code and never blocks a prompt in Cursor: if the memory server is down, you just keep working.

## Local development

Against the local Docker stack (`deploy/global-images` plus a `tdai-memory-mcp` container on port 8097), set the server URL to `http://localhost:8097` and leave the WAIP token empty. In Claude Code you can install from a checkout with `/plugin marketplace add <path to Agent-Memory>`; the Cursor installers take `-Url http://localhost:8097` (`--url`).
