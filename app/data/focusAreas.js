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

export const officialStreetSegments = localReferenceStreetSegments;
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
