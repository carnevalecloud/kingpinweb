import { View } from "./binary.ts";
import type { Diagnostics } from "./diagnostics.ts";

export const TGA_HEADER_SIZE = 18;

const IMAGE_TYPES: Record<number, string> = {
  1: "colour-mapped",
  2: "true-colour",
  3: "greyscale",
  9: "colour-mapped RLE",
  10: "true-colour RLE",
  11: "greyscale RLE",
};

export interface TgaDetails extends Record<string, unknown> {
  imageType: number;
  imageTypeName: string;
  width: number;
  height: number;
  bitsPerPixel: number;
  topDown: boolean;
}

/** Validates a Truevision TGA header. `fileSize` is the whole file; `bytes` may be just the header. */
export function inspectTga(bytes: Uint8Array, fileSize: number, diag: Diagnostics): TgaDetails | null {
  const view = new View(bytes);
  if (view.length < TGA_HEADER_SIZE) {
    diag.error("tga.truncated-header", `file is ${view.length} bytes; the header needs ${TGA_HEADER_SIZE}`);
    return null;
  }
  const idLength = view.u8(0);
  const colorMapType = view.u8(1);
  const imageType = view.u8(2);
  const mapLength = view.u16(5);
  const mapEntryBits = view.u8(7);
  const width = view.u16(12);
  const height = view.u16(14);
  const bitsPerPixel = view.u8(16);
  const typeName = IMAGE_TYPES[imageType];

  if (!typeName) diag.error("tga.unsupported-type", `image type ${imageType} is not a recognised TGA type`);
  if (colorMapType > 1) diag.error("tga.bad-color-map-type", `colour map type ${colorMapType}`);
  if (width === 0 || height === 0) diag.error("tga.zero-dimension", `image is ${width}x${height}`);
  if (![8, 15, 16, 24, 32].includes(bitsPerPixel)) diag.warn("tga.unusual-depth", `${bitsPerPixel} bits per pixel`);
  if ((width & (width - 1)) !== 0 || (height & (height - 1)) !== 0) {
    diag.info("tga.non-power-of-two", `${width}x${height}`);
  }

  const mapBytes = colorMapType === 1 ? mapLength * Math.ceil(mapEntryBits / 8) : 0;
  const compressed = imageType >= 9;
  const minimum =
    TGA_HEADER_SIZE + idLength + mapBytes + (compressed ? 1 : width * height * Math.ceil(bitsPerPixel / 8));
  if (typeName && fileSize < minimum) {
    diag.error("tga.truncated-data", `needs at least ${minimum} bytes, file has ${fileSize}`);
  }

  return {
    imageType,
    imageTypeName: typeName ?? "unknown",
    width,
    height,
    bitsPerPixel,
    topDown: (view.u8(17) & 0x20) !== 0,
  };
}
