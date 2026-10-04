declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    APLYD_ENV?: string;
    SESSION_SECRET?: string;
  }
}
