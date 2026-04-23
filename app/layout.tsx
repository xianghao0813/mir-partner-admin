import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MIR Partner Admin",
  description: "Independent admin console for MIR Partner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
