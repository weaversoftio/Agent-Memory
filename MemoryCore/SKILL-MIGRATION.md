---
name: openclaw-memory-tencentdb-migration
description: Helps existing users migrate the OpenClaw memory plugin from the old package @tdai/memory-tdai to the new package @tencentdb-agent-memory/memory-tencentdb. Trigger it when the user mentions "plugin migration", "renamed memory plugin package", "memory-tdai upgrade", "package name change", or hits install errors for the old package.
version: 1.0.0
---

## Purpose

Help existing users who installed `@tdai/memory-tdai` (old package name) move smoothly to `@tencentdb-agent-memory/memory-tencentdb` (new package name), keeping their memory data and fully restoring their config.

## Background

- **Old package**: `@tdai/memory-tdai` (plugin ID: `memory-tdai`)
- **New package**: `@tencentdb-agent-memory/memory-tencentdb` (plugin ID: `memory-tencentdb`)
- Old and new plugins share the same data directory (`~/.openclaw/memory-tdai/`). Uninstalling the old plugin **does not delete the data directory**, so existing memory data is unaffected
- Uninstalling the old plugin **does delete** its config section in `openclaw.json`, so back it up first

## When to use

- the user has `@tdai/memory-tdai` installed and needs to move to the new package name
- `openclaw plugins install @tdai/memory-tdai` fails with 404 / not found
- the user was told the old package is deprecated and needs migrating

## When not to use

- the user never installed the memory plugin (use the `openclaw-memory-tencentdb-setup` skill)
- the user uses a different memory plugin (e.g. `openclaw-mem0`)

## Standard workflow

### 1) Check the current state

Check whether the old plugin is installed:

```bash
openclaw plugins list | grep -i memory
```

You should see `memory-tdai` or `@tdai/memory-tdai` in the loaded state.

If the old plugin isn't there, skip the migration and do a fresh install with the `openclaw-memory-tencentdb-setup` skill.

### 2) Back up the existing config (key step)

Uninstalling the old plugin deletes its section in `openclaw.json`. **Back it up first**.

Extract the old plugin's config with:

```bash
cat ~/.openclaw/openclaw.json | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
plugins = cfg.get('plugins', {}).get('entries', {})
old_cfg = plugins.get('memory-tdai', {})
if old_cfg:
    print(json.dumps(old_cfg, indent=2, ensure_ascii=False))
    with open('/tmp/memory-tdai-config-backup.json', 'w') as f:
        json.dump(old_cfg, f, indent=2, ensure_ascii=False)
    print('\n✅ Config backed up to /tmp/memory-tdai-config-backup.json')
else:
    print('⚠️ No memory-tdai config section found (probably using the defaults)')
"
```

**Pay particular attention to whether these exist (record them if so)**:

- the `embedding` config (`provider`, `baseUrl`, `apiKey`, `model`, `dimensions`, `proxyUrl`)
- `extraction.model` (the model used for extraction)
- `persona.model` (the model used for the persona)
- `capture.excludeAgents` (excluded agents)
- `capture.l0l1RetentionDays` (data retention in days)

### 3) Check the data directory exists

```bash
ls -la ~/.openclaw/memory-tdai/
```

You should see `conversations/`, `records/`, `scene_blocks/`, `vectors.db`, `persona.md`, etc.

Record the current amount of data to verify against after the migration:

```bash
echo "=== Data before migration ==="
wc -l ~/.openclaw/memory-tdai/conversations/*.jsonl 2>/dev/null || echo "no conversation data"
wc -l ~/.openclaw/memory-tdai/records/*.jsonl 2>/dev/null || echo "no record data"
ls ~/.openclaw/memory-tdai/scene_blocks/*.md 2>/dev/null | wc -l | xargs -I{} echo "scene blocks: {}"
wc -c ~/.openclaw/memory-tdai/persona.md 2>/dev/null || echo "no persona"
```

### 4) Uninstall the old plugin

```bash
openclaw plugins uninstall memory-tdai
```

Afterwards confirm:

- the `memory-tdai` section in `openclaw.json` is gone (expected)
- the `~/.openclaw/memory-tdai/` data directory **still exists** (it isn't deleted)

```bash
# check the data directory is still there
ls ~/.openclaw/memory-tdai/ && echo "✅ data directory intact" || echo "❌ data directory missing!"
```

### 5) Install the new plugin

```bash
openclaw plugins install @tencentdb-agent-memory/memory-tencentdb
```

### 6) Restore the config

Write the config backed up in step 2 back into `openclaw.json`; note that the new plugin's config key is `memory-tencentdb`:

```bash
python3 -c "
import json, os

# read the backed-up config
backup_path = '/tmp/memory-tdai-config-backup.json'
if os.path.exists(backup_path):
    with open(backup_path) as f:
        old_cfg = json.load(f)
    print('📋 Backed-up config:')
    print(json.dumps(old_cfg, indent=2, ensure_ascii=False))
else:
    old_cfg = {'enabled': True}
    print('⚠️ No backup found, using the minimal config')

# read the current openclaw.json
config_path = os.path.expanduser('~/.openclaw/openclaw.json')
with open(config_path) as f:
    cfg = json.load(f)

# write the new plugin's config
cfg.setdefault('plugins', {}).setdefault('entries', {})['memory-tencentdb'] = old_cfg

with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)

print('\n✅ Config written to memory-tencentdb')
"
```

If the backup is lost or the user needs to restore by hand, at least write the minimal config:

```json
{
  "memory-tencentdb": {
    "enabled": true
  }
}
```

### 7) Restart the Gateway and verify

```bash
openclaw gateway restart
```

Check:

- the Gateway log shows the `[memory-tdai]` prefix (note: the log tag is still memory-tdai; that's normal)
- the data directory contents are unchanged

```bash
echo "=== Verification after migration ==="
# the new plugin is loaded
openclaw plugins list | grep -i memory

# the amount of data matches the pre-migration numbers
wc -l ~/.openclaw/memory-tdai/conversations/*.jsonl 2>/dev/null
wc -l ~/.openclaw/memory-tdai/records/*.jsonl 2>/dev/null
```

### 8) Smoke test

Run one conversation to confirm the memory pipeline works:

1. send a message with personal information (preferences, habits)
2. check the logs for `[before_prompt_build]` and `[agent_end]` output
3. if embedding is configured, check vector search works (no embedding errors in the log)

## Rollback

If something goes wrong after migrating, roll back quickly:

```bash
# 1. uninstall the new plugin
openclaw plugins uninstall memory-tencentdb

# 2. reinstall the old plugin (if the npm source is still available)
openclaw plugins install @tdai/memory-tdai

# 3. restore the config by hand (from the backup)
# write the contents of /tmp/memory-tdai-config-backup.json back into the memory-tdai section of openclaw.json

# 4. restart
openclaw gateway restart
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|------|----------|----------|
| no logs from the new plugin | `enabled` isn't `true` in the config | check `memory-tencentdb.enabled` in `openclaw.json` |
| installing the new plugin fails | npm source unavailable | check the network / npm registry config |
| no past memory after migrating | config only partly restored | compare `/tmp/memory-tdai-config-backup.json` with the current config |
| embedding errors | `apiKey` or other settings lost | restore the `embedding` section from the backup |
| data directory empty | unexpected deletion during uninstall (very rare) | check whether `~/.openclaw/memory-tdai/` exists |

## Security and compliance

- the backup file `/tmp/memory-tdai-config-backup.json` may contain an `apiKey`; delete it after migrating: `rm /tmp/memory-tdai-config-backup.json`
- never show an `apiKey` in plain text in chat or logs
- only change the `memory-tencentdb` section; leave the user's other plugins alone

## Definition of Done

The migration is done when all of these hold:

- [x] the old plugin `@tdai/memory-tdai` is uninstalled
- [x] the new plugin `@tencentdb-agent-memory/memory-tencentdb` is installed and loaded
- [x] `openclaw.json` has a complete `memory-tencentdb` config (including the user's custom embedding settings, etc.)
- [x] the Gateway has been restarted
- [x] the log shows the `[memory-tdai]` prefix
- [x] the data directory is intact and the amount of data matches the pre-migration numbers
- [x] at least 1 conversation confirmed the memory pipeline works
- [x] the sensitive backup file has been cleaned up

## Hand-off message template

> The memory plugin migration is done:
> - old plugin `@tdai/memory-tdai` → new plugin `@tencentdb-agent-memory/memory-tencentdb`
> - existing memory data is fully kept (conversations/records/scene blocks/vector store unaffected)
> - the config was fully restored from the old plugin (including custom embedding / extraction / persona settings)
> - the Gateway has been restarted and the memory pipeline verified
