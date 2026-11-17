/** Contrato del catálogo compartido por dashboard y PWA. No accede a almacenamiento. */
export class ErrorRuta extends Error {
  constructor(public status: number, public codigo: string, mensaje: string) { super(mensaje); }
}
type Objeto = Record<string, unknown>;
export type SelectorRuta = { _id?: string; id_ruta?: string };
const camposDatos = [
  'nombre',
  'descripcion',
  'trazado_geojson',
  'color_mapa',
  'distancia_estimada_km',
  'duracion_estimada_min',
  'activa',
  'diasRecoleccion',
  'horarioHabitual',
  'camionAsignadoId',
  'conductorHabitualId',
  'dias_recoleccion',
  'horario_habitual',
  'camion_asignado_id',
  'conductor_habitual_id',
];
function invalida(): never { throw new ErrorRuta(400, 'ENTRADA_INVALIDA', 'Los datos o identificadores de la ruta no son válidos'); }
function objeto(valor: unknown): valor is Objeto { return !!valor && typeof valor === 'object' && !Array.isArray(valor); }
function texto(valor: unknown, maximo: number, vacio = false): string {
  if (typeof valor !== 'string' || valor.length > maximo || (!vacio && !valor.trim())) return invalida();
  return valor.trim();
}
function codigo(valor: unknown): string { return texto(valor, 100).toUpperCase(); }
function objectId(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-f\d]{24}$/i.test(valor)) return invalida();
  return valor.toLowerCase();
}
function geometria(valor: unknown) {
  if (!objeto(valor) || Object.keys(valor).some(k => !['type', 'coordinates'].includes(k))) return invalida();
  const linea = (puntos: unknown): boolean => Array.isArray(puntos) && puntos.length >= 2 && puntos.every(p =>
    Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 &&
    typeof p[1] === 'number' && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90);
  if (valor.type === 'LineString' && linea(valor.coordinates)) return valor;
  if (valor.type === 'MultiLineString' && Array.isArray(valor.coordinates) && valor.coordinates.length > 0 && valor.coordinates.every(linea)) return valor;
  return invalida();
}
function datos(cuerpo: Objeto): Objeto {
  const salida: Objeto = {};
  for (const campo of camposDatos) {
    if (!Object.hasOwn(cuerpo, campo)) continue;
    const valor = cuerpo[campo];
    if (campo === 'nombre') salida[campo] = texto(valor, 200);
    else if (campo === 'descripcion') salida[campo] = texto(valor, 5000, true);
    else if (campo === 'trazado_geojson') salida[campo] = geometria(valor);
    else if (campo === 'color_mapa') {
      if (typeof valor !== 'string' || !/^#[a-f\d]{6}$/i.test(valor)) return invalida();
      salida[campo] = valor;
    } else if (campo === 'activa') {
      if (typeof valor !== 'boolean') return invalida();
      salida[campo] = valor;
    } else if (campo === 'diasRecoleccion' || campo === 'dias_recoleccion') {
      if (!Array.isArray(valor) || !valor.every(d => typeof d === 'string' && d.trim().length > 0 && d.trim().length <= 25)) return invalida();
      salida[campo] = valor.map(d => (d as string).trim().toLowerCase());
    } else if (campo === 'horarioHabitual' || campo === 'horario_habitual') {
      if (!objeto(valor)) return invalida();
      const inicio = (valor.horaInicio ?? valor.hora_inicio) as unknown;
      const fin = (valor.horaFin ?? valor.hora_fin) as unknown;
      if (typeof inicio !== 'string' || typeof fin !== 'string') return invalida();
      const regexHora = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!regexHora.test(inicio.trim()) || !regexHora.test(fin.trim())) return invalida();
      salida[campo] = { horaInicio: inicio.trim(), horaFin: fin.trim() };
    } else if (campo === 'camionAsignadoId' || campo === 'camion_asignado_id') {
      if (valor === null || valor === '' || valor === undefined) {
        salida[campo] = null;
      } else if (typeof valor === 'object' && valor !== null && '_id' in (valor as Objeto)) {
        salida[campo] = valor;
      } else {
        salida[campo] = objectId(valor);
      }
    } else if (campo === 'conductorHabitualId' || campo === 'conductor_habitual_id') {
      if (valor === null || valor === '' || valor === undefined) {
        salida[campo] = null;
      } else if (typeof valor === 'object' && valor !== null && '_id' in (valor as Objeto)) {
        salida[campo] = valor;
      } else {
        salida[campo] = objectId(valor);
      }
    } else if (campo === 'distancia_estimada_km' || campo === 'duracion_estimada_min') {
      if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return invalida();
      salida[campo] = valor;
    } else {
      salida[campo] = valor;
    }
  }
  return salida;
}
export function validarCreacionRuta(valor: unknown): Objeto {
  if (!objeto(valor) || Object.keys(valor).some(k => !['id_ruta', ...camposDatos.filter(c => c !== 'activa')].includes(k))) return invalida();
  if (!Object.hasOwn(valor, 'nombre') || !Object.hasOwn(valor, 'trazado_geojson')) return invalida();
  return { ...datos(valor), id_ruta: codigo(valor.id_ruta), activa: true };
}
export function validarActualizacionRuta(valor: unknown): { selector: SelectorRuta; cambios: Objeto } {
  if (!objeto(valor) || Object.keys(valor).some(k => !['_id', 'id_ruta', ...camposDatos].includes(k))) return invalida();
  const selector: SelectorRuta = {};
  if (Object.hasOwn(valor, '_id')) selector._id = objectId(valor._id);
  if (Object.hasOwn(valor, 'id_ruta')) selector.id_ruta = codigo(valor.id_ruta);
  if (!Object.keys(selector).length) return invalida();
  const cambios = datos(valor);
  if (!Object.keys(cambios).length) return invalida();
  return { selector, cambios };
}
export function validarBajaRuta(parametros: URLSearchParams): SelectorRuta {
  if ([...parametros.keys()].some(k => k !== 'id') || parametros.getAll('id').length !== 1) return invalida();
  const id = texto(parametros.get('id'), 100);
  return /^[a-f\d]{24}$/i.test(id) ? { _id: objectId(id) } : { id_ruta: codigo(id) };
}

/** Valida el estado completo persistido, sin aplicar defaults ni transformar datos heredados. */
export function validarRutaActiva(valor: unknown): void {
  if (!objeto(valor)) return invalida();
  const cuerpo: Record<string, unknown> = {};
  for (const campo of ['id_ruta', ...camposDatos.filter(c => c !== 'activa')]) {
    if (valor[campo] !== undefined) cuerpo[campo] = valor[campo];
  }
  validarCreacionRuta(cuerpo);
}
export function esRutaPublicable(valor: unknown): boolean {
  try { validarRutaActiva(valor); return true; } catch { return false; }
}
