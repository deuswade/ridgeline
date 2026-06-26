import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ridgeline — EFT to FD-258",
  description: "Parse an EFT (NIST ITL) file and lay the demographics and prints onto a printable FD-258 card.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
