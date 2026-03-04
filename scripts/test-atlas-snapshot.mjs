import assert from "node:assert/strict";

import { atlasSnapshot } from "../app/data/generatedAtlasSnapshot.js";
import { buildLiveDataFromSnapshot, hasAtlasSnapshot } from "../app/services/snapshotService.js";

assert.ok(atlasSnapshot);
assert.ok(atlasSnapshot.layers);
assert.ok(atlasSnapshot.summaries);
assert.ok(atlasSnapshot.statuses);

for (const key of ["crashAreas", "traffic", "intersections", "sidewalks", "transit"]) {
  assert.equal(atlasSnapshot.layers[key]?.type, "FeatureCollection");
  assert.ok(Array.isArray(atlasSnapshot.layers[key]?.features));
  assert.ok(atlasSnapshot.statuses[key]);
}

const prepared = buildLiveDataFromSnapshot(atlasSnapshot);
assert.ok(prepared.liveData.crashAreas);
assert.ok(prepared.liveData.traffic);
assert.ok(prepared.liveData.intersections);
assert.ok(prepared.liveData.sidewalks);
assert.ok(prepared.liveData.transit);

if (atlasSnapshot.generatedAt) {
  assert.equal(hasAtlasSnapshot(atlasSnapshot), true);
} else {
  assert.equal(hasAtlasSnapshot(atlasSnapshot), false);
}

console.log("atlas snapshot checks passed");
