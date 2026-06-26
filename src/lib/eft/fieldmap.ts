/**
 * Type-2 demographic field mapping.
 *
 * The exact field numbers in a Type-2 record depend on the transmitting
 * agency's EBTS/profile, but the codes below are the widely-used FBI EBTS
 * defaults. Adjust here if your EFT source uses a different profile — this is
 * the one place to change demographic tag numbers.
 */

import type { Demographics } from "./types";

/** field number within Type-2 -> Demographics key (or a special handler). */
export interface Type2FieldDef {
  field: number;
  key: keyof Omit<Demographics, "extras" | "fullName">;
  label: string;
}

export const TYPE2_FIELDS: Type2FieldDef[] = [
  { field: 18, key: "lastName", label: "NAM" }, // NAME (parsed below)
  { field: 20, key: "placeOfBirth", label: "POB" },
  { field: 22, key: "dateOfBirth", label: "DOB" },
  { field: 24, key: "sex", label: "SEX" },
  { field: 25, key: "race", label: "RAC" },
  { field: 27, key: "height", label: "HGT" },
  { field: 29, key: "weight", label: "WGT" },
  { field: 31, key: "eyeColor", label: "EYE" },
  { field: 32, key: "hairColor", label: "HAI" },
  { field: 16, key: "ssn", label: "SOC" },
  { field: 15, key: "stateId", label: "SID" },
  { field: 14, key: "fbiNumber", label: "FBI" },
  { field: 10, key: "miscIdNumber", label: "MNU" },
  { field: 37, key: "reasonFingerprinted", label: "RFP" },
  { field: 38, key: "employerAndAddress", label: "EAD" },
  { field: 39, key: "residenceOfPersonFingerprinted", label: "RES" },
  { field: 5, key: "datePrinted", label: "DAT" },
];

/** Field number that holds the NAM (name) value, parsed as LAST,FIRST MIDDLE. */
export const NAME_FIELD = 18;

/** Parse a NIST NAM value "LAST,FIRST MIDDLE" into parts. */
export function parseName(raw: string): {
  lastName?: string;
  firstName?: string;
  middleName?: string;
  fullName: string;
} {
  const value = raw.replace(/\^/g, " ").trim();
  // EBTS often uses commas: LAST,FIRST,MIDDLE  or  LAST,FIRST MIDDLE
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const lastName = parts[0];
    const firstName = parts[1];
    const middleName = parts.length >= 3 ? parts.slice(2).join(" ") : undefined;
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    return { lastName, firstName, middleName, fullName };
  }
  return { fullName: value };
}

/** Normalize DOB to MM/DD/YYYY (the FD-258 "Month Day Year" format). */
export function normalizeDob(raw: string): string {
  const v = raw.trim();
  // NIST stores YYYYMMDD; also accept YYYY-MM-DD just in case.
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}
