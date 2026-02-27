import { ARCGIS_ENDPOINTS } from "../config.js";
import { arcgisToGeoJson, buildEnvelopeQueryGeometry, fetchArcGisFeatures } from "./arcgisHelpers.js";
import { constrainCollectionToCounty } from "./geometryService.js";
import { isMetroJurisdictionLabel, pickFirstMatchingProperty } from "./jurisdictionService.js";

export async function fetchOfficialCrashAreas(countyFeature) {
  const features = await fetchArcGisFeatures({
    endpoint: ARCGIS_ENDPOINTS.crashAreas,
    geometry: buildEnvelopeQueryGeometry(countyFeature),
    geometryType: "esriGeometryEnvelope",
  });

  const geoJson = constrainCollectionToCounty(
    normalizeCrashAreas(arcgisToGeoJson(features)),
    countyFeature,
  );

  return {
    data: geoJson,
    mode: "live",
    detail: "Crash-ranked areas came from the Nashville MPO High Crash Areas 2020-2024 service.",
    summary: buildCrashSummary(geoJson.features),
  };
}

function normalizeCrashAreas(collection) {
  const scoreProfile = inferCrashScoreProfile(collection.features);
  const labelKeys = inferLabelKeys(collection.features);

  const normalizedFeatures = collection.features.map((feature, index) => {
    const label = pickFirstValue(feature.properties, labelKeys);
    const crashScore = buildCrashScore(feature.properties, scoreProfile, index, collection.features.length);

    return {
      ...feature,
      properties: {
        ...feature.properties,
        featureIndex: index + 1,
        displayName: label || `Crash area ${index + 1}`,
        displayScore: crashScore.normalized,
        displayScoreRaw: crashScore.raw,
        displayScoreLabel: crashScore.label,
        displayScoreSource: crashScore.source,
      },
    };
  });

  return {
    type: "FeatureCollection",
    features: normalizedFeatures.filter((feature) => {
      const label = feature.properties.displayName;
      return isMetroJurisdictionLabel(label);
    }),
  };
}

function inferCrashScoreProfile(features) {
  const profiles = collectNumericProfiles(features);
  const candidates = profiles.filter((profile) => {
    if (isExcludedNumericField(profile.key)) {
      return false;
    }

    return profile.distinctCount > 1 && profile.count >= Math.max(5, Math.floor(features.length * 0.35));
  });

  const rankedCandidates = (candidates.length ? candidates : profiles).sort((left, right) => {
    const leftScore = scoreNumericProfile(left);
    const rightScore = scoreNumericProfile(right);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (left.distinctCount !== right.distinctCount) {
      return right.distinctCount - left.distinctCount;
    }

    return right.count - left.count;
  });

  const best = rankedCandidates[0];

  if (!best || best.range <= 0) {
    return null;
  }

  return {
    ...best,
    isRankLike: /rank|ranking|priority|order/i.test(best.key) && !/score/i.test(best.key),
  };
}

function inferLabelKeys(features) {
  const preferredKeys = [
    "name",
    "Name",
    "NAME",
    "area_name",
    "AREA_NAME",
    "street",
    "Street",
    "STREET",
    "road",
    "Road",
    "ROAD",
    "location",
    "Location",
    "LOCATION",
    "corridor",
    "Corridor",
    "CORRIDOR",
    "route",
    "Route",
    "ROUTE",
    "label",
    "Label",
    "LABEL",
  ];

  const sample = features[0]?.properties ?? {};
  const keys = Object.keys(sample);

  return preferredKeys.filter((key) => keys.includes(key));
}

function pickFirstValue(properties, keys) {
  return pickFirstMatchingProperty(properties, keys);
}

function collectNumericProfiles(features) {
  const profiles = new Map();

  features.forEach((feature) => {
    Object.entries(feature.properties ?? {}).forEach(([key, value]) => {
      if (!Number.isFinite(value)) {
        return;
      }

      const profile = profiles.get(key) ?? {
        key,
        count: 0,
        min: value,
        max: value,
        distinctValues: new Set(),
      };

      profile.count += 1;
      profile.min = Math.min(profile.min, value);
      profile.max = Math.max(profile.max, value);

      if (profile.distinctValues.size < 80) {
        profile.distinctValues.add(value);
      }

      profiles.set(key, profile);
    });
  });

  return [...profiles.values()].map((profile) => ({
    key: profile.key,
    count: profile.count,
    min: profile.min,
    max: profile.max,
    range: profile.max - profile.min,
    distinctCount: profile.distinctValues.size,
  }));
}

function scoreNumericProfile(profile) {
  const lowerKey = profile.key.toLowerCase();
  let score = 0;

  if (/score|severity|injury|fatal|crash|risk|weighted|index/.test(lowerKey)) {
    score += 140;
  } else if (/rank|ranking|priority|order|hin/.test(lowerKey)) {
    score += 120;
  } else if (/count|total|sum/.test(lowerKey)) {
    score += 70;
  }

  score += profile.distinctCount * 2;
  score += profile.count;
  score += Math.min(40, profile.range);

  if (isExcludedNumericField(profile.key)) {
    score -= 300;
  }

  return score;
}

function isExcludedNumericField(key) {
  return /objectid|shape|globalid|^fid$|id$|length|area|year|month|day|lat|lon|xcoord|ycoord/i.test(key);
}

function buildCrashScore(properties, scoreProfile, index, total) {
  if (scoreProfile) {
    const raw = Number(properties[scoreProfile.key]);

    if (Number.isFinite(raw)) {
      const normalized = normalizeCrashScore(raw, scoreProfile);

      if (normalized != null) {
        return {
          normalized,
          raw,
          label: formatCrashScoreLabel(raw, scoreProfile),
          source: scoreProfile.key,
        };
      }
    }
  }

  if (!total) {
    return {
      normalized: null,
      raw: null,
      label: null,
      source: null,
    };
  }

  const orderedScore = Math.round(((total - index) / Math.max(total - 1, 1)) * 100);

  return {
    normalized: orderedScore,
    raw: index + 1,
    label: `Service order ${index + 1}`,
    source: "serviceOrder",
  };
}

function normalizeCrashScore(raw, scoreProfile) {
  if (!Number.isFinite(raw) || scoreProfile.range <= 0) {
    return null;
  }

  const position = (raw - scoreProfile.min) / scoreProfile.range;
  const normalized = scoreProfile.isRankLike ? 100 - position * 100 : position * 100;

  return clamp(Math.round(normalized), 0, 100);
}

function formatCrashScoreLabel(raw, scoreProfile) {
  const rounded = Number.isInteger(raw) ? raw : raw.toFixed(1);

  if (scoreProfile.isRankLike) {
    return `Rank ${rounded}`;
  }

  const title = scoreProfile.key.replace(/_/g, " ").trim();
  return `${title}: ${rounded}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildCrashSummary(features) {
  const scored = features
    .filter((feature) => Number.isFinite(feature.properties.displayScore))
    .sort((left, right) => right.properties.displayScore - left.properties.displayScore);

  const topFeatures = (scored.length ? scored : features).slice(0, 12);
  const averageScore = scored.length
    ? Math.round(
        scored.reduce((sum, feature) => sum + feature.properties.displayScore, 0) / scored.length,
      )
    : null;

  return {
    totalAreas: features.length,
    averageScore,
    topAreas: topFeatures.map((feature) => ({
      id: feature.properties.OBJECTID ?? feature.properties.featureIndex,
      featureIndex: feature.properties.featureIndex,
      name: feature.properties.displayName,
      score: feature.properties.displayScore,
      scoreLabel: feature.properties.displayScoreLabel,
    })),
  };
}
