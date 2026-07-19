import { describe, expect, it } from "vitest";
import {
  createCloudEntryChanges,
  includeLegacyEntriesForMigration,
  rebaseCloudEntryChanges
} from "@/lib/live-cloud-changes";
import type { LiveEntry } from "@/lib/types";

function createTestEntry(id: string, title = id): LiveEntry {
  return {
    id,
    title,
    date: "2026-01-01",
    place: "東京",
    venue: "Test Hall",
    artists: ["Test Artist"],
    genre: "",
    memo: "",
    images: []
  };
}

describe("createCloudEntryChanges", () => {
  it("returns only changed, added, and deleted records", () => {
    const unchanged = createTestEntry("unchanged");
    const changed = createTestEntry("changed");
    const deleted = createTestEntry("deleted");
    const added = createTestEntry("added");

    const result = createCloudEntryChanges(
      [unchanged, changed, deleted],
      [unchanged, { ...changed, title: "updated" }, added]
    );

    expect(result.upserts.map((entry) => entry.id)).toEqual(["changed", "added"]);
    expect(result.deleteEntryIds).toEqual(["deleted"]);
    expect(result.entryIds).toEqual(["unchanged", "changed", "added"]);
  });
});

describe("includeLegacyEntriesForMigration", () => {
  it("copies every active legacy record while preserving newer local values", () => {
    const unchangedLegacy = createTestEntry("legacy");
    const changedLegacy = createTestEntry("changed", "old title");
    const deletedLegacy = createTestEntry("deleted");
    const changedLocal = createTestEntry("changed", "new title");
    const addedLocal = createTestEntry("added");

    const result = includeLegacyEntriesForMigration(
      {
        upserts: [changedLocal, addedLocal],
        deleteEntryIds: ["deleted"],
        entryIds: ["legacy", "changed", "added"]
      },
      [unchangedLegacy, changedLegacy, deletedLegacy]
    );

    expect(result.upserts.map((entry) => entry.id)).toEqual(["legacy", "changed", "added"]);
    expect(result.upserts.find((entry) => entry.id === "changed")?.title).toBe("new title");
    expect(result.upserts.some((entry) => entry.id === "deleted")).toBe(false);
  });
});

describe("rebaseCloudEntryChanges", () => {
  it("keeps unrelated records added on another device", () => {
    const base = createTestEntry("base");
    const remote = createTestEntry("remote");
    const local = { ...base, title: "local update" };

    const result = rebaseCloudEntryChanges([base], [local], [base, remote]);

    expect(result.conflictingEntryIds).toEqual([]);
    expect(result.entries.map((entry) => entry.id)).toEqual(["base", "remote"]);
    expect(result.entries[0].title).toBe("local update");
    expect(result.changes.upserts.map((entry) => entry.id)).toEqual(["base"]);
    expect(result.changes.deleteEntryIds).toEqual([]);
  });

  it("stops when the same record changed on both devices", () => {
    const base = createTestEntry("same");
    const local = { ...base, title: "local update" };
    const remote = { ...base, title: "remote update" };

    const result = rebaseCloudEntryChanges([base], [local], [remote]);

    expect(result.conflictingEntryIds).toEqual(["same"]);
    expect(result.changes.upserts).toEqual([]);
  });

  it("resumes safely when an earlier chunk already stored the local value", () => {
    const base = createTestEntry("partial");
    const local = { ...base, title: "stored already" };

    const result = rebaseCloudEntryChanges([base], [local], [local]);

    expect(result.conflictingEntryIds).toEqual([]);
    expect(result.changes.upserts).toEqual([]);
    expect(result.entries).toEqual([local]);
  });
});
