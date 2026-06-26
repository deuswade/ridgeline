"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFile, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFile(files[0]);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-blue-400",
        dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".eft,.nist,.an2,.ebts"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <svg className="mb-3 h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0L8.25 12.75M12 9l3.75 3.75M3 16.5v1.875A2.625 2.625 0 005.625 21h12.75A2.625 2.625 0 0021 18.375V16.5" />
      </svg>
      <p className="text-base font-medium text-slate-700">
        Drag &amp; drop your <span className="font-mono">.eft</span> file here
      </p>
      <p className="mt-1 text-sm text-slate-500">or click to browse</p>
    </div>
  );
}
