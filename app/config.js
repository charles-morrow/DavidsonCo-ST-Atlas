export const DAVIDSON_BOUNDS = [-87.12, 35.97, -86.53, 36.39];

export const MAP_CENTER = [-86.78, 36.1627];
export const MAP_ZOOM = 10.6;

export const ARCGIS_ENDPOINTS = {
  countyBoundary:
    "https://maps.nashville.gov/arcgis/rest/services/Basemaps/NashvilleBasemapMuted_SP/MapServer/133/query",
  crashAreas:
    "https://services3.arcgis.com/pXGyp7DHTIE4RXOJ/arcgis/rest/services/High_Crash_Areas_2020_2024/FeatureServer/0/query",
  sidewalks:
    "https://maps.nashville.gov/arcgis/rest/services/SidewalksPro/MapServer/0/query",
  metroOfficialStreets:
    "https://maps.nashville.gov/arcgis/rest/services/Transportation/StreetCenterlines/MapServer/1/query",
};

export const TRANSIT_PROXY_URL = isLocalDevHost() ? "/api/wego-gtfs" : null;

export const TRANSIT_INTEREST_ROUTES = ["3", "7", "22", "23", "29", "52", "55"];

export const SOURCE_LINKS = [
  {
    label: "Davidson County Boundary",
    url: "https://maps.nashville.gov/arcgis/rest/services/Basemaps/NashvilleBasemapMuted_SP/MapServer/133",
  },
  {
    label: "Nashville Sidewalk Centerlines",
    url: "https://maps.nashville.gov/arcgis/rest/services/SidewalksPro/MapServer/0",
  },
  {
    label: "Nashville MPO High Crash Areas 2020-2024",
    url: "https://services3.arcgis.com/pXGyp7DHTIE4RXOJ/arcgis/rest/services/High_Crash_Areas_2020_2024/FeatureServer",
  },
  {
    label: "WeGo Transit GTFS Feed",
    url: "https://www.wegotransit.com/ride/transit-data/",
  },
  {
    label: "NDOT Metro Official Streets and Alleys",
    url: "https://maps.nashville.gov/arcgis/rest/services/Transportation/StreetCenterlines/MapServer/1",
  },
  {
    label: "Nashville Safety Action Plan",
    url: "https://www.nashville.gov/departments/transportation/plans-and-programs/vision-zero/safety-action-plan",
  },
  {
    label: "NDOT HIN Project List",
    url: "https://www.nashville.gov/sites/default/files/2022-08/HIN_Project_List.pdf?ct=1661961752",
  },
  {
    label: "NDOT HIN Local Intersection Improvements",
    url: "https://www.nashville.gov/departments/transportation/projects/high-injury-network",
  },
];

function isLocalDevHost() {
  const hostname = globalThis.location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1";
}
