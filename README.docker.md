# TencentDB-Agent-Memory

Long-term memory service for AI Agents. It gives any Agent framework four progressive memory layers (L0 conversation → L1 atomic memory → L2 scene summaries → L3 user profile).

## Image

| Item | Value |
|------|---|
| Image name | `tencentdb-agent-memory` |
| Base image | `node:22-slim` |
| Size | ~920MB |
| Port | 8420 |
| Runs as | tdai (uid 10001) |
| PID 1 | tini |

## Quick start

The commands below run inside `MemoryCore/`; if you are at the repository root, `cd MemoryCore` first.

### 1. Build the image

```bash
docker build -t tencentdb-agent-memory:latest .
```

### 2. Prepare the config file

There are two config templates:

| Template | Fits |
|------|---------|
| `tdai-gateway.standalone.yaml` | local development, single machine, no outside dependencies |
| `tdai-gateway.service.yaml` | K8s with several replicas, multi-tenant cloud service |

Copy a template and edit it:

```bash
# standalone mode
cp tdai-gateway.standalone.yaml tdai-gateway.yaml

# service mode
cp tdai-gateway.service.yaml tdai-gateway.yaml
```

### 3. Start the container

**Standalone mode (minimal):**

```bash
docker run -d --name agent-memory \
  -v $(pwd)/tdai-gateway.yaml:/data/config/tdai-gateway.yaml:ro \
  -e TDAI_LLM_API_KEY=sk-your-key \
  -p 8420:8420 \
  tencentdb-agent-memory:latest
```

**Service mode (needs Redis):**

```bash
# Start Redis (if you have no remote Redis)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start mock-shark (provides VDB/COS credentials locally)
VDB_ENDPOINT=http://your-vdb:8100 \
VDB_API_KEY=xxx \
VDB_DATABASE=your-db \
COS_BUCKET=your-bucket \
COS_REGION=ap-guangzhou \
COS_SECRET_ID=xxx \
COS_SECRET_KEY=xxx \
npx tsx scripts/mock-shark-server.ts &

# Start the Memory Service
docker run -d --name agent-memory \
  -v $(pwd)/tdai-gateway.real.yaml:/data/config/tdai-gateway.yaml:ro \
  -e TDAI_LLM_API_KEY=sk-your-key \
  -p 8420:8420 \
  tencentdb-agent-memory:latest
```

**Docker Compose, one command (includes Redis):**

```bash
TDAI_LLM_API_KEY=sk-your-key docker compose -f docker-compose.local.yaml up --build
```

### 4. Check the service

```bash
curl http://localhost:8420/health
```

A healthy response:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "services": {
    "timerScanner": { "isLeader": true },
    "pipelineWorker": { "workerId": "worker-xxx" },
    "stateBackend": "connected"
  }
}
```

## Configuration

### Config file + environment variables (recommended)

Every setting can come from the **YAML config file** or an **environment variable**; environment variables win.

Inside the container the config file path comes from the `TDAI_GATEWAY_CONFIG` environment variable, default `/data/config/tdai-gateway.yaml`.

```
┌─────────────────────────────┐
│  env vars (highest)         │  ← secrets
├─────────────────────────────┤
│  tdai-gateway.yaml          │  ← mounted from a ConfigMap
├─────────────────────────────┤
│  code defaults              │  ← fallback
└─────────────────────────────┘
```

### Config file layout

```yaml
deployMode: service          # standalone | service

server:
  port: 8420
  host: "0.0.0.0"

llm:                         # LLM API (OpenAI-compatible)
  baseUrl: "https://api.lkeap.cloud.tencent.com/v1"
  apiKey: "${TDAI_LLM_API_KEY}"
  model: "deepseek-v3.2"

redis:                       # Redis (required in service mode)
  host: "redis:6379"
  keyPrefix: "tdai_memory"

shark:                       # Shark config center (hands out VDB/COS credentials)
  baseUrl: "http://shark:8000"

scanner:                     # Timer Scanner
  intervalMs: 500

worker:                      # Pipeline Worker
  pollMs: 200

memory:                      # memory engine tuning
  pipeline:
    everyNConversations: 5
    enableWarmup: true
  recall:
    maxResults: 5
    strategy: "hybrid"
```

For the full set of options see `tdai-gateway.standalone.yaml` and `tdai-gateway.service.yaml`.

### Environment variables and their config file keys

| Environment variable | YAML path | Default | Description |
|---------|----------|--------|------|
| `TDAI_DEPLOY_MODE` | `deployMode` | `standalone` | deployment mode |
| `TDAI_GATEWAY_CONFIG` | — | `/data/config/tdai-gateway.yaml` | config file path |
| `TDAI_LLM_API_KEY` | `llm.apiKey` | — | LLM API key |
| `TDAI_LLM_BASE_URL` | `llm.baseUrl` | `https://api.openai.com/v1` | LLM address |
| `TDAI_LLM_MODEL` | `llm.model` | `gpt-4o` | model name |
| `REDIS_HOST` | `redis.host` | `127.0.0.1` | Redis address |
| `REDIS_PORT` | `redis.port` | `6379` | Redis port |
| `REDIS_PASSWORD` | `redis.password` | — | Redis password |
| `REDIS_KEY_PREFIX` | `redis.keyPrefix` | `tdai_memory` | key prefix |
| `SHARK_BASE_URL` | `shark.baseUrl` | — | Shark address |
| `STATE_BACKEND` | `stateBackend` | auto | `redis` / `local` |
| `SCANNER_INTERVAL_MS` | `scanner.intervalMs` | `500` | scan interval |
| `WORKER_POLL_MS` | `worker.pollMs` | `200` | worker polling |
| `COS_DOMAIN` | `cos.domain` | — | COS internal domain |

## K8s / TKE deployment

This repository doesn't contain ready-to-apply Kubernetes manifests (the WAIP chart in `deploy/waip/agent-memory/` aside); these are the core pieces a K8s/TKE deployment needs:

1. a **ConfigMap** that mounts `tdai-gateway.yaml` into `/app/config/`
2. a **Secret** that injects `TDAI_LLM_API_KEY` + `REDIS_PASSWORD` as environment variables
3. a **Deployment** that sets `TDAI_GATEWAY_CONFIG=/data/config/tdai-gateway.yaml`

```yaml
# Key parts of the Deployment
env:
  - name: TDAI_GATEWAY_CONFIG
    value: /data/config/tdai-gateway.yaml
  - name: TDAI_LLM_API_KEY
    valueFrom:
      secretKeyRef:
        name: tdai-memory-secrets
        key: TDAI_LLM_API_KEY
volumeMounts:
  - name: config-volume
    mountPath: /app/config
    readOnly: true
volumes:
  - name: config-volume
    configMap:
      name: tdai-memory-config
```

## API overview

| Method | Path | Description |
|------|------|------|
| GET | `/health` | health check |
| POST | `/recall` | memory recall |
| POST | `/capture` | write a conversation |
| POST | `/search/memories` | L1 memory search |
| POST | `/search/conversations` | L0 conversation search |
| POST | `/session/end` | end the session |
| POST | `/v2/*` | v2 multi-tenant API (needs a Bearer token) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 TencentDB Agent Memory               │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Gateway  │  │ TimerScanner │  │ PipelineWorker│  │
│  │ HTTP API │  │ 500ms scan   │  │ competing     │  │
│  │          │  │              │  │ consumers     │  │
│  └────┬─────┘  └──────┬───────┘  └──────┬────────┘  │
│       │               │                 │            │
│  ┌────▼─────────────────────────────────▼────────┐  │
│  │          IStateBackend (Redis / Local)         │  │
│  └───────────────────────────────────────────────┘  │
│       │                                              │
│  ┌────▼───────────┐  ┌────────────┐  ┌───────────┐  │
│  │  TdaiCore      │  │ StorePool  │  │ COS       │  │
│  │  L0→L1→L2→L3   │  │ VDB pool   │  │ objects   │  │
│  └────────────────┘  └────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────┘
         │                    │               │
    ┌────▼────┐         ┌────▼────┐     ┌────▼────┐
    │  LLM    │         │  TCVDB  │     │  COS    │
    │ API     │         │ vectors │     │ objects │
    └─────────┘         └─────────┘     └─────────┘
```

## Files

```
.
├── MemoryCore/
│   ├── Dockerfile                       # image build
│   ├── docker-compose.local.yaml        # local one-command test (includes Redis)
│   ├── tdai-gateway.standalone.yaml     # standalone config template
│   ├── tdai-gateway.service.yaml        # service config template
│   ├── tdai-gateway.real.yaml           # local test config (real services)
│   ├── scripts/mock-shark-server.ts     # mock Shark (local development)
│   └── src/gateway/server.ts            # service entry point
```

## License

Proprietary — Tencent Cloud
