import { SOURCE_LINKS } from "./config.js";
import { officialIntersectionProjects } from "./data/focusAreas.js";
import { createSafetyMap } from "./map/createMap.js?v=20260227b";
import { fetchSidewalkGeoJson } from "./services/arcgis.js";
import { fetchOfficialCrashAreas } from "./services/crashService.js";
import { fetchDavidsonCountyBoundary } from "./services/countyService.js";
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
  layers: {
    crashAreas: true,
    traffic: true,
    intersections: true,
    transit: true,
    sidewalks: false,
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

  try {
    const result = await fetchTrafficCounts(countyBoundary);
    mapApi?.updateTraffic(result.data);
    patchLiveData("traffic", {
      status: result.mode,
      detail: result.detail,
      count: result.summary.totalStations,
      summary: result.summary,
    });
  } catch (error) {
    console.warn(error);
    patchLiveData("traffic", {
      status: "error",
      detail: "The traffic count service did not load in this session.",
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
      { label: "Sidewalk segments", value: displayCount(state.liveData.sidewalks) },
    ],
    statusDetails: buildStatusDetails(state),
    statusCopy: [
      state.liveData.countyBoundary.detail,
      state.liveData.crashAreas.detail,
      state.liveData.traffic.detail,
      state.liveData.transit.detail,
      state.liveData.sidewalks.detail,
    ]
      .filter(Boolean)
      .join(" "),
    intersections: officialIntersectionProjects
      .filter((intersection) => !/brick church pike/i.test(intersection.name))
      .map((intersection) => ({
        ...intersection,
        selected: intersection.id === state.selectedIntersectionId,
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
      { value: officialIntersectionProjects.filter((intersection) => !/brick church pike/i.test(intersection.name)).length, label: "metro-jurisdiction intersections" },
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
    intersectionRows: officialIntersectionProjects
      .filter((intersection) => !/brick church pike/i.test(intersection.name))
      .map((intersection) => ({
        name: intersection.name,
        detail: intersection.emphasis,
        modes: intersection.modes.join(" / "),
      })),
    narrative: buildNarrative(topCrashAreas, state),
  };
}

function buildNarrative(topCrashAreas, state) {
  if (!topCrashAreas.length) {
    return "The analytics view will populate once the county boundary and the official local crash-area service respond in the browser.";
  }

  const trafficMode =
    "The traffic overlay is currently using NDOT's local street network as the official traffic context layer.";

  return `${topCrashAreas[0].name} is currently leading the county-filtered crash view. ${trafficMode} State highways and federal interstates are intentionally excluded from the traffic and crash overlays so the map stays focused on Davidson County jurisdiction.`;
}

function buildStatusDetails(state) {
  return [
    createStatusDetail("County boundary", state.liveData.countyBoundary.status),
    createStatusDetail("Crash areas", state.liveData.crashAreas.status),
    createStatusDetail("Traffic", state.liveData.traffic.status),
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
