// The Worker entry. Every request goes to the application through vinext's fetch handler.
import handler from "vinext/server/fetch-handler";

export default {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) => handler.fetch(request, env, ctx),
};
