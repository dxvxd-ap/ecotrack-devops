import type { ColeccionRutas } from '../servicios/contratos.ts';

/** Fixture visual, nunca datos municipales ni una secuencia GPS real. */
export const rutaDemo: ColeccionRutas = {
  type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'demo', nombre: 'Recorrido de demostración', color: '#10B981' },
    geometry: { type: 'LineString', coordinates: [[-97.091,20.448],[-97.091,20.450],[-97.088,20.450],[-97.088,20.453],[-97.085,20.453],[-97.085,20.455]] },
  }],
};
