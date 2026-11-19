"use client";

import { useEffect } from "react";
import { VistaError } from "@/componentes/ui/VistaError";

export default function ErrorDashboard({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const esChunk =
      error.name === "ChunkLoadError" ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("ChunkLoadError");

    if (esChunk) {
      const yaRecargado = sessionStorage.getItem("chunk_reload_error_dashboard");
      if (!yaRecargado) {
        sessionStorage.setItem("chunk_reload_error_dashboard", "1");
        window.location.reload();
        return;
      }
    }
    console.error("[DashboardError] Excepción capturada en dashboard:", error);
  }, [error]);

  const esErrorChunk =
    error.name === "ChunkLoadError" ||
    error.message?.includes("Loading chunk") ||
    error.message?.includes("ChunkLoadError");

  return (
    <div className="py-12">
      <VistaError
        tipo="500"
        tituloPersonalizado={esErrorChunk ? "Actualización del Panel Disponible" : "Interrupción en el Panel de Control"}
        mensajePersonalizado={
          esErrorChunk
            ? "Se ha detectado una nueva versión del sistema en Vercel. Presiona 'Actualizar ahora' para recargar el panel de control."
            : "No pudimos cargar los datos operativos de esta sección. Intenta reintentar la acción o volver al resumen general."
        }
        alReintentar={() => {
          if (esErrorChunk) {
            window.location.reload();
          } else {
            reset();
          }
        }}
        enlaceVolver="/dashboard"
        textoVolver="Volver al Resumen General"
      />
    </div>
  );
}
