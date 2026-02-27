import fs from "node:fs/promises";
import path from "node:path";

import { davidsonCountyBoundary } from "../app/data/davidsonCountyBoundary.js";
import { constrainCollectionToCounty } from "../app/services/geometryService.js";
const [inputDir = ".cache/gtfs", outputFile = "app/data/generatedTransitSnapshot.js"] = process.argv.slice(2);

async function main() {
  const [routesText, tripsText, shapesText] = await Promise.all([
    fs.readFile(path.join(inputDir, "routes.txt"), "utf8"),
    fs.readFile(path.join(inputDir, "trips.txt"), "utf8"),
    fs.readFile(path.join(inputDir, "shapes.txt"), "utf8"),
  ]);

  const routes = parseCsv(routesText);
  const trips = parseCsv(tripsText);
  const selectedRoutes = new Map(routes.map((route) => [route.route_id, route]));

  if (!selectedRoutes.size) {
    throw new Error("No routes were found in the GTFS snapshot.");
  }

  const shapesByRoute = pickRepresentativeShapes(trips, selectedRoutes);
  const selectedShapeIds = new Set([...shapesByRoute.values()].map((entry) => entry.shapeId));
  const pointsByShape = collectShapePoints(shapesText, selectedShapeIds);
  const features = [];

  shapesByRoute.forEach((entry, routeId) => {
    const route = selectedRoutes.get(routeId);
    const shapePoints = pointsByShape.get(entry.shapeId);

    if (!route || !shapePoints || shapePoints.length < 2) {
      return;
    }

    features.push({
      type: "Feature",
      properties: {
        id: `${route.route_short_name}-${entry.shapeId}`,
        routeShortName: route.route_short_name,
        routeLongName: route.route_long_name,
        stroke: normalizeColor(route.route_color),
        sourceType: "static",
      },
      geometry: {
        type: "LineString",
        coordinates: shapePoints.map((point) => [point.lon, point.lat]),
      },
    });
  });

  const clippedCollection = constrainCollectionToCounty(
    {
      type: "FeatureCollection",
      features,
    },
    davidsonCountyBoundary,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    routeCount: clippedCollection.features.length,
    source: "WeGo GTFS snapshot generated during deploy.",
  };

  const moduleContents = [
    `export const staticTransitSnapshot = ${JSON.stringify(snapshot, null, 2)};`,
    `export const staticTransitGeoJson = ${JSON.stringify(clippedCollection, null, 2)};`,
    "",
  ].join("\n\n");

  await fs.writeFile(outputFile, moduleContents, "utf8");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
