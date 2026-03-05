import { SOURCE_LINKS } from "./config.js";
import { officialIntersectionDefinitions } from "./data/intersectionRegistry.js";
import { createSafetyMap } from "./map/createMap.js?v=20260228b";
import { fetchSidewalkGeoJson } from "./services/arcgis.js";
import { fetchOfficialCrashAreas } from "./services/crashService.js";
import { fetchDavidsonCountyBoundary } from "./services/countyService.js";
import {
  buildIntersectionGeoJson,
  buildUnresolvedIntersectionSeed,
  EMPTY_COLLECTION,
  resolveIntersectionProjects,
} from "./services/intersectionResolver.js";
import {
  buildLiveDataFromSnapshot,
  hasAtlasSnapshot,
  loadAtlasSnapshot,
  shouldPreferLiveData,
} from "./services/snapshotService.js";
import { fetchTrafficCounts } from "./services/trafficService.js";
import { fetchTransitGeoJson } from "./services/transitService.js";
import { createStore } from "./state.js";
import { renderAnalytics } from "./ui/renderAnalytics.js";
import { renderSidebar } from "./ui/renderSidebar.js";

const store = createStore({
  activeView: "map",
  selectedIntersectionId: null,
  selectedCrashAreaIndex: null,
  countyBoundaryReady: false,
  intersectionProjects: buildUnresolvedIntersectionSeed(officialIntersectionDefinitions),
  layers: {
    crashAreas: true,
    traffic: true,
    intersections: true,
    transit: true,
    sidewalks: true,
  },
  liveData: {
    countyBoundary: {
      status: "idle",
      detail: "Davidson County boundary has not loaded yet.",
      count: 0,
    },
    crashAreas: {
      status: "idle",
      detail: "Official crash-ranked areas have not loaded yet.",
      count: 0,
      summary: null,
    },
    traffic: {
      status: "idle",
      detail: "Traffic counts have not loaded yet.",
      count: 0,
      summary: null,
    },
    intersections: {
      status: "idle",
      detail: "Official intersections are waiting on NDOT street geometry.",
      count: 0,
      summary: null,
    },
    sidewalks: {
      status: "idle",
      detail: "Sidewalk inventory has not loaded yet.",
      count: 0,
    },
    transit: {
      status: "idle",
      detail: "Transit routes have not loaded yet.",
      count: 0,
    },
  },
});

const sidebarRoot = document.querySelector("#sidebar");
const analyticsRoot = document.querySelector("#analytics");
const statusStrip = document.querySelector("#status-strip");
const mapView = document.querySelector("#map-view");
const analyticsView = document.querySelector("#analytics-view");
const tabButtons = [...document.querySelectorAll(".tab-button")];

let countyBoundary = null;
let countyBoundaryRequested = false;
let crashAreasRequested = false;
let trafficRequested = false;
let transitRequested = false;
let sidewalkRequested = false;

const mapApi = createSafetyMap({
  containerId: "map",
  onIntersectionSelect: selectIntersection,
  onCrashAreaSelect: selectCrashArea,
  onReady: () => {
    syncMapState(store.getState());
  },
});

const actions = {
  toggleLayer(layerKey) {
    const nextLayers = {
      ...store.getState().layers,
      [layerKey]: !store.getState().layers[layerKey],
    };

    store.patch({ layers: nextLayers });

    if (layerKey === "crashAreas" && nextLayers.crashAreas) {
      requestCrashAreas();
    }

    if (layerKey === "traffic" && nextLayers.traffic) {
      requestTraffic();
    }

    if (layerKey === "intersections" && nextLayers.intersections) {
      requestTraffic();
    }

    if (layerKey === "transit" && nextLayers.transit) {
      requestTransit();
    }

    if (layerKey === "sidewalks" && nextLayers.sidewalks) {
      requestSidewalks();
    }
  },
  selectIntersection,
  selectCrashArea,
};

store.subscribe((state) => {
  syncTabs(state.activeView);
  syncMapState(state);
  renderSidebar(sidebarRoot, buildSidebarModel(state), actions);
  renderAnalytics(analyticsRoot, buildAnalyticsModel(state));
  renderStatusStrip(statusStrip, state);
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    store.patch({ activeView: button.dataset.view });
  });
});

store.patch({});
void bootstrapLiveData();

function selectIntersection(intersectionId) {
  store.patch({
    selectedIntersectionId: intersectionId,
  });
  mapApi?.focusIntersection(intersectionId);
}

function selectCrashArea(featureIndex) {
  store.patch({ selectedCrashAreaIndex: featureIndex });
  mapApi?.focusCrashArea(featureIndex);
}

function syncTabs(activeView) {
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });

  mapView.classList.toggle("is-hidden", activeView !== "map");
  analyticsView.classList.toggle("is-hidden", activeView !== "analytics");

  if (activeView === "map") {
    window.requestAnimationFrame(() => {
      mapApi?.resize();
    });
  }
}

function syncMapState(state) {
  mapApi?.setLayerVisibility(state.layers);
  mapApi?.updateSelection({
    intersectionId: state.selectedIntersectionId,
    crashAreaIndex: state.selectedCrashAreaIndex,
  });
  mapApi?.updateTopCrashAreas(
    state.liveData.crashAreas.summary?.topAreas.map((area) => area.featureIndex) ?? [],
  );
}

async function bootstrapLiveData() {
  await ensureCountyBoundary();

  if (!countyBoundary) {
    return;
  }

  if (!shouldPreferLiveData()) {
    await tryAtlasSnapshot();
  }

  await Promise.allSettled([
    requestCrashAreas(),
    requestTraffic(),
    requestTransit(),
    requestSidewalks(),
  ]);
}

async function ensureCountyBoundary() {
  if (countyBoundaryRequested) {
    return countyBoundary;
  }

  countyBoundaryRequested = true;
  patchLiveData("countyBoundary", {
    status: "loading",
    detail: "Davidson County boundary is loading from the checked-in county file.",
    count: 0,
  });

  try {
    const result = await fetchDavidsonCountyBoundary();
    countyBoundary = result.clipFeature;
    mapApi?.updateCountyBoundary({
      outline: {
        type: "FeatureCollection",
        features: [result.displayFeature],
      },
      mask: {
        type: "FeatureCollection",
        features: [result.maskFeature],
      },
    });
    store.patch({ countyBoundaryReady: true });
    patchLiveData("countyBoundary", {
      status: result.mode,
      detail: result.detail,
      count: 1,
    });
  } catch (error) {
    console.warn(error);
    patchLiveData("countyBoundary", {
      status: "error",
      detail: "The Davidson County boundary layer did not load, so live overlays were not requested.",
      count: 0,
    });
  }

  return countyBoundary;
}

async function tryAtlasSnapshot() {
  try {
    const snapshot = await loadAtlasSnapshot();

    if (!hasAtlasSnapshot(snapshot)) {
      return false;
    }

    const prepared = buildLiveDataFromSnapshot(snapshot);
    crashAreasRequested = isSnapshotLayerReady(prepared.liveData.crashAreas);
    trafficRequested = isSnapshotLayerReady(prepared.liveData.traffic);
    transitRequested = isSnapshotLayerReady(prepared.liveData.transit);
    sidewalkRequested = isSnapshotLayerReady(prepared.liveData.sidewalks);

    mapApi?.updateCrashAreas(prepared.layers.crashAreas);
    mapApi?.updateTraffic(prepared.layers.traffic);
    mapApi?.updateIntersections(prepared.layers.intersections);
    mapApi?.updateTransit(prepared.layers.transit);
    mapApi?.updateSidewalks(prepared.layers.sidewalks);

    store.patch({
      intersectionProjects: prepared.intersectionProjects,
      liveData: {
        ...store.getState().liveData,
        crashAreas: prepared.liveData.crashAreas,
        traffic: prepared.liveData.traffic,
        intersections: prepared.liveData.intersections,
        sidewalks: prepared.liveData.sidewalks,
        transit: prepared.liveData.transit,
      },
    });

    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

async function requestCrashAreas() {
  if (crashAreasRequested || !countyBoundary) {
    return;
  }

  crashAreasRequested = true;
  patchLiveData("crashAreas", {
    status: "loading",
    detail: "Official crash-ranked areas are loading inside the Davidson County boundary.",
    count: 0,
    summary: null,
  });

  try {
    const result = await fetchOfficialCrashAreas(countyBoundary);
    mapApi?.updateCrashAreas(result.data);
    patchLiveData("crashAreas", {
      status: result.mode,
      detail: result.detail,
      count: result.summary.totalAreas,
      summary: result.summary,
    });
  } catch (error) {
    console.warn(error);
    patchLiveData("crashAreas", {
      status: "error",
      detail: "The official crash-area service did not load in this session.",
      count: 0,
      summary: null,
    });
  }
}

async function requestTraffic() {
  if (trafficRequested || !countyBoundary) {
    return;
  }

  trafficRequested = true;
  patchLiveData("traffic", {
    status: "loading",
    detail: "Traffic counts are loading and filtering out interstate and state-route labels.",
    count: 0,
    summary: null,
  });
  patchLiveData("intersections", {
    status: "loading",
    detail: "Official intersections are resolving against NDOT street geometry.",
    count: 0,
    summary: null,
  });

  try {
    const result = await fetchTrafficCounts(countyBoundary);
    const intersectionResult = resolveIntersectionProjects(
      officialIntersectionDefinitions,
      result.data,
    );

    mapApi?.updateTraffic(result.data);
    mapApi?.updateIntersections(buildIntersectionGeoJson(intersectionResult.projects));
    store.patch({ intersectionProjects: intersectionResult.projects });
    patchLiveData("traffic", {
      status: result.mode,
      detail: result.detail,
      count: result.summary.totalStations,
      summary: result.summary,
    });
    patchLiveData("intersections", {
      status: buildIntersectionStatus(intersectionResult.summary),
      detail: buildIntersectionDetail(intersectionResult),
      count: intersectionResult.summary.resolvedCount,
      summary: intersectionResult.summary,
    });
  } catch (error) {
    console.warn(error);
    store.patch({
      intersectionProjects: buildUnresolvedIntersectionSeed(officialIntersectionDefinitions),
    });
    mapApi?.updateIntersections(EMPTY_COLLECTION);
    patchLiveData("traffic", {
      status: "error",
      detail: "The traffic count service did not load in this session.",
      count: 0,
      summary: null,
    });
    patchLiveData("intersections", {
      status: "error",
      detail: "Official intersections are unavailable because NDOT street geometry did not load.",
      count: 0,
      summary: null,
    });
  }
}

async function requestTransit() {
  if (transitRequested || !countyBoundary) {
    return;
  }

  transitRequested = true;
  patchLiveData("transit", {
    status: "loading",
    detail: "Transit routes are loading and clipping to Davidson County.",
    count: 0,
  });

  const result = await fetchTransitGeoJson(countyBoundary);
  mapApi?.updateTransit(result.data);
  patchLiveData("transit", {
    status: result.mode,
    detail: result.detail,
    count: result.data.features.length,
  });
}

async function requestSidewalks() {
  if (sidewalkRequested || !countyBoundary) {
    return;
  }

  sidewalkRequested = true;
  patchLiveData("sidewalks", {
    status: "loading",
    detail: "Sidewalk segments are loading inside the Davidson County boundary.",
    count: 0,
  });

  try {
    const data = await fetchSidewalkGeoJson(countyBoundary);
    mapApi?.updateSidewalks(data);
    patchLiveData("sidewalks", {
      status: "live",
      detail: "Sidewalk centerlines pulled from the Nashville map service and constrained to Davidson County.",
      count: data.features.length,
    });
  } catch (error) {
    console.warn(error);
    patchLiveData("sidewalks", {
      status: "error",
      detail: "The sidewalk service did not load in this session.",
      count: 0,
    });
  }
}

function patchLiveData(key, nextValue) {
  store.patch({
    liveData: {
      ...store.getState().liveData,
      [key]: nextValue,
    },
  });
}

function isSnapshotLayerReady(layerState) {
  const status = layerState?.status ?? "idle";
  return !["idle", "loading", "error"].includes(status);
}

function buildSidebarModel(state) {
  const crashSummary = state.liveData.crashAreas.summary;
  const trafficSummary = state.liveData.traffic.summary;

  return {
    summaryCards: [
      {
        value:
          state.liveData.countyBoundary.status === "idle" ||
          state.liveData.countyBoundary.status === "loading"
            ? "pending"
            : state.liveData.countyBoundary.status,
        label: "county boundary filter",
      },
      { value: displayCount(state.liveData.transit), label: "transit routes" },
      { value: displayCount(state.liveData.crashAreas), label: "local crash areas" },
      { value: displayCount(state.liveData.traffic), label: "traffic context segments" },
    ],
    layerControls: [
      {
        key: "crashAreas",
        label: "Crash-ranked areas",
        description: "Official Nashville MPO crash areas filtered to Davidson County and non-highway labels.",
        enabled: state.layers.crashAreas,
      },
      {
        key: "traffic",
        label: "Traffic context",
        description: "Official NDOT Metro street network inside Davidson County, limited to Metro-jurisdiction streets.",
        enabled: state.layers.traffic,
      },
      {
        key: "intersections",
        label: "Official intersection projects",
        description: "NDOT's local HIN intersection package.",
        enabled: state.layers.intersections,
      },
      {
        key: "transit",
        label: "Bus routes",
        description: "WeGo routes clipped to the Davidson County boundary.",
        enabled: state.layers.transit,
      },
      {
        key: "sidewalks",
        label: "Sidewalk inventory",
        description: "Davidson County sidewalk centerlines from Nashville's map service.",
        enabled: state.layers.sidewalks,
      },
    ],
    statusChips: [
      { label: "County filter", value: formatStatus(state.liveData.countyBoundary.status) },
      { label: "Crash areas", value: displayCount(state.liveData.crashAreas) },
      { label: "Traffic context", value: displayCount(state.liveData.traffic) },
      { label: "Resolved intersections", value: displayCount(state.liveData.intersections) },
      { label: "Sidewalk segments", value: displayCount(state.liveData.sidewalks) },
    ],
    statusDetails: buildStatusDetails(state),
    statusCopy: [
      state.liveData.countyBoundary.detail,
      state.liveData.crashAreas.detail,
      state.liveData.traffic.detail,
      state.liveData.intersections.detail,
      state.liveData.transit.detail,
      state.liveData.sidewalks.detail,
    ]
      .filter(Boolean)
      .join(" "),
    intersections: state.intersectionProjects.map((intersection) => ({
      ...intersection,
      selected: intersection.resolved && intersection.id === state.selectedIntersectionId,
      interactive: intersection.resolved,
      statusLabel: intersection.resolved
        ? "resolved from NDOT street geometry"
        : intersection.resolutionType === "pending"
          ? "waiting on NDOT street geometry"
          : "unresolved",
      resolutionLabel: formatResolutionType(intersection.resolutionType),
    })),
    crashAreas:
      crashSummary?.topAreas.map((area) => ({
        id: area.featureIndex,
        name: area.name,
        score: area.score,
        scoreLabel: area.scoreLabel,
        selected: area.featureIndex === state.selectedCrashAreaIndex,
      })) ?? [],
    sources: SOURCE_LINKS,
  };
}

function buildAnalyticsModel(state) {
  const crashSummary = state.liveData.crashAreas.summary;
  const trafficSummary = state.liveData.traffic.summary;
  const topCrashAreas = crashSummary?.topAreas ?? [];

  return {
    metricCards: [
      { value: state.liveData.countyBoundary.status === "error" ? "no" : "yes", label: "all live layers county-confined" },
      { value: crashSummary?.totalAreas ?? displayCount(state.liveData.crashAreas), label: "local crash areas loaded" },
      { value: trafficSummary?.totalStations ?? displayCount(state.liveData.traffic), label: "local traffic context segments" },
      {
        value: formatIntersectionMetric(state.liveData.intersections.summary),
        label: "official intersections resolved",
      },
    ],
    corridorBars: topCrashAreas.map((area) => ({
      name: area.name,
      score: normalizeScore(area.score, crashSummary),
      scoreLabel: area.scoreLabel ?? (Number.isFinite(area.score) ? `${area.score}/100` : "n/a"),
    })),
    mobilityRows: [
      {
        label: "County boundary gate",
        detail: state.liveData.countyBoundary.detail,
        value: formatStatus(state.liveData.countyBoundary.status),
      },
      {
        label: "Crash layer",
        detail: state.liveData.crashAreas.detail,
        value: `${state.liveData.crashAreas.count} areas`,
      },
      {
        label: "Traffic overlay",
        detail: state.liveData.traffic.detail,
        value: `${state.liveData.traffic.count} segments`,
      },
      {
        label: "Intersection resolver",
        detail: state.liveData.intersections.detail,
        value: formatStatus(state.liveData.intersections.status),
      },
      {
        label: "Transit overlay",
        detail: state.liveData.transit.detail,
        value: `${state.liveData.transit.count} lines`,
      },
      {
        label: "Sidewalk overlay",
        detail: state.liveData.sidewalks.detail,
        value: `${state.liveData.sidewalks.count} segments`,
      },
    ],
    intersectionRows: state.intersectionProjects.map((intersection) => ({
        name: intersection.name,
        detail: intersection.emphasis,
        modes: intersection.modes.join(" / "),
        statusLabel: intersection.resolved
          ? "resolved"
          : intersection.resolutionType === "pending"
            ? "pending"
            : "unresolved",
        resolutionLabel: formatResolutionType(intersection.resolutionType),
      })),
    narrative: buildNarrative(topCrashAreas, state),
  };
}

function buildNarrative(topCrashAreas, state) {
  if (!topCrashAreas.length) {
    return "The analytics view will populate once the county boundary and the official local crash-area service respond in the browser.";
  }

  const trafficMode =
    state.liveData.traffic.status === "snapshot"
      ? "The traffic overlay is currently using a deploy-time NDOT county snapshot."
      : "The traffic overlay is currently using NDOT's local street network as the official traffic context layer.";

  return `${topCrashAreas[0].name} is currently leading the county-filtered crash view. ${trafficMode} State highways and federal interstates are intentionally excluded from the traffic and crash overlays so the map stays focused on Davidson County jurisdiction.`;
}

function buildStatusDetails(state) {
  return [
    createStatusDetail("County boundary", state.liveData.countyBoundary.status),
    createStatusDetail("Crash areas", state.liveData.crashAreas.status),
    createStatusDetail("Traffic", state.liveData.traffic.status),
    createStatusDetail("Intersections", state.liveData.intersections.status),
    createStatusDetail("Transit", state.liveData.transit.status),
    createStatusDetail("Sidewalks", state.liveData.sidewalks.status),
  ];
}

function createStatusDetail(label, status) {
  const value = status === "idle" ? "pending" : status;
  return {
    label: `${label}: ${value}`,
    className:
      status === "live" || status === "local"
        ? "is-live"
        : status === "snapshot"
          ? "is-snapshot"
        : status === "partial"
          ? "is-partial"
        : status === "fallback"
          ? "is-fallback"
          : status === "error"
            ? "is-error"
            : "",
  };
}

function renderStatusStrip(root, state) {
  root.innerHTML = `
    <span class="status-chip ${createStatusDetail("County boundary", state.liveData.countyBoundary.status).className}">
      County ${formatStatus(state.liveData.countyBoundary.status)}
    </span>
    <span class="status-chip ${createStatusDetail("Crash areas", state.liveData.crashAreas.status).className}">
      Crash areas ${formatStatus(state.liveData.crashAreas.status)}
    </span>
    <span class="status-chip ${createStatusDetail("Traffic", state.liveData.traffic.status).className}">
      Traffic ${formatStatus(state.liveData.traffic.status)}
    </span>
    <span class="status-chip ${createStatusDetail("Intersections", state.liveData.intersections.status).className}">
      Intersections ${formatStatus(state.liveData.intersections.status)}
    </span>
    <span class="status-chip ${createStatusDetail("Transit", state.liveData.transit.status).className}">
      Transit ${formatStatus(state.liveData.transit.status)}
    </span>
    <span class="status-chip ${createStatusDetail("Sidewalks", state.liveData.sidewalks.status).className}">
      Sidewalks ${formatStatus(state.liveData.sidewalks.status)}
    </span>
  `;
}

function formatStatus(status) {
  return status === "idle" ? "pending" : status;
}

function displayCount(item) {
  if (item.status === "idle" || item.status === "loading") {
    return "pending";
  }

  return item.count;
}

function buildIntersectionStatus(summary) {
  if (!summary) {
    return "idle";
  }

  if (summary.resolvedCount === summary.totalCount) {
    return "live";
  }

  return summary.resolvedCount > 0 ? "partial" : "error";
}

function buildIntersectionDetail(result) {
  const { resolvedCount, totalCount, unresolvedNames } = result.summary;

  if (resolvedCount === totalCount) {
    return `All ${totalCount} official intersection projects resolved from NDOT street geometry.`;
  }

  if (!resolvedCount) {
    return "The loaded NDOT street geometry did not resolve any official intersection projects confidently.";
  }

  return `${resolvedCount} of ${totalCount} official intersection projects resolved from NDOT street geometry. Unresolved: ${unresolvedNames.join(", ")}.`;
}

function formatIntersectionMetric(summary) {
  if (!summary) {
    return "pending";
  }

  return `${summary.resolvedCount}/${summary.totalCount}`;
}

function formatResolutionType(resolutionType) {
  if (resolutionType === "shared-node") {
    return "shared node";
  }

  if (resolutionType === "nearest-approach") {
    return "nearest approach";
  }

  if (resolutionType === "pending") {
    return "pending";
  }

  return "unresolved";
}

function normalizeScore(score, crashSummary) {
  if (!Number.isFinite(score) || !crashSummary?.topAreas?.length) {
    return 60;
  }

  const highestScore = Math.max(
    ...crashSummary.topAreas
      .map((area) => area.score)
      .filter((value) => Number.isFinite(value)),
    1,
  );

  return Math.max(12, Math.round((score / highestScore) * 100));
}
