/** Runtime settings, all from environment variables. The service holds no secrets. */
export interface McpConfig {
  /** Port the HTTP server listens on (the WAIP mcp-server chart uses 8080). */
  port: number;
  /** Memory Hub panel base URL, e.g. http://agent-memory-hub.apps.svc:8125 */
  hubUrl: string;
  /** Default memory instance ID (x-tdai-service-id) when the client sends none. */
  serviceId: string;
  /** Timeout for each call to Memory Hub. */
  timeoutMs: number;
  /** How long a resolved user → agents mapping is cached. */
  identityCacheMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const port = Number(env.PORT ?? env.MCP_HTTP_PORT ?? 8080);
  return {
    port: Number.isFinite(port) && port > 0 ? port : 8080,
    hubUrl: (env.MEMORY_HUB_URL ?? "http://127.0.0.1:8125").replace(/\/+$/, ""),
    serviceId: env.MEMORY_SERVICE_ID ?? "default",
    timeoutMs: Number(env.MEMORY_HUB_TIMEOUT_MS ?? 15000),
    identityCacheMs: Number(env.MEMORY_IDENTITY_CACHE_MS ?? 60000),
  };
}
