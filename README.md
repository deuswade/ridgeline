<p align="center">
  <img src="assets/logo.png" width="128" alt="Ridgeline logo" />
</p>

<h1 align="center">Ridgeline</h1>

Ridgeline reads an **EFT** file (an ANSI/NIST‑ITL biometric transmission, the
format produced by livescan fingerprint systems) and lays the demographics and
the fingerprint impressions onto a print‑ready **FD‑258** fingerprint card.

It parses the Type‑1/2/4/14 records, decodes the prints (including FBI **WSQ**),
trims and fits each impression into its box, and either overlays your data onto a
real pre‑printed FD‑258 card or prints a complete card on blank stock.

Everything runs locally in your browser — **no server processes your data, and
no biometric data leaves your machine.**

---

## Two ways to run it

### 1. Standalone HTML — easiest, zero install

Open **`fd258-standalone.html`** in any modern browser (double‑click it).

That's it. The standalone is **completely self‑contained** — all libraries
(`pdf-lib`, `pako`, and the WSQ/PNG codecs) are inlined into the file. It needs
**no `npm install`, no build step, and no internet connection.** You can copy
that one file anywhere and it just works, offline.

It includes an embedded synthetic sample so you can click **"Try with sample"**
and see the whole pipeline immediately.

### 2. Next.js app — for development

If you want to modify the code or run the full app:

```bash
git clone <your-fork-url> ridgeline
cd ridgeline
npm install
npm run dev
```

Then open <http://localhost:3000>. Drag `fixtures/sample.eft` onto the upload
zone to try it.

Requirements: Node.js 18+ and npm.

The Next.js version parses the EFT in an API route (server‑side, where it uses
Node's `zlib` for raw rasters) and composes the PDF in the browser so the
calibration sliders re‑render instantly.

---

## Using it

1. **Upload** an `.eft` file (drag‑and‑drop or click to browse).
2. The demographics and the 14 impressions are extracted and shown on a live
   FD‑258 preview.
3. Under **Add to card**, type any fields the EFT didn't supply (aliases,
   citizenship, residence, employer, reason fingerprinted, etc.). These are
   drawn straight onto the output, so Print/Download always include them.
4. Options:
   - **Print the ORI block** — on by default. Uncheck if your cards already have
     the ORI pre‑printed.
   - **Print the card template too** — off by default. Leave it off to overlay
     only your data onto a real pre‑printed card; turn it on to print a complete
     card (lines, labels, data, prints) on blank cardstock.
   - **Output size** — **US Letter** (the 8×8 content pinned near the top‑left of
     a letter page; works on almost any printer) or **8×8 card** (only if your
     printer honors a true 8″×8″ custom size).
   - **Printer calibration (X/Y, mm)** — nudge everything to compensate for how
     your printer pulls paper.
5. **Print** or **Download PDF**.

> The card outline in the preview is an **alignment aid only**. The printed/
> downloaded output contains only your data + prints unless you tick "Print the
> card template too."

---

## Printing notes (read this before wasting a card)

FD‑258 cards are exactly **8″ × 8″**, and the output is generated at that exact
size for 1:1 printing. Getting a laser printer to cooperate takes a couple of
settings:

- Use the **US Letter** output size and print on **US Letter** paper. Most
  printers/drivers quietly re‑center or refuse a custom 8×8 page; Letter is
  honored reliably, and the content sits in the top‑left 8 inches.
- In the print dialog: **Scale 100%** (not "Scale to Fit"), **Auto‑Rotate OFF**,
  Portrait.
- **Test on plain paper first.** Lay the test sheet over a blank FD‑258 card and
  use the **X/Y sliders** to fine‑tune, then print onto the card. The slider
  value is stable for a given printer, so you set it once.
- Laser printers can't print within ~0.2–0.5″ of the paper edge. The Letter
  layout keeps everything inside the printable area; a true 8×8 page will clip at
  the edges on most lasers.

---

## How it works

```
src/
  app/
    page.tsx                 Upload → preview → calibrate → print/download
    api/process/route.ts     POST: parse EFT, decode images (Node runtime)
  components/                UploadZone, CalibrationControls, PreviewPane
  lib/
    eft/
      parser.ts              NIST ITL record walker (Type-1 CNT driven)
      images.ts              Compression detect + decode dispatch
      png.ts                 Grayscale → PNG (Node zlib)
      trim.ts                Crop whitespace around each print (@pdf-lib/upng)
      fieldmap.ts            Type-2 demographic field → label map (EBTS defaults)
      types.ts               Shared types + FD-258 position codes
    pdf/
      fd258-layout.ts        Coordinate map (mm) — EDIT HERE to re-calibrate
      generate.ts            pdf-lib composition (runs client-side)
      client.ts              Rebuilds parse result → live PDF in the browser
  scripts/
    make-fixture-eft.mjs     Build fixtures/sample.eft from fixtures/prints
    make-placeholder-template.mjs
    selftest.ts              End-to-end parse + generate sanity check
fixtures/
  sample.eft                 Synthetic sample transmission (see below)
  prints/                    14 cropped sample prints (see below)
public/
  fd-258-template.pdf        FD-258 card art used for the on-screen preview
fd258-standalone.html        Self-contained offline build of the whole app
```

### Fingerprint formats / WSQ

Type‑4 records (and many Type‑14) store prints as **WSQ** (FBI Wavelet Scalar
Quantization). Ridgeline decodes WSQ with
[`@li0ard/wsq`](https://www.npmjs.com/package/@li0ard/wsq) (a pure‑JS port of the
NBIS reference decoder), and handles uncompressed grayscale, JPEG, and PNG
natively. Each decoded print is cropped to its inked content so it fills its box
cleanly without crossing the card's lines.

### Demographic field map

Type‑2 field numbers vary by transmitting‑agency profile. The defaults
(FBI EBTS) live in `src/lib/eft/fieldmap.ts` — adjust there if your source uses a
different profile. Unmapped fields are preserved under `demographics.extras`.

### Customizing

- **Card coordinates:** all box and text positions are in `src/lib/pdf/
  fd258-layout.ts`, in millimeters with a top‑left origin. They're measured from
  the official FD‑258 (Rev. 10/31/2023).
- **Default ORI:** the pre‑filled ORI block is defined in `fd258-layout.ts`
  (`ORI_LINES`). Change it to your agency's ORI, or just uncheck "Print the ORI
  block" in the UI.
- The standalone HTML has the same constants inlined near the top of its
  `<script>` block if you'd rather edit that copy directly.

---

## Sample data

Both the sample EFT and the prints in it are **non‑sensitive**:

- The demographics are obviously fake (`DOE, JOHN QUINCY`, etc.).
- The 14 fingerprint images are cropped from a **license‑free** sample FD‑258
  card and stored in `fixtures/prints/`. Run `npm run make:fixture` to rebuild
  `fixtures/sample.eft` from them.

No real biometric or personal data is included in this repository.

---

## Disclaimer

Ridgeline is an independent, open‑source tool. It is **not affiliated with or
endorsed by the FBI, ATF, or any government agency.** Validate the output against
your own EFT files and card stock before any operational use — confirm the field
mapping matches your transmitting agency's profile and that alignment is correct
on your printer.

## License

GPL‑3.0‑or‑later. See [`LICENSE`](./LICENSE).
