# Davidson County Safety and Travel Atlas

This is a small static web app for exploring Davidson County, Tennessee travel safety conditions. It combines:

- Live official Nashville MPO crash-ranked area polygons
- Live official NDOT Metro street-network traffic context with on-map street labels
- Local NDOT intersection improvement markers
- Optional live sidewalk inventory from Nashville's map service
- Optional bus route overlays clipped to the county boundary
- An analytics tab that summarizes crash exposure and mobility context

## Run it locally

Use the included Node dev server if you want live transit proxying in local development:

```bash
node dev-server.mjs
```

Then open `http://localhost:8000`.

## Structure

- `index.html`: app shell and CDN dependencies
- `styles/main.css`: visual system and responsive layout
- `app/main.js`: app wiring, state changes, and live data loading
- `app/data/focusAreas.js`: local intersection markers and transit fallback data
- `app/map/createMap.js`: MapLibre setup, layers, and popups
- `app/services/arcgis.js`: Nashville sidewalk query
- `app/services/countyService.js`: Davidson County boundary loader
- `app/services/crashService.js`: Nashville MPO crash-area query
- `app/services/trafficService.js`: NDOT street-network traffic context query
- `app/services/transitService.js`: WeGo GTFS parsing with a local fallback
- `app/ui/`: sidebar and analytics rendering

## Notes

- Every live overlay now waits on a checked-in Davidson County boundary and is requested inside that polygon instead of a rough bounding box.
- The traffic overlay is drawn from NDOT's Metro Official Streets and Alleys layer and excludes records that read like interstates, U.S. routes, state routes, parkways, or pikes.
- The primary safety layer now comes from the Nashville MPO High Crash Areas 2020-2024 service.
- The Davidson County boundary is intentionally checked in locally so the rest of the overlays stay deterministic across sessions.
- The intersection markers are still local reference data because the crash-area feed is polygon-based, not a pre-labeled local-street severity dataset.
- If the live GTFS feed fails, the app falls back to local route sketches so the map still works.
- WeGo's GTFS zip cannot be read directly from the browser because of CORS. The included `dev-server.mjs` exposes `/api/wego-gtfs` locally so live transit geometry can load during development. On GitHub Pages, the app automatically skips that proxy and uses fallback transit sketches instead.
- The sidewalk overlay depends on the browser reaching Nashville's ArcGIS service.

## Deploy to GitHub Pages

This repo includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

1. Push the repo to GitHub.
2. In GitHub, open `Settings` > `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `main`, or run the `Deploy GitHub Pages` workflow manually from the `Actions` tab.

GitHub will publish the app at:

`https://<your-github-username>.github.io/<your-repo-name>/`

Notes:

- The app uses relative asset paths, so it will work from a GitHub Pages repo subpath.
- Live transit proxying is local-development-only. The public GitHub Pages version will use the fallback transit overlay unless you later move the GTFS proxy to a hosted serverless function.
