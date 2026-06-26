"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadZone from "@/components/UploadZone";
import CalibrationControls from "@/components/CalibrationControls";
import PreviewPane from "@/components/PreviewPane";
import { composePdf } from "@/lib/pdf/client";
import { getExtraFields } from "@/lib/pdf/fd258-layout";
import type { ProcessResponse } from "@/lib/api-types";

type Stage = "idle" | "uploading" | "ready" | "error";

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProcessResponse | null>(null);

  const [offsetXmm, setOffsetXmm] = useState(0);
  const [offsetYmm, setOffsetYmm] = useState(0);
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [printOri, setPrintOri] = useState(true);
  const [printTemplate, setPrintTemplate] = useState(false);
  const [pageSize, setPageSize] = useState<"card" | "letter">("letter");

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const lastBytes = useRef<Uint8Array | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setStage("uploading");
    setError(null);
    setData(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/process", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to process file.");
      const resp = json as ProcessResponse;
      // Pre-fill the extra inputs from any demographics the EFT provided.
      const initial: Record<string, string> = {};
      for (const f of getExtraFields()) {
        initial[f.name] = f.key ? ((resp.demographics as any)[f.key] ?? "") : "";
      }
      setExtras(initial);
      setData(resp);
      setStage("ready");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }, []);

  // Re-compose the PDF whenever data or offsets change (debounced).
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const bytes = await composePdf({ data, offsetXmm, offsetYmm, extras, printOri });
        if (cancelled) return;
        lastBytes.current = bytes;
        const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, offsetXmm, offsetYmm, extras, printOri]);

  // Print/Download output is DATA-ONLY (no template) — it overlays onto a real
  // pre-printed FD-258 card. The template is only shown in the preview above.
  const buildOutput = async (): Promise<Uint8Array | null> => {
    if (!data) return null;
    return composePdf({ data, offsetXmm, offsetYmm, extras, printOri, includeTemplate: printTemplate, pageSize });
  };

  const download = async () => {
    const bytes = await buildOutput();
    if (!bytes) return;
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (data?.fileName?.replace(/\.[^.]+$/, "") || "fd-258") + ".pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = async () => {
    const bytes = await buildOutput();
    if (!bytes) return;
    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url);
    w?.addEventListener("load", () => w.print());
  };

  const reset = () => {
    setStage("idle");
    setData(null);
    setError(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Ridgeline <span className="font-normal text-slate-400">· EFT → FD-258</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload an EFT (NIST ITL) transmission file. We extract the demographics and fingerprint
          impressions and lay them onto a print-ready 8&quot;×8&quot; FD-258 card.
        </p>
      </header>

      {stage === "idle" || stage === "error" ? (
        <div className="space-y-4">
          <UploadZone onFile={handleFile} />
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      ) : stage === "uploading" ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p className="mt-4 text-sm text-slate-600">Parsing EFT and decoding impressions…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Print preview</h2>
              <button onClick={reset} className="text-xs font-medium text-slate-500 hover:underline">
                Upload another file
              </button>
            </div>
            <PreviewPane pdfUrl={pdfUrl} rendering={rendering} />
            <div className="mt-4 flex gap-3">
              <button
                onClick={print}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Print
              </button>
              <button
                onClick={download}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Download PDF
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={printOri}
                onChange={(e) => setPrintOri(e.target.checked)}
                className="accent-blue-600"
              />
              Print the ORI block (uncheck if your cards already have the ORI pre-printed)
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={printTemplate}
                onChange={(e) => setPrintTemplate(e.target.checked)}
                className="accent-blue-600"
              />
              Print the card template too (for printing a full card on blank cardstock)
            </label>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <span>Output size:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as "card" | "letter")}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="letter">US Letter — 8×8 at top-left (most printers)</option>
                <option value="card">8×8 card (only if your printer honors custom size)</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              The card outline above is only a preview for alignment. Print &amp; Download output{" "}
              <strong>only your data and prints</strong> (no card lines), to overlay onto a real pre-printed
              FD-258 card. Type extra details under &ldquo;Add to card&rdquo; — they&rsquo;re always included.
            </p>
          </section>

          <aside className="space-y-6">
            <CalibrationControls
              offsetXmm={offsetXmm}
              offsetYmm={offsetYmm}
              onChange={({ offsetXmm: x, offsetYmm: y }) => {
                setOffsetXmm(x);
                setOffsetYmm(y);
              }}
            />
            <ExtrasPanel
              extras={extras}
              onChange={(name, value) => setExtras((prev) => ({ ...prev, [name]: value }))}
            />
            {data && <DemographicsCard data={data} />}
          </aside>
        </div>
      )}

      <PrintMargins />
    </main>
  );
}

function ExtrasPanel({
  extras,
  onChange,
}: {
  extras: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">Add to card</h3>
      <p className="mt-1 text-xs text-slate-500">Fill in the boxes the EFT didn&rsquo;t cover.</p>
      <div className="mt-3 space-y-2">
        {getExtraFields().map((f) => (
          <label key={f.name} className="block">
            <span className="text-[11px] text-slate-500">{f.label}</span>
            {f.multiline ? (
              <textarea
                rows={2}
                value={extras[f.name] ?? ""}
                onChange={(e) => onChange(f.name, e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            ) : (
              <input
                value={extras[f.name] ?? ""}
                onChange={(e) => onChange(f.name, e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function DemographicsCard({ data }: { data: ProcessResponse }) {
  const d = data.demographics;
  const rows: [string, string | undefined][] = [
    ["Name", d.fullName],
    ["DOB", d.dateOfBirth],
    ["Sex", d.sex],
    ["Race", d.race],
    ["Height", d.height],
    ["Weight", d.weight],
    ["Eyes", d.eyeColor],
    ["Hair", d.hairColor],
  ];
  const decoded = data.images.filter((i) => i.dataBase64).length;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">Extracted data</h3>
      <dl className="mt-3 space-y-1 text-xs">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-800">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        Impressions decoded: <span className="font-medium text-slate-800">{decoded}</span> of{" "}
        {data.images.length} · Records: {data.recordTypes.join(", ")}
      </p>
      {data.warnings.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-amber-700">
            {data.warnings.length} warning(s)
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-amber-700">
            {data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PrintMargins() {
  return (
    <style>{`
      @media print {
        @page { size: 8in 8in; margin: 0; }
      }
    `}</style>
  );
}
