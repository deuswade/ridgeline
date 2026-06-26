/**
 * FD-258 card layout — coordinates measured from the official FD-258
 * (Rev. 10/31/2023) fillable PDF rendered at 150 px/in (1200×1200 px on an
 * 8" × 8" page, i.e. 5.9055 px/mm).
 *
 * Coordinates are in MILLIMETERS with a TOP-LEFT origin (x right, y down) —
 * how a ruler reads the card. `toPdfPoints()` converts to pdf-lib's bottom-left
 * point space. The X/Y calibration sliders add mm offsets on top of these.
 *
 * If you swap in a different FD-258 revision, re-measure and edit here.
 */

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const POINTS_PER_MM = POINTS_PER_INCH / MM_PER_INCH;

/** Card size: exactly 8" x 8". */
export const CARD_WIDTH_MM = 8 * MM_PER_INCH; // 203.2
export const CARD_HEIGHT_MM = 8 * MM_PER_INCH; // 203.2
export const CARD_WIDTH_PT = 8 * POINTS_PER_INCH; // 576
export const CARD_HEIGHT_PT = 8 * POINTS_PER_INCH; // 576

export interface Rect {
  x: number; // mm from left
  y: number; // mm from TOP
  w: number; // mm
  h: number; // mm
}

export interface TextField {
  key: string; // Demographics key
  rect: Rect;
  fontSize: number; // points
  label?: string;
}

export interface ImageBox {
  position: number; // normalized finger position 1-14
  caption: string;
  rect: Rect;
  /** Multiplier applied to the contain-fit size (1 = fit exactly). >1 enlarges. */
  scale?: number;
}

export interface Fd258Layout {
  cardWidthMm: number;
  cardHeightMm: number;
  textFields: TextField[];
  imageBoxes: ImageBox[];
}

// --- Demographic fields (top block) — created as PRE-FILLED fillable fields. ---
// y values nudged up vs. the first pass so values sit centered in their boxes.
const textFields: TextField[] = [
  // Name band — the card has separate LAST / FIRST / MIDDLE sub-columns.
  { key: "lastName", rect: { x: 78, y: 8, w: 34, h: 6 }, fontSize: 10, label: "LAST" },
  { key: "firstName", rect: { x: 114, y: 8, w: 24, h: 6 }, fontSize: 10, label: "FIRST" },
  { key: "middleName", rect: { x: 139, y: 8, w: 22, h: 6 }, fontSize: 10, label: "MIDDLE" },
  // FBI number, top-right corner box.
  { key: "fbiNumber", rect: { x: 162, y: 6, w: 38, h: 6 }, fontSize: 9, label: "FBI" },
  // Date of birth is drawn separately as Month / Day / Year parts (see generate).
  // SEX / RACE / HGT / WGT / EYES / HAIR row — values in the data cell below headers.
  { key: "sex", rect: { x: 116, y: 35, w: 9, h: 4 }, fontSize: 8, label: "SEX" },
  { key: "race", rect: { x: 124, y: 35, w: 10, h: 4 }, fontSize: 8, label: "RACE" },
  { key: "height", rect: { x: 133, y: 35, w: 11, h: 4 }, fontSize: 8, label: "HGT" },
  { key: "weight", rect: { x: 144, y: 35, w: 11, h: 4 }, fontSize: 8, label: "WGT" },
  { key: "eyeColor", rect: { x: 154, y: 35, w: 10, h: 4 }, fontSize: 8, label: "EYES" },
  { key: "hairColor", rect: { x: 165, y: 35, w: 10, h: 4 }, fontSize: 8, label: "HAIR" },
  { key: "placeOfBirth", rect: { x: 174, y: 35, w: 28, h: 4 }, fontSize: 8, label: "POB" },
];

/**
 * Extra card boxes the user types into (drawn as positioned text, prefilled from
 * the parsed demographics where `key` is set). `align: "right"` places the value
 * in the blank writing space, clear of the printed label / code marker.
 */
export interface ExtraField {
  name: string; // identifier used by the UI inputs + values object
  label: string; // shown next to the input
  key?: string; // Demographics key to pre-fill from, if any
  rect: Rect;
  fontSize: number;
  align?: "left" | "right";
  multiline?: boolean;
}

const extraFields: ExtraField[] = [
  { name: "residence", key: "residenceOfPersonFingerprinted", label: "Residence", rect: { x: 3, y: 30, w: 70, h: 5 }, fontSize: 8 },
  { name: "date_taken", label: "Date", rect: { x: 3, y: 40, w: 28, h: 3.5 }, fontSize: 8 },
  { name: "employer_address", label: "Employer & address", rect: { x: 3, y: 50, w: 70, h: 6 }, fontSize: 8, multiline: true },
  { name: "reason_fingerprinted", label: "Reason fingerprinted", rect: { x: 3, y: 64, w: 70, h: 8 }, fontSize: 8, multiline: true },
  { name: "aliases", label: "Aliases (AKA)", rect: { x: 78, y: 21, w: 33, h: 4 }, fontSize: 8 },
  // Middle column: value on the writing line below the label, left-aligned.
  { name: "citizenship", label: "Citizenship (CTZ)", rect: { x: 79, y: 34, w: 33, h: 4 }, fontSize: 8 },
  { name: "your_no", label: "Your no. (OCA)", rect: { x: 79, y: 41, w: 33, h: 4 }, fontSize: 8 },
  { name: "universal_control_no", label: "Universal control no. (UCN)", rect: { x: 79, y: 48, w: 33, h: 4 }, fontSize: 8 },
  { name: "armed_forces_no", label: "Armed forces no. (MNU)", rect: { x: 79, y: 54.5, w: 33, h: 4 }, fontSize: 8 },
  { name: "ssn", key: "ssn", label: "Social security no. (SOC)", rect: { x: 79, y: 63, w: 33, h: 4 }, fontSize: 8 },
  { name: "misc", key: "miscIdNumber", label: "Miscellaneous no. (MNU)", rect: { x: 79, y: 69.5, w: 33, h: 4 }, fontSize: 8 },
];

export function getExtraFields(): ExtraField[] {
  return extraFields;
}

/** Fixed ORI block, pre-printed on every card (centered in the ORI box). */
export const ORI_LINES = ["WVATF0800", "ATF-NATL TRA CTR", "MARTINSBURG, WV"];
export const ORI_BOX: Rect = { x: 116, y: 17, w: 42, h: 16 };
export const ORI_FONT_SIZE = 8.5;
export const ORI_LINE_MM = 4.2;

/**
 * Date of birth is printed as three numbers centered under the Month / Day /
 * Year sub-labels. Sub-rects tile the DOB box (x 174–202 mm).
 */
export const DOB_PARTS: { month: Rect; day: Rect; year: Rect; fontSize: number } = {
  month: { x: 174, y: 27.5, w: 9, h: 4 },
  day: { x: 183, y: 27.5, w: 8, h: 4 },
  year: { x: 191, y: 27.5, w: 11, h: 4 },
  fontSize: 9,
};

// --- Fingerprint impression boxes ---
// Box rects are measured from the template's printed grid lines, inset ~1.5 mm
// inside each cell so a print never crosses a line.
//   Rolled column dividers: 40.9 / 81.8 / 122.3 / 163.3 mm  (outer ~2 / ~202)
//   Row dividers: 74.4 / 113.2 / 151.3 / 198.1 mm
//   Plain-row dividers: 81.8 / 101.9 / 122.3 mm
const ROLL_X = [3.5, 42.4, 83.3, 123.8, 164.8]; // left edge per column (inset)
const ROLL_W = [35.9, 37.9, 37.5, 38.0, 35.7]; // width per column (inset)
const ROW1_Y = 75.9;
const ROW1_H = 35.8;
const ROW2_Y = 114.7;
const ROW2_H = 35.1;

const capsR = ["R. Thumb", "R. Index", "R. Middle", "R. Ring", "R. Little"];
const capsL = ["L. Thumb", "L. Index", "L. Middle", "L. Ring", "L. Little"];

const imageBoxes: ImageBox[] = [];
for (let c = 0; c < 5; c++) {
  imageBoxes.push({
    position: c + 1,
    caption: capsR[c],
    rect: { x: ROLL_X[c], y: ROW1_Y, w: ROLL_W[c], h: ROW1_H },
  });
}
for (let c = 0; c < 5; c++) {
  imageBoxes.push({
    position: c + 6,
    caption: capsL[c],
    rect: { x: ROLL_X[c], y: ROW2_Y, w: ROLL_W[c], h: ROW2_H },
  });
}

// Bottom plain-impression band: Left four | L thumb | R thumb | Right four.
const PLAIN_Y = 152.8;
const PLAIN_H = 43.8;
imageBoxes.push(
  { position: 14, caption: "L. Four Fingers", rect: { x: 3.5, y: PLAIN_Y, w: 76.8, h: PLAIN_H } },
  { position: 12, caption: "L. Thumb", rect: { x: 83.3, y: PLAIN_Y, w: 17.1, h: PLAIN_H } },
  { position: 11, caption: "R. Thumb", rect: { x: 103.4, y: PLAIN_Y, w: 17.4, h: PLAIN_H } },
  { position: 13, caption: "R. Four Fingers", rect: { x: 123.8, y: PLAIN_Y, w: 76.7, h: PLAIN_H } },
);

export const FD258_LAYOUT: Fd258Layout = {
  cardWidthMm: CARD_WIDTH_MM,
  cardHeightMm: CARD_HEIGHT_MM,
  textFields,
  imageBoxes,
};

/** Convert a top-left mm rect (+ mm offsets) to pdf-lib bottom-left points. */
export function toPdfPoints(
  rect: Rect,
  offsetXmm: number,
  offsetYmm: number,
): { x: number; y: number; w: number; h: number } {
  const xMm = rect.x + offsetXmm;
  const yTopMm = rect.y + offsetYmm; // +Y slider nudges down
  return {
    x: xMm * POINTS_PER_MM,
    y: (CARD_HEIGHT_MM - yTopMm - rect.h) * POINTS_PER_MM,
    w: rect.w * POINTS_PER_MM,
    h: rect.h * POINTS_PER_MM,
  };
}
