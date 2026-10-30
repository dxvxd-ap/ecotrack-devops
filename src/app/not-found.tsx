import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function PaginaNoEncontrada() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-blue-400 mb-6">
        <Compass className="w-7 h-7" />
      </div>
      <h1 className="texto-anton text-4xl text-white tracking-wide mb-2">
        404 // PÁGINA NO ENCONTRADA
      </h1>
      <p className="text-xs text-zinc-400 max-w-sm mb-6 font-mono">
        La ruta o recurso solicitado no existe dentro del sistema logístico EcoRuta.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Volver al Inicio</span>
      </Link>
    </div>
  );
}

