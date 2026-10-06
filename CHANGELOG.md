# Changelog

This file records notable changes to **TencentDB Agent Memory**. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

It covers every open-source module in the repository: `MemoryCore` / `MemoryPanel` / `MemoryKnowledge` /
`MemoryProxy` / SDK.

---

## [Unreleased]

### 🌐 Languages

- The panel UI ships in English and Hebrew (right-to-left); the Chinese UI was removed
- Agent-facing text (session-init forms, `mem:` command replies, injected context) and the memory LLM prompts are in English
- Docs, scripts and setup output are in English; the duplicate Chinese READMEs were removed

### 🔐 Private git repositories for Code Graph / Wiki

- The Knowledge Service can clone private repositories with server-wide credentials:
  `KNOWLEDGE_GIT_AUTH_URL_PREFIX` / `_USERNAME` / `_TOKEN`. The token turns it on; it is sent
  as an HTTP header for matching URLs only and never stored in repository URLs
- Repository URLs that embed a password are rejected

---

## [2.0.2-beta.1] — 2026-09-07

### 🗄️ MongoDB storage backend (experimental, optional, off by default)

The default storage is still sqlite; existing deployments need no changes. MongoDB is an optional backend,
for when you want mongot's native full-text search or want to evaluate a non-sqlite data plane:

- new one-command entry point `./start-all-mongo.sh`; without `MONGODB_ENDPOINT` set,
  the script starts a local `mongodb-atlas-local` container (not cloud Atlas)
- once enabled, `MEMORY_CORE_STORE_MODE=mongodb` is written to `.env` and later starts
  keep that backend, never silently falling back to sqlite
- **Switching storage backends doesn't migrate existing data.** sqlite and MongoDB use separate
  data directories / instances, and after switching the old data stays in the old backend. In this version you have to back up and
  migrate by hand; a later version will ship an official migration tool

See the "MongoDB storage backend (experimental)" section of [INSTALL.md](./INSTALL.md) for usage.

### 🧰 Skill experience

- skill search and display are more structured, with clearer information and more reliable calls
- old malformed skill data is repaired automatically; old assets stay compatible

### 🔄 Sessions and client connection

- more clients connect smoothly, and text-mode clients work out of the box
- the team / Agent picker shows the full list, so nothing is missed when there are many teams
- clearer confirmation when a session reset finishes

### 🔐 OAuth2 support · enterprise OA login

- Panel login supports the standard OAuth2 protocol and can connect to an enterprise OA / SSO system
- since every OA differs in protocol details, the repository provides an integration skeleton and settings;
  adapt the `authorize` / `token` / `userinfo` endpoints for your own OA
- once connected, team members log in to the Panel with their OA account, the user identity and `user_key`
  are linked automatically, and nobody has to hand out/remember an `sk-mem-...` string anymore

### 📊 Analytics and observability (optional, off by default)

- a new analytics page shows team usage at a glance, to help you judge how well memory assets accumulate
- more tracking and observability data at key points, for easier operations troubleshooting
- **off by default**; enabling it needs ClickHouse configured on three services: Proxy / Knowledge
  report the tracking data (Proxy records memory / skill tool calls, Knowledge records
  wiki / code-graph tool calls) and Core serves the query endpoints. The Panel calls
  the config discovery endpoints of Core and Knowledge to decide whether it's enabled, and then calls the query endpoints
  to fetch data. See the "Analytics and observability (optional)" section of
  [INSTALL.md](./INSTALL.md)

### 🐛 Fixes

- fixed memory recall coming back empty and search fallback not working in some cases
- fixed occasional memory parsing failures and duplicated past messages
- fixed lists being truncated/incomplete when switching between several teams
- fixed deployment script compatibility issues in some environments

---

## [2.0.1] — 2026-08-25

### 🚀 More Agent clients

Whichever coding agent you use, you can now attach team memory directly:

- new **OpenCode** client support
- new **DeepSeek Harness (dsh)** support: Web UI sessions of DeepSeek's official agent harness
  connect straight to the Proxy and get team memory / skill / knowledge injection automatically
- new **Codex CLI** support
- new **WorkBuddy** client support, out of the box
- consistent first-run and reset experience across clients, for smoother switching

### 🤖 Commands inside the conversation

Common operations without switching to the panel:

- reset the binding mid-session in one step (change team / Agent / task)
- create / update tasks directly in the conversation
- faster command responses, less waiting

### 🧠 Works out of the box on a cold start

- creating a team or user automatically creates a default Agent; no manual setup
- admins can customise the default Agent template, applied automatically to new users
- import assets in one step from Agents already in your IDE, to get started quickly
- a task is bound by default after connecting, so it's ready to use

### 🔄 More stable session binding

- session bindings are persisted and survive restarts
- after switching Agent, memory and skills switch with it correctly, with no cross-over
- fixed some clients' history replay being misclassified

### 🧰 Skill improvements

- skills created in a session are searchable immediately, with no "search blind spot"
- skill IDs are shown again, with one-click copy
- skills can be edited online
- new connection wizard skill: follow it step by step, or connect to the Proxy with one command

### 🎛️ Memory Hub panel

- new login page with a dot-matrix ripple animation
- team edit / delete moved into the team switcher, easier to use, and a switching bug fixed
- admins can set a custom User_Key when creating an account
- new conversation memory search: semantic and keyword search across sessions, with visibility controlled precisely by permission;
  single memory layers can be overwritten directly
- asset IDs are shown and can be copied; lists load completely, fixing truncated pagination

### ⚙️ One-command deployment improvements

- the start scripts support interactive configuration and pre-check the LLM path and port usage automatically, to avoid deployment pitfalls
- the client connection address can be copied in one click and resolves to the host address in single-machine deployments, so external clients can connect directly

### ⚡ Performance

- faster knowledge base list loading and quicker responses on common paths
- Wiki pages are built concurrently and a failed page is retried automatically, greatly cutting the time for large document imports

### 📚 Docs

- separate connection docs per client: each agent has its own clear guide
- new panel and API usage docs
- English panel screenshots and README updates

### 🐛 Fixes

- fixed empty memory search in multi-Agent setups
- fixed asset unbinding not taking effect and the memory tab disappearing when there are many assets
- fixed scrambled times on imported past sessions, restoring the original timeline
- fixed some content being expanded twice when editing a scene
- fixed deployment script compatibility on macOS
- fixed install errors caused by missing dependencies
- fixed compatibility of some clients' first-run form on older versions
- new clear-conversation-memory feature with batch delete

---

## [2.0.1-beta.1] — 2026-08-13

### 🧠 Works out of the box on a cold start · default Agent + preset skills

- creating a team/user automatically creates a default Agent; no manual setup
- the client connection address can be copied in one click and can point at Memory Proxy
- in single-machine deployments the connection address resolves to the host address, so external clients can connect directly

### ⚡ Faster Wiki generation

- optimised Wiki generation with concurrent page builds, greatly cutting the time for large document imports
- a failed page is retried automatically and no longer stalls the whole batch
- generation progress and per-page status are visible in real time

### 🧰 Skill ecosystem

- new skill export
- better skill search: private skills are searchable and results are more accurate
- better skill extraction, covering more cases

### 🔀 Memory Proxy · new clients

- new Codex CLI support
- new WorkBuddy client support
- new DeepSeek Harness (dsh) support: Web UI sessions of DeepSeek's official agent harness
  connect straight to the Proxy and get team memory / skill / knowledge injection; supports short-circuiting aux requests
  (compaction / title-gen) and the CLI headless bypass
- better association between code-graph resources and workspaces

### 🎛️ Memory Hub panel

- reworked first-use onboarding with a new Agent binding step
- better panel interactions, loading skeletons and transitions
- better resolution of user display names on the Task page
- better asset page layout and explanations of ownership/sharing rules
- fixed the memory tab disappearing when there are many assets

### 🐛 Fixes

- fixed empty memory search in multi-Agent setups
- fixed asset unbinding not taking effect
- imported past sessions keep their original times, so the timeline is no longer scrambled
- fixed memory loss in some cases
- new clear-conversation-memory feature with batch delete

---

## [2.0.0] — 2026-08-03

> **What it's for**: turn Agents' experience, docs and code into reusable assets, so the next Agent
> can pick up where the last one left off. See [README.md](./README.md).

### 🧠 Four kinds of memory assets · fully open-sourced for the first time

The four kinds of assets accumulate automatically from "conversations/work traces":

- **Chat Memory**: extracted layer by layer from conversations, L0 raw records → L1 facts → L2 scenes → L3
  long-term understanding; keeps preferences, decisions and interaction history across sessions.
- **Skill**: reusable SOPs distilled from tasks that worked, with versions / resource files / trigger boundaries /
  execution steps / verification rules. New: forced skill archiving.
- **Wiki**: turns documents into structured pages + a link graph (inspired by Karpathy's LLM knowledge base
  practice).
- **CodeGraph**: indexes a repository's symbols / files / call relations / impact paths, so an Agent can do impact analysis
  before changing code. New: scheduled automatic repository sync.

### 🎛️ Memory Hub · the team console

The control panel (the `agentmemory/memory-hub` image, with Panel + Knowledge Service):

- create Teams / Agents and manage assets by owner / version / status / visibility in one place
- three visibility levels: `private` / `team` / `restricted` (User / Role / Agent ACL),
  plus targeted `agent` assignment
- Agent Loadout: bind different assets to different Agents and adjust priority and usage
- the Wiki + CodeGraph workshop is built into the Hub; import a repository/documents and it builds automatically
- System Admins can now use asset management too
- the panel supports switching between Chinese and English throughout; consistent page design, better list interactions and pagination

### 🔀 Memory Proxy · how Agents get memory

`agentmemory/memory-proxy` lets coding agents such as Claude Code use team memory directly:

- **Anthropic / OpenAI protocols**: both `/claude-code/<spaceId>/v1/messages` and
  `/v1/chat/completions` are supported
- **first-turn onboarding**: sessionInit uses `AskUserQuestion` to let the user pick team / agent /
  task, and the proxy remembers the binding
- **per-turn injection**: the agent's L2/L3 memory, matched skills and wiki/code-graph
  go into the system prompt before forwarding to the upstream LLM
- **auth**: `x-tdai-user-key` → the kernel's `/v3/meta/auth/verify` returns the `user_id`,
  and asset visibility is controlled per user
- Cost Guard can configure different models for different Agents to cut costs

### 🚀 The full set of three services with one command

The three images are multi-architecture (`linux/amd64` + `linux/arm64`) and published on
[Docker Hub `agentmemory`](https://hub.docker.com/u/agentmemory), publicly pullable
without logging in:

```bash
git clone https://github.com/Tencent/TencentDB-Agent-Memory.git
cd TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env && $EDITOR .env    # fill in the two sets of LLM parameters
./start-all.sh                          # start everything
```

On first start `start-all.sh` runs `init-admin` automatically, generates the admin `sk-mem-...` and saves it to
`.admin-key`; after checking `/v3/meta/auth/verify` it prints a `claude` start command you can copy.
`stop-all.sh --purge` removes the volumes + admin key completely, for a clean reset.

See [INSTALL.md](./INSTALL.md).

### 🧰 Official SDKs

- **TypeScript**: `@tencentdb-agent-memory/memory-sdk-ts-v2`

  ```ts
  import { MemoryClient, SkillClient, MetadataClient } from "@tencentdb-agent-memory/memory-sdk-ts-v2";

  const memory = new MemoryClient({
    endpoint, apiKey, serviceId,
    teamId, agentId, userId,     // v3 strict isolation: all three required
  });
  ```

  The top-level export is the v3 strict-isolation version; old code using the `.../v2/v3` subpath
  keeps working (the subpath is kept as a backward-compatible alias).

- **Python**: `pip install tencentdb-agent-memory-sdk-python`

  ```python
  from tencentdb_agent_memory import MemoryClient                     # default (v2-compatible)
  from tencentdb_agent_memory.v3 import MemoryClient, MetadataClient, SkillClient
  ```

### 📖 Docs

- new CodeBuddy / Hermes / OpenClaw connection guides
- updated role permission notes in the install guide

---

## [2.0.0-beta.1] — 2026-07-21

First public release. SemVer starts at `2.0.0-beta.1` (the npm package names moved to a `-v2` suffix:
`@tencentdb-agent-memory/memory-tencentdb-v2`, `memory-sdk-ts-v2`).
Docker image tags are independent of the npm versions; this release's images are `:1.0.0-beta.1`.

> **What it's for**: turn Agents' experience, docs and code into reusable assets, so the next Agent
> can pick up where the last one left off. See [README.md](./README.md).

### 🧠 Four kinds of memory assets · fully open-sourced for the first time

The four kinds of assets accumulate automatically from "conversations/work traces":

- **Chat Memory**: extracted layer by layer from conversations, L0 raw records → L1 facts → L2 scenes → L3
  long-term understanding; keeps preferences, decisions and interaction history across sessions.
- **Skill**: reusable SOPs distilled from tasks that worked, with versions / resource files / trigger boundaries /
  execution steps / verification rules.
- **Wiki**: turns documents into structured pages + a link graph (inspired by Karpathy's LLM knowledge base
  practice).
- **CodeGraph**: indexes a repository's symbols / files / call relations / impact paths, so an Agent can do impact analysis
  before changing code.

### 🎛️ Memory Hub · the team console

The control panel (the `agentmemory/memory-hub` image, with Panel + Knowledge Service):

- create Teams / Agents and manage assets by owner / version / status / visibility in one place
- three visibility levels: `private` / `team` / `restricted` (User / Role / Agent ACL),
  plus targeted `agent` assignment
- Agent Loadout: bind different assets to different Agents and adjust priority and usage
- the Wiki + CodeGraph workshop is built into the Hub; import a repository/documents and it builds automatically

### 🔀 Memory Proxy · how Agents get memory

`agentmemory/memory-proxy` lets coding agents such as Claude Code use team memory directly:

- **Anthropic / OpenAI protocols**: both `/claude-code/<spaceId>/v1/messages` and
  `/v1/chat/completions` are supported
- **first-turn onboarding**: sessionInit uses `AskUserQuestion` to let the user pick team / agent /
  task, and the proxy remembers the binding
- **per-turn injection**: the agent's L2/L3 memory, matched skills and wiki/code-graph
  go into the system prompt before forwarding to the upstream LLM
- **auth**: `x-tdai-user-key` → the kernel's `/v3/meta/auth/verify` returns the `user_id`,
  and asset visibility is controlled per user

### 🚀 The full set of three services with one command

The three images are multi-architecture (`linux/amd64` + `linux/arm64`) and published on
[Docker Hub `agentmemory`](https://hub.docker.com/u/agentmemory), publicly pullable
without logging in:

```bash
git clone https://github.com/Tencent/TencentDB-Agent-Memory.git
cd TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env && $EDITOR .env    # fill in the two sets of LLM parameters
./start-all.sh                          # start everything
```

On first start `start-all.sh` runs `init-admin` automatically, generates the admin `sk-mem-...` and saves it to
`.admin-key`; after checking `/v3/meta/auth/verify` it prints a `claude` start command you can copy.
`stop-all.sh --purge` removes the volumes + admin key completely, for a clean reset.

See [INSTALL.md](./INSTALL.md).

### 🧰 Official SDKs

- **TypeScript**: `@tencentdb-agent-memory/memory-sdk-ts-v2`

  ```ts
  import { MemoryClient, SkillClient, MetadataClient } from "@tencentdb-agent-memory/memory-sdk-ts-v2";

  const memory = new MemoryClient({
    endpoint, apiKey, serviceId,
    teamId, agentId, userId,     // v3 strict isolation: all three required
  });
  ```

  The top-level export is the v3 strict-isolation version; old code using the `.../v2/v3` subpath
  keeps working (the subpath is kept as a backward-compatible alias).

- **Python**: `pip install tencentdb-agent-memory-sdk-python`

  ```python
  from tencentdb_agent_memory import MemoryClient                     # default (v2-compatible)
  from tencentdb_agent_memory.v3 import MemoryClient, MetadataClient, SkillClient
  ```
