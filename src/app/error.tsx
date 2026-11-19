"use client";

import { useEffect } from "react";
import { VistaError } from "@/componentes/ui/VistaError";

export default function ErrorGlobal({
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
      const yaRecargado = sessionStorage.getItem("chunk_reload_error_global");
      if (!yaRecargado) {
        sessionStorage.setItem("chunk_reload_error_global", "1");
        window.location.reload();
        return;
      }
    }
    console.error("[ErrorGlobal] Excepción no controlada:", error);
  }, [error]);

  const esErrorChunk =
    error.name === "ChunkLoadError" ||
    error.message?.includes("Loading chunk") ||
    error.message?.includes("ChunkLoadError");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <VistaError
        tipo="500"
        tituloPersonalizado={esErrorChunk ? "Actualización del Sistema Disponible" : undefined}
        mensajePersonalizado={
          esErrorChunk
            ? "Se ha desplegado una nueva versión en el servidor. Presiona 'Actualizar ahora' para cargar los últimos cambios."
            : undefined
        }
        alReintentar={() => {
          if (esErrorChunk) {
            window.location.reload();
          } else {
            reset();
          }
        }}
        enlaceVolver="/"
        textoVolver="Volver a la Página Principal"
        mostrarBotonInicio={false}
      />
    </div>
  );
}
