import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { RecuperadorChunk } from "@/componentes/ui/RecuperadorChunk";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoTrack - Sistema de Gestión Logística y Rutas de Residuos",
  description:
    "Plataforma inteligente para la administración de rutas de recolección, telemetría de camiones, calendario logístico y alertas en tiempo real al ciudadano.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="es" suppressHydrationWarning>
        <body className="antialiased min-h-screen w-full flex flex-col selection:bg-blue-600 selection:text-white">
          <RecuperadorChunk />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

