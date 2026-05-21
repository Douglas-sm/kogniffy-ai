import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kogniffy AI",
  description: "Plataforma gamificada de triagem cognitiva com resultados lúdicos, indicativos e não diagnósticos."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#173b4f"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
