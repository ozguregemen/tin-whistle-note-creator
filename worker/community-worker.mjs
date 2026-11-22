import { DurableObject } from "cloudflare:workers";
import { COMMUNITY_PATH } from "../shared/community-song.mjs";
import { communityOriginAllowed, handleCommunity, initializeCommunityStorage } from "./community-api.mjs";

export class CommunityDirectory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    initializeCommunityStorage(ctx.storage);
  }

  fetch(request) {
    return handleCommunity(request, this.ctx.storage, { moderatorToken: this.env.MODERATOR_TOKEN });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${COMMUNITY_PATH}/`)) return new Response(null, { status: 404 });

    const origin = request.headers.get("Origin");
    if (!communityOriginAllowed(origin, env)) return new Response(null, { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": origin ?? "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") {
      const suffix = url.pathname.slice(COMMUNITY_PATH.length + 1);
      const action = suffix === "register" || suffix === "login" ? suffix : "write";
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const result = await env.AUTH_LIMIT.limit({ key: `${action}:${ip}` });
      if (!result.success) return Response.json({ error: "try_later" }, { status: 429, headers });
    }

    const response = await env.COMMUNITY.getByName("catalog").fetch(request);
    const resultHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) resultHeaders.set(key, value);
    return new Response(response.body, { status: response.status, headers: resultHeaders });
  },
};
