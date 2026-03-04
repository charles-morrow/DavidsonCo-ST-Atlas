# Davidson County Safety and Travel Atlas

This is a small static web app for exploring Davidson County, Tennessee travel safety conditions. It combines:

- Deploy-time county snapshots of Nashville MPO crash-ranked area polygons
- Deploy-time NDOT Metro street-network traffic context
- NDOT HIN intersection projects resolved from deploy-time NDOT street geometry
- Deploy-time sidewalk inventory from Nashville's map service
- Bus route overlays clipped to the county boundary
- An analytics tab that summarizes crash exposure and mobility context

## Run it locally

Use the included Node dev server for local viewing:

```bash
node dev-server.mjs
```

Then open `http://localhost:8000`.

If you want to bypass the deploy-time snapshot and force live browser loading for debugging, open:

`http://localhost:8000/?liveData=1`

## Structure

- `index.html`: app shell and CDN dependencies
- `styles/main.css`: visual system and responsive layout
- `app/main.js`: app wiring, state changes, and live data loading
- `app/data/focusAreas.js`: transit fallback street sketches
- `app/data/generatedAtlasSnapshot.js`: deploy-time county snapshot placeholder/output
- `app/data/intersectionRegistry.js`: official NDOT HIN intersection definitions
- `app/map/createMap.js`: MapLibre setup, layers, and popups
- `app/services/arcgis.js`: Nashville sidewalk query
- `app/services/countyService.js`: Davidson County boundary loader
- `app/services/crashService.js`: Nashville MPO crash-area query
- `app/services/intersectionResolver.js`: NDOT street-graph intersection resolution
- `app/services/snapshotService.js`: deploy-time atlas snapshot loading
- `app/services/trafficService.js`: NDOT street-network traffic context query
- `app/services/transitService.js`: WeGo GTFS parsing with a local fallback
- `scripts/build-atlas-snapshot.mjs`: build-time county snapshot generation
- `app/ui/`: sidebar and analytics rendering

## Notes

- Public loads now prefer a deploy-time Davidson County snapshot instead of browser-side ArcGIS pagination.
- Live browser loading is still available locally with `?liveData=1` for debugging.
- The traffic overlay is drawn from NDOT's Metro Official Streets and Alleys layer and excludes records that read like interstates, U.S. routes, state routes, and parkways.
- The primary safety layer now comes from the Nashville MPO High Crash Areas 2020-2024 service.
- The Davidson County boundary is intentionally checked in locally so the rest of the overlays stay deterministic across sessions.
- The official intersection layer no longer uses local marker coordinates. It resolves each NDOT HIN project from NDOT street geometry and hides projects that do not resolve confidently.
- If the live GTFS feed fails, the app falls back to local route sketches so the map still works.
- WeGo's GTFS zip cannot be read directly from the browser because of CORS. The included `dev-server.mjs` exposes `/api/wego-gtfs` locally so live transit geometry can load during development.
- On GitHub Pages, the deployment workflow fetches ArcGIS and GTFS inputs server-side, then writes a unified county snapshot into the published site.
- If the snapshot is missing in a local checkout, the app falls back to the existing live browser data path.

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
- The workflow now rebuilds the atlas snapshot on pushes, manual dispatches, and a daily scheduled run.
- If one layer fails during snapshot generation, that layer is published with a clear status instead of blocking the whole site.
