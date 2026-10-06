/**
 * Thin client for the Memory Hub panel API (/api/v1/*).
 *
 * Every call carries the caller's own user key, so the panel's normal permission
 * checks (team membership, asset ownership, ACL) apply exactly as in the browser.
 */

export interface Envelope<T = unknown> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

export class HubError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "HubError";
  }
}

export interface HubClientOptions {
  baseUrl: string;
  serviceId: string;
  userKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class HubClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HubClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get userKey(): string {
    return this.opts.userKey;
  }

  get serviceId(): string {
    return this.opts.serviceId;
  }

  /** POST /api/v1/{path}; returns `data` on code 0, throws HubError otherwise. */
  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    if (!this.opts.userKey) {
      throw new HubError(401, "Missing memory key: add your sk-mem key as the X-Memory-User-Key header in your MCP config.");
    }
    const url = `${this.opts.baseUrl}/api/v1/${path.replace(/^\/+/, "")}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tdai-service-id": this.opts.serviceId,
          "x-tdai-user-key": this.opts.userKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      throw new HubError(503, `Memory Hub is unreachable (${err instanceof Error ? err.message : String(err)})`);
    }
    let env: Envelope<T>;
    try {
      env = (await res.json()) as Envelope<T>;
    } catch {
      throw new HubError(res.status || 502, `Memory Hub returned a non-JSON response (HTTP ${res.status})`);
    }
    if (env.code !== 0) throw new HubError(env.code, env.message || `HTTP ${res.status}`);
    return env.data;
  }
}
