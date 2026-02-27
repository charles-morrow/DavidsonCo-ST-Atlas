export async function fetchArcGisFeatures({
  endpoint,
  geometry,
  where = "1=1",
  geometryType = "esriGeometryEnvelope",
  spatialRelationship = "esriSpatialRelIntersects",
  inSpatialReference = "4326",
  outSpatialReference = "4326",
  resultRecordCount = 2000,
  extraParams = {},
}) {
  const features = [];
  let resultOffset = 0;
  let keepGoing = true;

  while (keepGoing) {
    const searchParams = new URLSearchParams({
      where,
      inSR: inSpatialReference,
      outFields: "*",
      returnGeometry: "true",
      outSR: outSpatialReference,
      f: "json",
      resultOffset: String(resultOffset),
      resultRecordCount: String(resultRecordCount),
      ...extraParams,
    });

    if (geometry) {
      searchParams.set("geometry", typeof geometry === "string" ? geometry : JSON.stringify(geometry));
      searchParams.set("geometryType", geometryType);
      searchParams.set("spatialRel", spatialRelationship);
    }

    const response = await fetch(`${endpoint}?${searchParams.toString()}`);

    if (!response.ok) {
      throw new Error(`ArcGIS request failed with ${response.status}`);
    }

    const payload = await response.json();

    if (!Array.isArray(payload.features)) {
      throw new Error("ArcGIS response did not include a feature array.");
    }

    features.push(...payload.features);
    keepGoing = Boolean(payload.exceededTransferLimit) && payload.features.length > 0;
    resultOffset += payload.features.length;
  }

  return features;
}

export function arcgisToGeoJson(features) {
  return {
    type: "FeatureCollection",
    features: features
      .map((feature) => convertFeature(feature))
      .filter(Boolean),
  };
}

export function buildPolygonQueryGeometry(geoJsonFeature) {
  if (!geoJsonFeature?.geometry) {
    throw new Error("A polygon boundary is required to build an ArcGIS geometry query.");
  }

  if (geoJsonFeature.geometry.type !== "Polygon") {
    throw new Error("Only Polygon county boundaries are supported for ArcGIS geometry queries.");
  }

  return {
    // ArcGIS query URLs get too large if we send the full county geometry.
    // Use a lighter ring for the request, then apply the precise county clip locally.
    rings: geoJsonFeature.geometry.coordinates.map((ring) => simplifyRingForQuery(ring)),
    spatialReference: { wkid: 4326 },
  };
}

export function buildEnvelopeQueryGeometry(geoJsonFeature) {
  if (!geoJsonFeature?.geometry) {
    throw new Error("A county boundary is required to build an ArcGIS envelope query.");
  }

  const points = flattenGeometryPoints(geoJsonFeature.geometry);

  if (!points.length) {
    throw new Error("County boundary geometry did not include coordinates.");
  }

  const bounds = points.reduce(
    (accumulator, [x, y]) => ({
      xmin: Math.min(accumulator.xmin, x),
      ymin: Math.min(accumulator.ymin, y),
      xmax: Math.max(accumulator.xmax, x),
      ymax: Math.max(accumulator.ymax, y),
    }),
    {
      xmin: Number.POSITIVE_INFINITY,
      ymin: Number.POSITIVE_INFINITY,
      xmax: Number.NEGATIVE_INFINITY,
      ymax: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    ...bounds,
    spatialReference: { wkid: 4326 },
  };
}

function simplifyRingForQuery(ring) {
  if (!Array.isArray(ring) || ring.length <= 240) {
    return ring.map((point) => roundPoint(point));
  }

  const withoutClosingPoint = dropClosingPoint(ring);
  const maxPoints = 220;
  const step = Math.max(1, Math.ceil(withoutClosingPoint.length / maxPoints));
  const simplified = withoutClosingPoint.filter((_, index) => index % step === 0);
  const lastPoint = withoutClosingPoint[withoutClosingPoint.length - 1];
  const firstPoint = withoutClosingPoint[0];

  if (!pointsEqual(simplified[simplified.length - 1], lastPoint)) {
    simplified.push(lastPoint);
  }

  const closedRing = [...simplified.map((point) => roundPoint(point)), roundPoint(firstPoint)];

  return closedRing.length >= 4 ? closedRing : ring.slice(0, 4).map((point) => roundPoint(point));
}

function dropClosingPoint(ring) {
  if (ring.length < 2) {
    return ring;
  }

  return pointsEqual(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
}

function pointsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1];
}

function roundPoint(point) {
  return [roundCoordinate(point[0]), roundCoordinate(point[1])];
}

function roundCoordinate(value) {
  return Math.round(value * 100000) / 100000;
}

function flattenGeometryPoints(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates.flat();
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat(2);
  }

  return [];
}

function convertFeature(feature) {
  const geometry = convertGeometry(feature.geometry);

  if (!geometry) {
    return null;
  }

  return {
    type: "Feature",
    properties: feature.attributes ?? {},
    geometry,
  };
}

function convertGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (Array.isArray(geometry.rings)) {
    return {
      type: "Polygon",
      coordinates: geometry.rings,
    };
  }

  if (Array.isArray(geometry.paths)) {
    return geometry.paths.length === 1
      ? {
          type: "LineString",
          coordinates: geometry.paths[0],
        }
      : {
          type: "MultiLineString",
          coordinates: geometry.paths,
        };
  }

  if (typeof geometry.x === "number" && typeof geometry.y === "number") {
    return {
      type: "Point",
      coordinates: [geometry.x, geometry.y],
    };
  }

  return null;
}
