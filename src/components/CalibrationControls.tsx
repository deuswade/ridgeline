"use client";

interface Props {
  offsetXmm: number;
  offsetYmm: number;
  onChange: (next: { offsetXmm: number; offsetYmm: number }) => void;
}

const RANGE = 10; // +/- 10 mm of travel

export default function CalibrationControls({ offsetXmm, offsetYmm, onChange }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">Printer calibration</h3>
      <p className="mt-1 text-xs text-slate-500">
        Nudge all content to match how your printer pulls paper. Print once, compare to a blank
        card, then fine-tune.
      </p>

      <Slider
        label="Horizontal (X)"
        hint="− left · + right"
        value={offsetXmm}
        onChange={(v) => onChange({ offsetXmm: v, offsetYmm })}
      />
      <Slider
        label="Vertical (Y)"
        hint="− up · + down"
        value={offsetYmm}
        onChange={(v) => onChange({ offsetXmm, offsetYmm: v })}
      />

      <button
        type="button"
        onClick={() => onChange({ offsetXmm: 0, offsetYmm: 0 })}
        className="mt-2 text-xs font-medium text-blue-600 hover:underline"
      >
        Reset to 0
      </button>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-700">{label}</label>
        <span className="font-mono text-xs text-slate-600">{value.toFixed(1)} mm</span>
      </div>
      <input
        type="range"
        min={-RANGE}
        max={RANGE}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-blue-600"
      />
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{hint}</div>
    </div>
  );
}
