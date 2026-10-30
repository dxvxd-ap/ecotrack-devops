import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoRuta - Sistema de Gestión Logística y Rutas de Residuos",
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
      <html lang="es">
        <body className="antialiased min-h-screen flex flex-col bg-white text-zinc-900 selection:bg-blue-600 selection:text-white">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

