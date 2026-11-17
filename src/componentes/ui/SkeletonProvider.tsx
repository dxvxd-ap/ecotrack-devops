'use client';

import React from 'react';
import { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

// ============================================================================
// CONFIGURACIÓN DE COLORES Y ESTILOS (EDITA AQUÍ A TU GUSTO)
// ============================================================================
export const SKELETON_CONFIG = {
  // Tema Claro / Blanco
  light: {
    baseColor: '#e2e8f0',      // Fondo base del skeleton (gris muy claro)
    highlightColor: '#f8fafc', // Destello blanco suave al animar
  },
  // Tema Oscuro
  dark: {
    baseColor: '#1e293b',      // Fondo base oscuro (ej. slate-800)
    highlightColor: '#334155', // Destello sutil oscuro (ej. slate-700)
  },
  // Ajustes globales de animación y forma
  borderRadius: '0.5rem',      // Bordes redondeados (8px)
  duration: 1.4,               // Velocidad del brillo en segundos
};

interface SkeletonProviderProps {
  children: React.ReactNode;
  /** Pasa 'light' o 'dark' según el estado de tema de tu dashboard */
  theme?: 'light' | 'dark';
}

export function SkeletonProvider({
  children,
  theme = 'light',
}: SkeletonProviderProps) {
  const activeColors =
    theme === 'dark' ? SKELETON_CONFIG.dark : SKELETON_CONFIG.light;

  return (
    <SkeletonTheme
      baseColor={activeColors.baseColor}
      highlightColor={activeColors.highlightColor}
      borderRadius={SKELETON_CONFIG.borderRadius}
      duration={SKELETON_CONFIG.duration}
    >
      {children}
    </SkeletonTheme>
  );
}