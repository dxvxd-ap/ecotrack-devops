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
    // Registro interno y seguro en la consola del cliente/servidor sin filtrar al DOM
    console.error("[ErrorGlobal] Excepción no controlada:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <VistaError
        tipo="500"
        alReintentar={reset}
        enlaceVolver="/"
        textoVolver="Volver a la Página Principal"
        mostrarBotonInicio={false}
      />
    </div>
  );
}
