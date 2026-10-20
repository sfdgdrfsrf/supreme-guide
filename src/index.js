const ROBLOX_SEARCH = "https://apis.roblox.com/toolbox-service/v2/assets:search";

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30, s-maxage=30",
    "Vary": "Origin",
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin),
  });
}

function firstArray(payload) {
  // The service response has changed shape over time; accept common wrappers,
  // but don't fabricate results when no array exists.
  for (const key of ["data", "assets", "results", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload)) return payload;
  return null;
}

function normalizeAsset(item) {
  const id = item?.id ?? item?.assetId ?? item?.asset?.id;
  if (id === undefined || id === null) return null;
  const creator = item?.creator ?? item?.creatorInfo ?? {};
  const thumbnail = item?.thumbnail ?? item?.thumbnailUrl ?? item?.imageUrl ?? null;
  return {
    id: String(id),
    name: item?.name ?? item?.title ?? item?.asset?.name ?? "Untitled model",
    description: item?.description ?? item?.asset?.description ?? "",
    thumbnailUrl: typeof thumbnail === "string"
      ? thumbnail
      : (thumbnail?.url ?? thumbnail?.imageUrl ?? null),
    creatorName: creator?.name ?? item?.creatorName ?? "",
    creatorId: creator?.id ?? item?.creatorId ?? null,
    assetType: item?.assetType ?? item?.assetTypeName ?? "Model",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "f3x-creator-store-api" }, 200, origin);
    }

    if (url.pathname !== "/api/search") {
      return json({ error: "Not found", endpoints: ["/health", "/api/search?q=..."] }, 404, origin);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed. Use GET." }, 405, origin);
    }

    const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
    if (query.length < 2) {
      return json({ error: "Query 'q' must contain at least 2 characters." }, 400, origin);
    }

    const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25));
    const pageNumber = Math.max(0, Math.min(1000, Number.parseInt(url.searchParams.get("pageNumber") || "0", 10) || 0));
    const verified = url.searchParams.get("includeOnlyVerifiedCreators") || "false";

    const upstream = new URL(ROBLOX_SEARCH);
    upstream.searchParams.set("searchCategoryType", "Model");
    upstream.searchParams.set("query", query);
    upstream.searchParams.set("maxPageSize", String(limit));
    upstream.searchParams.set("pageNumber", String(pageNumber));
    upstream.searchParams.set("searchView", "Full");
    upstream.searchParams.set("includeOnlyVerifiedCreators", verified === "true" ? "true" : "false");

    try {
      const response = await fetch(upstream.toString(), {
        method: "GET",
        headers: { "Accept": "application/json" },
        cf: { cacheTtl: 30, cacheEverything: true },
      });

      const bodyText = await response.text();
      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        return json({
          error: "Roblox returned a non-JSON response.",
          upstreamStatus: response.status,
          details: bodyText.slice(0, 400),
        }, 502, origin);
      }

      if (!response.ok) {
        return json({
          error: "Roblox Creator Store search failed.",
          upstreamStatus: response.status,
          details: payload,
        }, 502, origin);
      }

      const raw = firstArray(payload);
      if (!raw) {
        return json({
          error: "Roblox response format was not recognized; no results were fabricated.",
          upstreamKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
          upstream: payload,
        }, 502, origin);
      }

      const assets = raw.map(normalizeAsset).filter(Boolean);
      return json({
        ok: true,
        query,
        count: assets.length,
        nextPageToken: payload?.nextPageToken ?? payload?.nextPageCursor ?? null,
        assets,
        // Include the raw payload during early testing so schema changes are diagnosable.
        upstreamKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      }, 200, origin);
    } catch (error) {
      return json({ error: "Could not reach Roblox Creator Store.", details: String(error) }, 502, origin);
    }
  },
};
