/**
 * POST /api/process
 *
 * Accepts a multipart form upload of an .eft file, parses it (NIST ITL-1),
 * decodes the fingerprint images server-side (where Node's zlib is available),
 * and returns JSON the client can use to compose the FD-258 PDF live with
 * calibration offsets.
 *
 * Runs on the Node.js runtime (not Edge) because the parser uses Buffer and
 * node:zlib.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseEft } from "@/lib/eft/parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded under field 'file'." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    const result = await parseEft(bytes);

    const images = result.images.map((img) => ({
      position: img.fingerPosition,
      width: img.width,
      height: img.height,
      compression: img.compression,
      mime: img.compression === "JPEGB" ? "image/jpeg" : "image/png",
      dataBase64: img.pngData ? Buffer.from(img.pngData).toString("base64") : null,
      note: img.decodeNote ?? null,
    }));

    return NextResponse.json({
      fileName: file.name,
      demographics: result.demographics,
      recordTypes: result.recordTypes,
      warnings: result.warnings,
      images,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse EFT file: ${(e as Error).message}` },
      { status: 422 },
    );
  }
}
