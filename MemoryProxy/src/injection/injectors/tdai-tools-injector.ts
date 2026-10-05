/**
 * TdaiMemoryToolsInjector — inject a static `<tdai_memory_tools>` text block
 * that teaches the LLM to curl `<proxy>/memory-bridge/v3/*` for TDAI memory
 * read operations.
 *
 * 设计与 skill-tools-injector 完全同形（参见 docs/design/2026-06-17-team-skill-proxy-runtime.md §4）：
 *
 *   Why static (NOT native tool defs):
 *     agent host (IDE / Claude Code) 不识别 native tool；改让 LLM 用现有 Bash
 *     工具去 curl 一个 proxy 路径，proxy 端反向代理到 tdai gateway，期间注入
 *     IdFields + Bearer，rules out LLM 伪造身份 + 防止 token 进入 prompt。
 *
 *   Tools 集合（**只读**，静态注入 system prompt，cache 友好）：
 *     - tdai_memory_search       L1 双路 hybrid search（atomic/search）
 *     - tdai_atomic_query        L1 按 type / 时间 / 分页（atomic/query）
 *     - tdai_conversation_search L0 对话 hybrid search（conversation/search）
 *     - tdai_conversation_query  L0 按 session 取历史（conversation/query）
 *     - tdai_scenario_ls         L2 列出 scene_blocks 路径索引
 *     - tdai_read_scene          L2 按 path 读全文
 *
 *   设计取舍：
 *     - L0/L1 **不再每轮自动召回**注入到 user prompt（会破坏 KV/prompt cache），
 *       改为静态工具按需检索；system prompt 稳定 → 命中 prompt cache。
 *     - L3（persona）由 tdai-profile-memory-injector **直接注入** system，无需工具。
 *     - L2 索引也直接注入 system（`<l2_scene_index>`），正文按需用 read_scene。
 *
 *   写操作 (atomic/update / conversation/delete / scenario/write / scenario/rm / core/write)
 *   不在 bridge allowlist 里；写入由主链路注入器控制。
 *
 *   注入点：`system.suffix`（不像 skill 是 `tools.append`，因为我们不再用
 *   native tool）。在 system prompt 末尾贴一段说明，告诉 LLM 这些 endpoint
 *   存在以及调用方法。
 */

import type {
  AgentContext,
  AnchorTarget,
  CacheStrategy,
  ContextBlock,
  HookPriority,
  InjectionHook,
  PrewarmInput,
} from "../types.js";
import { HOOK_PRIORITY } from "../types.js";
import { getTdaiIdentity } from "../../tdai/identity.js";

export interface TdaiMemoryToolsInjectorConfig {
  /**
   * Base URL the LLM should curl. Filled into every curl recipe.
   * E.g. `http://127.0.0.1:8096`. Trailing slash trimmed.
   */
  proxyBaseUrl: string;
}

/** 渲染整段 `<tdai_memory_tools>` 文本，纯函数便于测试。 */
export function renderTdaiMemoryToolsBlock(
  proxyBaseUrl: string,
  sessionId?: string,
  spaceId?: string,
): string {
  const base = proxyBaseUrl.replace(/\/$/, "");
  const bridge = `${base}/memory-bridge/v3`;
  // gateway 需要 `x-tdai-service-id: <spaceId>` 才放行；`x-conversation-id`
  // 让 proxy 复用 session 里的身份 (user_id / team_id / agent_id)。
  const sessionHeader = sessionId ? ` -H 'x-conversation-id: ${sessionId}'` : "";
  const tenantHeader = spaceId ? ` -H 'x-tdai-service-id: ${spaceId}'` : "";
  const authHeader = `${tenantHeader}${sessionHeader}`;

  const lines: string[] = [
    "<tdai_memory_tools>",
    "**These are memory capabilities you can call yourself** (not documentation); use them through Bash + curl.",
    "These TDAI memory capabilities have the same priority as Claude Code's native Memory/MEMORY.md; when memory is involved, don't only check the local MEMORY.md.",
    "When the user asks about identity / history / preferences / past conclusions / project conventions, first query with the TDAI memory tools below, then answer based on the results.",
    "Never say \"I don't have that tool / it needs MCP / I can only check local memory\" — you have the TDAI memory tools; use the curl commands below.",
    "",
    "How to call: run curl in Bash against the proxy's memory-bridge paths. The proxy injects identity and auth automatically (team_id/user_id/agent_id); the body only needs the business fields. If the current Agent has several chat_memory bindings, the search endpoints search self + imported memories together by default and return source_agent_id/source_agent_name/source_agent_role in the results.",
    "",
    "Coverage:",
    "- L3 (long-term persona) and the L2 scenario index (`<l2_scene_index>`) are already injected into the system prompt; no lookup needed;",
    "- read the L2 full text with tdai_read_scene when needed;",
    "- L0/L1 (raw conversation / atomic memories) are **no longer recalled automatically every turn** (that would break the KV cache); search them with the tools when needed.",
    "",
    "  <tool name=\"tdai_memory_search\">",
    `    curl: ${bridge}/atomic/search`,
    `    body: {"query": "<text>", "limit": 5}`,
    "    use:  search L1 atomic memories (hybrid: dense vector + BM25), sorted by relevance. By default searches the current Agent's self + imported memories; source_agent_* in each item shows where it came from. Good for recalling user preferences, past conclusions, rules, etc.",
    "    returns: {code, data: {items: [...], searched_agents: [...]}} — hits are in data.items[].",
    "  </tool>",
    "",
    "  <tool name=\"tdai_atomic_query\">",
    `    curl: ${bridge}/atomic/query`,
    `    body: {"type": "?episodic|persona|instruction", "limit": 20, "offset": 0, "time_start": "?ISO", "time_end": "?ISO"}`,
    "    use:  fetch L1 memories by type / time window / page (no semantic search).",
    "  </tool>",
    "",
    "  <tool name=\"tdai_conversation_search\">",
    `    curl: ${bridge}/conversation/search`,
    `    body: {"query": "<text>", "limit": 5, "session_id": "?<sid>"}`,
    "    use:  search the L0 raw conversation (finer-grained than atomic_search: exact message text / quotes / timeline). By default searches the current Agent's self + imported memories; source_agent_* in each item shows where it came from.",
    "    returns: {code, data: {messages: [...], searched_agents: [...]}} — hits are in data.messages[] (note: different from atomic_search's data.items).",
    "  </tool>",
    "",
    "  <tool name=\"tdai_conversation_query\">",
    `    curl: ${bridge}/conversation/query`,
    `    body: {"session_id": "<sid>", "limit": 50, "offset": 0}`,
    "    use:  fetch L0 history messages in session order.",
    "  </tool>",
    "",
    "  <tool name=\"tdai_scenario_ls\">",
    `    curl: ${bridge}/scenario/ls`,
    `    body: {"path_prefix": "?optional prefix"}`,
    "    use:  list the L2 scene_blocks path index (with summaries, without full text). The index is usually injected into the system prompt already; use this only to refresh or filter by prefix.",
    "  </tool>",
    "",
    "  <tool name=\"tdai_read_scene\">",
    `    curl: ${bridge}/scenario/read`,
    `    body: {"path": "<scene path>", "agent_id": "?from <agent agent_id=...>; pass it when reading imported memories"}`,
    "    use:  read the full text of an L2 scenario file by path. Get the path from `<l2_scene_index>` or tdai_scenario_ls first — never make one up; for paths in an imported_from section, pass that section's agent_id.",
    "  </tool>",
    "",
    "## Call limits",
    "- These tools are read-only; changing L1/L2/L3 must go through the main pipeline (agent_id is assigned automatically).",
    "- Per turn, atomic_search + conversation_search **together ≤ 3 calls**;",
    "  query / ls / read_scene don't count toward the limit, but don't read the same path twice.",
    "- Retries: HTTP 5xx may be retried once; never retry HTTP 4xx.",
    "- Every curl must send: " +
      (spaceId ? `x-tdai-service-id: ${spaceId}, ` : "x-tdai-service-id (the current memory instance, see the example), ") +
      (sessionId ? `x-conversation-id: ${sessionId}` : "x-conversation-id (from the current session)") +
      "; Content-Type: application/json.",
    "",
    "## Full example",
    "```bash",
    `curl -sfk -X POST ${bridge}/atomic/search \\`,
    `  -H 'Content-Type: application/json'${authHeader} \\`,
    `  -d '{"query": "preferred programming language of the user", "limit": 5}'`,
    "```",
    "</tdai_memory_tools>",
  ];

  return lines.join("\n");
}

export class TdaiMemoryToolsInjector implements InjectionHook {
  id = "tdai-memory-tools-injector";
  point = "system.suffix" as const;
  anchor: AnchorTarget = { slot: "memory", relation: "before" };
  priority: HookPriority = HOOK_PRIORITY.MEMORY + 5;
  description = "Inject <tdai_memory_tools> curl recipes block into system prompt";
  /** Static tool instructions are session-stable; render once at session_init. */
  cacheStrategy: CacheStrategy = "session_init";

  constructor(private cfg: TdaiMemoryToolsInjectorConfig) {}

  execute(ctx: AgentContext): ContextBlock[] {
    const caps = ctx.metadata.custom?.assetCapabilities as { chat_memory?: boolean } | undefined;
    if (caps?.chat_memory === false) return [];
    // 没识别身份 → 不注入（即便 LLM 调 curl，bridge 也会 401）
    const identity = getTdaiIdentity(ctx.metadata.custom);
    if (!identity) return [];
    const session = (ctx.metadata.custom as Record<string, unknown> | undefined)?.session as
      | Record<string, unknown>
      | undefined;
    const spaceId = typeof session?.space_id === "string" ? session.space_id : undefined;
    return this.renderBlocks(identity.sessionId, spaceId);
  }

  prewarm(input: PrewarmInput): ContextBlock[] {
    if (input.assetCapabilities?.chat_memory === false) return [];
    return this.renderBlocks(input.sessionInfo.session_id, input.sessionInfo.space_id);
  }

  private renderBlocks(sessionId: string, spaceId?: string): ContextBlock[] {
    return [{
      type: "text",
      content: renderTdaiMemoryToolsBlock(this.cfg.proxyBaseUrl, sessionId, spaceId),
      metadata: {
        source: this.id,
        sessionId,
        cacheKey: "tdai-memory-tools-injector:tools",
      },
    }];
  }
}

/** @deprecated 旧 API 兼容名 */
export const TdaiToolsInjector = TdaiMemoryToolsInjector;
