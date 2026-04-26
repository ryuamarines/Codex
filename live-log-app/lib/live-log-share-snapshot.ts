import type { AggregateBucket, ArtistYearTrend, TrendBucket } from "@/lib/live-analytics";

export type ShareSnapshotMetric = {
  label: string;
  value: string | number;
};

export type ShareSnapshotSection = {
  label: string;
  items: AggregateBucket[];
};

export type LiveLogShareSnapshot =
  | {
      version: 1;
      kind: "summary";
      title: string;
      subtitle?: string;
      generatedAt: string;
      metrics: ShareSnapshotMetric[];
    }
  | {
      version: 1;
      kind: "aggregate";
      title: string;
      subtitle?: string;
      generatedAt: string;
      items: AggregateBucket[];
    }
  | {
      version: 1;
      kind: "trend";
      title: string;
      subtitle?: string;
      generatedAt: string;
      items: TrendBucket[];
    }
  | {
      version: 1;
      kind: "artistYears";
      title: string;
      subtitle?: string;
      generatedAt: string;
      years: string[];
      items: ArtistYearTrend[];
    }
  | {
      version: 1;
      kind: "artistStacked";
      title: string;
      subtitle?: string;
      generatedAt: string;
      years: string[];
      items: ArtistYearTrend[];
    }
  | {
      version: 1;
      kind: "yearly";
      title: string;
      subtitle?: string;
      generatedAt: string;
      year: string;
      metrics: ShareSnapshotMetric[];
      sections: ShareSnapshotSection[];
    };

export function encodeShareSnapshot(snapshot: LiveLogShareSnapshot) {
  return encodeURIComponent(JSON.stringify(snapshot));
}

export function decodeShareSnapshot(payload: string) {
  try {
    const parsed = JSON.parse(decodeURIComponent(payload)) as LiveLogShareSnapshot;

    if (parsed && typeof parsed === "object" && "version" in parsed && parsed.version === 1) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function buildShareSnapshotUrl(origin: string, snapshot: LiveLogShareSnapshot) {
  const url = new URL("/share/snapshot", origin);
  url.searchParams.set("data", encodeShareSnapshot(snapshot));
  return url.toString();
}
