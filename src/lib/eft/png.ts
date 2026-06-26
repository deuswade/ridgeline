/**
 * Minimal 8-bit grayscale PNG encoder.
 *
 * Used to turn raw, uncompressed grayscale fingerprint rasters (and decoded
 * WSQ output) into PNG bytes that pdf-lib can embed. Runs server-side on the
 * Node runtime and relies on Node's built-in zlib for DEFLATE.
 */

import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param gray  Raw grayscale samples, one byte per pixel, length >= width*height.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 */
export function encodeGrayPng(gray: Uint8Array, width: number, height: number): Uint8Array {
  if (width <= 0 || height <= 0) throw new Error("width/height must be positive");
  const expected = width * height;
  if (gray.length < expected) {
    throw new Error(`raster too small: have ${gray.length}, need ${expected}`);
  }

  // Build raw image data with a filter byte (0 = None) prefixed to each scanline.
  const stride = width;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    gray.subarray(y * stride, y * stride + stride).forEach((v, x) => {
      raw[rowStart + 1 + x] = v;
    });
  }

  const idatData = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  const chunks = [
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idatData),
    makeChunk("IEND", Buffer.alloc(0)),
  ];

  return new Uint8Array(Buffer.concat(chunks));
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC-32 (PNG polynomial) with a lazily-built lookup table.
let crcTable: number[] | undefined;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}
