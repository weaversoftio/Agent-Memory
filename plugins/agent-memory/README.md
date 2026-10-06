# Agent Memory for Claude Code and Cursor

Connects your coding agent to the team's Agent Memory while it keeps its own model and login:

- **Memory tools (MCP):** search, add, edit and delete memory (`memory_search`, `memory_add`, …)
- **Every turn saved:** your message and the agent's reply go to your agent's raw history (L0), and the memory pipeline extracts facts from them in the background
- **Memory at session start:** each new chat starts with your agent's profile and scene list (or its most recent facts)

Everything goes through the memory server (`MemoryMcp`, port 8097 locally or the `agent-memory` MCP store entry on WAIP) with **your own** `sk-mem` key, so you only ever reach memory you're allowed to see. Obvious secrets (API keys, tokens, private keys) are masked before anything is saved.

## You need

- Your memory key: Memory Hub panel → API Key page (`sk-mem-…`)
- The memory server URL:
  - local stack: `http://localhost:8097`
  - WAIP: the `agent-memory` entry in the MCP store; its Connection tab gives the URL and a WAIP token

## Claude Code

```
/plugin marketplace add weaversoftio/Agent-Memory
/plugin install agent-memory@weaversoft
```

Claude Code asks for the server URL, your memory key, an optional agent ID (only if you own more than one agent) and, for WAIP, the WAIP token. The key and token are kept in your system's secure credential store.

Restart Claude Code. `/mcp` should list `agent-memory`, and `/hooks` shows the three hooks.

To test from a local checkout instead of GitHub: `/plugin marketplace add C:/path/to/Agent-Memory`.

If you added the MCP by hand before (`claude mcp add … agent-memory …`), remove that one: `claude mcp remove agent-memory`.

## Cursor

Run the installer once (it backs up and keeps your existing Cursor settings):

**Windows (PowerShell)**

```powershell
powershell -ExecutionPolicy Bypass -File plugins\agent-memory\cursor\install-cursor.ps1
```

**macOS / Linux**

```bash
bash plugins/agent-memory/cursor/install-cursor.sh
```

It asks for your memory key. For WAIP add `-Url <server URL> -PlatformToken <WAIP token>` (`--url` / `--platform-token` on macOS). If you own more than one agent, add `-AgentId <id>` (`--agent-id`).

Restart Cursor. Settings → MCP should show `agent-memory` as connected.

It writes, at user level so they apply to every project:

| File | What it adds |
|---|---|
| `~/.cursor/mcp.json` | the `agent-memory` MCP server with your key in a header |
| `~/.cursor/hooks.json` | `sessionStart`, `beforeSubmitPrompt`, `afterAgentResponse` hooks that send the hook data to the memory server with `curl` |

Remove it again with `-Uninstall` (`--uninstall`).

## How it works

```
Claude Code / Cursor ──(own login)──> its usual model
   ├─ MCP tools ──────────────┐  (the model decides)
   └─ hooks ──────────────────┤  (every turn, always)
                              ▼
   memory server  /mcp  /hooks/claude-code  /hooks/cursor
                              ▼
   Memory Hub panel API (your key, your permissions) ──> memory-core L0 → L1 → L2 → L3
```

| Moment | Claude Code hook | Cursor hook | What happens |
|---|---|---|---|
| chat starts | `SessionStart` | `sessionStart` | profile + scenes (or recent facts) added to the chat |
| you send a message | `UserPromptSubmit` | `beforeSubmitPrompt` | your message saved to L0 |
| the agent finishes | `Stop` | `afterAgentResponse` | the reply saved to L0 |

Saving runs in the background in Claude Code and never blocks a prompt in Cursor: if the memory server is down, you just keep working.
