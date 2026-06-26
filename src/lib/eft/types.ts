/**
 * Type definitions for the NIST ITL-1 (EFT) parser and the data we map onto
 * the FD-258 card.
 *
 * Reference: ANSI/NIST-ITL 1-2007 "Data Format for the Interchange of
 * Fingerprint, Facial & Other Biometric Information".
 */

/** A single tagged field inside a Type-1, Type-2, or Type-14 record. */
export interface NistField {
  /** Record type, e.g. 1, 2, 14. */
  type: number;
  /** Field number within the record, e.g. 2.001 -> 1. */
  field: number;
  /** Full tag string, e.g. "2.018". */
  tag: string;
  /** Raw value as text (information separators preserved as | and ^). */
  value: string;
}

/** A record made of tagged ASCII fields (Type-1, Type-2, Type-14 header). */
export interface TaggedRecord {
  type: number;
  fields: Map<number, string>;
  /** Convenience accessor preserving insertion order. */
  raw: NistField[];
}

/** Image compression algorithms we recognize. */
export type ImageCompression =
  | "NONE" // uncompressed raw grayscale pixels
  | "WSQ" // FBI wavelet scalar quantization (Type-4 / Type-14)
  | "JPEGB" // baseline JPEG
  | "JPEG2000" // JP2 / J2K
  | "PNG"
  | "UNKNOWN";

/** One extracted fingerprint impression. */
export interface FingerprintImage {
  /** Source record type the image came from (4 or 14). */
  sourceType: number;
  /** IDC / FGP friction-ridge position code (1-14 for the FD-258 boxes). */
  fingerPosition: number;
  /** Image width in pixels (0 if unknown). */
  width: number;
  /** Image height in pixels (0 if unknown). */
  height: number;
  /** Detected compression. */
  compression: ImageCompression;
  /** Raw image bytes exactly as stored in the record. */
  data: Uint8Array;
  /**
   * Decoded PNG bytes ready for pdf-lib, if we were able to decode.
   * Undefined means decoding failed / not attempted (e.g. WSQ without decoder).
   */
  pngData?: Uint8Array;
  /** Human-readable note if decoding was skipped or failed. */
  decodeNote?: string;
}

/** Demographic data extracted from Type-1 / Type-2 records. */
export interface Demographics {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  fullName?: string;
  dateOfBirth?: string; // YYYY-MM-DD if parseable
  sex?: string; // M / F / U
  race?: string;
  height?: string; // as printed, e.g. 5'11"
  weight?: string; // lbs
  eyeColor?: string;
  hairColor?: string;
  placeOfBirth?: string;
  ssn?: string;
  fbiNumber?: string;
  stateId?: string;
  miscIdNumber?: string;
  datePrinted?: string;
  reasonFingerprinted?: string;
  employerAndAddress?: string;
  residenceOfPersonFingerprinted?: string;
  /** Anything we found but did not map, keyed by field tag. */
  extras: Record<string, string>;
}

/** Full parse result. */
export interface EftParseResult {
  demographics: Demographics;
  images: FingerprintImage[];
  /** Non-fatal warnings collected while parsing. */
  warnings: string[];
  /** Record types encountered, in order. */
  recordTypes: number[];
}

/**
 * The 14 friction-ridge positions printed on an FD-258 card.
 * 1-10 are the rolled impressions (top two rows); 11-14 are the plain
 * (slap) impressions along the bottom.
 */
export const FD258_POSITIONS = {
  R_THUMB: 1,
  R_INDEX: 2,
  R_MIDDLE: 3,
  R_RING: 4,
  R_LITTLE: 5,
  L_THUMB: 6,
  L_INDEX: 7,
  L_MIDDLE: 8,
  L_RING: 9,
  L_LITTLE: 10,
  PLAIN_R_THUMB: 11, // FGP 15 in NIST (right thumb plain) — normalized to 11 here
  PLAIN_L_THUMB: 12,
  PLAIN_R_FOUR: 13, // right four fingers plain
  PLAIN_L_FOUR: 14, // left four fingers plain
} as const;
