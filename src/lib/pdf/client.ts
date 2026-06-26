/**
 * Client-side composition glue.
 *
 * Rebuilds FingerprintImage objects from the API response and calls the shared
 * (isomorphic) generateFd258Pdf so the FD-258 can be re-rendered instantly when
 * the calibration sliders move — no re-upload or re-parse needed.
 */

import { generateFd258Pdf } from "./generate";
import type { FingerprintImage, ImageCompression } from "@/lib/eft/types";
import type { ProcessResponse } from "@/lib/api-types";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ComposeArgs {
  data: ProcessResponse;
  offsetXmm: number;
  offsetYmm: number;
  drawGuides?: boolean;
  extras?: Record<string, string>;
  printOri?: boolean;
  includeTemplate?: boolean;
  pageSize?: "card" | "letter";
}

export async function composePdf(args: ComposeArgs): Promise<Uint8Array> {
  const {
    data, offsetXmm, offsetYmm, drawGuides = true, extras = {},
    printOri = true, includeTemplate = true, pageSize = "card",
  } = args;

  // Fetch the template only for the preview (it's never part of the printed output).
  let templateBytes: Uint8Array | null = null;
  if (includeTemplate) {
    try {
      const res = await fetch("/fd-258-template.pdf");
      if (res.ok) templateBytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      templateBytes = null;
    }
  }

  const images: FingerprintImage[] = data.images.map((img) => ({
    sourceType: 0,
    fingerPosition: img.position,
    width: img.width,
    height: img.height,
    compression: img.compression as ImageCompression,
    data: new Uint8Array(),
    pngData: img.dataBase64 ? base64ToBytes(img.dataBase64) : undefined,
    decodeNote: img.note ?? undefined,
  }));

  return generateFd258Pdf({
    demographics: data.demographics,
    images,
    offsetXmm,
    offsetYmm,
    templateBytes,
    drawGuides,
    extras,
    printOri,
    includeTemplate,
    pageSize,
  });
}
