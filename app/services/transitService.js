import { TRANSIT_PROXY_URL } from "../config.js";
import { officialStreetSegments } from "../data/focusAreas.js";
import { staticTransitGeoJson, staticTransitSnapshot } from "../data/generatedTransitSnapshot.js";
import { constrainCollectionToCounty } from "./geometryService.js";

const transitFallbackGeoJson = {
  type: "FeatureCollection",
  features: officialStreetSegments
    .filter((street) => street.transitRoutes.length)
    .map((street, index) => ({
      type: "Feature",
      properties: {
        id: `fallback-route-${index + 1}`,
        routeShortName: street.transitRoutes.join(", "),
        routeLongName: street.name,
        stroke: "#2a62c9",
        sourceType: "fallback",
      },
      geometry: {
        type: "LineString",
        coordinates: street.geometry,
      },
    })),
};

export async function fetchTransitGeoJson(countyFeature) {
  if (staticTransitGeoJson.features.length && !TRANSIT_PROXY_URL) {
    return {
      data: constrainCollectionToCounty(staticTransitGeoJson, countyFeature),
      mode: "live",
      detail: buildStaticTransitDetail(),
    };
  }

  if (!TRANSIT_PROXY_URL) {
    return {
      data: constrainCollectionToCounty(transitFallbackGeoJson, countyFeature),
      mode: "fallback",
      detail:
        "The browser cannot read WeGo's GTFS zip directly because of CORS, and no deploy-time GTFS snapshot was available, so the app is using county-clipped fallback route sketches.",
    };
  }

  if (!window.JSZip) {
    return {
      data: constrainCollectionToCounty(transitFallbackGeoJson, countyFeature),
      mode: "fallback",
      detail: "JSZip was unavailable, so the app used county-clipped fallback route sketches.",
    };
  }

  try {
    const response = await fetch(TRANSIT_PROXY_URL);

    if (!response.ok) {
      throw new Error(`Transit feed request failed with ${response.status}`);
    }

    const zipData = await response.arrayBuffer();
    const zip = await window.JSZip.loadAsync(zipData);

    const [routesText, tripsText, shapesText] = await Promise.all([
      readZipFile(zip, "routes.txt"),
      readZipFile(zip, "trips.txt"),
      readZipFile(zip, "shapes.txt"),
    ]);

    const routes = parseCsv(routesText);
    const trips = parseCsv(tripsText);
    const selectedRoutes = new Map(routes.map((route) => [route.route_id, route]));

    if (!selectedRoutes.size) {
      throw new Error("No routes were found in the GTFS feed.");
    }

    const shapesByRoute = pickRepresentativeShapes(trips, selectedRoutes);
    const selectedShapeIds = new Set(
      [...shapesByRoute.values()].map((entry) => entry.shapeId),
    );

    const pointsByShape = collectShapePoints(shapesText, selectedShapeIds);
    const features = [];

    shapesByRoute.forEach((entry, routeId) => {
      const shapePoints = pointsByShape.get(entry.shapeId);
      const route = selectedRoutes.get(routeId);

      if (!shapePoints || shapePoints.length < 2) {
        return;
      }

      features.push({
        type: "Feature",
        properties: {
          id: `${route.route_short_name}-${entry.shapeId}`,
          routeShortName: route.route_short_name,
          routeLongName: route.route_long_name,
          stroke: normalizeColor(route.route_color),
          sourceType: "live",
        },
        geometry: {
          type: "LineString",
          coordinates: shapePoints.map((point) => [point.lon, point.lat]),
        },
      });
    });

    if (!features.length) {
      throw new Error("No route shapes could be assembled from the GTFS feed.");
    }

    return {
      data: constrainCollectionToCounty(
        {
          type: "FeatureCollection",
          features,
        },
        countyFeature,
      ),
      mode: "live",
      detail: "Routes were drawn from the proxied WeGo GTFS feed and clipped to Davidson County.",
    };
  } catch (error) {
    console.warn(error);
    return {
      data: constrainCollectionToCounty(transitFallbackGeoJson, countyFeature),
      mode: "fallback",
      detail:
        "The live GTFS feed could not be parsed, so the app used county-clipped route sketches tied to the local reference streets.",
    };
  }
}

function buildStaticTransitDetail() {
  const generatedAt = staticTransitSnapshot.generatedAt
    ? new Date(staticTransitSnapshot.generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  if (!generatedAt) {
    return "Transit routes came from a deploy-time GTFS snapshot and were clipped to Davidson County.";
  }

  return `Transit routes came from a deploy-time WeGo GTFS snapshot built on ${generatedAt} and were clipped to Davidson County.`;
}

async function readZipFile(zip, filename) {
  const file = zip.file(filename);

  if (!file) {
    throw new Error(`${filename} was missing from the GTFS bundle.`);
  }

  return file.async("string");
}

function pickRepresentativeShapes(trips, selectedRoutes) {
  const shapeCountsByRoute = new Map();

  trips.forEach((trip) => {
    if (!selectedRoutes.has(trip.route_id) || !trip.shape_id) {
      return;
    }

    const routeShapes = shapeCountsByRoute.get(trip.route_id) ?? new Map();
    routeShapes.set(trip.shape_id, (routeShapes.get(trip.shape_id) ?? 0) + 1);
    shapeCountsByRoute.set(trip.route_id, routeShapes);
  });

  const chosen = new Map();

  shapeCountsByRoute.forEach((shapeCounts, routeId) => {
    const [shapeId, tripsUsingShape] = [...shapeCounts.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0];

    chosen.set(routeId, { shapeId, tripsUsingShape });
  });

  return chosen;
}

function collectShapePoints(shapesText, selectedShapeIds) {
  const lines = shapesText.trim().split(/\r?\n/);
  const header = splitCsvLine(lines.shift());
  const columns = buildColumnLookup(header);
  const pointsByShape = new Map();

  lines.forEach((line) => {
    if (!line) {
      return;
    }

    const values = splitCsvLine(line);
    const shapeId = values[columns.shape_id];

    if (!selectedShapeIds.has(shapeId)) {
      return;
    }

    const point = {
      lat: Number(values[columns.shape_pt_lat]),
      lon: Number(values[columns.shape_pt_lon]),
      sequence: Number(values[columns.shape_pt_sequence]),
    };
    const points = pointsByShape.get(shapeId) ?? [];
    points.push(point);
    pointsByShape.set(shapeId, points);
  });

  pointsByShape.forEach((points, shapeId) => {
    points.sort((left, right) => left.sequence - right.sequence);
    pointsByShape.set(shapeId, points);
  });

  return pointsByShape;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines.shift());
  const columns = buildColumnLookup(header);

  return lines.map((line) => {
    const values = splitCsvLine(line);
    const row = {};

    Object.entries(columns).forEach(([columnName, index]) => {
      row[columnName] = values[index];
    });

    return row;
  });
}

function buildColumnLookup(columns) {
  return columns.reduce((lookup, columnName, index) => {
    lookup[columnName] = index;
    return lookup;
  }, {});
}

function splitCsvLine(line) {
  const values = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

function normalizeColor(routeColor) {
  if (!routeColor) {
    return "#2a62c9";
  }

  return routeColor.startsWith("#") ? routeColor : `#${routeColor}`;
}
