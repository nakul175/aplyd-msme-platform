// Environment bindings the platform module reads. All optional: a missing value makes the feature refuse, never guess.
export type AppEnv = {
  DB?: D1Database;
  /** local | synthetic | test. Synthetic sign-in refuses to run for any other value. */
  APLYD_ENV?: string;
  /** HMAC key for session tokens. Without it sign-in is refused. */
  SESSION_SECRET?: string;
};

const SYNTHETIC_ENVIRONMENTS = ["local", "synthetic", "test"];

export function isSyntheticEnvironment(env: AppEnv): boolean {
  return typeof env.APLYD_ENV === "string" && SYNTHETIC_ENVIRONMENTS.includes(env.APLYD_ENV);
}
