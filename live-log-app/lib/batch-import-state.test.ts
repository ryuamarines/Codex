import { describe, expect, it } from "vitest";
import { markRegisteredBatchItems } from "@/lib/batch-import-state";

describe("markRegisteredBatchItems", () => {
  it("marks approved items complete even after candidate selection was cleared", () => {
    const items = [
      {
        id: "approved-item",
        selected: false,
        approved: true,
        reviewState: "new_candidate" as const
      },
      {
        id: "failed-item",
        selected: false,
        approved: true,
        reviewState: "new_candidate" as const
      }
    ];

    const result = markRegisteredBatchItems(items, new Set(["approved-item"]));

    expect(result[0]).toMatchObject({
      selected: false,
      approved: false,
      reviewState: "confirmed"
    });
    expect(result[1]).toEqual(items[1]);
  });
});
