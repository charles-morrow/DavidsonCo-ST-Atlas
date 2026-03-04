const EMPTY_COLLECTION = {
  type: "FeatureCollection",
  features: [],
};

const AREA_HINTS = {
  downtown: {
    center: [-86.7792, 36.1642],
    radiusFeet: 2200,
  },
  "downtown-north": {
    center: [-86.7798, 36.1692],
    radiusFeet: 2600,
  },
  "north-nashville": {
    center: [-86.7944, 36.1776],
    radiusFeet: 3200,
  },
  "green-hills": {
    center: [-86.819, 36.1053],
    radiusFeet: 3200,
  },
  "brick-church": {
    center: [-86.7635, 36.2322],
    radiusFeet: 4200,
  },
};

export function normalizeStreetLabel(value) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bCIRCLE\b/g, "CIR")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bPIKE\b/g, "PIKE")
    .replace(/\bPARKWAY\b/g, "PKWY")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bJR\b/g, "JR")
    .replace(/\bMARTIN LUTHER KING\b/g, "MARTIN L KING")
    .replace(/\bREPRESENTATIVE\b/g, "REP")
    .replace(/\bREPUBLICAN\b/g, "REP")
    .replace(/\bMOUNT\b/g, "MT")
    .replace(/\bPK\b/g, "PIKE")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

export function buildStreetGraph(trafficCollection) {
  const features = [];
  const nodes = new Map();

  trafficCollection?.features?.forEach((feature) => {
    const normalizedFeature = normalizeStreetFeature(feature);

    if (!normalizedFeature) {
      return;
    }

    features.push(normalizedFeature);

    normalizedFeature.lines.forEach((line) => {
      line.forEach((coordinate, index) => {
        const node = ensureNode(nodes, coordinate);
        node.memberFeatureIds.add(normalizedFeature.id);
        node.streetNames.add(normalizedFeature.normalizedName);
        normalizedFeature.nodeKeys.add(node.key);

        if (index > 0) {
          node.segmentFeatureIds.add(normalizedFeature.id);
        }
      });
    });
  });

  return {
    features,
    nodes,
  };
}

export function resolveIntersectionProjects(registry, trafficCollection) {
  const graph = buildStreetGraph(trafficCollection);
  const projects = registry.map((definition) => resolveIntersectionDefinition(definition, graph));
  const resolvedCount = projects.filter((project) => project.resolved).length;
  const totalCount = projects.length;
  const unresolvedNames = projects.filter((project) => !project.resolved).map((project) => project.name);

  return {
    projects,
    summary: {
      totalCount,
      resolvedCount,
      unresolvedCount: totalCount - resolvedCount,
      unresolvedNames,
    },
    detail:
      totalCount === 0
        ? "No official NDOT intersection definitions are configured."
        : resolvedCount === totalCount
          ? `All ${totalCount} official intersection projects resolved from NDOT street geometry.`
          : `${resolvedCount} of ${totalCount} official intersection projects resolved from NDOT street geometry.`,
  };
}

export function resolveIntersectionDefinition(definition, graph) {
  const streetA = collectStreetCandidates(definition.streetA, graph, definition.validation);
  const streetB = collectStreetCandidates(definition.streetB, graph, definition.validation);
  const nodeCandidates = collectSharedNodeCandidates(definition, graph, streetA, streetB);
  const sharedNodeCandidate = scoreCandidateNodes(definition, nodeCandidates)[0] ?? null;

  if (sharedNodeCandidate) {
    return buildResolvedProject(definition, sharedNodeCandidate);
  }

  const nearestApproachCandidate = scoreNearestApproachCandidates(
    definition,
    collectNearestApproachCandidates(definition, streetA, streetB),
  )[0] ?? null;

  if (nearestApproachCandidate) {
    return buildResolvedProject(definition, nearestApproachCandidate);
  }

  return buildUnresolvedProject(definition, streetA.length || streetB.length ? "unresolved" : "missing-streets");
}

export function scoreCandidateNodes(definition, candidates) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      candidateScore:
        candidate.matchScore * 100000 +
        candidate.areaDistanceFeet * 2 +
        candidate.resolutionDistanceFeet,
    }))
    .sort((left, right) => left.candidateScore - right.candidateScore)
    .filter((candidate) => candidate.confidence !== "low");
}

export function buildIntersectionGeoJson(resolvedProjects) {
  return {
    type: "FeatureCollection",
    features: resolvedProjects
      .filter((project) => project.resolved && project.coordinates)
      .map((project) => ({
        type: "Feature",
        properties: {
          id: project.id,
          name: project.name,
          emphasis: project.emphasis,
          modes: project.modes.join(", "),
          source: project.source,
          resolutionType: project.resolutionType,
          confidence: project.confidence,
          resolutionDistanceFeet: project.resolutionDistanceFeet,
          geometrySource: "NDOT Metro Official Streets and Alleys",
          resolutionSummary: project.resolutionSummary,
        },
        geometry: {
          type: "Point",
          coordinates: project.coordinates,
        },
      })),
  };
}

export function buildUnresolvedIntersectionSeed(registry) {
  return registry.map((definition) => buildUnresolvedProject(definition, "pending"));
}

function normalizeStreetFeature(feature) {
  const displayName = String(feature?.properties?.displayName ?? "").trim();
  const normalizedName = normalizeStreetLabel(
    feature?.properties?.normalizedStreetName ?? displayName,
  );
  const matchStreetNames =
    Array.isArray(feature?.properties?.matchStreetNames) && feature.properties.matchStreetNames.length
      ? feature.properties.matchStreetNames
      : buildMatchNames(displayName);

  if (!displayName || !normalizedName) {
    return null;
  }

  const lines = extractLines(feature.geometry).filter((line) => line.length >= 2);

  if (!lines.length) {
    return null;
  }

  return {
    id: feature.properties?.sourceObjectId ?? feature.properties?.featureIndex ?? displayName,
    displayName,
    normalizedName,
    matchNames: new Set(matchStreetNames),
    geometry: feature.geometry,
    lines,
    nodeKeys: new Set(),
  };
}

function collectStreetCandidates(streetDefinition, graph, validation) {
  const allowedNames = buildStreetDefinitionNames(streetDefinition);
  const areaHint = AREA_HINTS[validation?.expectedArea] ?? null;

  return graph.features
    .map((feature) => {
      const matchScore = scoreStreetNameMatch(feature, streetDefinition, allowedNames);

      if (matchScore == null) {
        return null;
      }

      const areaDistanceFeet = areaHint
        ? Math.min(...feature.lines.map((line) => feetFromPointToLine(areaHint.center, line)))
        : 0;

      return {
        ...feature,
        matchScore,
        areaDistanceFeet,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.matchScore !== right.matchScore) {
        return left.matchScore - right.matchScore;
      }

      return left.areaDistanceFeet - right.areaDistanceFeet;
    })
    .slice(0, 12);
}

function buildStreetDefinitionNames(streetDefinition) {
  return new Map(
    [streetDefinition.canonicalName, ...(streetDefinition.aliases ?? [])].map((name, index) => [
      normalizeStreetLabel(name),
      index === 0 ? 0 : 1,
    ]),
  );
}

function scoreStreetNameMatch(feature, streetDefinition, allowedNames) {
  let bestScore = null;

  allowedNames.forEach((score, allowedName) => {
    if (feature.matchNames.has(allowedName)) {
      bestScore = bestScore == null ? score : Math.min(bestScore, score);
      return;
    }

    const looseMatchScore = scoreLooseStreetMatch(feature.matchNames, allowedName, score);

    if (looseMatchScore != null) {
      bestScore = bestScore == null ? looseMatchScore : Math.min(bestScore, looseMatchScore);
    }
  });

  if (bestScore == null) {
    return null;
  }

  if (streetDefinition.preferredDirection) {
    const directionMatch = [...feature.matchNames].some((name) =>
      name.endsWith(` ${streetDefinition.preferredDirection}`),
    );
    return directionMatch ? bestScore : bestScore + 1;
  }

  return bestScore;
}

function collectSharedNodeCandidates(definition, graph, streetAFeatures, streetBFeatures) {
  const areaHint = AREA_HINTS[definition.validation?.expectedArea] ?? null;
  const candidates = [];

  streetAFeatures.forEach((streetAFeature) => {
    streetBFeatures.forEach((streetBFeature) => {
      const intersections = collectLineIntersections(streetAFeature.lines, streetBFeature.lines);

      intersections.forEach((coordinate) => {
        const areaDistanceFeet = areaHint ? feetBetweenCoordinates(coordinate, areaHint.center) : 0;

        candidates.push({
          coordinates: coordinate,
          resolutionType: "shared-node",
          matchScore: streetAFeature.matchScore + streetBFeature.matchScore,
          areaDistanceFeet,
          resolutionDistanceFeet: 0,
          confidence: classifyConfidence(
            definition,
            "shared-node",
            0,
            streetAFeature.matchScore + streetBFeature.matchScore,
            areaDistanceFeet,
          ),
          streetNames: [streetAFeature.displayName, streetBFeature.displayName],
          sourceObjectIds: [streetAFeature.id, streetBFeature.id],
          supportingFeatureIds: [streetAFeature.id, streetBFeature.id],
        });
      });
    });
  });

  return candidates;
}

function collectNearestApproachCandidates(definition, streetAFeatures, streetBFeatures) {
  const areaHint = AREA_HINTS[definition.validation?.expectedArea] ?? null;
  const candidates = [];

  streetAFeatures.forEach((streetAFeature) => {
    streetBFeatures.forEach((streetBFeature) => {
      const closest = closestPointsBetweenLines(streetAFeature.lines, streetBFeature.lines);

      if (!closest) {
        return;
      }

      const areaDistanceFeet = areaHint
        ? feetBetweenCoordinates(closest.midpoint, areaHint.center)
        : 0;

      candidates.push({
        coordinates: closest.midpoint,
        resolutionType: "nearest-approach",
        matchScore: streetAFeature.matchScore + streetBFeature.matchScore,
        areaDistanceFeet,
        resolutionDistanceFeet: closest.distanceFeet,
        confidence: classifyConfidence(
          definition,
          "nearest-approach",
          closest.distanceFeet,
          streetAFeature.matchScore + streetBFeature.matchScore,
          areaDistanceFeet,
        ),
        streetNames: [streetAFeature.displayName, streetBFeature.displayName],
        sourceObjectIds: [streetAFeature.id, streetBFeature.id],
        supportingFeatureIds: [streetAFeature.id, streetBFeature.id],
      });
    });
  });

  return candidates;
}

function scoreNearestApproachCandidates(definition, candidates) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      candidateScore:
        candidate.matchScore * 100000 +
        candidate.areaDistanceFeet * 2 +
        candidate.resolutionDistanceFeet * 4,
    }))
    .sort((left, right) => left.candidateScore - right.candidateScore)
    .filter((candidate) => candidate.confidence !== "low");
}

function buildResolvedProject(definition, candidate) {
  return {
    ...definition,
    coordinates: candidate.coordinates,
    resolved: true,
    resolutionType: candidate.resolutionType,
    confidence: candidate.confidence,
    resolutionDistanceFeet: Math.round(candidate.resolutionDistanceFeet),
    resolutionSummary: buildResolutionSummary(candidate),
    resolvedStreetNames: candidate.streetNames,
    sourceObjectIds: candidate.sourceObjectIds,
  };
}

function buildUnresolvedProject(definition, resolutionType) {
  return {
    ...definition,
    coordinates: null,
    resolved: false,
    resolutionType,
    confidence: "none",
    resolutionDistanceFeet: null,
    resolutionSummary:
      resolutionType === "pending"
        ? "Waiting on NDOT street geometry."
        : resolutionType === "missing-streets"
          ? "The needed NDOT street records were not available in this session."
          : "The loaded NDOT street geometry did not resolve this project confidently.",
    resolvedStreetNames: [],
    sourceObjectIds: [],
  };
}

function classifyConfidence(
  definition,
  resolutionType,
  resolutionDistanceFeet,
  matchScore,
  areaDistanceFeet,
) {
  const maxNodeDistanceFeet = definition.matchRules?.maxNodeDistanceFeet ?? 150;
  const areaHint = AREA_HINTS[definition.validation?.expectedArea] ?? null;
  const withinExpectedArea = !areaHint || areaDistanceFeet <= areaHint.radiusFeet;

  if (resolutionType === "shared-node" && withinExpectedArea) {
    return matchScore <= 1 ? "high" : "medium";
  }

  if (withinExpectedArea && resolutionDistanceFeet <= maxNodeDistanceFeet && matchScore <= 3) {
    return "medium";
  }

  return "low";
}

function buildResolutionSummary(candidate) {
  if (candidate.resolutionType === "shared-node") {
    return "Resolved from a shared NDOT street node.";
  }

  return `Resolved from the nearest NDOT street approach (${Math.round(candidate.resolutionDistanceFeet)} feet).`;
}

function ensureNode(nodes, coordinate) {
  const key = buildNodeKey(coordinate);

  if (!nodes.has(key)) {
    nodes.set(key, {
      key,
      coordinate,
      memberFeatureIds: new Set(),
      segmentFeatureIds: new Set(),
      streetNames: new Set(),
    });
  }

  return nodes.get(key);
}

function buildNodeKey(coordinate) {
  return `${coordinate[0].toFixed(6)}:${coordinate[1].toFixed(6)}`;
}

function buildMatchNames(displayName) {
  const normalized = normalizeStreetLabel(displayName);

  return Array.from(
    new Set([
      normalized,
      normalized.replace(/\s+[NSEW]$/, "").trim(),
      normalized.replace(/\bAVE\b/g, "AVENUE"),
      normalized.replace(/\bBLVD\b/g, "BOULEVARD"),
      normalized.replace(/\bCIR\b/g, "CIRCLE"),
      normalized.replace(/\bDR\b/g, "DRIVE"),
      normalized.replace(/\bST\b/g, "STREET"),
      normalized.replace(/\bPIKE\b/g, "PK"),
    ]),
  ).map((name) => normalizeStreetLabel(name));
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

function closestPointsBetweenLines(firstLines, secondLines) {
  let bestCandidate = null;

  firstLines.forEach((firstLine) => {
    secondLines.forEach((secondLine) => {
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

          if (!bestCandidate || candidate.distanceFeet < bestCandidate.distanceFeet) {
            bestCandidate = candidate;
          }
        }
      }
    });
  });

  return bestCandidate;
}

function collectLineIntersections(firstLines, secondLines) {
  const intersections = [];

  firstLines.forEach((firstLine) => {
    secondLines.forEach((secondLine) => {
      for (let firstIndex = 0; firstIndex < firstLine.length - 1; firstIndex += 1) {
        for (let secondIndex = 0; secondIndex < secondLine.length - 1; secondIndex += 1) {
          const intersection = segmentIntersection(
            firstLine[firstIndex],
            firstLine[firstIndex + 1],
            secondLine[secondIndex],
            secondLine[secondIndex + 1],
          );

          if (intersection) {
            intersections.push(intersection);
          }
        }
      }
    });
  });

  return dedupeCoordinates(intersections);
}

function closestPointsBetweenSegments(startA, endA, startB, endB) {
  const exactIntersection = segmentIntersection(startA, endA, startB, endB);

  if (exactIntersection) {
    return {
      midpoint: exactIntersection,
      distanceFeet: 0,
    };
  }

  const candidates = [
    projectPointToSegment(startA, startB, endB),
    projectPointToSegment(endA, startB, endB),
    projectPointToSegment(startB, startA, endA),
    projectPointToSegment(endB, startA, endA),
  ].map((candidate) => ({
    midpoint: midpoint(candidate.point, candidate.projectedPoint),
    distanceFeet: feetBetweenCoordinates(candidate.point, candidate.projectedPoint),
  }));

  return candidates.sort((left, right) => left.distanceFeet - right.distanceFeet)[0] ?? null;
}

function segmentIntersection(startA, endA, startB, endB) {
  const denominator =
    (endA[0] - startA[0]) * (endB[1] - startB[1]) - (endA[1] - startA[1]) * (endB[0] - startB[0]);

  if (Math.abs(denominator) < 1e-12) {
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

function projectPointToSegment(point, start, end) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (!lengthSquared) {
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

function midpoint(left, right) {
  return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
}

function feetFromPointToLine(point, line) {
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < line.length - 1; index += 1) {
    const candidate = projectPointToSegment(point, line[index], line[index + 1]);
    bestDistance = Math.min(bestDistance, feetBetweenCoordinates(point, candidate.projectedPoint));
  }

  return bestDistance;
}

function feetBetweenCoordinates(left, right) {
  const averageLatitude = ((left[1] + right[1]) / 2) * (Math.PI / 180);
  const feetPerDegreeLatitude = 364000;
  const feetPerDegreeLongitude = Math.cos(averageLatitude) * 288200;
  const deltaX = (left[0] - right[0]) * feetPerDegreeLongitude;
  const deltaY = (left[1] - right[1]) * feetPerDegreeLatitude;

  return Math.hypot(deltaX, deltaY);
}

function dedupeCoordinates(coordinates) {
  return Array.from(
    new Map(
      coordinates.map((coordinate) => [
        `${coordinate[0].toFixed(6)}:${coordinate[1].toFixed(6)}`,
        coordinate,
      ]),
    ).values(),
  );
}

function scoreLooseStreetMatch(featureNames, allowedName, baseScore) {
  const allowedTokens = tokenizeStreetName(allowedName);

  if (!allowedTokens.length) {
    return null;
  }

  for (const featureName of featureNames) {
    const featureTokens = tokenizeStreetName(featureName);

    if (allowedTokens.every((token) => featureTokens.includes(token))) {
      return baseScore + 2;
    }
  }

  return null;
}

function tokenizeStreetName(value) {
  return normalizeStreetLabel(value)
    .split(" ")
    .filter((token) => token && !STOP_TOKENS.has(token));
}

const STOP_TOKENS = new Set(["N", "S", "E", "W", "AVE", "ST", "DR", "RD", "BLVD", "CIR"]);

export { EMPTY_COLLECTION };
