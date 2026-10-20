
const ROBLOX_SEARCH = "https://apis.roblox.com/toolbox-service/v2/assets:search";

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=30",
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
  for (const key of [
    "creatorStoreAssets",
    "data",
    "assets",
    "results",
    "items",
  ]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload)) return payload;
  return null;
}

function normalizeAsset(item) {
  const asset = item?.asset ?? item;
  const creator = item?.creator ?? {};

  const id = asset?.id ?? item?.id ?? item?.assetId;
  if (id == null) return null;

  const previews = asset?.previewAssets;
  const imagePreview = previews?.imagePreviewAssets?.[0];

  return {
    id: String(id),
    name: asset?.name ?? item?.name ?? "Untitled model",
    description: asset?.description ?? item?.description ?? "",
    thumbnailUrl:
      imagePreview?.imageUrl ??
      imagePreview?.url ??
      asset?.thumbnailUrl ??
      item?.thumbnailUrl ??
      null,
    creatorName: creator?.name ?? item?.creatorName ?? "",
    creatorId: creator?.userId ?? creator?.id ?? item?.creatorId ?? null,
    assetType: "Model",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "f3x-creator-store-api",
      }, 200, origin);
    }

    if (url.pathname !== "/api/search") {
      return json({
        error: "Not found",
        endpoints: ["/health", "/api/search?q=spongebob%20statue"],
      }, 404, origin);
    }

    const query = (url.searchParams.get("q") || "").trim().slice(0, 120);

    if (query.length < 2) {
      return json({
        error: "Enter at least 2 search characters.",
      }, 400, origin);
    }

    const limit = Math.max(
      1,
      Math.min(
        50,
        Number.parseInt(url.searchParams.get("limit") || "25", 10) || 25
      )
    );

    const upstream = new URL(ROBLOX_SEARCH);
    upstream.searchParams.set("searchCategoryType", "Model");
    upstream.searchParams.set("query", query);
    upstream.searchParams.set("maxPageSize", String(limit));
    upstream.searchParams.set(
      "pageNumber",
      String(Math.max(0, Number.parseInt(url.searchParams.get("pageNumber") || "0", 10) || 0))
    );
    upstream.searchParams.set("searchView", "Full");
    upstream.searchParams.set("includeOnlyVerifiedCreators", "false");

    try {
      const response = await fetch(upstream.toString(), {
        headers: { Accept: "application/json" },
      });

      const bodyText = await response.text();
      let payload;

      try {
        payload = JSON.parse(bodyText);
      } catch {
        return json({
          error: "Roblox returned an invalid response.",
          upstreamStatus: response.status,
          details: bodyText.slice(0, 300),
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
          error: "Unrecognized Roblox response format.",
          upstreamKeys: Object.keys(payload || {}),
        }, 502, origin);
      }

      const assets = raw.map(normalizeAsset).filter(Boolean);

      return json({
        ok: true,
        query,
        count: assets.length,
        totalResults: payload?.totalResults ?? assets.length,
        nextPageToken: payload?.nextPageToken ?? null,
        assets,
      }, 200, origin);

    } catch (error) {
      return json({
        error: "Could not reach Roblox Creator Store.",
        details: String(error),
      }, 502, origin);
    }
  },
};
