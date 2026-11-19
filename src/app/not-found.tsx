import { VistaError } from "@/componentes/ui/VistaError";

export default function PaginaNoEncontrada() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <VistaError
        tipo="404"
        enlaceVolver="/"
        textoVolver="Volver a la Página Principal"
        mostrarBotonInicio={false}
      />
    </div>
  );
}
