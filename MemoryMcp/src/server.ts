/**
 * Stateless streamable-HTTP MCP server.
 *
 * Each POST /mcp builds a fresh McpServer bound to the caller's memory key, so no
 * state is shared between users or requests. The key arrives in a header:
 *   X-Memory-User-Key: sk-mem-...      (works behind the WAIP mcp-proxy, which strips Authorization)
 *   Authorization: Bearer sk-mem-...   (fallback for direct local connections)
 * Optional headers: X-Memory-Agent-Id / X-Memory-Team-Id (default agent),
 * X-Memory-Service-Id (memory instance, defaults to MEMORY_SERVICE_ID).
 */
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpConfig } from "./config.js";
import { HubClient } from "./hub.js";
import { registerChatMemoryTools } from "./tools.js";
import { handleHook, type HookClient } from "./hooks.js";

export const SERVER_NAME = "agent-memory";
export const SERVER_VERSION = "0.1.1";

const INSTRUCTIONS =
  "Agent Memory: the team's shared long-term memory for this agent. Search it (memory_search) before answering questions about past decisions, conventions or project facts. When the user states a durable fact, decision or preference, save it with memory_add as one standalone sentence. Never save secrets or credentials.";

function header(req: http.IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

export function userKeyFrom(req: http.IncomingMessage): string | undefined {
  const explicit = header(req, "x-memory-user-key");
  if (explicit) return explicit;
  const auth = header(req, "authorization");
  const m = auth?.match(/^Bearer\s+(sk-mem-\S+)$/i);
  return m?.[1];
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 4 * 1024 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

export function createHttpServer(config: McpConfig, fetchImpl?: typeof fetch): http.Server {
  return http.createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";

    if (req.method === "GET" && (path === "/healthz" || path === "/health")) {
      return sendJson(res, 200, { status: "ok", name: SERVER_NAME, version: SERVER_VERSION });
    }

    if (path === "/hooks/claude-code" || path === "/hooks/cursor") {
      if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
      const client: HookClient = path === "/hooks/cursor" ? "cursor" : "claude-code";
      // Hooks always answer 200 with a body the client accepts, so a memory problem never
      // blocks the user; problems are logged here (and surfaced once as a Claude Code warning).
      const safe = client === "cursor" ? { continue: true } : {};
      const userKey = userKeyFrom(req);
      if (!userKey) {
        return sendJson(res, 200, client === "claude-code" ? { systemMessage: "Agent Memory: no memory key configured, so this conversation isn't being saved." } : safe);
      }
      let input: unknown;
      try {
        input = await readBody(req);
      } catch {
        return sendJson(res, 200, safe);
      }
      const hub = new HubClient({
        baseUrl: config.hubUrl,
        serviceId: header(req, "x-memory-service-id") ?? config.serviceId,
        userKey,
        timeoutMs: config.timeoutMs,
        fetchImpl,
      });
      const out = await handleHook(client, input, {
        hub,
        identityCacheMs: config.identityCacheMs,
        defaultTarget: { agentId: header(req, "x-memory-agent-id"), teamId: header(req, "x-memory-team-id") },
        log: (m) => console.warn(m),
      });
      return sendJson(res, 200, out);
    }

    if (path !== "/mcp" && path !== "/") return sendJson(res, 404, { error: "not found" });

    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream and no sessions to delete.
      res.writeHead(405, { allow: "POST", "content-type": "application/json" });
      return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
    }

    // Without a key the server still answers the handshake and tools/list (the WAIP MCP store
    // lists tools that way, with no user identity); every tool call then fails with a clear
    // "missing memory key" error, because the hub client refuses to call the panel.
    const userKey = userKeyFrom(req) ?? "";

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: `Invalid request body: ${err instanceof Error ? err.message : String(err)}` },
        id: null,
      });
    }

    const hub = new HubClient({
      baseUrl: config.hubUrl,
      serviceId: header(req, "x-memory-service-id") ?? config.serviceId,
      userKey,
      timeoutMs: config.timeoutMs,
      fetchImpl,
    });
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
    registerChatMemoryTools(server, {
      hub,
      identityCacheMs: config.identityCacheMs,
      defaultTarget: { agentId: header(req, "x-memory-agent-id"), teamId: header(req, "x-memory-team-id") },
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: `Internal error: ${err instanceof Error ? err.message : String(err)}` },
          id: null,
        });
      }
    }
  });
}
