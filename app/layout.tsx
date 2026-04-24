import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quebra Cabeças",
  description: "Arena de quebra-cabeças com fila, largada sincronizada, pódio e painel admin em tempo real.",
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
