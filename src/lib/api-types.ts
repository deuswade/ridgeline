import type { Demographics } from "./eft/types";

export interface ApiImage {
  position: number;
  width: number;
  height: number;
  compression: string;
  mime: string;
  /** base64 of PNG or JPEG bytes, or null if undecodable (e.g. WSQ). */
  dataBase64: string | null;
  note: string | null;
}

export interface ProcessResponse {
  fileName: string;
  demographics: Demographics;
  recordTypes: number[];
  warnings: string[];
  images: ApiImage[];
}
