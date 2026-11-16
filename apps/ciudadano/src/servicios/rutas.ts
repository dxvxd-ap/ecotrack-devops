import { normalizarRutas, type ColeccionRutas } from './contratos.ts';

export async function consultarRutas(origen: string, signal: AbortSignal, transportar: typeof fetch = fetch, timeoutMs = 12000): Promise<ColeccionRutas> {
  const control = new AbortController();
  const cancelar = () => control.abort();
  if (signal.aborted) control.abort();
  else signal.addEventListener('abort', cancelar, { once: true });
  const timer = setTimeout(cancelar, timeoutMs);
  try {
    const response = await transportar(`${origen}/api/rutas`, {
      method: 'GET', signal: control.signal, headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('No se pudieron consultar las rutas.');
    return normalizarRutas(await response.json());
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancelar); }
}

export function limitesRuta(ruta: ColeccionRutas['features'][number]): [[number, number], [number, number]] {
  const puntos = ruta.geometry.type === 'LineString' ? ruta.geometry.coordinates as number[][] : (ruta.geometry.coordinates as number[][][]).flat();
  let oeste = Infinity, sur = Infinity, este = -Infinity, norte = -Infinity;
  for (const [lon, lat] of puntos) { oeste = Math.min(oeste, lon); sur = Math.min(sur, lat); este = Math.max(este, lon); norte = Math.max(norte, lat); }
  return [[oeste, sur], [este, norte]];
}
