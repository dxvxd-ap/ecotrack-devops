import { consultarRutas } from './rutas.ts';
import type { ColeccionRutas, Vehiculo } from './contratos.ts';

export interface DatosMapa { demostracion: boolean; rutas: ColeccionRutas; vehiculos: Vehiculo[] }

/** Evita mostrar un snapshot demo bajo rótulos reales antes de ejecutarse el siguiente efecto. */
export function datosVisibles(datos: DatosMapa, demostracion: boolean): Pick<DatosMapa, 'rutas' | 'vehiculos'> {
  return datos.demostracion === demostracion ? datos : { rutas: { type: 'FeatureCollection', features: [] }, vehiculos: [] };
}

export function permitirDemo({ desarrollo, habilitada, android = false }: { desarrollo: boolean; habilitada?: string; android?: boolean }): boolean {
  return desarrollo && habilitada === 'true' && !android;
}

/** Cada vuelta al modo real consulta de nuevo la API; no hay caché ni fallback simulado. */
export async function cargarDatosMapa({ origen, signal, demostracion = false }: { origen: string; signal: AbortSignal; demostracion?: boolean }, transportar: typeof fetch = fetch): Promise<DatosMapa> {
  if (demostracion) {
    const [{ rutaDemo }, { proveedorDemostracion }] = await Promise.all([import('../mapas/demo.ts'), import('./vehiculos.ts')]);
    return { demostracion, rutas: rutaDemo, vehiculos: await proveedorDemostracion.consultar(signal) };
  }
  return { demostracion, rutas: await consultarRutas(origen, signal, transportar), vehiculos: [] };
}
