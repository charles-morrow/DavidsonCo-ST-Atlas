const localReferenceStreetSegments = [
  {
    id: "church-fourth-fifth",
    name: "Church Street",
    from: "3rd Avenue North",
    to: "5th Avenue North",
    source: "NDOT HIN Local Intersection Improvements project page.",
    category: "Metro-jurisdiction reference street",
    transitRoutes: ["3"],
    geometry: [
      [-86.7828, 36.1629],
      [-86.7811, 36.1631],
      [-86.7795, 36.1633],
      [-86.7778, 36.1634],
    ],
  },
  {
    id: "john-lewis-mlk-charlotte",
    name: "Rep. John Lewis Way North",
    from: "Charlotte Avenue",
    to: "Jefferson Street",
    source: "NDOT HIN Local Intersection Improvements project page.",
    category: "Metro-jurisdiction reference street",
    transitRoutes: ["29"],
    geometry: [
      [-86.7861, 36.1607],
      [-86.7859, 36.1639],
      [-86.7857, 36.1664],
      [-86.7854, 36.1706],
    ],
  },
  {
    id: "garfield-delta-approach",
    name: "Garfield Street",
    from: "26th Avenue North",
    to: "28th Avenue North",
    source: "NDOT HIN Local Intersection Improvements project page.",
    category: "Metro-jurisdiction reference street",
    transitRoutes: ["22"],
    geometry: [
      [-86.8007, 36.1782],
      [-86.7975, 36.178],
      [-86.7943, 36.1778],
      [-86.791, 36.1776],
    ],
  },
  {
    id: "bandywood-hillsboro-circle",
    name: "Bandywood Drive",
    from: "Hillsboro Pike",
    to: "Sills Court",
    source: "NDOT HIN Local Intersection Improvements project page.",
    category: "Metro-jurisdiction reference street",
    transitRoutes: ["7"],
    geometry: [
      [-86.8132, 36.1165],
      [-86.8119, 36.1164],
      [-86.8107, 36.1162],
      [-86.8087, 36.1161],
    ],
  },
  {
    id: "fourth-avenue-north",
    name: "4th Avenue North",
    from: "Union Street",
    to: "Charlotte Avenue",
    source: "NDOT HIN Local Intersection Improvements project page.",
    category: "Metro-jurisdiction reference street",
    transitRoutes: ["3"],
    geometry: [
      [-86.7804, 36.1612],
      [-86.7803, 36.1635],
      [-86.7801, 36.166],
      [-86.78, 36.1682],
    ],
  },
];

// These coordinates are only used to place markers for official NDOT intersection projects.
// The project names and descriptions come from Nashville's HIN local intersection improvements page.
const intersectionProjects = [
  {
    id: "garfield-delta",
    name: "Garfield Street & Delta Avenue",
    coordinates: [-86.7943, 36.1778],
    streetHints: [["garfield"], ["delta"]],
    emphasis: "Five-leg North Nashville intersection now under NDOT HIN design review.",
    modes: ["Walking", "Transit", "Driving"],
    source: "NDOT HIN Local Intersection Improvements project page.",
  },
  {
    id: "fourth-church",
    name: "4th Avenue & Church Street",
    coordinates: [-86.77874, 36.16401],
    streetHints: [["4th avenue", "4th ave", "4 avenue"], ["church"]],
    emphasis: "Downtown signal and crosswalk location included in NDOT's five-intersection HIN package.",
    modes: ["Walking", "Driving"],
    source: "NDOT HIN Local Intersection Improvements project page.",
  },
  {
    id: "john-lewis-mlk",
    name: "Rep. John Lewis Way & Dr. Martin Luther King Jr. Blvd",
    coordinates: [-86.77992, 36.16945],
    streetHints: [
      ["john lewis", "rep john lewis", "5th avenue", "5th ave"],
      ["martin luther king", "martin l king", "mlk"],
    ],
    emphasis: "Major downtown crossing identified for timing, striping, and pedestrian safety upgrades.",
    modes: ["Walking", "Driving", "Transit"],
    source: "NDOT HIN Local Intersection Improvements project page.",
  },
  {
    id: "hillsboro-bandywood",
    name: "Hillsboro Circle & Bandywood Drive",
    coordinates: [-86.81921, 36.10523],
    streetHints: [["hillsboro circle", "hillsboro pike", "hillsboro"], ["bandywood"]],
    emphasis: "Green Hills area intersection with planned lane, median, sidewalk, and lighting changes.",
    modes: ["Walking", "Driving"],
    source: "NDOT HIN Local Intersection Improvements project page.",
  },
];

const MAX_INTERSECTION_SNAP_DISTANCE = 0.0015;

export const officialStreetSegments = localReferenceStreetSegments;
export const officialIntersectionProjects = intersectionProjects;
export const localReferenceRoutes = ["3", "7", "22", "23", "29", "52", "55"];

export function streetSegmentsToGeoJson() {
  return {
    type: "FeatureCollection",
    features: officialStreetSegments.map((segment) => ({
      type: "Feature",
      properties: {
        id: segment.id,
        name: segment.name,
        from: segment.from,
        to: segment.to,
        category: segment.category,
        source: segment.source,
        transitRoutes: segment.transitRoutes.join(", "),
      },
      geometry: {
        type: "LineString",
        coordinates: segment.geometry,
      },
    })),
  };
}

export function intersectionsToGeoJson() {
  return buildIntersectionsGeoJson(officialIntersectionProjects);
}

export function resolveIntersectionProjectsFromTraffic(trafficCollection) {
  if (!trafficCollection?.features?.length) {
    return officialIntersectionProjects;
  }

  return officialIntersectionProjects.map((intersection) => {
    const resolvedCoordinates = resolveIntersectionCoordinates(intersection, trafficCollection.features);

    return resolvedCoordinates
      ? {
          ...intersection,
          coordinates: resolvedCoordinates,
        }
      : intersection;
  });
}

export function buildIntersectionsGeoJson(intersections) {
  return {
    type: "FeatureCollection",
    features: intersections.map((intersection) => ({
      type: "Feature",
      properties: {
        id: intersection.id,
        name: intersection.name,
        emphasis: intersection.emphasis,
        modes: intersection.modes.join(", "),
        source: intersection.source,
      },
      geometry: {
        type: "Point",
        coordinates: intersection.coordinates,
      },
    })),
  };
}

function resolveIntersectionCoordinates(intersection, trafficFeatures) {
  const [firstHints, secondHints] = normalizeHintGroups(intersection.streetHints ?? []);

  if (!firstHints.length || !secondHints.length) {
    return null;
  }

  const firstRoadLines = findMatchingLines(trafficFeatures, firstHints, intersection.coordinates);
  const secondRoadLines = findMatchingLines(trafficFeatures, secondHints, intersection.coordinates);
  const intersections = [];

  firstRoadLines.forEach((firstLine) => {
    secondRoadLines.forEach((secondLine) => {
      collectLineIntersections(firstLine.coordinates, secondLine.coordinates, intersections);
    });
  });

  if (!intersections.length) {
    const nearestPair = findNearestLinePair(firstRoadLines, secondRoadLines, intersection.coordinates);
    return keepPointNearAnchor(nearestPair?.midpoint, intersection.coordinates);
  }

  const resolvedPoint = intersections.sort(
    (left, right) =>
      distanceBetween(left, intersection.coordinates) - distanceBetween(right, intersection.coordinates),
  )[0];

  return keepPointNearAnchor(resolvedPoint, intersection.coordinates);
}

function normalizeHintGroups(rawHints) {
  return rawHints.map((entry) => (Array.isArray(entry) ? entry : [entry]));
}

function findMatchingLines(features, hints, anchorPoint) {
  const normalizedHints = hints.map((hint) => normalizeStreetLabel(hint));

  return features
    .filter((feature) => {
      const name = normalizeStreetLabel(feature.properties?.displayName);
      return normalizedHints.some((hint) => name.includes(hint));
    })
    .flatMap((feature) =>
      extractLines(feature.geometry).map((coordinates) => ({
        coordinates,
        distanceToAnchor: distanceFromPointToLine(anchorPoint, coordinates),
      })),
    )
    .sort((left, right) => left.distanceToAnchor - right.distanceToAnchor)
    .slice(0, 6);
}

function extractLines(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
}

function collectLineIntersections(firstLine, secondLine, collector) {
  for (let firstIndex = 0; firstIndex < firstLine.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < secondLine.length - 1; secondIndex += 1) {
      const point = segmentIntersection(
        firstLine[firstIndex],
        firstLine[firstIndex + 1],
        secondLine[secondIndex],
        secondLine[secondIndex + 1],
      );

      if (point) {
        collector.push(point);
      }
    }
  }
}

function findNearestLinePair(firstRoadLines, secondRoadLines, anchorPoint) {
  let bestPair = null;

  firstRoadLines.forEach((firstLine) => {
    secondRoadLines.forEach((secondLine) => {
      const candidate = findNearestPointPair(firstLine.coordinates, secondLine.coordinates);

      if (!candidate) {
        return;
      }

      const anchorDistance = distanceBetween(candidate.midpoint, anchorPoint);

      if (
        !bestPair ||
        candidate.distance < bestPair.distance ||
        (Math.abs(candidate.distance - bestPair.distance) < 1e-10 &&
          anchorDistance < bestPair.anchorDistance)
      ) {
        bestPair = {
          ...candidate,
          anchorDistance,
        };
      }
    });
  });

  return bestPair;
}

function findNearestPointPair(firstLine, secondLine) {
  let bestPair = null;

  for (let firstIndex = 0; firstIndex < firstLine.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < secondLine.length - 1; secondIndex += 1) {
      const candidate = closestPointsBetweenSegments(
        firstLine[firstIndex],
        firstLine[firstIndex + 1],
        secondLine[secondIndex],
        secondLine[secondIndex + 1],
      );

      if (!candidate) {
        continue;
      }

      if (!bestPair || candidate.distance < bestPair.distance) {
        bestPair = candidate;
      }
    }
  }

  return bestPair;
}

function segmentIntersection(startA, endA, startB, endB) {
  const denominator =
    (endA[0] - startA[0]) * (endB[1] - startB[1]) - (endA[1] - startA[1]) * (endB[0] - startB[0]);

  if (Math.abs(denominator) < 1e-10) {
    return null;
  }

  const numeratorA =
    (startA[1] - startB[1]) * (endB[0] - startB[0]) - (startA[0] - startB[0]) * (endB[1] - startB[1]);
  const numeratorB =
    (startA[1] - startB[1]) * (endA[0] - startA[0]) - (startA[0] - startB[0]) * (endA[1] - startA[1]);
  const ratioA = numeratorA / denominator;
  const ratioB = numeratorB / denominator;

  if (ratioA < 0 || ratioA > 1 || ratioB < 0 || ratioB > 1) {
    return null;
  }

  return [
    startA[0] + ratioA * (endA[0] - startA[0]),
    startA[1] + ratioA * (endA[1] - startA[1]),
  ];
}

function closestPointsBetweenSegments(startA, endA, startB, endB) {
  const exactIntersection = segmentIntersection(startA, endA, startB, endB);

  if (exactIntersection) {
    return {
      distance: 0,
      midpoint: exactIntersection,
    };
  }

  const candidates = [
    projectPointToSegment(startA, startB, endB),
    projectPointToSegment(endA, startB, endB),
    projectPointToSegment(startB, startA, endA),
    projectPointToSegment(endB, startA, endA),
  ];

  return candidates
    .map((candidate) => ({
      distance: distanceBetween(candidate.point, candidate.projectedPoint),
      midpoint: midpoint(candidate.point, candidate.projectedPoint),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
}

function projectPointToSegment(point, start, end) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared === 0) {
    return {
      point,
      projectedPoint: start,
    };
  }

  const rawRatio =
    ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / lengthSquared;
  const ratio = Math.max(0, Math.min(1, rawRatio));

  return {
    point,
    projectedPoint: [start[0] + ratio * deltaX, start[1] + ratio * deltaY],
  };
}

function distanceFromPointToLine(point, line) {
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < line.length - 1; index += 1) {
    const candidate = projectPointToSegment(point, line[index], line[index + 1]);
    bestDistance = Math.min(bestDistance, distanceBetween(point, candidate.projectedPoint));
  }

  return bestDistance;
}

function midpoint(left, right) {
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

function keepPointNearAnchor(candidate, anchorPoint) {
  if (!candidate) {
    return null;
  }

  return distanceBetween(candidate, anchorPoint) <= MAX_INTERSECTION_SNAP_DISTANCE
    ? candidate
    : anchorPoint;
}

function normalizeStreetLabel(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.&]/g, " ")
    .replace(/\bjr\b/g, "jr")
    .replace(/\bdr\b/g, "dr")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceBetween(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
