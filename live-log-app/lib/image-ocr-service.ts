import type { BatchImageType } from "@/lib/types";

export type OcrResult = {
  text: string;
  confidence: number;
};

let workerPromise: Promise<{
  recognize(file: File): Promise<{ data: { text: string; confidence: number } }>;
}> | null = null;

export async function runImageOcr(file: File, imageType: BatchImageType): Promise<OcrResult> {
  const worker = await getWorker();
  const preparedVariants = await prepareFilesForOcr(file, imageType);
  let bestResult: OcrResult = { text: "", confidence: 0 };
  let bestScore = -1;

  for (const prepared of preparedVariants) {
    const result = await worker.recognize(prepared);
    const candidate = {
      text: result.data.text ?? "",
      confidence: Number.isFinite(result.data.confidence) ? result.data.confidence / 100 : 0
    };
    const score = scoreOcrResult(candidate, imageType);

    if (score > bestScore) {
      bestResult = candidate;
      bestScore = score;
    }
  }

  return bestResult;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("jpn+eng"));
  }

  return workerPromise;
}

async function prepareFilesForOcr(file: File, imageType: BatchImageType) {
  const loaded = await loadImageFromFile(file).catch(() => null);

  if (!loaded) {
    return [file];
  }

  const baseCanvas = document.createElement("canvas");
  const maxEdge = imageType === "ticket" ? 2600 : 1800;
  const scale = Math.max(
    1,
    Math.min(imageType === "ticket" ? 2.9 : 2, maxEdge / Math.max(loaded.width, loaded.height))
  );
  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  baseCanvas.width = width;
  baseCanvas.height = height;
  const context = baseCanvas.getContext("2d");

  if (!context) {
    loaded.revoke();
    return [file];
  }

  context.drawImage(loaded.image, 0, 0, width, height);
  loaded.revoke();

  const variants = [file];
  const baseImage = context.getImageData(0, 0, width, height);
  const grayscale = cloneImageData(baseImage);
  applyGrayscale(grayscale, imageType === "ticket" ? 1.22 : 1);
  variants.push(await imageDataToFile(grayscale, file, "ocr-gray"));

  if (imageType !== "other") {
    const thresholdStrong = cloneImageData(baseImage);
    applyThreshold(thresholdStrong, imageType === "ticket" ? 182 : 160);
    variants.push(await imageDataToFile(thresholdStrong, file, "ocr-high-contrast"));
  }

  if (imageType === "ticket") {
    const thresholdSoft = cloneImageData(baseImage);
    applyThreshold(thresholdSoft, 155);
    variants.push(await imageDataToFile(thresholdSoft, file, "ocr-soft-threshold"));

    const invertedSoft = cloneImageData(baseImage);
    applyThreshold(invertedSoft, 132);
    invertImageData(invertedSoft);
    variants.push(await imageDataToFile(invertedSoft, file, "ocr-inverted-soft"));

    const croppedTop = cropImageData(baseImage, 0, 0, width, Math.round(height * 0.72));
    applyGrayscale(croppedTop, 1.28);
    variants.push(await imageDataToFile(croppedTop, file, "ocr-ticket-top"));

    const croppedCenter = cropImageData(
      baseImage,
      0,
      Math.round(height * 0.18),
      width,
      Math.round(height * 0.58)
    );
    applyGrayscale(croppedCenter, 1.18);
    variants.push(await imageDataToFile(croppedCenter, file, "ocr-ticket-center"));

    const croppedBottom = cropImageData(
      baseImage,
      0,
      Math.round(height * 0.36),
      width,
      Math.round(height * 0.54)
    );
    applyGrayscale(croppedBottom, 1.24);
    variants.push(await imageDataToFile(croppedBottom, file, "ocr-ticket-bottom"));
  }

  return variants;
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

function applyThreshold(imageData: ImageData, thresholdValue: number) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = luminance > thresholdValue ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

function invertImageData(imageData: ImageData) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
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

function scoreOcrResult(result: OcrResult, imageType: BatchImageType) {
  const text = result.text ?? "";
  const confidence = result.confidence ?? 0;
  const normalized = text
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[OＯo]/g, "0")
    .replace(/[Iｌl]/g, "1")
    .replace(/[Ss]/g, "5");
  const dateSignals = normalized.match(/(20\d{2}\s*[\/.\-年]\s*\d{1,2}\s*[\/.\-月]\s*\d{1,2})|(\d{1,2}\s*月\s*\d{1,2}\s*日)/g)?.length ?? 0;
  const timeSignals = normalized.match(/\d{1,2}\s*[:時]\s*\d{2}/g)?.length ?? 0;
  const keywordSignals =
    (/(open|start|開場|開演|会場|venue|出演|live)/gi.exec(normalized) ? 1 : 0) +
    (normalized.match(/(open|start|開場|開演|会場|venue|出演|live)/gi)?.length ?? 0);
  const lengthScore = Math.min(normalized.replace(/\s+/g, "").length / 180, 1);
  const slashDateBonus = /\b20\d{2}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{1,2}\b/.test(normalized) ? 0.08 : 0;
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
