import { parseUsagePayload } from "../src/telemetry/events";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400",
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "cache-control": "no-store" } });
}

function weekBucket(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${String(date.getUTCFullYear())}-W${String(week).padStart(2, "0")}`;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return response({ ok: false, error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return response({ ok: false, error: "Payload too large" }, 413);

  let payload: ReturnType<typeof parseUsagePayload>;
  try { payload = parseUsagePayload(await request.json()); }
  catch { payload = null; }
  if (!payload) return response({ ok: false, error: "Invalid count payload" }, 400);

  const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return response({ ok: false, error: "Counter storage is not configured" }, 503);

  const key = `linkscope:usage:${weekBucket()}`;
  const commands = Object.entries(payload.counts).map(([event, count]) => ["HINCRBY", key, event, count]);
  try {
    const stored = await fetch(`${redisUrl.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${redisToken}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!stored.ok) return response({ ok: false, error: "Counter storage unavailable" }, 502);
    return response({ ok: true });
  } catch {
    return response({ ok: false, error: "Counter storage unavailable" }, 502);
  }
}
