import type { BatchImageType } from "@/lib/types";

export type OcrResult = {
  text: string;
  confidence: number;
};

export type OcrRunOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?(completed: number, total: number): void;
};

type OcrWorker = {
  recognize(file: File): Promise<{ data: { text: string; confidence: number } }>;
  setParameters(params: {
    preserve_interword_spaces?: string;
    tessedit_pageseg_mode?: string;
    user_defined_dpi?: string;
  }): Promise<unknown>;
  terminate(): Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;

const TESSERACT_ASSET_PATH = "/tesseract";
const PAGE_SEGMENT_MODE = {
  block: "6",
  sparseText: "11"
} as const;

type PreparedOcrVariant = {
  file: File;
  pageSegmentationMode: (typeof PAGE_SEGMENT_MODE)[keyof typeof PAGE_SEGMENT_MODE];
};

export async function runImageOcr(
  file: File,
  imageType: BatchImageType,
  options: OcrRunOptions = {}
): Promise<OcrResult> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  const timeoutId = window.setTimeout(
    () => controller.abort(new Error("OCR が時間内に完了しませんでした。画像を切り抜いて再試行してください。")),
    timeoutMs
  );
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    throwIfOcrAborted(controller.signal);
    const worker = await getWorker();
    throwIfOcrAborted(controller.signal);
    const preparedVariants = await prepareFilesForOcr(file, imageType);
    let bestResult: OcrResult = { text: "", confidence: 0 };
    let bestScore = -1;
    let currentPageSegmentationMode = "";

    for (let index = 0; index < preparedVariants.length; index += 1) {
      const prepared = preparedVariants[index];
      throwIfOcrAborted(controller.signal);

      if (prepared.pageSegmentationMode !== currentPageSegmentationMode) {
        await runWorkerOperation(
          worker,
          worker.setParameters({
            preserve_interword_spaces: "1",
            tessedit_pageseg_mode: prepared.pageSegmentationMode,
            user_defined_dpi: "300"
          }),
          controller.signal
        );
        currentPageSegmentationMode = prepared.pageSegmentationMode;
      }

      const result = await runWorkerOperation(
        worker,
        worker.recognize(prepared.file),
        controller.signal
      );
      const candidate = {
        text: result.data.text ?? "",
        confidence: Number.isFinite(result.data.confidence) ? result.data.confidence / 100 : 0
      };
      const score = scoreOcrResult(candidate, imageType);

      if (score > bestScore) {
        bestResult = candidate;
        bestScore = score;
      }

      options.onProgress?.(index + 1, preparedVariants.length);

      if (index >= 1 && isStrongOcrResult(bestResult, imageType)) {
        break;
      }
    }

    return bestResult;
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function getWorker() {
  if (!workerPromise) {
    const nextWorkerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("jpn+eng", 1, {
        corePath: `${TESSERACT_ASSET_PATH}/core`,
        langPath: `${TESSERACT_ASSET_PATH}/lang`,
        workerPath: `${TESSERACT_ASSET_PATH}/worker.min.js`,
        workerBlobURL: false,
        gzip: true
      })
    );
    workerPromise = nextWorkerPromise.catch((error) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

function runWorkerOperation<T>(worker: OcrWorker, operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(createOcrAbortError(signal));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      workerPromise = null;
      void worker.terminate().catch(() => undefined);
      reject(createOcrAbortError(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function throwIfOcrAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw createOcrAbortError(signal);
  }
}

function createOcrAbortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("OCR を中断しました。別の画像で再試行できます。");
}

function isStrongOcrResult(result: OcrResult, imageType: BatchImageType) {
  const compactText = normalizeOcrSignalText(result.text);
  const hasDate = /(20\d{2}[\/.\-年]\d{1,2}[\/.\-月]\d{1,2})|(\d{1,2}月\d{1,2}日)/.test(compactText);
  const hasVenue = /(会場|venue|zepp|hall|ホール|club|livehouse|ライブハウス|o-east|quattro|blaze|loft)/i.test(
    compactText
  );
  const hasEventSignal = /(open|start|開場|開演|live|tour|festival|fes|公演|出演)/i.test(compactText);

  if (imageType === "ticket") {
    return result.confidence >= 0.52 && hasDate && (hasVenue || hasEventSignal);
  }

  return result.confidence >= 0.58 && (hasDate || hasVenue) && hasEventSignal;
}

function normalizeOcrSignalText(value: string) {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "");
}

async function prepareFilesForOcr(file: File, imageType: BatchImageType) {
  const loaded = await loadImageFromFile(file).catch(() => null);
  const fullPageSegmentationMode = PAGE_SEGMENT_MODE.sparseText;

  if (!loaded) {
    return [{ file, pageSegmentationMode: fullPageSegmentationMode }];
  }

  const baseCanvas = document.createElement("canvas");
  const scale = calculateOcrScale(loaded.width, loaded.height, imageType);
  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  baseCanvas.width = width;
  baseCanvas.height = height;
  const context = baseCanvas.getContext("2d");

  if (!context) {
    loaded.revoke();
    return [{ file, pageSegmentationMode: fullPageSegmentationMode }];
  }

  context.drawImage(loaded.image, 0, 0, width, height);
  loaded.revoke();

  const variants: PreparedOcrVariant[] = [{ file, pageSegmentationMode: fullPageSegmentationMode }];
  const baseImage = context.getImageData(0, 0, width, height);
  const grayscale = cloneImageData(baseImage);
  applyGrayscale(grayscale, imageType === "ticket" ? 1.22 : 1);
  applyAutoContrast(grayscale);
  variants.push({
    file: await imageDataToFile(grayscale, file, "ocr-gray"),
    pageSegmentationMode: fullPageSegmentationMode
  });

  const normalized = cloneImageData(baseImage);
  applyGrayscale(normalized, imageType === "ticket" ? 1.12 : 1);
  applyAutoContrast(normalized);
  applySharpen(normalized);
  variants.push({
    file: await imageDataToFile(normalized, file, "ocr-normalized"),
    pageSegmentationMode: fullPageSegmentationMode
  });

  if (imageType !== "other") {
    const adaptive = cloneImageData(baseImage);
    applyGrayscale(adaptive);
    applyAdaptiveThreshold(adaptive, imageType === "ticket" ? 18 : 14);
    variants.push({
      file: await imageDataToFile(adaptive, file, "ocr-adaptive-threshold"),
      pageSegmentationMode: fullPageSegmentationMode
    });
  }

  if (imageType === "ticket") {
    const croppedTop = cropImageData(baseImage, 0, 0, width, Math.round(height * 0.72));
    applyGrayscale(croppedTop, 1.28);
    applyAutoContrast(croppedTop);
    variants.push({
      file: await imageDataToFile(croppedTop, file, "ocr-ticket-top"),
      pageSegmentationMode: PAGE_SEGMENT_MODE.block
    });

    const croppedCenter = cropImageData(
      baseImage,
      0,
      Math.round(height * 0.18),
      width,
      Math.round(height * 0.58)
    );
    applyGrayscale(croppedCenter, 1.18);
    applyAutoContrast(croppedCenter);
    variants.push({
      file: await imageDataToFile(croppedCenter, file, "ocr-ticket-center"),
      pageSegmentationMode: PAGE_SEGMENT_MODE.block
    });
  }

  return variants;
}

export function calculateOcrScale(width: number, height: number, imageType: BatchImageType) {
  const maxEdge = imageType === "ticket" ? 2600 : 1800;
  const maxUpscale = imageType === "ticket" ? 2.4 : 1.8;
  return Math.min(maxUpscale, maxEdge / Math.max(1, width, height));
}

function cloneImageData(source: ImageData) {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

function cropImageData(source: ImageData, startX: number, startY: number, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");

  if (!context) {
    return cloneImageData(source);
  }

  context.putImageData(source, 0, 0);
  return context.getImageData(startX, startY, width, height);
}

function applyGrayscale(imageData: ImageData, contrastBoost = 1) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const normalized = Math.max(0, Math.min(255, (luminance - 128) * contrastBoost + 128));
    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }
}

function applyAutoContrast(imageData: ImageData) {
  const data = imageData.data;
  const histogram = new Uint32Array(256);
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]] += 1;
  }

  const cutoff = Math.max(1, Math.floor(pixelCount * 0.01));
  let low = 0;
  let high = 255;
  let cumulative = 0;

  while (low < 255 && cumulative < cutoff) {
    cumulative += histogram[low];
    low += 1;
  }

  cumulative = 0;
  while (high > 0 && cumulative < cutoff) {
    cumulative += histogram[high];
    high -= 1;
  }

  if (high <= low) {
    return;
  }

  const range = high - low;

  for (let i = 0; i < data.length; i += 4) {
    const normalized = Math.max(0, Math.min(255, ((data[i] - low) * 255) / range));
    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }
}

function applySharpen(imageData: ImageData) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      const sharpened =
        source[center] * 5 -
        source[center - 4] -
        source[center + 4] -
        source[center - width * 4] -
        source[center + width * 4];
      const normalized = Math.max(0, Math.min(255, sharpened));
      data[center] = normalized;
      data[center + 1] = normalized;
      data[center + 2] = normalized;
    }
  }
}

function applyAdaptiveThreshold(imageData: ImageData, bias: number) {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);
  const integralWidth = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  const radius = 12;

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;

    for (let x = 1; x <= width; x += 1) {
      rowSum += source[((y - 1) * width + (x - 1)) * 4];
      integral[y * integralWidth + x] = integral[(y - 1) * integralWidth + x] + rowSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      const sum =
        integral[(bottom + 1) * integralWidth + (right + 1)] -
        integral[top * integralWidth + (right + 1)] -
        integral[(bottom + 1) * integralWidth + left] +
        integral[top * integralWidth + left];
      const count = (right - left + 1) * (bottom - top + 1);
      const index = (y * width + x) * 4;
      const value = source[index] < sum / count - bias ? 0 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }
}

function imageDataToFile(imageData: ImageData, file: File, suffix: string) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.resolve(file);
  }

  context.putImageData(imageData, 0, 0);

  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(
          new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-${suffix}.png`, {
            type: "image/png"
          })
        );
        return;
      }

      reject(new Error("OCR 前処理に失敗しました。"));
    }, "image/png");
  });
}

export function scoreOcrResult(result: OcrResult, imageType: BatchImageType) {
  const text = result.text ?? "";
  const confidence = result.confidence ?? 0;
  const normalized = text.replace(
    /[０-９]/g,
    (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  const digitNormalized = normalized
    .replace(/[OＯo]/g, "0")
    .replace(/[Iｌl]/g, "1")
    .replace(/[Ss]/g, "5");
  const dateSignals = digitNormalized.match(/(20\d{2}\s*[\/.\-年]\s*\d{1,2}\s*[\/.\-月]\s*\d{1,2})|(\d{1,2}\s*月\s*\d{1,2}\s*日)/g)?.length ?? 0;
  const timeSignals = digitNormalized.match(/\d{1,2}\s*[:時]\s*\d{2}/g)?.length ?? 0;
  const keywordSignals =
    (/(open|start|開場|開演|会場|venue|出演|live)/gi.exec(normalized) ? 1 : 0) +
    (normalized.match(/(open|start|開場|開演|会場|venue|出演|live)/gi)?.length ?? 0);
  const lengthScore = Math.min(normalized.replace(/\s+/g, "").length / 180, 1);
  const slashDateBonus = /\b20\d{2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{1,2}\b/.test(digitNormalized) ? 0.08 : 0;
  const ticketLabelBonus =
    imageType === "ticket" && /(発券|入場|整理番号|座席|ticket|qr)/i.test(normalized) ? 0.09 : 0;
  const timeRangeBonus =
    imageType === "ticket" && /(open|start|開場|開演).{0,12}\d{1,2}\s*[:時]\s*\d{2}/i.test(normalized)
      ? 0.08
      : 0;
  const venueBonus =
    imageType === "ticket" && /(会場|venue|zepp|club|hall|o-east|quattro|blaze|loft)/i.test(normalized)
      ? 0.06
      : 0;

  const weighted =
    confidence * 0.45 +
    Math.min(dateSignals, 2) * 0.22 +
    Math.min(timeSignals, 2) * 0.08 +
    Math.min(keywordSignals, 3) * 0.08 +
    lengthScore * 0.12 +
    (imageType === "ticket" && dateSignals > 0 ? 0.12 : 0) +
    slashDateBonus +
    ticketLabelBonus +
    timeRangeBonus +
    venueBonus;

  return weighted;
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
