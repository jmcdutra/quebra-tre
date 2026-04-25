import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "[TRE] Gincana (Quebra Cabeças)",
  description: "Gincana da Companhia dos Treinadores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
