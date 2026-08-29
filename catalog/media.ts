import sharp, { type Metadata } from "sharp";

type ImageType = "image/avif" | "image/jpeg" | "image/png" | "image/webp";

export const maximumScreenshots = 5;
export const maximumAppMediaBytes = 1024 * 1024;
export const maximumScreenshotWidth = 1280;
export const maximumScreenshotHeight = 800;
export const maximumIconSize = 256;

function imageDimensions(metadata: Metadata, label: string) {
  if ((metadata.pages ?? 1) !== 1) {
    throw new Error(`${label} must not be animated`);
  }

  if (!metadata.width || !metadata.height) {
    throw new Error(`${label} has no dimensions`);
  }

  if (metadata.width > 8192 || metadata.height > 8192) {
    throw new Error(`${label} dimensions must not exceed 8192 pixels`);
  }

  if (metadata.width * metadata.height > 33_177_600) {
    throw new Error(`${label} must not exceed 33 megapixels`);
  }

  return { width: metadata.width, height: metadata.height };
}

export function imageType(file: string): ImageType {
  const extension = file.toLowerCase().split(".").at(-1);

  if (extension === "avif") {
    return "image/avif";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  throw new Error(`${file}: unsupported image format`);
}

export async function validateImage(
  data: Buffer,
  file: string,
  appId: string,
  options: { icon?: boolean } = {}
) {
  try {
    const expectedType = imageType(file);
    const image = sharp(data, { animated: true, failOn: "error" });
    const metadata = await image.metadata();

    if (metadata.mediaType !== expectedType) {
      throw new Error(`${file} does not match its image format`);
    }

    const { width, height } = imageDimensions(metadata, file);

    await image.stats();

    if (options.icon && (width !== height || width < 128 || width > 1024)) {
      throw new Error("icon must be square and between 128 and 1024 pixels");
    }

    if (file.endsWith(".webp") && /^[a-f0-9]{64}\./.test(file)) {
      if (options.icon && width > maximumIconSize) {
        throw new Error(`icon must not exceed ${maximumIconSize} pixels`);
      }

      if (!options.icon && (width > maximumScreenshotWidth || height > maximumScreenshotHeight)) {
        throw new Error(
          `screenshot must fit within ${maximumScreenshotWidth} by ${maximumScreenshotHeight} pixels`
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`${appId}: ${message}`, { cause: error });
  }
}

export async function normalizeImage(data: Buffer, icon = false) {
  const image = sharp(data, { animated: true, failOn: "error" });
  const metadata = await image.metadata();
  const { width, height } = imageDimensions(metadata, "image");

  if (icon && (width !== height || width < 128)) {
    throw new Error("icon must be square and at least 128 pixels");
  }

  const normalized = image.rotate().resize({
    width: icon ? maximumIconSize : maximumScreenshotWidth,
    height: icon ? maximumIconSize : maximumScreenshotHeight,
    fit: "inside",
    withoutEnlargement: true,
  });

  return icon
    ? normalized.webp({ lossless: true, effort: 4 }).toBuffer()
    : normalized.webp({ quality: 78, effort: 4, smartSubsample: true }).toBuffer();
}
