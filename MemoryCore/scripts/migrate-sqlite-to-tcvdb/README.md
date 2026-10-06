# SQLite → Tencent Cloud VectorDB migration tool

An offline migration tool that moves memory-tdai data from local SQLite storage to Tencent Cloud VectorDB (TCVDB).

## Prerequisites

- Node.js >= 22.16.0
- the plugin is installed with `openclaw plugins install`
- the migration script is compiled (see below)

## Build

The migration script is written in TypeScript and has to be compiled before running:

```bash
npm run build:migrate-sqlite-to-vdb
```

The output goes to `scripts/migrate-sqlite-to-tcvdb/dist/` and runs directly with Node.

## Usage

```bash
# Preflight mode (only inspects the source data, writes nothing)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --dry-run

# Real migration
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --yes
```

### More examples

```bash
# Pass the API key directly (not through an environment variable)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key 'your-api-key-here' \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --yes
```

```bash
# Custom SQLite path (when the database isn't at the default vectors.db location)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --sqlite-path /backup/2026-04/vectors-snapshot.db \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --yes
```

```bash
# Migrate only the L1 memory layer (skip L0 raw messages and the profile)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --layers l1 \
  --yes
```

```bash
# Migrate only L0 and L1 (not the profile)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --layers l0,l1 \
  --yes
```

```bash
# English corpus: use English BM25 tokenisation
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-en-v1.5 \
  --bm25-language en \
  --yes
```

```bash
# Disable BM25 sparse vectors (dense vector search only)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --no-bm25-enabled \
  --yes
```

```bash
# Migrate the data only; don't update openclaw.json and the manifest (manage the config by hand)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --no-apply-config \
  --no-rewrite-manifest \
  --yes
```

```bash
# Incremental migration: allow existing data in the target and skip the non-empty check
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --no-fail-if-target-nonempty \
  --no-verify-counts \
  --yes
```

```bash
# Write the migration summary to a JSON file (for CI/automation pipelines)
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://127.0.0.1:80 \
  --tcvdb-username root \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --summary-json-path ./migration-report.json \
  --job-id "migrate-2026-04-13" \
  --yes
```

```bash
# Custom timeout and alias
npm run migrate:sqlite-to-tcvdb -- \
  --plugin-data-dir ~/.openclaw/memory-tdai \
  --openclaw-config-path ~/.openclaw/openclaw.json \
  --tcvdb-url http://10.0.1.50:80 \
  --tcvdb-username admin \
  --tcvdb-api-key-env TCVDB_API_KEY \
  --tcvdb-database agent_memory_prod \
  --tcvdb-embedding-model bge-large-zh \
  --tcvdb-alias "production-primary" \
  --tcvdb-timeout-ms 30000 \
  --yes
```

## Options

| Option | Required | Default | Description |
|---|---|---|---|
| `--plugin-data-dir` | yes | — | plugin data directory path |
| `--openclaw-config-path` | yes | — | path of the `openclaw.json` config file |
| `--sqlite-path` | no | `<plugin-data-dir>/vectors.db` | SQLite database file path (defaults to `vectors.db` in the data directory) |
| `--plugin-id` | no | `memory-tencentdb` | plugin ID used when writing the config |
| `--tcvdb-url` | yes | — | TCVDB service address |
| `--tcvdb-username` | yes | — | TCVDB username |
| `--tcvdb-api-key` | * | — | TCVDB API key (plain text) |
| `--tcvdb-api-key-env` | * | — | name of the environment variable holding the API key |
| `--tcvdb-database` | yes | — | TCVDB database name |
| `--tcvdb-embedding-model` | yes | — | embedding model name |
| `--tcvdb-alias` | no | `""` | user-defined alias |
| `--tcvdb-timeout-ms` | no | `10000` | request timeout (milliseconds) |
| `--layers` | no | `l0,l1,l2,l3` | layers to migrate (comma-separated) |
| `--dry-run` | no | `false` | preview only, no writes |
| `--yes` | no | `false` | skip interactive confirmation |
| `--apply-config` | no | `true` | update openclaw.json after migrating |
| `--config-backup` | no | `true` | back up the original config file before writing |
| `--rewrite-manifest` | no | `true` | update manifest.json to tcvdb |
| `--fail-if-target-nonempty` | no | `true` | abort when the target database isn't empty |
| `--verify-counts` | no | `true` | verify record counts after migrating |
| `--summary-json-path` | no | — | write the migration summary to this file |
| `--job-id` | no | — | migration job ID (for tracking) |
| `--bm25-enabled` | no | `true` | enable BM25 sparse vectors |
| `--bm25-language` | no | `zh` | BM25 language (`zh` or `en`) |

\* Exactly one of `--tcvdb-api-key` and `--tcvdb-api-key-env` must be given.

## Layout

```
scripts/migrate-sqlite-to-tcvdb/
├── cli-entry.ts          # CLI entry point
├── sqlite-to-tcvdb.ts    # core migration logic (option parsing, preflight, data migration)
├── config-write.ts       # OpenClaw config update (JSON5, self-contained)
├── manifest-write.ts     # manifest rewrite
├── *.test.ts             # tests next to the code
├── tsconfig.json         # build config for the migration script
├── dist/                 # build output (gitignored)
└── README.md             # this file

bin/migrate-sqlite-to-tcvdb.mjs     # very thin bin wrapper → dist/
```

The migration script uses the storage implementations (VectorStore, TcvdbMemoryStore, etc.) through `../../src/`, but **doesn't depend on `openclaw/plugin-sdk`**. Writing the config back uses `json5` directly.
