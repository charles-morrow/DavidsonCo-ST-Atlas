const EXCLUDED_ROUTE_PATTERNS = [
  /\bI-?\s?\d+/i,
  /\bInterstate\b/i,
  /\bUS-?\s?\d+/i,
  /\bU\.S\.\s?\d+/i,
  /\bSR-?\s?\d+/i,
  /\bState Route\b/i,
  /\bTN-?\s?\d+/i,
  /\bPike\b/i,
  /\bBriley\b/i,
  /\bParkway\b/i,
  /\bHwy\b/i,
  /\bHighway\b/i,
];

export function isMetroJurisdictionLabel(value) {
  if (typeof value !== "string" || !value.trim()) {
    return true;
  }

  return !EXCLUDED_ROUTE_PATTERNS.some((pattern) => pattern.test(value));
}

export function pickFirstMatchingProperty(properties, candidates) {
  for (const key of candidates) {
    const value = properties?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
