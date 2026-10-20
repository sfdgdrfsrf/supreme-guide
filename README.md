# F3X Creator Store Search API

A small Cloudflare Worker proxy for Roblox Creator Store **Model** search. It is designed to sit between a Delta Lua UI and Roblox's Toolbox Service search endpoint.

## What this solves

- Searches Creator Store models, not avatar Marketplace clothing/accessories.
- Returns normalized results (`id`, `name`, `description`, `thumbnailUrl`, `creatorName`, `assetType` when available).
- Supports CORS for browser/executor clients.
- Adds basic input validation and a small result limit.

**Important:** this service searches and lists assets. It does not bypass Roblox asset permissions or guarantee that every model can be inserted with `InsertService`/`GetObjects`. Use only assets you have permission to use. The API is public if deployed publicly; do not add Roblox cookies or API keys to the Lua script.

## API

`GET /api/search?q=spongebob%20statue&limit=25`

Optional:
- `pageNumber` (0-based)
- `includeOnlyVerifiedCreators` (`true` or `false`; default `false` so community models can appear)

`GET /health`

The Worker forwards to Roblox's documented Toolbox Service endpoint:
`https://apis.roblox.com/toolbox-service/v2/assets:search?searchCategoryType=Model&query=...`

## Deploy from GitHub

1. Create a repository and upload these files.
2. Create a Cloudflare account and a Worker.
3. In Cloudflare, create an API token with permission to deploy Workers, and copy your Account ID.
4. In GitHub repository Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. In `wrangler.toml`, replace `f3x-creator-store-api` with the Worker name you want.
6. Push to `main`; the GitHub Actions workflow deploys the Worker.
7. Copy the Worker URL (for example `https://f3x-creator-store-api.<your-subdomain>.workers.dev`) and set it in the Lua script's `API_BASE` constant.

GitHub stores and builds the code; the Cloudflare Worker runs the live API. GitHub Pages alone cannot run this API endpoint.

## Smoke test

After deployment, open:
- `https://YOUR-WORKER-URL/health`
- `https://YOUR-WORKER-URL/api/search?q=spongebob%20statue`

If Roblox rejects or changes the endpoint, the API returns a useful HTTP error instead of pretending the search succeeded.

## Website (GitHub Pages)

The static search page lives in `site/` and is published by `.github/workflows/pages.yml`.

- Repo: https://github.com/sfdgdrfsrf/supreme-guide
- Site: https://sfdgdrfsrf.github.io/supreme-guide/

In the repo, go to Settings → Pages and set Source to **GitHub Actions**. Then set `DEFAULT_API_BASE` in `site/index.html` to your deployed Worker URL.
