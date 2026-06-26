/**
 * Image detection and decoding helpers.
 *
 * EFT files store fingerprint images in several encodings. The hard case is
 * WSQ (FBI Wavelet Scalar Quantization), which has no reliable pure-JS decoder.
 * We therefore:
 *   1. Detect the compression from magic bytes / record metadata.
 *   2. Decode the easy cases (raw grayscale, JPEG, PNG) ourselves into PNG so
 *      pdf-lib can embed them.
 *   3. For WSQ, attempt an OPTIONAL, pluggable decoder (see decodeWsq). If it is
 *      not installed we keep the raw bytes and flag a decodeNote, so the rest of
 *      the pipeline still runs and the UI can show a placeholder.
 *
 * pdf-lib natively embeds PNG and JPEG, so any image we can turn into one of
 * those (or leave as JPEG) is printable.
 */

import type { ImageCompression } from "./types";
import { encodeGrayPng } from "./png";
import { trimPng } from "./trim";

const WSQ_SOI = [0xff, 0xa0]; // WSQ start-of-image marker
const JPEG_SOI = [0xff, 0xd8];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
const JP2_SIG = [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50]; // .... jP

export function detectCompression(bytes: Uint8Array): ImageCompression {
  if (startsWith(bytes, PNG_SIG)) return "PNG";
  if (startsWith(bytes, WSQ_SOI)) return "WSQ";
  if (startsWith(bytes, JPEG_SOI)) return "JPEGB";
  if (startsWith(bytes, JP2_SIG)) return "JPEG2000";
  return "UNKNOWN";
}

/**
 * Map the NIST Type-4 "CA" (compression algorithm) byte to our enum.
 * 0 = uncompressed, 1 = WSQ. Type-14 uses a text token instead (see parser).
 */
export function compressionFromType4Byte(ca: number): ImageCompression {
  switch (ca) {
    case 0:
      return "NONE";
    case 1:
      return "WSQ";
    case 2:
      return "JPEGB";
    case 5:
      return "JPEG2000";
    default:
      return "UNKNOWN";
  }
}

export function compressionFromToken(token: string): ImageCompression {
  const t = token.trim().toUpperCase();
  if (t === "NONE" || t === "" ) return "NONE";
  if (t === "WSQ" || t === "WSQ20") return "WSQ";
  if (t === "JPEGB" || t === "JPEG" || t === "JPGB") return "JPEGB";
  if (t === "JP2" || t === "JP2L" || t === "JPEG2000") return "JPEG2000";
  if (t === "PNG") return "PNG";
  return "UNKNOWN";
}

interface DecodeArgs {
  bytes: Uint8Array;
  compression: ImageCompression;
  width: number;
  height: number;
}

export interface DecodeResult {
  /** PNG (or passthrough JPEG) bytes for pdf-lib, if available. */
  pngData?: Uint8Array;
  /** True if pngData is actually JPEG bytes (pdf-lib embeds both). */
  isJpeg?: boolean;
  note?: string;
}

/**
 * Produce bytes embeddable by pdf-lib. Returns pngData (PNG or JPEG) when
 * possible, otherwise a note explaining why not.
 */
export async function decodeForEmbedding(args: DecodeArgs): Promise<DecodeResult> {
  const { bytes, compression, width, height } = args;

  switch (compression) {
    case "PNG":
      return { pngData: trimPng(bytes) };
    case "JPEGB":
      return { pngData: bytes, isJpeg: true };
    case "NONE": {
      if (!width || !height) {
        return { note: "Uncompressed image is missing width/height; cannot rasterize." };
      }
      try {
        const png = encodeGrayPng(bytes, width, height);
        return { pngData: trimPng(png) };
      } catch (e) {
        return { note: `Failed to encode raw grayscale to PNG: ${(e as Error).message}` };
      }
    }
    case "WSQ": {
      const decoded = await decodeWsq(bytes, width, height);
      if (decoded) return { pngData: trimPng(decoded) };
      return {
        note:
          "WSQ image detected but no WSQ decoder is installed. Install an optional " +
          "WSQ decoder and wire it into decodeWsq() to render this print. " +
          "A placeholder box will be drawn instead.",
      };
    }
    case "JPEG2000":
      return {
        note:
          "JPEG 2000 image detected. Browsers/pdf-lib cannot embed JP2 directly; " +
          "add a JP2 decoder to render this print.",
      };
    default:
      return { note: "Unknown image compression; cannot decode." };
  }
}

/**
 * WSQ decoder.
 *
 * Uses `@li0ard/wsq`, a pure-JS port of the NBIS reference WSQ decoder, which
 * returns a ready-to-embed PNG. Works on both the Node (server) and browser
 * runtimes. The import is wrapped so a decode failure never breaks the rest of
 * the pipeline — the caller falls back to a placeholder + warning.
 *
 * If you ever need raw grayscale instead of PNG (e.g. to post-process), swap in
 * a decoder that returns pixels and feed them to encodeGrayPng().
 */
export async function decodeWsq(
  bytes: Uint8Array,
  _width: number,
  _height: number,
): Promise<Uint8Array | undefined> {
  try {
    const mod = await import("@li0ard/wsq");
    const png = mod.wsqToPNG(bytes);
    return png && png.byteLength > 0 ? png : undefined;
  } catch {
    return undefined;
  }
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}
