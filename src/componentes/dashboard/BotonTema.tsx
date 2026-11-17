'use client';

import { useTema } from '@/context/TemaContext';
import { Sun, Moon } from 'lucide-react';

export function BotonTema() {
  const { tema, alternarTema, montado } = useTema();

  if (!montado) {
    return (
      <div className="w-8 h-8 rounded-lg bg-zinc-800/40 border border-zinc-700/40 animate-pulse" />
    );
  }

  return (
    <button
      type="button"
      onClick={alternarTema}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 shadow-sm"
      title={tema === 'dark' ? 'Cambiar a Tema Claro (Blanco)' : 'Cambiar a Tema Oscuro'}
    >
      {tema === 'dark' ? (
        <>
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline text-[11px] font-semibold">Tema Claro</span>
        </>
      ) : (
        <>
          <Moon className="w-3.5 h-3.5 text-blue-500" />
          <span className="hidden sm:inline text-[11px] font-semibold">Tema Oscuro</span>
        </>
      )}
    </button>
  );
}
