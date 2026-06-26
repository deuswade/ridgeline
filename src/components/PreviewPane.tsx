"use client";

interface Props {
  pdfUrl: string | null;
  rendering: boolean;
}

export default function PreviewPane({ pdfUrl, rendering }: Props) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      {pdfUrl ? (
        <iframe
          title="FD-258 preview"
          src={`${pdfUrl}#toolbar=0&navpanes=0&view=Fit`}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Preview will appear here
        </div>
      )}
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <span className="text-sm font-medium text-slate-600">Rendering…</span>
        </div>
      )}
    </div>
  );
}
