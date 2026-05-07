import type { LiveEntry } from "@/lib/types";

export type EntityKind = "artist" | "venue";

export type EntityNormalizationIndex = {
  artists: Map<string, string>;
  venues: Map<string, string>;
};

type EntityVariant = {
  label: string;
  count: number;
  firstSeenIndex: number;
};

const UNSET_LABEL = "未設定";

export function createEntityNormalizationIndex(entries: LiveEntry[]): EntityNormalizationIndex {
  return {
    artists: buildEntityIndex(collectArtistVariants(entries), "artist"),
    venues: buildEntityIndex(collectVenueVariants(entries), "venue")
  };
}

export function canonicalizeArtistName(value: string, index?: EntityNormalizationIndex) {
  return canonicalizeEntityName(value, "artist", index);
}

export function canonicalizeVenueName(value: string, index?: EntityNormalizationIndex) {
  return canonicalizeEntityName(value, "venue", index);
}

export function createEntitySearchText(value: string, kind: EntityKind = "artist") {
  return Array.from(createEntityKeys(value, kind)).join(" ");
}

function canonicalizeEntityName(value: string, kind: EntityKind, index?: EntityNormalizationIndex) {
  const trimmed = value.trim();

  if (!trimmed) {
    return UNSET_LABEL;
  }

  const aliasMap = kind === "artist" ? index?.artists : index?.venues;

  if (!aliasMap) {
    return trimmed;
  }

  for (const key of createEntityKeys(trimmed, kind)) {
    const canonicalName = aliasMap.get(key);

    if (canonicalName) {
      return canonicalName;
    }
  }

  return trimmed;
}

function collectArtistVariants(entries: LiveEntry[]) {
  const variants: string[] = [];

  for (const entry of entries) {
    const artists = entry.artists.length > 0 ? entry.artists : [UNSET_LABEL];
    variants.push(...artists);
  }

  return variants;
}

function collectVenueVariants(entries: LiveEntry[]) {
  return entries.map((entry) => entry.venue || UNSET_LABEL);
}

function buildEntityIndex(values: string[], kind: EntityKind) {
  const variantsByLabel = new Map<string, EntityVariant>();
  const labelsByKey = new Map<string, string[]>();
  const parentByLabel = new Map<string, string>();

  values.forEach((value, index) => {
    const label = value.trim() || UNSET_LABEL;
    const variant = variantsByLabel.get(label) ?? {
      label,
      count: 0,
      firstSeenIndex: index
    };

    variant.count += 1;
    variantsByLabel.set(label, variant);
    parentByLabel.set(label, label);
  });

  for (const variant of variantsByLabel.values()) {
    for (const key of createEntityKeys(variant.label, kind)) {
      const labels = labelsByKey.get(key) ?? [];
      labels.push(variant.label);
      labelsByKey.set(key, labels);
    }
  }

  for (const labels of labelsByKey.values()) {
    const [firstLabel, ...restLabels] = labels;

    for (const label of restLabels) {
      unionLabels(parentByLabel, firstLabel, label);
    }
  }

  const variantsByRoot = new Map<string, EntityVariant[]>();

  for (const variant of variantsByLabel.values()) {
    const root = findLabelRoot(parentByLabel, variant.label);
    const variants = variantsByRoot.get(root) ?? [];
    variants.push(variant);
    variantsByRoot.set(root, variants);
  }

  const canonicalByRoot = new Map<string, string>();

  for (const [root, variants] of variantsByRoot.entries()) {
    const canonicalName = chooseCanonicalName(variants);
    canonicalByRoot.set(root, canonicalName);
  }

  const aliasMap = new Map<string, string>();

  for (const variant of variantsByLabel.values()) {
    const root = findLabelRoot(parentByLabel, variant.label);
    const canonicalName = canonicalByRoot.get(root) ?? variant.label;

    for (const key of createEntityKeys(variant.label, kind)) {
      aliasMap.set(key, canonicalName);
    }
  }

  return aliasMap;
}

function findLabelRoot(parentByLabel: Map<string, string>, label: string): string {
  const parent = parentByLabel.get(label);

  if (!parent || parent === label) {
    return label;
  }

  const root = findLabelRoot(parentByLabel, parent);
  parentByLabel.set(label, root);
  return root;
}

function unionLabels(parentByLabel: Map<string, string>, left: string, right: string) {
  const leftRoot = findLabelRoot(parentByLabel, left);
  const rightRoot = findLabelRoot(parentByLabel, right);

  if (leftRoot !== rightRoot) {
    parentByLabel.set(rightRoot, leftRoot);
  }
}

function chooseCanonicalName(variants: EntityVariant[]) {
  return [...variants].sort((left, right) => {
    const countDiff = right.count - left.count;

    if (countDiff !== 0) {
      return countDiff;
    }

    const lengthDiff = right.label.length - left.label.length;

    if (lengthDiff !== 0) {
      return lengthDiff;
    }

    return left.firstSeenIndex - right.firstSeenIndex;
  })[0].label;
}

function createEntityKeys(value: string, kind: EntityKind) {
  const keys = new Set<string>();
  const normalized = normalizeBaseName(value);
  const compact = compactName(normalized);

  if (normalized) {
    keys.add(normalized);
  }

  if (compact) {
    keys.add(compact);
  }

  if (kind === "venue") {
    for (const venueKey of createVenueKeys(normalized)) {
      keys.add(venueKey);
    }
  }

  return keys;
}

function createVenueKeys(value: string) {
  const keys = new Set<string>();
  const withoutBracket = compactName(value.replace(/\([^)]*\)/g, "").replace(/（[^）]*）/g, ""));

  if (withoutBracket) {
    keys.add(withoutBracket);
  }

  const normalizedVenue = withoutBracket
    .replace(/^spotify/, "")
    .replace(/^tsutaya/, "")
    .replace(/^shibuya/, "")
    .replace(/tokyo$/, "")
    .replace(/東京$/, "");

  if (normalizedVenue) {
    keys.add(normalizedVenue);
  }

  if (normalizedVenue.includes("zepp羽田") || normalizedVenue.includes("zepphaneda")) {
    keys.add("zepphaneda");
  }

  if (normalizedVenue.includes("oeast") || normalizedVenue.includes("o-east")) {
    keys.add("oeast");
  }

  if (normalizedVenue.includes("owest") || normalizedVenue.includes("o-west")) {
    keys.add("owest");
  }

  if (normalizedVenue.includes("onest") || normalizedVenue.includes("o-nest")) {
    keys.add("onest");
  }

  if (normalizedVenue.includes("ocrest") || normalizedVenue.includes("o-crest")) {
    keys.add("ocrest");
  }

  return keys;
}

function normalizeBaseName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[&＆]/g, " and ")
    .replace(/[‐‑‒–—―ー]/g, "-")
    .replace(/\s+/g, " ");
}

function compactName(value: string) {
  return value.replace(/[\s・･.,，．。'’"“”`´_/:：;；|｜\\()[\]{}<>〈〉《》「」『』【】＋+~〜\-]/g, "");
}
