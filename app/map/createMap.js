import { intersectionsToGeoJson } from "../data/focusAreas.js";
import { MAP_CENTER, MAP_ZOOM } from "../config.js";

const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: [],
};

export function createSafetyMap({
  containerId,
  onIntersectionSelect,
  onCrashAreaSelect,
  onTrafficSelect,
  onReady = () => {},
}) {
  if (!window.maplibregl) {
    return null;
  }

  const map = new window.maplibregl.Map({
    container: containerId,
    style: {
      version: 8,
      sources: {
        base: {
          type: "raster",
          tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
        },
      },
      layers: [
        {
          id: "base",
          type: "raster",
          source: "base",
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    },
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    minZoom: 9.5,
    maxZoom: 16,
  });

  map.addControl(new window.maplibregl.NavigationControl(), "top-right");

  const pending = {
    intersections: intersectionsToGeoJson(),
    countyBoundary: EMPTY_COLLECTION,
    countyMask: EMPTY_COLLECTION,
    crashAreas: EMPTY_COLLECTION,
    topCrashAreas: [],
    traffic: EMPTY_COLLECTION,
    transit: EMPTY_COLLECTION,
    sidewalks: EMPTY_COLLECTION,
  };

  map.on("load", () => {
    map.addSource("intersections", { type: "geojson", data: pending.intersections });
    map.addSource("county-boundary", { type: "geojson", data: pending.countyBoundary });
    map.addSource("county-mask", { type: "geojson", data: pending.countyMask });
    map.addSource("crash-areas", { type: "geojson", data: pending.crashAreas });
    map.addSource("traffic", { type: "geojson", data: pending.traffic });
    map.addSource("transit", { type: "geojson", data: pending.transit });
    map.addSource("sidewalks", { type: "geojson", data: pending.sidewalks });

    map.addLayer({
      id: "county-boundary-casing",
      type: "line",
      source: "county-boundary",
      paint: {
        "line-color": "rgba(255, 251, 245, 0.98)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 6, 12, 8, 15, 10],
        "line-opacity": 0.96,
      },
    });
    map.addLayer({
      id: "county-boundary-line",
      type: "line",
      source: "county-boundary",
      paint: {
        "line-color": "#0f2b36",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 2.3, 12, 3.2, 15, 4.4],
        "line-opacity": 0.98,
      },
    });
    map.addLayer({
      id: "county-mask-fill",
      type: "fill",
      source: "county-mask",
      paint: {
        "fill-color": "rgba(247, 243, 235, 1)",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0.24, 12, 0.18, 15, 0.12],
      },
    });

    map.addLayer({
      id: "crash-areas-fill",
      type: "fill",
      source: "crash-areas",
      paint: {
        "fill-color": [
          "case",
          ["has", "displayScore"],
          [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "displayScore"], 0],
            0,
            "#f7ead8",
            30,
            "#efc57e",
            65,
            "#d87a48",
            100,
            "#b54736",
          ],
          "#f2dcc1",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9.5,
          ["case", [">=", ["coalesce", ["get", "displayScore"], 0], 80], 0.22, 0.03],
          11,
          ["case", [">=", ["coalesce", ["get", "displayScore"], 0], 65], 0.26, 0.05],
          13,
          ["case", [">=", ["coalesce", ["get", "displayScore"], 0], 45], 0.3, 0.08],
          15,
          ["case", [">=", ["coalesce", ["get", "displayScore"], 0], 0], 0.34, 0.14],
        ],
      },
    });

    map.addLayer({
      id: "crash-areas-outline",
      type: "line",
      source: "crash-areas",
      paint: {
        "line-color": "rgba(126, 63, 41, 0.34)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 0.2, 12, 0.35, 15, 0.7],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9.5,
          0.12,
          12,
          0.18,
          15,
          0.28,
        ],
      },
    });

    map.addLayer({
      id: "crash-areas-highlight",
      type: "line",
      source: "crash-areas",
      filter: ["==", ["get", "featureIndex"], -1],
      paint: {
        "line-color": "#15303b",
        "line-width": 2.6,
      },
    });
    map.addLayer({
      id: "crash-areas-top-fill",
      type: "fill",
      source: "crash-areas",
      filter: ["==", ["get", "featureIndex"], -1],
      paint: {
        "fill-color": "#f0b24a",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9.5, 0.2, 12, 0.26, 15, 0.32],
      },
    });
    map.addLayer({
      id: "crash-areas-top-outline",
      type: "line",
      source: "crash-areas",
      filter: ["==", ["get", "featureIndex"], -1],
      paint: {
        "line-color": "#b77a1e",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 1.4, 12, 2.2, 15, 3.4],
        "line-opacity": 0.95,
      },
    });

    addLineLayer(map, "sidewalks-line", "sidewalks", "#247b74", 1.4, 0.42);
    map.addLayer({
      id: "traffic-circles",
      type: "circle",
      source: "traffic",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "displayCount"], 0],
          0,
          "#f6d992",
          8000,
          "#ec9c49",
          20000,
          "#ce6237",
          40000,
          "#8f2d1b",
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "displayCount"], 0],
          0,
          3,
          8000,
          6,
          20000,
          10,
          40000,
          14,
        ],
        "circle-opacity": 0.82,
        "circle-stroke-color": "#fff7ee",
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "traffic-lines",
      type: "line",
      source: "traffic",
      filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
      paint: {
        "line-color": "#b86d4f",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 1, 12, 1.8, 15, 2.8],
        "line-opacity": 0.24,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
    addLineLayer(
      map,
      "transit-line",
      "transit",
      "#2a62c9",
      3,
      0.78,
    );

    map.addLayer({
      id: "intersections-circle",
      type: "circle",
      source: "intersections",
      paint: {
        "circle-color": "#d9a441",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 13, 8],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    map.addLayer({
      id: "intersections-highlight",
      type: "circle",
      source: "intersections",
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-color": "#15303b",
        "circle-radius": 11,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3,
      },
    });

    // Keep the county mask above the overlays, then redraw the boundary on top of the mask.
    map.moveLayer("county-mask-fill");
    map.moveLayer("county-boundary-casing");
    map.moveLayer("county-boundary-line");

    attachInteraction(map, "intersections-circle", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      onIntersectionSelect(feature.properties.id);
      showPopup(map, event.lngLat, intersectionPopup(feature.properties));
    });

    attachInteraction(map, "crash-areas-fill", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      onCrashAreaSelect(feature.properties.featureIndex);
      showPopup(map, event.lngLat, crashPopup(feature.properties));
    });

    attachInteraction(map, "traffic-circles", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      onTrafficSelect?.(feature.properties.featureIndex);
      showPopup(map, event.lngLat, trafficPopup(feature.properties));
    });
    attachInteraction(map, "traffic-lines", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      onTrafficSelect?.(feature.properties.featureIndex);
      showPopup(map, event.lngLat, trafficPopup(feature.properties));
    });

    attachInteraction(map, "transit-line", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      showPopup(map, event.lngLat, transitPopup(feature.properties));
    });

    onReady();
  });

  return {
    updateCountyBoundary(data) {
      const outlineData = data?.outline ?? data;
      const maskSourceData = data?.mask ?? outlineData;

      pending.countyBoundary = outlineData;
      pending.countyMask = buildCountyMask(maskSourceData);
      updateSourceData(map, "county-boundary", outlineData);
      updateSourceData(map, "county-mask", pending.countyMask);
    },
    updateIntersections(data) {
      pending.intersections = data;
      updateSourceData(map, "intersections", data);
    },
    updateCrashAreas(data) {
      pending.crashAreas = data;
      updateSourceData(map, "crash-areas", data);
    },
    updateTopCrashAreas(featureIndexes) {
      pending.topCrashAreas = featureIndexes;

      if (!map.getLayer("crash-areas-top-fill")) {
        return;
      }

      const hasIndexes = Array.isArray(featureIndexes) && featureIndexes.length > 0;
      const filter = hasIndexes
        ? [
            "any",
            ...featureIndexes.map((featureIndex) => [
              "==",
              ["get", "featureIndex"],
              featureIndex,
            ]),
          ]
        : ["==", ["get", "featureIndex"], -1];

      map.setFilter("crash-areas-top-fill", filter);
      map.setFilter("crash-areas-top-outline", filter);
    },
    updateTraffic(data) {
      pending.traffic = data;
      updateSourceData(map, "traffic", data);
    },
    updateTransit(data) {
      pending.transit = data;
      updateSourceData(map, "transit", data);
    },
    updateSidewalks(data) {
      pending.sidewalks = data;
      updateSourceData(map, "sidewalks", data);
    },
    updateSelection(selection) {
      if (!map.getLayer("intersections-highlight")) {
        return;
      }

      map.setFilter("intersections-highlight", [
        "==",
        ["get", "id"],
        selection.intersectionId ?? "",
      ]);
      map.setFilter("crash-areas-highlight", [
        "==",
        ["get", "featureIndex"],
        selection.crashAreaIndex ?? -1,
      ]);
    },
    focusIntersection(intersectionId) {
      const intersection = pending.intersections.features.find(
        (feature) => feature.properties.id === intersectionId,
      );

      if (!intersection) {
        return;
      }

      map.flyTo({
        center: intersection.geometry.coordinates,
        zoom: 14.1,
        duration: 850,
      });
    },
    focusCrashArea(featureIndex) {
      const source = map.getSource("crash-areas");

      if (!source || !pending.crashAreas.features.length) {
        return;
      }

      const feature = pending.crashAreas.features.find(
        (entry) => entry.properties.featureIndex === featureIndex,
      );

      if (!feature) {
        return;
      }

      const bounds = buildBounds(flattenCoordinates(feature.geometry));
      map.fitBounds(bounds, {
        padding: 70,
        duration: 850,
      });
    },
    setLayerVisibility(layers) {
      setVisibility(map, "county-boundary-casing", true);
      setVisibility(map, "county-boundary-line", true);
      setVisibility(map, "county-mask-fill", true);
      setVisibility(map, "crash-areas-fill", layers.crashAreas);
      setVisibility(map, "crash-areas-outline", layers.crashAreas);
      setVisibility(map, "crash-areas-top-fill", layers.crashAreas);
      setVisibility(map, "crash-areas-top-outline", layers.crashAreas);
      setVisibility(map, "crash-areas-highlight", layers.crashAreas);
      setVisibility(map, "traffic-circles", layers.traffic);
      setVisibility(map, "traffic-lines", layers.traffic);
      setVisibility(map, "transit-line", layers.transit);
      setVisibility(map, "sidewalks-line", layers.sidewalks);
      setVisibility(map, "intersections-circle", layers.intersections);
      setVisibility(map, "intersections-highlight", layers.intersections);
    },
    resize() {
      map.resize();
    },
  };
}

function buildCountyMask(collection) {
  const countyFeature = collection.features?.[0];

  if (!countyFeature?.geometry || countyFeature.geometry.type !== "Polygon") {
    return EMPTY_COLLECTION;
  }

  const countyRings = countyFeature.geometry.coordinates.map((ring, index) =>
    normalizeRingOrientation(ring, index === 0 ? "counterclockwise" : "clockwise"),
  );

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            normalizeRingOrientation(
              [
                [-180, -85],
                [180, -85],
                [180, 85],
                [-180, 85],
                [-180, -85],
              ],
              "clockwise",
            ),
            ...countyRings,
          ],
        },
      },
    ],
  };
}

function normalizeRingOrientation(ring, targetDirection) {
  const signedArea = calculateSignedArea(ring);
  const isClockwise = signedArea < 0;
  const wantsClockwise = targetDirection === "clockwise";

  if (isClockwise === wantsClockwise) {
    return ring;
  }

  return [...ring].reverse();
}

function calculateSignedArea(ring) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return area / 2;
}

function addLineLayer(map, id, source, color, width, opacity) {
  map.addLayer({
    id,
    type: "line",
    source,
    paint: {
      "line-color": color,
      "line-width": width,
      "line-opacity": opacity,
    },
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
  });
}

function updateSourceData(map, sourceName, data) {
  const source = map.getSource(sourceName);

  if (!source) {
    return;
  }

  source.setData(data);
}

function setVisibility(map, layerId, visible) {
  if (!map.getLayer(layerId)) {
    return;
  }

  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

function attachInteraction(map, layerId, handler) {
  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", layerId, handler);
}

function showPopup(map, lngLat, html) {
  new window.maplibregl.Popup({
    closeButton: false,
    offset: 16,
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

function intersectionPopup(properties) {
  return `
    <div class="popup-card">
      <h3>${properties.name}</h3>
      <p>${properties.emphasis}</p>
      <ul>
        <li>Modes under pressure: ${properties.modes}</li>
      </ul>
    </div>
  `;
}

function crashPopup(properties) {
  const scoreLine = Number.isFinite(properties.displayScore)
    ? `<li>Crash pressure: ${properties.displayScore}/100</li>`
    : "";
  const scoreLabelLine = properties.displayScoreLabel
    ? `<li>${properties.displayScoreLabel}</li>`
    : "";

  return `
    <div class="popup-card">
      <h3>${properties.displayName}</h3>
      <p>Official Nashville MPO crash-ranked area cell.</p>
      <ul>
        ${scoreLine}
        ${scoreLabelLine}
        <li>Area index: ${properties.featureIndex}</li>
      </ul>
    </div>
  `;
}

function transitPopup(properties) {
  return `
    <div class="popup-card">
      <h3>Route ${properties.routeShortName}</h3>
      <p>${properties.routeLongName}</p>
      <ul>
        <li>Feed mode: ${properties.sourceType}</li>
      </ul>
    </div>
  `;
}

function trafficPopup(properties) {
  const descriptor =
    properties.sourceType === "live"
      ? "Metro-jurisdiction street segment from NDOT's official street layer."
      : "Metro-jurisdiction traffic context segment.";
  const countLine =
    properties.displayCount == null
      ? "<li>Traffic count: not published in this overlay</li>"
      : `<li>Daily traffic count: ${properties.displayCount}</li>`;

  return `
    <div class="popup-card">
      <h3>${properties.displayName}</h3>
      <p>${descriptor}</p>
      <ul>
        ${countLine}
      </ul>
    </div>
  `;
}

function buildBounds(coordinates) {
  const [firstLongitude, firstLatitude] = coordinates[0];
  const bounds = new window.maplibregl.LngLatBounds(
    [firstLongitude, firstLatitude],
    [firstLongitude, firstLatitude],
  );

  coordinates.forEach((coordinate) => bounds.extend(coordinate));
  return bounds;
}

function flattenCoordinates(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }

  if (geometry.type === "LineString") {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.flat();
  }

  if (geometry.type === "Point") {
    return [geometry.coordinates];
  }

  return [];
}
