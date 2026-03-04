import assert from "node:assert/strict";

import {
  buildIntersectionGeoJson,
  resolveIntersectionProjects,
} from "../app/services/intersectionResolver.js";

const sharedNodeTraffic = {
  type: "FeatureCollection",
  features: [
    lineFeature(1, "4th Ave N", [
      [-86.78, 36.163],
      [-86.78, 36.164],
      [-86.78, 36.165],
    ]),
    lineFeature(2, "Church St", [
      [-86.781, 36.164],
      [-86.78, 36.164],
      [-86.779, 36.164],
    ]),
  ],
};

const dividedRoadTraffic = {
  type: "FeatureCollection",
  features: [
    lineFeature(3, "Hillsboro Cir", [
      [-86.8202, 36.1046],
      [-86.8187, 36.1062],
    ]),
    lineFeature(4, "Bandywood Dr", [
      [-86.8195, 36.1051],
      [-86.8181, 36.1051],
    ]),
  ],
};

const aliasTraffic = {
  type: "FeatureCollection",
  features: [
    lineFeature(5, "5th Ave N", [
      [-86.7803, 36.1686],
      [-86.7803, 36.1703],
    ]),
    lineFeature(6, "Dr Martin Luther King Jr Blvd", [
      [-86.7812, 36.1694],
      [-86.7795, 36.1694],
    ]),
  ],
};

const unresolvedTraffic = {
  type: "FeatureCollection",
  features: [lineFeature(7, "Garfield St", [[-86.79, 36.17], [-86.788, 36.17]])],
};

const sharedNodeDefinitions = [
  {
    id: "fourth-church",
    name: "4th Avenue & Church Street",
    source: "test",
    emphasis: "test",
    modes: ["Walking"],
    ndotProjectKey: "test",
    streetA: { canonicalName: "4TH AVE N", aliases: ["4TH AVE"], preferredDirection: "N" },
    streetB: { canonicalName: "CHURCH ST", aliases: [], preferredDirection: null },
    matchRules: { maxNodeDistanceFeet: 140, requireSharedNodeOrNearestApproach: true },
    fallbackStrategy: "hide-if-unresolved",
    validation: { expectedArea: "downtown" },
  },
];

const aliasDefinitions = [
  {
    id: "john-lewis-mlk",
    name: "Rep. John Lewis Way & Dr. Martin Luther King Jr. Blvd",
    source: "test",
    emphasis: "test",
    modes: ["Walking"],
    ndotProjectKey: "test",
    streetA: {
      canonicalName: "REP JOHN LEWIS WAY N",
      aliases: ["5TH AVE N"],
      preferredDirection: "N",
    },
    streetB: {
      canonicalName: "DR MARTIN L KING JR BLVD",
      aliases: ["MARTIN LUTHER KING JR BLVD"],
      preferredDirection: null,
    },
    matchRules: { maxNodeDistanceFeet: 160, requireSharedNodeOrNearestApproach: true },
    fallbackStrategy: "hide-if-unresolved",
    validation: { expectedArea: "downtown-north" },
  },
];

const dividedRoadDefinitions = [
  {
    id: "hillsboro-bandywood",
    name: "Hillsboro Circle & Bandywood Drive",
    source: "test",
    emphasis: "test",
    modes: ["Walking"],
    ndotProjectKey: "test",
    streetA: { canonicalName: "HILLSBORO CIR", aliases: ["HILLSBORO CIRCLE"], preferredDirection: null },
    streetB: { canonicalName: "BANDYWOOD DR", aliases: [], preferredDirection: null },
    matchRules: { maxNodeDistanceFeet: 180, requireSharedNodeOrNearestApproach: true },
    fallbackStrategy: "hide-if-unresolved",
    validation: { expectedArea: "green-hills" },
  },
];

const unresolvedDefinitions = [
  {
    id: "missing",
    name: "Missing",
    source: "test",
    emphasis: "test",
    modes: ["Walking"],
    ndotProjectKey: "test",
    streetA: { canonicalName: "EWING DR", aliases: [], preferredDirection: null },
    streetB: { canonicalName: "DELTA AVE", aliases: [], preferredDirection: null },
    matchRules: { maxNodeDistanceFeet: 120, requireSharedNodeOrNearestApproach: true },
    fallbackStrategy: "hide-if-unresolved",
    validation: { expectedArea: "brick-church" },
  },
];

const sharedNodeResult = resolveIntersectionProjects(sharedNodeDefinitions, sharedNodeTraffic);
assert.equal(sharedNodeResult.projects[0].resolved, true);
assert.equal(sharedNodeResult.projects[0].resolutionType, "shared-node");

const aliasResult = resolveIntersectionProjects(aliasDefinitions, aliasTraffic);
assert.equal(aliasResult.projects[0].resolved, true);
assert.equal(aliasResult.projects[0].confidence, "high");

const dividedRoadResult = resolveIntersectionProjects(dividedRoadDefinitions, dividedRoadTraffic);
assert.equal(dividedRoadResult.projects[0].resolved, true);
assert.equal(dividedRoadResult.projects[0].resolutionType, "nearest-approach");

const unresolvedResult = resolveIntersectionProjects(unresolvedDefinitions, unresolvedTraffic);
assert.equal(unresolvedResult.projects[0].resolved, false);
assert.equal(buildIntersectionGeoJson(unresolvedResult.projects).features.length, 0);

console.log("intersection resolver checks passed");

function lineFeature(objectId, displayName, coordinates) {
  return {
    type: "Feature",
    properties: {
      sourceObjectId: objectId,
      displayName,
      normalizedStreetName: displayName,
      matchStreetNames: [],
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}
