import { ARCGIS_ENDPOINTS } from "../config.js";
import { arcgisToGeoJson, buildEnvelopeQueryGeometry, fetchArcGisFeatures } from "./arcgisHelpers.js";
import { constrainCollectionToCounty } from "./geometryService.js";

export async function fetchSidewalkGeoJson(countyFeature) {
  const features = await fetchArcGisFeatures({
    endpoint: ARCGIS_ENDPOINTS.sidewalks,
    geometry: buildEnvelopeQueryGeometry(countyFeature),
    geometryType: "esriGeometryEnvelope",
    extraParams: {
      maxAllowableOffset: "0.00012",
    },
  });

  return constrainCollectionToCounty(arcgisToGeoJson(features), countyFeature);
}
