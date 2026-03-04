import { buildUnresolvedIntersectionSeed } from "./intersectionResolver.js";
import { officialIntersectionDefinitions } from "../data/intersectionRegistry.js";

export async function loadAtlasSnapshot() {
  const module = await import("../data/generatedAtlasSnapshot.js");
  return module.atlasSnapshot;
}

export function hasAtlasSnapshot(snapshot) {
  if (!snapshot?.generatedAt) {
    return false;
  }

  return Object.values(snapshot.layers ?? {}).some(
    (layer) => Array.isArray(layer?.features) && layer.features.length > 0,
  );
}

export function buildLiveDataFromSnapshot(snapshot) {
  const intersectionProjects =
    snapshot.metadata?.intersectionProjects?.length
      ? snapshot.metadata.intersectionProjects
      : buildUnresolvedIntersectionSeed(officialIntersectionDefinitions);

  return {
    layers: snapshot.layers,
    intersectionProjects,
    liveData: {
      crashAreas: {
        status: snapshot.statuses?.crashAreas?.status ?? "snapshot",
        detail: snapshot.statuses?.crashAreas?.detail ?? "Crash areas loaded from a deploy-time county snapshot.",
        count: snapshot.summaries?.crashAreas?.totalAreas ?? snapshot.layers?.crashAreas?.features?.length ?? 0,
        summary: snapshot.summaries?.crashAreas ?? null,
      },
      traffic: {
        status: snapshot.statuses?.traffic?.status ?? "snapshot",
        detail: snapshot.statuses?.traffic?.detail ?? "Traffic context loaded from a deploy-time NDOT county snapshot.",
        count: snapshot.summaries?.traffic?.totalStations ?? snapshot.layers?.traffic?.features?.length ?? 0,
        summary: snapshot.summaries?.traffic ?? null,
      },
      intersections: {
        status: snapshot.statuses?.intersections?.status ?? "snapshot",
        detail:
          snapshot.statuses?.intersections?.detail ??
          "Official intersections resolved from a deploy-time NDOT street snapshot.",
        count:
          snapshot.summaries?.intersections?.resolvedCount ??
          snapshot.layers?.intersections?.features?.length ??
          0,
        summary: snapshot.summaries?.intersections ?? null,
      },
      sidewalks: {
        status: snapshot.statuses?.sidewalks?.status ?? "snapshot",
        detail: snapshot.statuses?.sidewalks?.detail ?? "Sidewalks loaded from a deploy-time county snapshot.",
        count:
          snapshot.summaries?.sidewalks?.totalSegments ??
          snapshot.layers?.sidewalks?.features?.length ??
          0,
      },
      transit: {
        status: snapshot.statuses?.transit?.status ?? "snapshot",
        detail: snapshot.statuses?.transit?.detail ?? "Transit routes loaded from a deploy-time WeGo snapshot.",
        count:
          snapshot.summaries?.transit?.routeCount ??
          snapshot.layers?.transit?.features?.length ??
          0,
      },
    },
  };
}

export function shouldPreferLiveData() {
  if (!isLocalDevHost()) {
    return false;
  }

  const params = new URLSearchParams(globalThis.location?.search ?? "");
  return params.get("liveData") === "1";
}

function isLocalDevHost() {
  const hostname = globalThis.location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}
