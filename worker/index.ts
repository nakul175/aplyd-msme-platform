// The Worker entry. Every request goes to the application through vinext's fetch handler.
import handler from "vinext/server/fetch-handler";
import { withSecurityHeaders } from "../modules/platform/src/api/security-headers.ts";

export default {
  fetch: async (request: Request, env: unknown, ctx: ExecutionContext) => withSecurityHeaders(await handler.fetch(request, env, ctx)),
};
