"use client";

import { useEffect } from "react";

/**
 * Recuperador automático de ChunkLoadError:
 * Cuando Vercel despliega una nueva versión, los chunks de la versión anterior
 * son reemplazados. Este componente detecta si el navegador intenta cargar un chunk
 * desactualizado y recarga automáticamente la página para obtener la versión fresca.
 */
export function RecuperadorChunk() {
  useEffect(() => {
    const manejarError = (event: ErrorEvent) => {
      const mensaje = event.message || "";
      const esErrorChunk =
        event.error?.name === "ChunkLoadError" ||
        mensaje.includes("ChunkLoadError") ||
        mensaje.includes("Loading chunk");

      if (esErrorChunk) {
        console.warn("[EcoTrack] Se detectó un cambio de versión en el servidor. Actualizando aplicación...");
        const yaRecargado = sessionStorage.getItem("ecotrack_chunk_recargado");
        if (!yaRecargado) {
          sessionStorage.setItem("ecotrack_chunk_recargado", Date.now().toString());
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", manejarError);

    // Limpiar bandera tras 8 segundos de navegación estable
    const timer = setTimeout(() => {
      sessionStorage.removeItem("ecotrack_chunk_recargado");
    }, 8000);

    return () => {
      window.removeEventListener("error", manejarError);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
