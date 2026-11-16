/** Transformaciones de visualización: nunca modifica ni une segmentos del GeoJSON. */
export function segmentosRuta(geometria: any): [number, number][][] {
  const lineas = geometria?.type === 'LineString' ? [geometria.coordinates]
    : geometria?.type === 'MultiLineString' ? geometria.coordinates : [];
  if (!Array.isArray(lineas)) return [];
  return lineas.filter((linea: any) => Array.isArray(linea) && linea.length >= 2 && linea.every((p: any) =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90))
    .map((linea: number[][]) => linea.map(([lon, lat]) => [lat, lon]));
}
export function puedeEditarGeometria(geometria: any): boolean {
  return geometria?.type === 'LineString' && segmentosRuta(geometria).length === 1 &&
    geometria.coordinates.every((p: unknown[]) => p.length === 2);
}
export function crearPopupRuta(ruta: { nombre?: unknown; id_ruta?: unknown; distancia_estimada_km?: unknown }): HTMLElement {
  const contenedor = document.createElement('div');
  contenedor.style.fontFamily = 'sans-serif'; contenedor.style.color = '#111';
  const nombre = document.createElement('strong'); nombre.style.textTransform = 'uppercase';
  nombre.textContent = typeof ruta.nombre === 'string' && ruta.nombre ? ruta.nombre : 'Ruta';
  const id = document.createElement('span'); id.style.fontSize = '11px'; id.style.color = '#666';
  id.textContent = `ID: ${typeof ruta.id_ruta === 'string' && ruta.id_ruta ? ruta.id_ruta : 'S/ID'}`;
  const distancia = document.createElement('span'); distancia.style.fontSize = '12px';
  distancia.textContent = `Distancia: ${typeof ruta.distancia_estimada_km === 'number' && Number.isFinite(ruta.distancia_estimada_km) ? ruta.distancia_estimada_km : 0} km`;
  contenedor.append(nombre, document.createElement('br'), id, document.createElement('br'), distancia);
  return contenedor;
}
