/**
 * Thin HTTP client for the Outline API used by step definitions.
 *
 * Wraps fetch() with auth, JSON encoding, and uniform error handling so that
 * step definitions can write `await api.post('arrow.tags.create', { name })`
 * and get back a `{ ok, status, data, error? }` shape.
 *
 * Outline's REST API uses POST for everything (incl. read endpoints) and
 * returns `{ ok: false, error: '<reason>' }` on the body for known errors —
 * the client surfaces that error string as `result.reason` so scenarios can
 * assert "rejected with reason 'X'".
 */
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  reason?: string; // Outline's `error` field for known business errors
  message?: string;
}

export class ArrowApiClient {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  async post<T = unknown>(
    endpoint: string,
    body: Record<string, unknown> = {}
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let parsed: { ok?: boolean; data?: T; error?: string; message?: string } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // body wasn't JSON — leave parsed empty
    }

    return {
      ok: parsed.ok === true && res.ok,
      status: res.status,
      data: parsed.data,
      reason: parsed.error,
      message: parsed.message,
    };
  }
}
