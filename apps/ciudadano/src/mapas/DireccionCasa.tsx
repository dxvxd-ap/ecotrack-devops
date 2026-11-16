import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popup, type Map as MapaGL } from 'maplibre-gl';
import { DireccionAproximada } from '../app/DireccionAproximada.tsx';
import type { PuntoDireccion } from '../servicios/direccion.ts';

/** La ventana describe el punto persistido; abrirla no modifica la cámara. */
export function DireccionCasa({ mapa, punto, cerrar }: {
  mapa: MapaGL; punto: PuntoDireccion; cerrar: () => void;
}) {
  const [contenido] = useState(() => document.createElement('div'));
  const [longitud, latitud] = punto;
  useLayoutEffect(() => {
    const popup = new Popup({ maxWidth: '280px', focusAfterOpen: false, offset: 30 })
      .setLngLat([longitud, latitud]).setDOMContent(contenido).addTo(mapa);
    popup.on('close', cerrar);
    return () => { popup.off('close', cerrar); popup.remove(); };
  }, [mapa, longitud, latitud, contenido, cerrar]);
  return createPortal(<section className="casa-direccion" aria-label="Dirección de tu domicilio guardado">
    <DireccionAproximada punto={punto} guardado />
  </section>, contenido);
}
