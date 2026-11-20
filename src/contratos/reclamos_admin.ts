import { CATEGORIAS_RECLAMO, ESTADOS_RECLAMO, ErrorReclamo, serializarDetalleAdministrativo, serializarResumenCiudadano } from './reclamos';
import type { EstadoReclamo } from './reclamos';
export type AccionAtencion = 'CAMBIAR_ESTADO' | 'RESPONDER' | 'AGREGAR_NOTA';
export type AtencionEntrada = { accion: AccionAtencion; version: number; estado?: EstadoReclamo; respuesta_publica?: string; nota_interna?: string };
export interface EventoAtencion {
  id: string; funcionario_id_clerk: string; funcionario_nombre: string; funcionario_rol: string;
  accion: AccionAtencion; estado_anterior: EstadoReclamo; estado_nuevo: EstadoReclamo; fecha: string;
  respuesta_publica: string | null; nota_interna: string | null; version: number;
  idempotencia: { id: string; hash: string; normalizacion_version: number };
}
export function entradaInvalida(): never { throw new ErrorReclamo(400, 'ENTRADA_INVALIDA', 'Entrada administrativa inválida o campos no permitidos'); }
export function idReclamo(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-f0-9]{24}$/i.test(valor)) return entradaInvalida();
  return valor.toLowerCase();
}
function texto(v: unknown, min: number, max: number, multilinea = false): string {
  if (typeof v !== 'string') return entradaInvalida();
  const n = v.normalize('NFC').replace(/\r\n?/g, '\n');
  if ((multilinea ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(n)) return entradaInvalida();
  const limpio = n.trim(); if (Array.from(limpio).length < min || Array.from(limpio).length > max) return entradaInvalida();
  return limpio;
}
export function validarAtencion(v: unknown): AtencionEntrada {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return entradaInvalida();
  const d = v as Record<string, unknown>;
  if (!['CAMBIAR_ESTADO', 'RESPONDER', 'AGREGAR_NOTA'].includes(d.accion as string) || !Number.isSafeInteger(d.version) || (d.version as number) < 0 || (d.version as number) >= Number.MAX_SAFE_INTEGER) return entradaInvalida();
  const campos = d.accion === 'CAMBIAR_ESTADO' ? ['accion','version','estado','respuesta_publica','nota_interna']
    : d.accion === 'RESPONDER' ? ['accion','version','respuesta_publica'] : ['accion','version','nota_interna'];
  if (Object.keys(d).some(k => !campos.includes(k))) return entradaInvalida();
  const r: AtencionEntrada = { accion: d.accion as AccionAtencion, version: d.version as number };
  if (d.accion === 'CAMBIAR_ESTADO') {
    if (!(ESTADOS_RECLAMO as readonly unknown[]).includes(d.estado)) return entradaInvalida();
    r.estado = d.estado as EstadoReclamo;
  }
  if (Object.hasOwn(d,'respuesta_publica')) r.respuesta_publica = texto(d.respuesta_publica,10,4000,true);
  if (Object.hasOwn(d,'nota_interna')) r.nota_interna = texto(d.nota_interna,1,2000,true);
  if ((d.accion === 'RESPONDER' || ['ATENDIDO','RECHAZADO'].includes(r.estado || '')) && !r.respuesta_publica) return entradaInvalida();
  if (d.accion === 'AGREGAR_NOTA' && !r.nota_interna) return entradaInvalida();
  return r;
}
export function validarTransicion(estado: unknown, d: AtencionEntrada): EstadoReclamo {
  const permitidas: Record<string, string[]> = { PENDIENTE: ['EN_REVISION','RECHAZADO'], EN_REVISION: ['ATENDIDO','RECHAZADO'], ATENDIDO: [], RECHAZADO: [] };
  if (typeof estado !== 'string' || !Object.hasOwn(permitidas, estado) ||
    (d.accion === 'CAMBIAR_ESTADO' && !permitidas[estado].includes(d.estado!)) ||
    (d.accion === 'RESPONDER' && ['ATENDIDO','RECHAZADO'].includes(estado)))
    throw new ErrorReclamo(409,'TRANSICION_NO_PERMITIDA','El estado actual no admite esta acción');
  return d.estado ?? estado as EstadoReclamo;
}
export function versionAdministrativa(d: Record<string, unknown>): number {
  if (!Object.hasOwn(d,'version_atencion')) return 0;
  if (!Number.isSafeInteger(d.version_atencion) || (d.version_atencion as number) < 0 || (d.version_atencion as number) >= Number.MAX_SAFE_INTEGER)
    throw new ErrorReclamo(409,'VERSION_DESACTUALIZADA','La versión del reporte requiere revisión');
  return d.version_atencion as number;
}
export function validarListado(p: URLSearchParams) {
  const permitidos = ['estado','categoria','desde','hasta','folio','ruta_id','cursor','limite'];
  for (const k of p.keys()) if (!permitidos.includes(k) || p.getAll(k).length !== 1) return entradaInvalida();
  const filtro: Record<string, unknown> = {};
  if (p.has('estado')) { if (!(ESTADOS_RECLAMO as readonly unknown[]).includes(p.get('estado'))) return entradaInvalida(); filtro.estado = p.get('estado'); }
  if (p.has('categoria')) { if (!(CATEGORIAS_RECLAMO as readonly unknown[]).includes(p.get('categoria'))) return entradaInvalida(); filtro.tipo_incidencia = p.get('categoria'); }
  if (p.has('folio')) filtro.folio = texto(p.get('folio'),1,100);
  if (p.has('ruta_id')) filtro.ruta_id = texto(p.get('ruta_id'),1,100);
  const fechas: Record<string, Date> = {};
  for (const [k,op] of [['desde','$gte'],['hasta','$lte']]) if (p.has(k)) {
    const s = p.get(k)!;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) return entradaInvalida();
    fechas[op] = new Date(s);
  }
  if (fechas.$gte && fechas.$lte && fechas.$gte > fechas.$lte) return entradaInvalida();
  if (Object.keys(fechas).length) filtro.fecha_reporte = fechas;
  const cursor = p.has('cursor') ? idReclamo(p.get('cursor')) : null;
  const n = p.get('limite');
  if (n !== null && (!/^[1-9]\d{0,2}$/.test(n) || Number(n) > 100)) return entradaInvalida();
  return { filtro, cursor, limite: n === null ? 25 : Number(n) };
}
export function dtoResumenMunicipal(d: Record<string, unknown>) {
  return { ...serializarResumenCiudadano(d), ruta_id: typeof d.ruta_id === 'string' ? d.ruta_id : null, version: versionAdministrativa(d) };
}
export function dtoHistorial(e: EventoAtencion) {
  return { id: e.id, funcionario: { id_clerk: e.funcionario_id_clerk, nombre: e.funcionario_nombre, rol: e.funcionario_rol },
    accion: e.accion, estado_anterior: e.estado_anterior, estado_nuevo: e.estado_nuevo, fecha: e.fecha,
    respuesta_publica: e.respuesta_publica, nota_interna: e.nota_interna, version: e.version };
}
export function dtoDetalleMunicipal(d: Record<string, unknown>) {
  return { ...serializarDetalleAdministrativo(d), version: versionAdministrativa(d),
    historial: Array.isArray(d.historial_atencion) ? (d.historial_atencion as EventoAtencion[]).map(dtoHistorial) : [] };
}
export function resultadoAtencion(reclamoId: string, e: EventoAtencion) {
  return { reclamo_id: reclamoId, evento_id: e.id, version: e.version, estado: e.estado_nuevo, fecha: e.fecha };
}
