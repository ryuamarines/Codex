import type { BatchReviewState } from "@/lib/types";

type ConfirmableBatchItem = {
  id: string;
  selected: boolean;
  approved: boolean;
  reviewState: BatchReviewState;
};

export function markRegisteredBatchItems<T extends ConfirmableBatchItem>(
  items: T[],
  completedItemIds: ReadonlySet<string>
) {
  return items.map((item) =>
    completedItemIds.has(item.id)
      ? {
          ...item,
          selected: false,
          approved: false,
          reviewState: item.reviewState === "excluded" ? "excluded" as const : "confirmed" as const
        }
      : item
  );
}
