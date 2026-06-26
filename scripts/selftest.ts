/* Runtime self-test: parse the fixture and generate a PDF. Not shipped logic. */
import { readFileSync, writeFileSync } from "node:fs";
import { parseEft } from "../src/lib/eft/parser";
import { generateFd258Pdf } from "../src/lib/pdf/generate";

async function main() {
  const eft = new Uint8Array(readFileSync(new URL("../fixtures/sample.eft", import.meta.url)));
  const result = await parseEft(eft);

  console.log("recordTypes:", result.recordTypes.join(","));
  console.log("name:", result.demographics.fullName);
  console.log("dob:", result.demographics.dateOfBirth, "sex:", result.demographics.sex,
    "hgt:", result.demographics.height, "wgt:", result.demographics.weight,
    "eyes:", result.demographics.eyeColor, "hair:", result.demographics.hairColor);
  console.log("images:", result.images.length,
    "decoded:", result.images.filter((i) => i.pngData).length);
  console.log("positions:", result.images.map((i) => i.fingerPosition).join(","));
  console.log("warnings:", result.warnings.length);

  let template: Uint8Array | null = null;
  try {
    template = new Uint8Array(readFileSync(new URL("../public/fd-258-template.pdf", import.meta.url)));
  } catch {}

  const pdf = await generateFd258Pdf({
    demographics: result.demographics,
    images: result.images,
    offsetXmm: 1.5,
    offsetYmm: -2,
    templateBytes: template,
  });
  writeFileSync(new URL("../fixtures/out-test.pdf", import.meta.url), pdf);
  console.log("PDF bytes:", pdf.length, "(8x8 page)");

  // Assertions
  const ok =
    result.demographics.fullName === "JOHN QUINCY DOE" &&
    result.images.length === 14 &&
    result.images.every((i) => i.pngData) &&
    pdf.length > 1000;
  console.log(ok ? "SELFTEST PASS" : "SELFTEST FAIL");
  if (!ok) process.exit(1);
}
main();
