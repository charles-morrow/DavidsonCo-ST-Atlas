import fs from "node:fs/promises";

import { davidsonCountyBoundary } from "../app/data/davidsonCountyBoundary.js";
import { officialIntersectionDefinitions } from "../app/data/intersectionRegistry.js";
import { fetchSidewalkGeoJson } from "../app/services/arcgis.js";
import { fetchOfficialCrashAreas } from "../app/services/crashService.js";
import {
  buildIntersectionGeoJson,
  resolveIntersectionProjects,
} from "../app/services/intersectionResolver.js";
import { fetchTrafficCounts } from "../app/services/trafficService.js";
import { buildTransitSnapshotFromGtfsDirectory } from "./build-static-transit.mjs";

const [gtfsDir = ".cache/gtfs", outputFile = "app/data/generatedAtlasSnapshot.js"] = process.argv.slice(2);

async function main() {
  const generatedAt = new Date().toISOString();

  const crashResult = await buildLayerSnapshot("crashAreas", async () =>
    fetchOfficialCrashAreas(davidsonCountyBoundary),
  );
  const trafficResult = await buildLayerSnapshot("traffic", async () =>
    fetchTrafficCounts(davidsonCountyBoundary),
  );
  const intersectionsResult = buildIntersectionSnapshot(trafficResult, generatedAt);
  const sidewalksResult = await buildLayerSnapshot("sidewalks", async () => {
    const data = await fetchSidewalkGeoJson(davidsonCountyBoundary);

    return {
      data,
      mode: "snapshot",
      detail: "Sidewalks were loaded from a deploy-time county snapshot.",
      summary: {
        totalSegments: data.features.length,
      },
    };
  });
  const transitResult = await buildTransitLayerSnapshot(gtfsDir);

  const atlasSnapshot = {
    generatedAt,
    sources: {
      crashAreas: "Nashville MPO High Crash Areas 2020-2024",
      traffic: "NDOT Metro Official Streets and Alleys",
      intersections: "NDOT HIN Local Intersection Improvements + NDOT Metro Official Streets and Alleys",
      sidewalks: "Nashville SidewalksPro",
      transit: "WeGo GTFS",
    },
    layers: {
      crashAreas: compactCrashLayer(crashResult.data),
      traffic: compactTrafficLayer(trafficResult.data),
      intersections: compactIntersectionLayer(intersectionsResult.data),
      sidewalks: compactLineLayer(sidewalksResult.data, 0.00008),
      transit: compactTransitLayer(transitResult.data),
    },
    summaries: {
      crashAreas: crashResult.summary,
      traffic: trafficResult.summary,
      intersections: intersectionsResult.summary,
      sidewalks: sidewalksResult.summary,
      transit: transitResult.summary,
    },
    statuses: {
      crashAreas: {
        status: crashResult.status,
        detail:
          crashResult.status === "snapshot"
            ? `Crash areas loaded from a deploy-time county snapshot built on ${formatSnapshotDate(generatedAt)}.`
            : crashResult.detail,
      },
      traffic: {
        status: trafficResult.status,
        detail:
          trafficResult.status === "snapshot"
            ? `Traffic context loaded from a deploy-time NDOT county snapshot built on ${formatSnapshotDate(generatedAt)}.`
            : trafficResult.detail,
      },
      intersections: {
        status:
          intersectionsResult.summary.resolvedCount === intersectionsResult.summary.totalCount
            ? "snapshot"
            : intersectionsResult.summary.resolvedCount > 0
              ? "partial"
              : "error",
        detail:
          intersectionsResult.summary.resolvedCount === intersectionsResult.summary.totalCount
            ? `Official intersections resolved from a deploy-time NDOT street snapshot built on ${formatSnapshotDate(generatedAt)}.`
            : `${intersectionsResult.summary.resolvedCount} of ${intersectionsResult.summary.totalCount} official intersections resolved from a deploy-time NDOT street snapshot built on ${formatSnapshotDate(generatedAt)}.`,
      },
      sidewalks: {
        status: sidewalksResult.status,
        detail:
          sidewalksResult.status === "snapshot"
            ? `Sidewalks loaded from a deploy-time county snapshot built on ${formatSnapshotDate(generatedAt)}.`
            : sidewalksResult.detail,
      },
      transit: {
        status: transitResult.status,
        detail: transitResult.detail,
      },
    },
    metadata: {
      intersectionProjects: intersectionsResult.projects,
    },
  };

  const moduleContents = `export const atlasSnapshot = ${JSON.stringify(atlasSnapshot, null, 2)};\n`;
  await fs.writeFile(outputFile, moduleContents, "utf8");
}

export async function buildLayerSnapshot(name, loader) {
  try {
    const result = await loader();

    return {
      data: result.data,
      detail: result.detail,
      summary: result.summary ?? null,
      status: "snapshot",
      name,
    };
  } catch (error) {
    console.error(`Failed to build ${name} snapshot`, error);

    return {
      data: {
        type: "FeatureCollection",
        features: [],
      },
      detail: `The deploy-time ${name} snapshot failed to build.`,
      summary: emptySummaryFor(name),
      status: "error",
      name,
    };
  }
}

function buildIntersectionSnapshot(trafficResult) {
  if (!trafficResult.data.features.length) {
    return {
      data: {
        type: "FeatureCollection",
        features: [],
      },
      projects: officialIntersectionDefinitions.map((definition) => ({
        ...definition,
        coordinates: null,
        resolved: false,
        resolutionType: "missing-streets",
        confidence: "none",
        resolutionDistanceFeet: null,
        resolutionSummary: "The deploy-time traffic snapshot was unavailable.",
        resolvedStreetNames: [],
        sourceObjectIds: [],
      })),
      summary: {
        totalCount: officialIntersectionDefinitions.length,
        resolvedCount: 0,
        unresolvedCount: officialIntersectionDefinitions.length,
        unresolvedNames: officialIntersectionDefinitions.map((definition) => definition.name),
      },
    };
  }

  const resolved = resolveIntersectionProjects(officialIntersectionDefinitions, trafficResult.data);

  return {
    data: buildIntersectionGeoJson(resolved.projects),
    projects: resolved.projects,
    summary: resolved.summary,
  };
}

async function buildTransitLayerSnapshot(gtfsDir) {
  try {
    const transitResult = await buildTransitSnapshotFromGtfsDirectory(gtfsDir);

    return {
      data: transitResult.collection,
      summary: {
        routeCount: transitResult.collection.features.length,
        generatedAt: transitResult.snapshot.generatedAt,
      },
      status: "snapshot",
      detail: `Transit routes loaded from a deploy-time WeGo snapshot built on ${formatSnapshotDate(transitResult.snapshot.generatedAt)}.`,
    };
  } catch (error) {
    console.error("Failed to build transit snapshot", error);

    return {
      data: {
        type: "FeatureCollection",
        features: [],
      },
      summary: {
        routeCount: 0,
        generatedAt: null,
      },
      status: "error",
      detail: "The deploy-time transit snapshot failed, so no transit routes were published in this build.",
    };
  }
}

function compactCrashLayer(collection) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      type: "Feature",
      properties: {
        featureIndex: feature.properties.featureIndex,
        displayName: feature.properties.displayName,
        displayScore: feature.properties.displayScore,
        displayScoreLabel: feature.properties.displayScoreLabel,
      },
      geometry: roundGeometry(feature.geometry),
    })),
  };
}

function compactTrafficLayer(collection) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      type: "Feature",
      properties: {
        featureIndex: feature.properties.featureIndex,
        displayName: feature.properties.displayName,
        displayCount: feature.properties.displayCount,
        sourceType: feature.properties.sourceType,
        sourceObjectId: feature.properties.sourceObjectId,
        normalizedStreetName: feature.properties.normalizedStreetName,
        matchStreetNames: feature.properties.matchStreetNames,
      },
      geometry: simplifyGeometry(feature.geometry, 0.00004),
    })),
  };
}

function compactIntersectionLayer(collection) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      type: "Feature",
      properties: {
        id: feature.properties.id,
        name: feature.properties.name,
        emphasis: feature.properties.emphasis,
        modes: feature.properties.modes,
        source: feature.properties.source,
        resolutionType: feature.properties.resolutionType,
        confidence: feature.properties.confidence,
        resolutionDistanceFeet: feature.properties.resolutionDistanceFeet,
        geometrySource: feature.properties.geometrySource,
        resolutionSummary: feature.properties.resolutionSummary,
      },
      geometry: roundGeometry(feature.geometry),
    })),
  };
}

function compactTransitLayer(collection) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      type: "Feature",
      properties: {
        id: feature.properties.id,
        routeShortName: feature.properties.routeShortName,
        routeLongName: feature.properties.routeLongName,
        stroke: feature.properties.stroke,
        sourceType: feature.properties.sourceType,
      },
      geometry: simplifyGeometry(feature.geometry, 0.00005),
    })),
  };
}

function compactLineLayer(collection, tolerance) {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature, index) => ({
      type: "Feature",
      properties: {
        id: feature.properties?.id ?? index + 1,
      },
      geometry: simplifyGeometry(feature.geometry, tolerance),
    })),
  };
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) {
    return geometry;
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: simplifyLine(geometry.coordinates, tolerance),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((line) => simplifyLine(line, tolerance)),
    };
  }

  return roundGeometry(geometry);
}

function roundGeometry(geometry) {
  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: roundCoordinatePair(geometry.coordinates),
    };
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(roundCoordinatePair),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((line) => line.map(roundCoordinatePair)),
    };
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(roundCoordinatePair)),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(roundCoordinatePair)),
      ),
    };
  }

  return geometry;
}

function simplifyLine(coordinates, tolerance) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2) {
    return coordinates.map(roundCoordinatePair);
  }

  const simplified = douglasPeucker(coordinates, tolerance).map(roundCoordinatePair);
  return simplified.length >= 2 ? simplified : coordinates.slice(0, 2).map(roundCoordinatePair);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], start, end);

    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= tolerance) {
    return [start, end];
  }

  return [
    ...douglasPeucker(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
    ...douglasPeucker(points.slice(splitIndex), tolerance),
  ];
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  if (!dx && !dy) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const numerator = Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]);
  const denominator = Math.hypot(dx, dy);
  return numerator / denominator;
}

function roundCoordinatePair(point) {
  return [roundCoordinate(point[0]), roundCoordinate(point[1])];
}

function roundCoordinate(value) {
  return Math.round(value * 1000000) / 1000000;
}

function emptySummaryFor(name) {
  if (name === "crashAreas") {
    return {
      totalAreas: 0,
      averageScore: null,
      topAreas: [],
    };
  }

  if (name === "traffic") {
    return {
      totalStations: 0,
      topStations: [],
    };
  }

  if (name === "sidewalks") {
    return {
      totalSegments: 0,
    };
  }

  return null;
}

function formatSnapshotDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
