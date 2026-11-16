import type { ComponentProps } from 'react';
import type { SignIn } from '@clerk/react';

type Apariencia = NonNullable<ComponentProps<typeof SignIn>['appearance']>;

// Core 3 (@clerk/react 6): tokens oficiales. Colores directos para evitar
// depender de la resolución de var()/color-mix en distintas versiones de Safari.
const claro = {
  variables: {
    colorPrimary: '#047857', colorPrimaryForeground: '#ffffff',
    colorBackground: '#ffffff', colorForeground: '#0f172a',
    colorMuted: '#f1f5f9', colorMutedForeground: '#475569',
    colorInput: '#ffffff', colorInputForeground: '#0f172a',
    colorNeutral: '#0f172a', colorBorder: '#64748b', colorRing: '#047857',
    colorDanger: '#b91c1c', colorSuccess: '#047857', colorWarning: '#92400e',
  },
  elements: {
    rootBox: { colorScheme: 'light' },
    card: { backgroundColor: '#ffffff', color: '#0f172a' },
    formButtonPrimary: { backgroundColor: '#047857', color: '#ffffff' },
  },
} satisfies Apariencia;

const oscuro = {
  variables: {
    colorPrimary: '#6ee7b7', colorPrimaryForeground: '#052e16',
    colorBackground: '#0f172a', colorForeground: '#e2e8f0',
    colorMuted: '#1e293b', colorMutedForeground: '#cbd5e1',
    colorInput: '#0a0f1a', colorInputForeground: '#f8fafc',
    colorNeutral: '#e2e8f0', colorBorder: '#94a3b8', colorRing: '#34d399',
    colorDanger: '#fca5a5', colorSuccess: '#6ee7b7', colorWarning: '#fde68a',
  },
  elements: {
    rootBox: { colorScheme: 'dark' },
    card: { backgroundColor: '#0f172a', color: '#e2e8f0' },
    formButtonPrimary: { backgroundColor: '#6ee7b7', color: '#052e16' },
  },
} satisfies Apariencia;

export function aparienciaAutenticacion(tema: 'light' | 'dark') {
  return tema === 'dark' ? oscuro : claro;
}
