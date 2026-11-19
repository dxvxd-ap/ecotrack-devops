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
    // Registro interno y seguro sin exponer stack traces al usuario final
    console.error("[DashboardError] Excepción capturada en dashboard:", error);
  }, [error]);

  return (
    <div className="py-12">
      <VistaError
        tipo="500"
        tituloPersonalizado="Interrupción en el Panel de Control"
        mensajePersonalizado="No pudimos cargar los datos operativos de esta sección. Intenta reintentar la acción o volver al resumen general."
        alReintentar={reset}
        enlaceVolver="/dashboard"
        textoVolver="Volver al Resumen General"
      />
    </div>
  );
}
