// Environment bindings the platform module reads. All optional: a missing value makes the feature refuse, never guess.
export type AppEnv = {
  DB?: D1Database;
  /** local | synthetic | test. Synthetic sign-in refuses to run for any other value. */
  APLYD_ENV?: string;
  /** HMAC key for session tokens. Without it sign-in is refused. */
  SESSION_SECRET?: string;
};

const SYNTHETIC_ENVIRONMENTS = ["local", "synthetic", "test"];

/** The shortest session secret accepted, in UTF-8 bytes. */
export const MIN_SECRET_BYTES = 32;

/**
 * The session secret, or null when it is missing, too short or a single repeated character. Every place that signs or
 * verifies a session goes through this, so a placeholder or a one-word secret cannot reach production by accident.
 */
export function getSessionSecret(env: AppEnv): string | null {
  const secret = env.SESSION_SECRET;
  if (typeof secret !== "string") return null;
  if (new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) return null;
  if (new Set(secret).size < 2) return null;
  return secret;
}

export function isSyntheticEnvironment(env: AppEnv): boolean {
  return typeof env.APLYD_ENV === "string" && SYNTHETIC_ENVIRONMENTS.includes(env.APLYD_ENV);
}
