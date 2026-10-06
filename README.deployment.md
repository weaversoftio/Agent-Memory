# Deployment and integration guide (open-source single machine / cloud service)

> 📖 **This document covers deployment modes, Hermes integration and end-to-end verification.**
> For the plugin's core capabilities, configuration options and CLI tools, go back to the **[main README](README.md)**.

`memory-tencentdb` offers **two independent deployment modes**. Both can be called by external Agents (typically Hermes) over the HTTP API, and each fits a different deployment scale and operational requirement:

| Mode | Storage | State backend | Multi-tenant | Fits |
|------|----------|----------|--------|----------|
| **Standalone (open-source single machine)** | SQLite + local files | in-process Map / Timer | single space | local development, single-Agent sidecar, all-in-one Docker, offline deployment |
| **Service (cloud service)** | TCVDB + COS | Redis (distributed lock + task queue) | many spaces, per `service_id` | K8s with several replicas, multi-tenant SaaS, memory shared by several Agents |

```
L0  raw conversation (Conversation)    ← written automatically
L1  atomic structured memory (Atomic)  ← extracted by the LLM + deduplicated
L2  scene blocks (Scene Blocks)        ← scene extraction by the LLM
L3  user profile (Persona)             ← persona synthesis by the LLM
```

Both modes share the same Gateway binary and the same v1/v2 HTTP API; only the configuration and backends differ. Switching modes only requires changing the `TDAI_DEPLOY_MODE` environment variable.

---

## Quick start (3 steps)

```bash
# 1. Go into MemoryCore and install dependencies
cd MemoryCore
npm install

# 2. Configure the LLM
export TDAI_LLM_API_KEY="your-api-key"
export TDAI_LLM_BASE_URL="https://api.deepseek.com/v1"
export TDAI_LLM_MODEL="deepseek-chat"

# 3. Start the Gateway
npx tsx src/gateway/server.ts
```

The Gateway listens on `http://127.0.0.1:8420` by default and stores data in `~/.memory-tencentdb/memory-tdai/`.

---

## Deployment modes

### Standalone mode (single machine)

No outside dependencies; all data is stored locally. Fits: local development, a single-Agent sidecar, all-in-one Docker deployments.

**Storage**: SQLite (vectors + records) + local file system (L2/L3 documents)
**State management**: in-process Map/Timer

#### Environment variables

```bash
# Required — LLM
export TDAI_LLM_API_KEY="sk-xxx"
export TDAI_LLM_BASE_URL="https://api.deepseek.com/v1"   # default https://api.openai.com/v1
export TDAI_LLM_MODEL="deepseek-chat"                     # default gpt-4o
export TDAI_LLM_MAX_TOKENS=4096
export TDAI_LLM_TIMEOUT_MS=120000

# Optional — service
export TDAI_GATEWAY_PORT=8420            # listening port, default 8420
export TDAI_GATEWAY_HOST="127.0.0.1"    # listening address, default 127.0.0.1
export TDAI_DATA_DIR="~/.memory-tencentdb/memory-tdai"  # data directory
```

#### YAML config file (optional)

Config file search order: `$TDAI_GATEWAY_CONFIG` → `./tdai-gateway.yaml` → `<dataDir>/tdai-gateway.yaml`

```yaml
# tdai-gateway.yaml — Standalone mode
server:
  port: 8420
  host: "127.0.0.1"

data:
  baseDir: "~/.memory-tencentdb/memory-tdai"

llm:
  baseUrl: "https://api.deepseek.com/v1"
  apiKey: "${TDAI_LLM_API_KEY}"
  model: "deepseek-chat"
  maxTokens: 4096
  timeoutMs: 120000

# memory settings (optional, all have sensible defaults)
memory:
  capture:
    enabled: true
    excludeAgents: []
  recall:
    maxResults: 5
    scoreThreshold: 0.3
    strategy: "hybrid"            # hybrid / embedding / keyword
  embedding:
    enabled: true
    provider: "openai"            # none / openai / deepseek / qclaw
    baseUrl: "${TDAI_LLM_BASE_URL}"
    apiKey: "${TDAI_LLM_API_KEY}"
    model: "text-embedding-3-small"
    dimensions: 1536
  bm25:
    enabled: true
    language: "zh"
  storeBackend: "sqlite"          # sqlite (standalone) or tcvdb (service)
  pipeline:
    everyNConversations: 5
    enableWarmup: true
    l1IdleTimeoutMs: 30000
    l2IntervalMs: 300000
    l3IntervalMs: 600000
```

#### Docker deployment

```bash
# Gateway only
docker run -d \
  -e TDAI_LLM_API_KEY="sk-xxx" \
  -e TDAI_LLM_BASE_URL="https://api.deepseek.com/v1" \
  -e TDAI_LLM_MODEL="deepseek-chat" \
  -e TDAI_GATEWAY_HOST="0.0.0.0" \
  -p 8420:8420 \
  -v tdai-data:/root/.memory-tencentdb/memory-tdai \
  agentmemory/hermes-memory:latest
```

#### Data directory layout

```
~/.memory-tencentdb/memory-tdai/
  ├── vectors.db              # SQLite vector database (L0 + L1)
  ├── conversations/          # L0 raw conversation JSONL
  ├── records/                # L1 structured memories
  ├── scene_blocks/           # L2 scene Markdown files
  ├── persona.md              # L3 user profile
  └── checkpoint.json         # pipeline progress
```

---

### Service mode

Uses external storage (TCVDB vector database + COS object storage) and scales horizontally across replicas. Fits: K8s clusters, multi-tenant SaaS, memory shared by several Agents.

**Storage**: TCVDB (vector search) + COS (L2/L3 documents, isolated by per-serviceId paths)
**State management**: Redis (distributed lock + task queue)
**Config source**: the Shark service (dynamic VDB/COS credentials) or environment variables (static credentials)

#### Environment variables

```bash
# ── Deployment mode ──
export TDAI_DEPLOY_MODE="service"           # key: enables service mode

# ── LLM (same as standalone) ──
export TDAI_LLM_API_KEY="sk-xxx"
export TDAI_LLM_BASE_URL="https://api.deepseek.com/v1"
export TDAI_LLM_MODEL="deepseek-chat"

# ── Service port ──
export TDAI_GATEWAY_PORT=3100
export TDAI_GATEWAY_HOST="0.0.0.0"

# ── Redis (distributed state backend) ──
export STATE_BACKEND="redis"                # redis or local (single-machine testing)
export REDIS_HOST="redis.example.com"
export REDIS_PORT=6379
export REDIS_PASSWORD="your-password"
export REDIS_KEY_PREFIX="tdai_memory"

# ── VDB vector database (direct mode) ──
export VDB_ENDPOINT="http://vdb.example.com:8100"
export VDB_USER="root"
export VDB_API_KEY="your-vdb-api-key"
export VDB_DATABASE="memory-production"

# ── COS object storage (direct mode) ──
export COS_SECRET_ID="AKIDxxxx"
export COS_SECRET_KEY="xxxxx"
export COS_TOKEN=""                         # set when using STS temporary credentials
export COS_URL="https://your-bucket.cos.ap-guangzhou.myqcloud.com"
export COS_PATH_PREFIX="tenants/prod/"

# ── Or use the Shark config service (recommended for production) ──
export SHARK_BASE_URL="http://shark.example.com:8080"
# Shark provides per-instance VDB and COS configuration automatically

# ── Optional tuning ──
export CONFIG_VDB_TTL_MS=300000             # VDB config cache TTL, default 5 minutes
export CONFIG_COS_BUFFER_MS=120000          # how early COS credentials are refreshed
export CONFIG_MAX_INSTANCES=1000            # maximum number of cached instances
export SCANNER_SPACES="space1,space2"       # spaces the Timer Scanner scans
export TDAI_SPACE_ID="default"              # space ID of this instance
```

#### YAML config file

```yaml
# tdai-gateway.yaml — Service mode
deployMode: service

server:
  port: 3100
  host: "0.0.0.0"

data:
  baseDir: "/data/tdai-memory"

llm:
  baseUrl: "${TDAI_LLM_BASE_URL}"
  apiKey: "${TDAI_LLM_API_KEY}"
  model: "deepseek-chat"

memory:
  storeBackend: "tcvdb"
  tcvdb:
    embeddingModel: "bge-large-zh"    # server-side embedding model in VDB
    timeout: 10000
  embedding:
    enabled: false                     # TCVDB does embedding server-side; not needed on the client
    provider: "none"
  bm25:
    enabled: true
    language: "zh"
  recall:
    strategy: "hybrid"
    maxResults: 10
```

#### K8s deployment

```yaml
# Core environment variables (injected via ConfigMap/Secret)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tdai-memory-gateway
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: gateway
          image: agentmemory/hermes-memory:latest
          env:
            - name: TDAI_DEPLOY_MODE
              value: "service"
            - name: TDAI_GATEWAY_PORT
              value: "3100"
            - name: TDAI_GATEWAY_HOST
              value: "0.0.0.0"
            - name: STATE_BACKEND
              value: "redis"
            - name: REDIS_HOST
              valueFrom:
                configMapKeyRef:
                  name: tdai-config
                  key: redis-host
            - name: SHARK_BASE_URL
              value: "http://shark-svc:8080"
          ports:
            - containerPort: 3100
---
apiVersion: v1
kind: Service
metadata:
  name: tdai-memory-gateway
spec:
  selector:
    app: tdai-memory-gateway
  ports:
    - port: 3100
      targetPort: 3100
```

#### Multi-replica architecture

```
                    ┌─────────────┐
                    │  Hermes #1  │─┐
                    └─────────────┘ │
                    ┌─────────────┐ │    ┌──────────────────┐    ┌──────────┐
                    │  Hermes #2  │─┼───→│  TDAI Gateway    │───→│  TCVDB   │
                    └─────────────┘ │    │  (N replicas)    │    │  vectors │
                    ┌─────────────┐ │    │                  │───→│          │
                    │  Hermes #3  │─┘    │  ┌─ Scanner ─┐   │    └──────────┘
                    └─────────────┘      │  │  Worker   │   │    ┌──────────┐
                                         │  └───────────┘   │───→│   COS    │
  Each Hermes uses a unique              └──────────────────┘    │  objects │
  x-tdai-service-id                              │               └──────────┘
  for data isolation                     ┌──────────────┐
                                         │    Redis     │
                                         │ state + tasks│
                                         └──────────────┘
```

---

## Hermes plugin configuration

There are two Hermes plugins for different deployment scenarios.

### v1 plugin: `memory_tencentdb` (single machine, self-managed)

Starts and manages the Gateway subprocess automatically; no manual Gateway deployment needed. Fits single-Agent local/Docker deployments.

**Install the plugin**:

```bash
# symlink (recommended for development)
ln -s "$(pwd)/MemoryCore/hermes-plugin/memory/memory_tencentdb" \
      <hermes-agent>/plugins/memory/memory_tencentdb

# copy (production)
cp -r MemoryCore/hermes-plugin/memory/memory_tencentdb \
      <hermes-agent>/plugins/memory/memory_tencentdb
```

**Hermes config** (`~/.hermes/config.yaml`):

```yaml
memory:
  provider: memory_tencentdb
```

**Environment variables**:

| Variable | Default | Description |
|------|--------|------|
| `TDAI_LLM_API_KEY` | (required) | LLM API key |
| `TDAI_LLM_BASE_URL` | `https://api.openai.com/v1` | LLM API address |
| `TDAI_LLM_MODEL` | `gpt-4o` | LLM model name |
| `MEMORY_TENCENTDB_GATEWAY_PORT` | `8420` | Gateway listening port |
| `MEMORY_TENCENTDB_GATEWAY_HOST` | `127.0.0.1` | Gateway listening address |
| `MEMORY_TENCENTDB_GATEWAY_CMD` | (auto-detected) | custom Gateway start command |

**Tools**:

| Tool | Purpose |
|------|------|
| `memory_tencentdb_memory_search` | search L1 structured memories |
| `memory_tencentdb_conversation_search` | search the L0 raw conversation |

**Features**: starts the Gateway subprocess automatically, health-check watchdog (every 10s), automatic recovery, circuit breaker, background sync thread.

---

### v2 plugin: `memory_tencentdb_v2` (external Gateway)

Connects to an already running Gateway service (local or remote) over the v2 REST API. Fits a Gateway shared by several Agents, and K8s cluster deployments.

**Install the plugin**:

```bash
ln -s "$(pwd)/MemoryCore/hermes-plugin/memory/memory_tencentdb_v2" \
      <hermes-agent>/plugins/memory/memory_tencentdb_v2
```

**Install the Python SDK**:

```bash
pip install tdai-memory
```

**Hermes config** (`~/.hermes/config.yaml`):

```yaml
memory:
  provider: memory_tencentdb_v2
```

**Environment variables**:

| Variable | Default | Description |
|------|--------|------|
| `TDAI_MEMORY_ENDPOINT` | `http://127.0.0.1:8420` | Gateway service address |
| `TDAI_MEMORY_API_KEY` | `""` | Bearer token (required in service mode) |
| `TDAI_MEMORY_SERVICE_ID` | `""` | instance/space ID (multi-tenant isolation key) |

**Tools**:

| Tool | Purpose | Parameters |
|------|------|------|
| `tdai_memory_search` | search L1 structured memories | `query` (required), `limit` (default 5) |
| `tdai_conversation_search` | search the L0 raw conversation | `query` (required), `limit` (default 5) |
| `tdai_read_scene` | read L2 scene content | `scene_id` (required) |

**Features**: based on the `tdai_memory` Python SDK (httpx), Bearer token auth, multi-tenant isolation, circuit breaker (5 failures → 60s cool-down), thread-safe.

---

### Which to choose

| Scenario | Plugin | Deployment mode | Gateway |
|------|----------|----------|---------|
| local development / single Agent | `memory_tencentdb` (v1) | standalone | managed by the plugin |
| single Docker container | `memory_tencentdb` (v1) | standalone | managed by the plugin |
| memory shared by several Agents | `memory_tencentdb_v2` (v2) | service | deployed separately |
| K8s cluster | `memory_tencentdb_v2` (v2) | service | K8s Service |
| multi-tenant SaaS | `memory_tencentdb_v2` (v2) | service | several replicas + Redis |

---

## API overview

### v1 API (standalone-compatible)

| Method | Path | Description |
|------|------|------|
| GET | `/health` | health check |
| POST | `/recall` | memory recall (prefetch) |
| POST | `/capture` | conversation capture (sync_turn) |
| POST | `/search/memories` | L1 memory search |
| POST | `/search/conversations` | L0 conversation search |
| POST | `/session/end` | end session + flush |
| POST | `/seed` | bulk-import past conversations |

### v2 API (multi-tenant, needs a Bearer token + x-tdai-service-id)

| Method | Path | Description |
|------|------|------|
| POST | `/v2/conversation/add` | L0 add conversation |
| POST | `/v2/conversation/query` | L0 query conversation |
| POST | `/v2/conversation/search` | L0 search conversation |
| POST | `/v2/conversation/delete` | L0 delete conversation |
| POST | `/v2/atomic/add` | L1 add memory |
| POST | `/v2/atomic/query` | L1 query memories |
| POST | `/v2/atomic/search` | L1 search memories |
| POST | `/v2/atomic/delete` | L1 delete memory |
| POST | `/v2/scenario/ls` | L2 list scenes |
| POST | `/v2/scenario/read` | L2 read scene |
| POST | `/v2/scenario/write` | L2 write scene |
| POST | `/v2/scenario/rm` | L2 delete scene |
| POST | `/v2/persona/read` | L3 read profile |
| POST | `/v2/persona/write` | L3 write profile |

---

## Configuration reference

### All environment variables

| Variable | Default | Mode | Description |
|------|--------|----------|------|
| **Gateway basics** |
| `TDAI_DEPLOY_MODE` | `standalone` | all | `standalone` or `service` |
| `TDAI_GATEWAY_PORT` | `8420` | all | listening port |
| `TDAI_GATEWAY_HOST` | `127.0.0.1` | all | listening address |
| `TDAI_DATA_DIR` | `~/.memory-tencentdb/memory-tdai` | all | data directory |
| `TDAI_GATEWAY_CONFIG` | (searched) | all | config file path |
| **LLM** |
| `TDAI_LLM_API_KEY` | `""` | all | LLM API key |
| `TDAI_LLM_BASE_URL` | `https://api.openai.com/v1` | all | LLM API address |
| `TDAI_LLM_MODEL` | `gpt-4o` | all | model name |
| `TDAI_LLM_MAX_TOKENS` | `4096` | all | maximum output tokens |
| `TDAI_LLM_TIMEOUT_MS` | `120000` | all | LLM request timeout |
| **Service mode** |
| `STATE_BACKEND` | (auto) | service | `redis` or `local` |
| `REDIS_HOST` | `127.0.0.1` | service | Redis address |
| `REDIS_PORT` | `6379` | service | Redis port |
| `REDIS_PASSWORD` | (none) | service | Redis password |
| `REDIS_KEY_PREFIX` | `tdai_memory` | service | Redis key prefix |
| **VDB (direct mode)** |
| `VDB_ENDPOINT` | `""` | service | VDB address |
| `VDB_USER` | `root` | service | VDB username |
| `VDB_API_KEY` | `""` | service | VDB API key |
| `VDB_DATABASE` | `default` | service | VDB database name |
| **COS (direct mode)** |
| `COS_SECRET_ID` | (none) | service | COS AK |
| `COS_SECRET_KEY` | (none) | service | COS SK |
| `COS_TOKEN` | (none) | service | COS STS token |
| `COS_URL` | (none) | service | COS bucket URL |
| `COS_PATH_PREFIX` | (none) | service | COS path prefix |
| **Shark (production mode)** |
| `SHARK_BASE_URL` | (none) | service | Shark config service address |
| **Tuning** |
| `CONFIG_VDB_TTL_MS` | `300000` | service | VDB config cache TTL |
| `CONFIG_COS_BUFFER_MS` | `120000` | service | how early COS credentials are refreshed |
| `CONFIG_MAX_INSTANCES` | `1000` | service | maximum number of cached instances |
| `SCANNER_SPACES` | `default` | service | spaces the Scanner scans |
| `TDAI_SPACE_ID` | `default` | service | current space ID |

---

## Typical deployment examples

### Example 1: local development (minimal)

```bash
export TDAI_LLM_API_KEY="sk-xxx"
export TDAI_LLM_BASE_URL="https://api.deepseek.com/v1"
export TDAI_LLM_MODEL="deepseek-chat"
npx tsx src/gateway/server.ts
```

### Example 2: Docker all-in-one (Hermes + Gateway)

```bash
docker run -d \
  -e MODEL_API_KEY="sk-xxx" \
  -e MODEL_BASE_URL="https://api.deepseek.com/v1" \
  -e MODEL_NAME="deepseek-chat" \
  -p 8420:8420 \
  -v hermes-data:/home/agentuser \
  agentmemory/hermes-memory:latest
```

### Example 3: several Agents + a shared Gateway

```bash
# 1. Start the Gateway (service mode)
cd MemoryCore
TDAI_DEPLOY_MODE=service \
TDAI_GATEWAY_PORT=3100 \
TDAI_GATEWAY_HOST=0.0.0.0 \
STATE_BACKEND=local \
VDB_ENDPOINT="http://vdb.example.com:8100" \
VDB_API_KEY="your-key" \
VDB_DATABASE="memory-shared" \
npx tsx src/gateway/server.ts

# 2. Give each Hermes Agent its own service_id
# Agent A:
export TDAI_MEMORY_ENDPOINT="http://gateway-host:3100"
export TDAI_MEMORY_API_KEY="shared-key"
export TDAI_MEMORY_SERVICE_ID="agent-code-assistant"

# Agent B:
export TDAI_MEMORY_ENDPOINT="http://gateway-host:3100"
export TDAI_MEMORY_API_KEY="shared-key"
export TDAI_MEMORY_SERVICE_ID="agent-customer-support"
```

### Example 4: K8s production deployment

This repository doesn't contain ready-to-apply Kubernetes manifests (except the WAIP chart in `deploy/waip/agent-memory/`); use the Deployment, ConfigMap and Secret examples in this section as a template and adjust them to your images, domains and cluster.

---

## End-to-end verification (E2E)

The repository has two ready-to-run E2E scripts, one per deployment mode. Both run the whole chain with a real Hermes API Server + a real LLM + a real Gateway process.

### Standalone E2E: `__tests__/e2e/test_hermes_standalone_e2e.py`

Verifies the open-source single-machine chain:

```
Hermes API Server → memory_tencentdb (v1 plugin) → self-managed Gateway subprocess → SQLite + local FS
```

Covers:
- Hermes API Server starts and `/health` passes
- the first chat triggers the v1 plugin's `initialize()`, which starts the Node subprocess with `pnpm exec tsx src/gateway/server.ts`
- Gateway `/health` reports `vectorStore: true`
- 3 conversation turns: plant a marker → the model recalls and echoes it → cross-session recall via the v1 plugin's prefetch
- side channel: query the Gateway's `/search/conversations` directly and find this run's marker
- tool layer: `/search/conversations` / `/search/memories` respond normally

```bash
hermes-agent/.venv/bin/python MemoryCore/__tests__/e2e/test_hermes_standalone_e2e.py
```

Measured result: **16 / 16 passed**.

### Service E2E: `MemoryCore/__tests__/e2e/test_hermes_service_e2e.py`

Verifies the multi-replica cloud service chain:

```
mock-shark (Shark stub: provides VDB/COS configuration)
2 Gateway processes (service mode, sharing TCVDB)
Hermes → memory_tencentdb_v2 (v2 plugin, tdai_memory SDK) → Gateway-1 → TCVDB
Side channel verified on Gateway-2 → proves TCVDB is really shared
```

Covers:
- mock-shark + GW1 + GW2 + Hermes all ready
- both Gateways in service mode (`stateBackend=connected` + `timerScanner` running)
- Hermes `/v1/models` returns 200 and the v2 plugin loads
- 3 conversation turns written through the v2 plugin into GW1 → real TCVDB
- **cross-Gateway consistency**: a search on GW2 finds the marker GW1 wrote
- GW2 `/conversation/query` returns every message of the main session
- cross-session prefetch: the model recalls the marker in a new session through the v2 plugin
- L1 add on GW1 → immediately visible via GW2 `/atomic/query` (proves shared TCVDB reads/writes)
- automatic backup/restore of the `memory.provider` field in `~/.hermes/config.yaml`

```bash
# Prerequisite: install the SDK into the Hermes venv (once)
hermes-agent/.venv/bin/python -m pip install -e sdk/memory-core/python/

# Run
hermes-agent/.venv/bin/python __tests__/e2e/test_hermes_service_e2e.py
```

Measured result: **23 / 23 passed** (cross-Gateway consistency, cross-session recall and cross-GW L1 sharing all pass).

### Prerequisites for both scripts

1. the `hermes` CLI is installed (default path `~/.hermes/bin/hermes`)
2. `model.api_key` / `model.base_url` / `model.default` in `~/.hermes/config.yaml` point to a working LLM
3. the v1 / v2 plugins are linked into `hermes-agent/plugins/memory/` (installed by default)
4. service mode additionally needs `pnpm add cos-nodejs-sdk-v5` (Gateway dependency) + `pip install -e sdk/memory-core/python/` (SDK for Hermes)
