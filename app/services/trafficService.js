import { ARCGIS_ENDPOINTS } from "../config.js";
import { arcgisToGeoJson, buildEnvelopeQueryGeometry, fetchArcGisFeatures } from "./arcgisHelpers.js";
import { constrainCollectionToCounty } from "./geometryService.js";
import { isMetroJurisdictionLabel, pickFirstMatchingProperty } from "./jurisdictionService.js";
import { normalizeStreetLabel } from "./intersectionResolver.js";

export async function fetchTrafficCounts(countyFeature) {
  const features = await fetchArcGisFeatures({
    endpoint: ARCGIS_ENDPOINTS.metroOfficialStreets,
    geometry: buildEnvelopeQueryGeometry(countyFeature),
    geometryType: "esriGeometryEnvelope",
    where: "IS_STATE_ROUTE = 0",
  });
  const geoJson = constrainCollectionToCounty(arcgisToGeoJson(features), countyFeature);
  const normalizedFeatures = geoJson.features
    .map((feature, index) => normalizeStreetFeature(feature, index))
    .filter(Boolean);

  return {
    data: {
      type: "FeatureCollection",
      features: normalizedFeatures,
    },
    mode: "live",
    detail:
      "Traffic context came from NDOT's Metro Official Streets and Alleys layer, filtered to Metro-jurisdiction streets inside Davidson County.",
    summary: buildTrafficSummary(normalizedFeatures),
  };
}

function normalizeStreetFeature(feature, index) {
  if (!["LineString", "MultiLineString"].includes(feature.geometry.type)) {
    return null;
  }

  const label = pickFirstMatchingProperty(feature.properties, [
    "FULL_STREET_NAME",
    "Full_Street_Name",
    "STREET_NAME",
    "Street_Name",
    "STREETNAME",
    "NAME",
    "Name",
  ]);

  if (!isMetroJurisdictionLabel(label)) {
    return null;
  }

  const normalizedStreetName = normalizeStreetLabel(label);
  const sourceObjectId =
    feature.properties?.OBJECTID ??
    feature.properties?.ObjectId ??
    feature.properties?.OBJECTID_1 ??
    feature.properties?.featureIndex ??
    index + 1;

  return {
    ...feature,
    properties: {
      ...feature.properties,
      featureIndex: index + 1,
      sourceObjectId,
      displayName: label || `Metro street ${index + 1}`,
      normalizedStreetName,
      matchStreetNames: buildStreetNameVariants(label),
      displayCount: null,
      sourceType: "live",
    },
  };
}

function buildStreetNameVariants(label) {
  const normalized = normalizeStreetLabel(label);

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
      normalized.replace(/\bPK\b/g, "PIKE"),
    ]),
  ).map((name) => normalizeStreetLabel(name));
}

function buildTrafficSummary(features) {
  return {
    totalStations: features.length,
    topStations: features.slice(0, 12).map((feature) => ({
      featureIndex: feature.properties.featureIndex,
      name: feature.properties.displayName,
      count: feature.properties.displayCount,
      sourceType: feature.properties.sourceType,
    })),
  };
}
