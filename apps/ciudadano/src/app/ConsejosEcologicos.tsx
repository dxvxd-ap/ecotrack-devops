import { useEffect, useRef, useState, useCallback } from 'react';
import { Leaf, Recycle, Package, AlertTriangle, Calendar, Minus, ChevronRight, Shield } from 'lucide-react';

type Consejo = {
  id: string;
  icono: React.ReactNode;
  texto: string;
};

const CONSEJOS: Consejo[] = [
  { id: '1', icono: <Leaf size={18} />, texto: 'Coloca tus residuos donde el recolector pueda alcanzarlos.' },
  { id: '2', icono: <AlertTriangle size={18} />, texto: 'Evita bloquear banquetas y entradas con bolsas.' },
  { id: '3', icono: <Recycle size={18} />, texto: 'Separa los residuos según las indicaciones municipales.' },
  { id: '4', icono: <Package size={18} />, texto: 'Cierra bien las bolsas para evitar derrames.' },
  { id: '5', icono: <Shield size={18} />, texto: 'Protege y señala los objetos cortantes.' },
  { id: '6', icono: <Calendar size={18} />, texto: 'Consulta los días de recolección de tu zona.' },
];

interface Props {
  expandidoRutas: boolean;
}

export function ConsejosEcologicos({ expandidoRutas }: Props) {
  const [indice, setIndice] = useState(0);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducidoRef = useRef(false);

  const siguiente = useCallback(() => {
    setIndice(prev => (prev + 1) % CONSEJOS.length);
  }, []);

  const iniciarRotacion = useCallback(() => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = setInterval(() => {
      if (!reducidoRef.current && document.visibilityState === 'visible') {
        siguiente();
      }
    }, 8000);
  }, [siguiente]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducidoRef.current = mediaQuery.matches;
    if (!mediaQuery.matches) {
      iniciarRotacion();
    }
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [iniciarRotacion]);

  const handleTouchStart = () => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    siguiente();
    setTimeout(iniciarRotacion, 300);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      iniciarRotacion();
    } else if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
  };

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [iniciarRotacion]);

  if (expandidoRutas) return null;

  const consejo = CONSEJOS[indice];

  return (
    <button
      type="button"
      className="consejo-pildora"
      onClick={handleTouchStart}
      aria-label={`Consejo ecológico: ${consejo.texto}`}
    >
      <span className="consejo-icono" aria-hidden="true">{consejo.icono}</span>
      <span className="consejo-texto">{consejo.texto}</span>
      <ChevronRight size={18} className="consejo-cambio" aria-hidden="true" />
    </button>
  );
}