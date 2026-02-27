export function pointInCounty(point, countyFeature) {
  const rings = countyFeature?.geometry?.coordinates ?? [];

  return rings.some((ring) => pointInRing(point, ring));
}

export function constrainCollectionToCounty(collection, countyFeature) {
  return {
    type: "FeatureCollection",
    features: collection.features
      .map((feature) => constrainFeatureToCounty(feature, countyFeature))
      .filter(Boolean),
  };
}

function constrainFeatureToCounty(feature, countyFeature) {
  if (!feature?.geometry) {
    return null;
  }

  if (feature.geometry.type === "Point") {
    return pointInCounty(feature.geometry.coordinates, countyFeature) ? feature : null;
  }

  if (feature.geometry.type === "LineString") {
    const coordinates = feature.geometry.coordinates.filter((point) =>
      pointInCounty(point, countyFeature),
    );

    if (coordinates.length < 2) {
      return null;
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates,
      },
    };
  }

  if (feature.geometry.type === "MultiLineString") {
    const coordinates = feature.geometry.coordinates
      .map((line) => line.filter((point) => pointInCounty(point, countyFeature)))
      .filter((line) => line.length >= 2);

    if (!coordinates.length) {
      return null;
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates,
      },
    };
  }

  if (feature.geometry.type === "Polygon") {
    return polygonTouchesCounty(feature.geometry.coordinates, countyFeature) ? feature : null;
  }

  if (feature.geometry.type === "MultiPolygon") {
    return polygonTouchesCounty(feature.geometry.coordinates.flat(), countyFeature) ? feature : null;
  }

  return feature;
}

function polygonTouchesCounty(rings, countyFeature) {
  return rings.some((ring) => ring.some((point) => pointInCounty(point, countyFeature)));
}

function pointInRing(point, ring) {
  let inside = false;
  const [x, y] = point;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > y !== y2 > y &&
      x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
