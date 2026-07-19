import { describe, expect, it } from "vitest";
import { recoverInterruptedImageSync } from "@/lib/live-entry-utils";
import type { LiveEntry } from "@/lib/types";

function createEntryWithImage(
  storageStatus: LiveEntry["images"][number]["storageStatus"],
  src: string,
  driveFileId?: string
): LiveEntry {
  return {
    id: "entry",
    title: "Test",
    date: "2026-01-01",
    place: "",
    venue: "Test Hall",
    artists: ["Test Artist"],
    genre: "",
    memo: "",
    images: [
      {
        id: "image",
        type: "eticket",
        src,
        storageStatus,
        driveFileId
      }
    ]
  };
}

describe("recoverInterruptedImageSync", () => {
  it("returns interrupted local uploads to the pending queue", () => {
    const [entry] = recoverInterruptedImageSync([
      createEntryWithImage("syncing", "data:image/png;base64,test")
    ]);

    expect(entry.images[0].storageStatus).toBe("local_pending");
  });

  it("keeps completed Drive uploads cloud-ready", () => {
    const [entry] = recoverInterruptedImageSync([
      createEntryWithImage("syncing", "https://example.test/image", "drive-file")
    ]);

    expect(entry.images[0].storageStatus).toBe("cloud");
  });
});
