export type Origen = 'api' | 'demo';
export interface Vehiculo {
  id: string;
  nombre: string;
  latitud: number;
  longitud: number;
  origen: Origen;
  actualizadoEn: string | null;
  estado: 'reciente' | 'antiguo' | 'sin-fecha';
}
export interface GeometriaRuta {
  type: 'LineString' | 'MultiLineString';
  coordinates: number[][] | number[][][];
}
export interface ColeccionRutas {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: GeometriaRuta;
    properties: {
      id: string;
      idPersistido?: string;
      nombre: string;
      color: string;
      descripcion?: string;
      distanciaKm?: number | null;
      duracionMin?: number | null;
      diasRecoleccion?: string[];
      horarioHabitual?: { horaInicio: string; horaFin: string };
      camionAsignado?: any;
    };
  }>;
}
type Objeto = Record<string, unknown>;
const objeto = (v: unknown): v is Objeto => !!v && typeof v === 'object' && !Array.isArray(v);
const numero = (v: unknown, limite: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limite;

export function configurar({ android, api = '' }: { android: boolean; api?: string }): { api: string } {
  if (!api && !android) return { api: '' };
  let url: URL;
  try { url = new URL(api); } catch { throw new Error('Configura una API HTTPS absoluta.'); }
  const local = (typeof __PERMITIR_API_LOOPBACK__ === 'undefined' || __PERMITIR_API_LOOPBACK__) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && (android || !local || url.protocol !== 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('La API requiere un origen HTTPS sin credenciales, ruta ni parámetros.');
  }
  return { api: url.origin };
}

export function normalizarVehiculo(dato: unknown, origen: Origen, ahora = Date.now()): Vehiculo | null {
  if (!objeto(dato) || typeof dato.id !== 'string' || !dato.id || !numero(dato.latitud, 90) || !numero(dato.longitud, 180)) return null;
  const fecha = typeof dato.actualizadoEn === 'string' ? Date.parse(dato.actualizadoEn) : NaN;
  const fechaValida = Number.isFinite(fecha) && fecha <= ahora + 5000;
  return {
    id: dato.id, nombre: typeof dato.nombre === 'string' ? dato.nombre : dato.id,
    latitud: dato.latitud, longitud: dato.longitud, origen,
    actualizadoEn: fechaValida ? new Date(fecha).toISOString() : null,
    estado: !fechaValida ? 'sin-fecha' : ahora - fecha > 60000 ? 'antiguo' : 'reciente',
  };
}

function lineaValida(v: unknown): v is number[][] {
  return Array.isArray(v) && v.length >= 2 && v.every(p => Array.isArray(p) && numero(p[0], 180) && numero(p[1], 90));
}
function normalizarHorario(v: unknown): { horaInicio: string; horaFin: string } {
  if (objeto(v)) {
    const horaInicio = typeof v.horaInicio === 'string' ? v.horaInicio : typeof v.hora_inicio === 'string' ? v.hora_inicio : '07:00';
    const horaFin = typeof v.horaFin === 'string' ? v.horaFin : typeof v.hora_fin === 'string' ? v.hora_fin : '13:00';
    return { horaInicio, horaFin };
  }
  return { horaInicio: '07:00', horaFin: '13:00' };
}
export function normalizarRutas(respuesta: unknown): ColeccionRutas {
  if (!objeto(respuesta) || respuesta.exito !== true || !Array.isArray(respuesta.datos)) throw new Error('La API no devolvió un contrato de rutas válido.');
  const features: ColeccionRutas['features'] = [];
  for (const r of respuesta.datos) {
    if (!objeto(r) || r.activa === false || !objeto(r.trazado_geojson)) continue;
    const g = r.trazado_geojson;
    if (!(g.type === 'LineString' && lineaValida(g.coordinates)) && !(g.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(lineaValida))) continue;
    const idPersistido = typeof r._id === 'string' && /^[a-f\d]{24}$/i.test(r._id) ? r._id : null;
    features.push({ type: 'Feature', geometry: { type: g.type as GeometriaRuta['type'], coordinates: g.coordinates as GeometriaRuta['coordinates'] }, properties: {
      id: String(r._id ?? r.id_ruta ?? features.length), nombre: typeof r.nombre === 'string' ? r.nombre : 'Ruta municipal',
      ...(idPersistido ? { idPersistido } : {}),
      color: typeof r.color_mapa === 'string' && /^#[\da-f]{6}$/i.test(r.color_mapa) ? r.color_mapa : '#059669',
      descripcion: typeof r.descripcion === 'string' ? r.descripcion : '',
      distanciaKm: typeof r.distancia_estimada_km === 'number' && Number.isFinite(r.distancia_estimada_km) && r.distancia_estimada_km > 0 ? r.distancia_estimada_km : null,
      duracionMin: typeof r.duracion_estimada_min === 'number' && Number.isFinite(r.duracion_estimada_min) && r.duracion_estimada_min > 0 ? r.duracion_estimada_min : null,
      diasRecoleccion: Array.isArray(r.diasRecoleccion) ? r.diasRecoleccion : Array.isArray(r.dias_recoleccion) ? r.dias_recoleccion : ['lunes', 'miercoles', 'viernes'],
      horarioHabitual: normalizarHorario(r.horarioHabitual ?? r.horario_habitual),
      camionAsignado: r.camionAsignadoId ?? r.camion_asignado_id ?? null,
    } });
  }
  return { type: 'FeatureCollection', features };
}
