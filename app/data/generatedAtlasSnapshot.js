export const atlasSnapshot = {
  generatedAt: null,
  sources: {
    crashAreas: null,
    traffic: null,
    intersections: null,
    sidewalks: null,
    transit: null,
  },
  layers: {
    crashAreas: {
      type: "FeatureCollection",
      features: [],
    },
    traffic: {
      type: "FeatureCollection",
      features: [],
    },
    intersections: {
      type: "FeatureCollection",
      features: [],
    },
    sidewalks: {
      type: "FeatureCollection",
      features: [],
    },
    transit: {
      type: "FeatureCollection",
      features: [],
    },
  },
  summaries: {
    crashAreas: null,
    traffic: null,
    intersections: null,
    sidewalks: null,
    transit: null,
  },
  statuses: {
    crashAreas: {
      status: "idle",
      detail: "No deploy-time crash snapshot is available in this checkout.",
    },
    traffic: {
      status: "idle",
      detail: "No deploy-time traffic snapshot is available in this checkout.",
    },
    intersections: {
      status: "idle",
      detail: "No deploy-time intersection snapshot is available in this checkout.",
    },
    sidewalks: {
      status: "idle",
      detail: "No deploy-time sidewalk snapshot is available in this checkout.",
    },
    transit: {
      status: "idle",
      detail: "No deploy-time transit snapshot is available in this checkout.",
    },
  },
  metadata: {
    intersectionProjects: [],
  },
};
