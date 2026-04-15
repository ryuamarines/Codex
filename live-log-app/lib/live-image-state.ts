import type { LiveEntryImage } from "@/lib/types";
import {
  countRenderableImages,
  countUnsyncedImages,
  hasUnsyncedImages,
  isRenderableImage
} from "@/lib/live-image-cloud-metadata";

export { countRenderableImages, countUnsyncedImages, hasUnsyncedImages, isRenderableImage };

type ImageSummaryInput = {
  src?: string;
  driveWebUrl?: string;
  driveThumbnailUrl?: string;
  storageStatus?: LiveEntryImage["storageStatus"];
};

export function formatPhotoSummary(images: ImageSummaryInput[]) {
  const renderable = countRenderableImages(images);
  const unsynced = countUnsyncedImages(images);

  if (renderable === 0 && unsynced === 0) {
    return "0件";
  }

  if (renderable === 0 && unsynced > 0) {
    return `未同期${unsynced}`;
  }

  if (unsynced > 0) {
    return `${renderable}件 / 未同期${unsynced}`;
  }

  return `${renderable}件`;
}
