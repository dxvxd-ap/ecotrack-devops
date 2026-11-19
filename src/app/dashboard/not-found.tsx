import { VistaError } from "@/componentes/ui/VistaError";

export default function PaginaDashboardNoEncontrada() {
  return (
    <div className="py-12">
      <VistaError
        tipo="404"
        tituloPersonalizado="Módulo o recurso no encontrado"
        mensajePersonalizado="El módulo de administración, reporte o ruta solicitada no se encuentra disponible en el panel de control."
        enlaceVolver="/dashboard"
        textoVolver="Volver a Resumen General"
      />
    </div>
  );
}
