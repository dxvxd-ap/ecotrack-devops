'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SkeletonProvider } from '@/componentes/ui/SkeletonProvider';

export type Tema = 'light' | 'dark';

interface ContextoTemaValor {
  tema: Tema;
  alternarTema: () => void;
  fijarTema: (tema: Tema) => void;
  montado: boolean;
}

const ContextoTema = createContext<ContextoTemaValor>({
  tema: 'dark',
  alternarTema: () => {},
  fijarTema: () => {},
  montado: false,
});

export function useTema() {
  return useContext(ContextoTema);
}

export function ProveedorTema({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema>('dark');
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem('ecotrack_tema') as Tema | null;
      if (guardado === 'light' || guardado === 'dark') {
        setTema(guardado);
        document.documentElement.setAttribute('data-theme', guardado);
        if (guardado === 'light') {
          document.documentElement.classList.add('light');
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      }
    } catch {
      // Ignorar fallos de acceso a localStorage
    }
    setMontado(true);
  }, []);

  const alternarTema = () => {
    setTema((prev) => {
      const siguiente: Tema = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('ecotrack_tema', siguiente);
      } catch {}
      document.documentElement.setAttribute('data-theme', siguiente);
      if (siguiente === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
      return siguiente;
    });
  };

  const fijarTema = (nuevoTema: Tema) => {
    setTema(nuevoTema);
    try {
      localStorage.setItem('ecotrack_tema', nuevoTema);
    } catch {}
    document.documentElement.setAttribute('data-theme', nuevoTema);
    if (nuevoTema === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  };

  return (
    <ContextoTema.Provider value={{ tema, alternarTema, fijarTema, montado }}>
      <SkeletonProvider theme={tema}>
        {children}
      </SkeletonProvider>
    </ContextoTema.Provider>
  );
}
