import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer } from "./server.js";
import { clearIdentityCache } from "./identity.js";
import { chunk, redactSecrets } from "./hooks.js";

const KEY = "sk-mem-test-key";

function fakeHub(opts: { failImport?: boolean } = {}) {
  const imports: Array<Record<string, unknown>> = [];
  const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, message: "ok", data }), { status: 200 });
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace("/api/v1/", "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    switch (path) {
      case "auth/waip/exchange":
        return new Headers(init?.headers).get("x-waip-identity") === "signed-for-dana"
          ? ok({ user_key: KEY, user: { user_id: "usr-1", username: "dana" } })
          : new Response(JSON.stringify({ code: 401, message: "WeaverAI identity rejected: signature verification failed", data: null }), { status: 401 });
      case "meta/auth/verify":
        return ok({ valid: true, user: { user_id: "usr-1", username: "dana" } });
      case "meta/team/list":
        return ok({ items: [{ team_id: "team-a", name: "Core" }] });
      case "meta/agent/list":
        return ok({ items: [{ agent_id: "agt-1", name: "builder", status: "active" }] });
      case "chat-memory/import":
        if (opts.failImport) return new Response(JSON.stringify({ code: 500, message: "boom", data: null }), { status: 500 });
        imports.push(body);
        return ok({ imported: true, accepted_count: (body.messages as unknown[]).length, session_id: body.session_id });
      case "chat-memory/layer":
        return ok(
          body.layer === "L3"
            ? { items: [{ id: "core", title: "core memory", body: "The team ships on Thursdays." }] }
            : { items: [{ id: "scene_blocks/release.md", title: "scene_blocks/release.md", body: "Release process and staging setup" }] },
        );
      default:
        return new Response(JSON.stringify({ code: 404, message: "NOT_FOUND", data: null }), { status: 404 });
    }
  };
  return { imports, fetchImpl };
}

let server: http.Server;
let base: string;

async function start(fetchImpl: typeof fetch) {
  server = createHttpServer({ port: 0, hubUrl: "http://hub.test", serviceId: "default", timeoutMs: 5000, identityCacheMs: 60000 }, fetchImpl);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function hook(client: string, body: unknown, key: string | null = KEY, extra: Record<string, string> = {}) {
  const res = await fetch(`${base}/hooks/${client}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-memory-user-key": key } : {}), ...extra },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => clearIdentityCache());
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("Claude Code hooks", () => {
  it("adds the profile and scene index at session start", async () => {
    await start(fakeHub().fetchImpl);
    const { body } = await hook("claude-code", { hook_event_name: "SessionStart", session_id: "s1", source: "startup" });
    const ctx = body.hookSpecificOutput.additionalContext as string;
    expect(body.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(ctx).toContain("ships on Thursdays");
    expect(ctx).toContain("scene_blocks/release.md");
  });

  it("saves the prompt and the final reply to L0 under one session", async () => {
    const hub = fakeHub();
    await start(hub.fetchImpl);
    await hook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "When do we deploy?" });
    await hook("claude-code", { hook_event_name: "Stop", session_id: "s1", last_assistant_message: "On Thursdays." });
    expect(hub.imports).toEqual([
      { team_id: "team-a", agent_id: "agt-1", session_id: "claude-code-s1", messages: [{ role: "user", content: "When do we deploy?" }] },
      { team_id: "team-a", agent_id: "agt-1", session_id: "claude-code-s1", messages: [{ role: "assistant", content: "On Thursdays." }] },
    ]);
  });

  it("warns instead of failing when no key is configured", async () => {
    await start(fakeHub().fetchImpl);
    const { status, body } = await hook("claude-code", { hook_event_name: "Stop", session_id: "s1", last_assistant_message: "x" }, null);
    expect(status).toBe(200);
    expect(body.systemMessage).toContain("no memory key");
  });

  it("saves turns for the WeaverAI user the MCP proxy vouches for", async () => {
    const hub = fakeHub();
    await start(hub.fetchImpl);
    const { status } = await hook("claude-code", { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "Hi" }, null, {
      "x-waip-identity": "signed-for-dana",
    });
    expect(status).toBe(200);
    expect(hub.imports).toHaveLength(1);
  });

  it("says why when the WeaverAI identity is refused", async () => {
    const hub = fakeHub();
    await start(hub.fetchImpl);
    const { body } = await hook("claude-code", { hook_event_name: "Stop", session_id: "s1", last_assistant_message: "x" }, null, {
      "x-waip-identity": "forged",
    });
    expect(body.systemMessage).toContain("identity rejected");
    expect(hub.imports).toHaveLength(0);
  });
});

describe("Cursor hooks", () => {
  it("always lets the prompt through, even when saving fails", async () => {
    await start(fakeHub({ failImport: true }).fetchImpl);
    const { status, body } = await hook("cursor", { hook_event_name: "beforeSubmitPrompt", conversation_id: "c1", prompt: "hi" });
    expect(status).toBe(200);
    expect(body).toEqual({ continue: true });
  });

  it("saves prompt and response, and adds context at session start", async () => {
    const hub = fakeHub();
    await start(hub.fetchImpl);
    const start1 = await hook("cursor", { hook_event_name: "sessionStart", session_id: "x", conversation_id: "c1" });
    expect(start1.body.additional_context).toContain("ships on Thursdays");
    await hook("cursor", { hook_event_name: "beforeSubmitPrompt", conversation_id: "c1", prompt: "Plan the release" });
    await hook("cursor", { hook_event_name: "afterAgentResponse", conversation_id: "c1", text: "Here is the plan." });
    expect(hub.imports.map((i) => [i.session_id, (i.messages as any[])[0].role])).toEqual([
      ["cursor-c1", "user"],
      ["cursor-c1", "assistant"],
    ]);
  });
});

describe("helpers", () => {
  it("redacts credentials", () => {
    const out = redactSecrets("key sk-mem-AbCdEfGh1234 and AKIAABCDEFGHIJKLMNOP done");
    expect(out).toBe("key [REDACTED] and [REDACTED] done");
  });

  it("splits long text into L0-sized messages", () => {
    expect(chunk("a".repeat(17000)).map((c) => c.length)).toEqual([8000, 8000, 1000]);
  });
});
