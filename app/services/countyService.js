import { davidsonCountyBoundary } from "../data/davidsonCountyBoundary.js";

export async function fetchDavidsonCountyBoundary() {
  return {
    clipFeature: davidsonCountyBoundary,
    maskFeature: davidsonCountyBoundary,
    displayFeature: davidsonCountyBoundary,
    mode: "local",
    detail:
      "Davidson County boundary is loaded from a checked-in local copy of Nashville's official county boundary geometry.",
  };
}
