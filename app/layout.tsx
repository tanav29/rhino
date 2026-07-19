import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "term",
  description: "Browser-based terminal powered by wterm",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="font-sans dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
