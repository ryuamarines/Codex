const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_DATA_URL_BYTES = 2_600_000;
const MAX_DIMENSION = 2600;
const MIN_REDUCTION_DIMENSION = 640;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export type PreparedBackgroundImage = {
  dataUrl: string;
  width: number;
  height: number;
  optimized: boolean;
};

export async function prepareBackgroundImage(file: File): Promise<PreparedBackgroundImage> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error("PNG、JPEG、WebPの画像を選んでください。");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("画像が25MBを超えています。元画像を小さくしてから読み込んでください。");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const shouldOptimize = scale < 1 || file.size * 1.37 > MAX_DATA_URL_BYTES;

    if (!shouldOptimize) {
      return {
        dataUrl: await readFileAsDataUrl(file),
        width: image.naturalWidth,
        height: image.naturalHeight,
        optimized: false
      };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像処理を開始できませんでした。");

    while (true) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      let quality = 0.88;
      let dataUrl = encodeCanvas(canvas, quality);
      while (estimateDataUrlBytes(dataUrl) > MAX_DATA_URL_BYTES && quality > 0.48) {
        quality -= 0.08;
        dataUrl = encodeCanvas(canvas, quality);
      }
      if (estimateDataUrlBytes(dataUrl) <= MAX_DATA_URL_BYTES) {
        return { dataUrl, width, height, optimized: true };
      }
      if (Math.max(width, height) <= MIN_REDUCTION_DIMENSION) {
        throw new Error("画像を保存可能なサイズまで圧縮できませんでした。画像をトリミングして再度お試しください。");
      }

      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。ファイルが壊れていないか確認してください。"));
    image.src = src;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number) {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

function estimateDataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  const payloadLength = commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : dataUrl.length;
  return Math.ceil(payloadLength * 0.75);
}
