import { createPendingImage } from "@/lib/live-entry-utils";
import type { LiveEntryImage } from "@/lib/types";

type SaveFileOptions = {
  onStatus?(message: string): void;
  onProgress?(ratio: number): void;
};

export interface ArchiveImageService {
  saveFile(
    file: File,
    type: LiveEntryImage["type"],
    caption?: string,
    options?: SaveFileOptions
  ): Promise<LiveEntryImage>;
}

export class LocalArchiveImageService implements ArchiveImageService {
  async saveFile(
    file: File,
    type: LiveEntryImage["type"],
    caption?: string,
    options?: SaveFileOptions
  ) {
    options?.onStatus?.("画像を準備しています...");
    const preparedFile = await withTimeout(
      prepareUploadFile(file),
      12000,
      "画像の準備に時間がかかりすぎています。別の画像で試してください。"
    );
    options?.onStatus?.("画像を端末に保存しています...");
    options?.onProgress?.(1);
    const src = await readFileAsDataUrl(preparedFile);
    return createPendingImage(src, type, caption ?? file.name);
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read file."));
    };

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function prepareUploadFile(file: File) {
  if (typeof window === "undefined") {
    return file;
  }

  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.size <= 1_500_000) {
    return file;
  }

  const loaded = await loadImageFromFile(file).catch(() => null);

  if (!loaded) {
    return file;
  }

  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(loaded.width, loaded.height));

  if (scale === 1) {
    loaded.revoke();
    return file;
  }

  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    loaded.revoke();
    return file;
  }

  context.drawImage(loaded.image, 0, 0, width, height);
  loaded.revoke();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.84).catch(() => null);

  if (!blob) {
    return file;
  }

  const normalizedName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${normalizedName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}


function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("画像の変換に失敗しました。"));
    }, type, quality);
  });
}

function loadImageFromFile(file: File) {
  return new Promise<{
    image: HTMLImageElement;
    width: number;
    height: number;
    revoke(): void;
  }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      cleanup();
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        revoke: () => URL.revokeObjectURL(objectUrl)
      });
    };

    image.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。"));
    };

    image.src = objectUrl;
  });
}
