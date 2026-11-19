"use client";

import { VistaError } from "@/componentes/ui/VistaError";

export default function PaginaAccesoDenegadoDashboard() {
  return (
    <div className="py-12">
      <VistaError
        tipo="403"
        tituloPersonalizado="Permisos Insuficientes en Dashboard"
        mensajePersonalizado="Tu cuenta actual no posee privilegios operativos o administrativos suficientes (RBAC) para ver o modificar este recurso de EcoTrack."
        enlaceVolver="/ciudadano"
        textoVolver="Ir al Portal Ciudadano"
        mostrarBotonInicio={true}
      />
    </div>
  );
}
