// A person's session with the application, over HTTP, for the seeder. It sends what a browser sends: the session cookie the sign-in sets and
// an Origin equal to the application's own. It uses no database and no function of the application, only its requests, so what the
// seeder produces is what a person using the pages would have produced, with the same checks and the same audit entries.
export type Reply = { status: number; body: unknown };

export class RequestFailed extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: unknown;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} answered ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

export class Session {
  private readonly base: string;
  private readonly cookie: string;
  readonly email: string;

  private constructor(base: string, cookie: string, email: string) {
    this.base = base;
    this.cookie = cookie;
    this.email = email;
  }

  /** Signs in as one of the synthetic users, as the sign-in page does. Fails where synthetic sign-in is not available. */
  static async signIn(base: string, email: string): Promise<Session> {
    const res = await fetch(`${base}/api/session`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email }), redirect: "manual" });
    const set = res.headers.get("set-cookie") ?? "";
    const cookie = set.split(";")[0];
    if (res.status !== 200 || !cookie.startsWith("aplyd_session=")) throw new RequestFailed("POST", "/api/session", res.status, await res.text().catch(() => ""));
    return new Session(base, cookie, email);
  }

  private async send(method: "GET" | "POST", path: string, body?: unknown): Promise<Reply> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { cookie: this.cookie, origin: this.base, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text === "" ? null : JSON.parse(text);
    } catch {
      /* not JSON: kept as text */
    }
    return { status: res.status, body: parsed };
  }

  /** GET, expecting 200. */
  async get<T = Record<string, any>>(path: string): Promise<T> {
    const r = await this.send("GET", path);
    if (r.status !== 200) throw new RequestFailed("GET", path, r.status, r.body);
    return r.body as T;
  }

  /** POST JSON, expecting 200 or 201. */
  async post<T = Record<string, any>>(path: string, body: unknown = {}): Promise<T> {
    const r = await this.send("POST", path, body);
    if (r.status !== 200 && r.status !== 201) throw new RequestFailed("POST", path, r.status, r.body);
    return r.body as T;
  }
}
