import { ModeloReclamo } from '@/modelos/Reclamo';
import type { EstadoReclamo } from '@/contratos/reclamos';
import { ErrorReclamo } from '@/contratos/reclamos';
import { dtoResumenMunicipal, dtoDetalleMunicipal, versionAdministrativa, validarTransicion, resultadoAtencion } from '@/contratos/reclamos_admin';
import type { AtencionEntrada, EventoAtencion, validarListado } from '@/contratos/reclamos_admin';
import type { ActorAdministrativo } from './autorizacion';

type ReclamoGestion = { _id: import('mongoose').Types.ObjectId; estado: EstadoReclamo;
  version_atencion?: number; historial_atencion?: EventoAtencion[] };
// Tipar el documento permite al driver comprobar $push; la colección es la misma del modelo existente.
const coleccion = ModeloReclamo.collection as unknown as import('mongoose').mongo.Collection<ReclamoGestion>;
const LECTURA = { readPreference: 'primary' as const, readConcern: { level: 'majority' as const }, maxTimeMS: 3000 };
const ESCRITURA = { writeConcern: { w: 'majority' as const, j: true, wtimeout: 5000 }, maxTimeMS: 5000 };
const MAX_EVENTOS = 500;
const oid = (id: string) => ModeloReclamo.schema.path('_id').cast(id);
const noEncontrado = () => new ErrorReclamo(404,'RECLAMO_NO_ENCONTRADO','No se encontró el reporte');
const conflicto = () => new ErrorReclamo(409,'VERSION_DESACTUALIZADA','El reporte cambió; consulta su detalle antes de realizar otra acción');
const incierto = () => new ErrorReclamo(503,'RESULTADO_INCIERTO','No se confirmó la atención; conserva la clave y el contenido y reintenta la misma operación');
async function leer(id: string) {
  return coleccion.findOne({ _id: oid(id) }, { ...LECTURA, projection: { operacion: 0 } });
}
export async function listarReclamosAdmin(consulta: ReturnType<typeof validarListado>) {
  const filtro = { ...consulta.filtro, ...(consulta.cursor ? { _id: { $lt: oid(consulta.cursor) } } : {}) };
  const docs = await coleccion.find(filtro, { ...LECTURA, projection: {
    _id: 1, folio: 1, estado: 1, tipo_incidencia: 1, fecha_reporte: 1, ruta_id: 1, version_atencion: 1,
  } }).sort({ _id: -1 }).limit(consulta.limite + 1).toArray();
  const hayMas = docs.length > consulta.limite; const pagina = docs.slice(0,consulta.limite);
  return { elementos: pagina.map(dtoResumenMunicipal), siguiente_cursor: hayMas ? String(pagina[pagina.length-1]._id) : null };
}
export async function detalleReclamoAdmin(id: string) {
  const doc = await leer(id); if (!doc) throw noEncontrado(); return dtoDetalleMunicipal(doc);
}
async function hashAtencion(d: AtencionEntrada) {
  const mensaje = JSON.stringify(['reclamos-atencion-r1',1,d.accion,d.version,d.estado ?? null,d.respuesta_publica ?? null,d.nota_interna ?? null]);
  const h = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2,'0')).join('');
}
function eventos(doc: Record<string, unknown>): EventoAtencion[] {
  if (doc.historial_atencion === undefined) return [];
  if (!Array.isArray(doc.historial_atencion)) throw new ErrorReclamo(503,'SERVICIO_NO_DISPONIBLE','El historial requiere revisión');
  return doc.historial_atencion as EventoAtencion[];
}
function repeticion(doc: Record<string, unknown>, funcionario: string, clave: string, hash: string, id: string) {
  const e = eventos(doc).find(e => e.funcionario_id_clerk === funcionario && e.idempotencia?.id === clave);
  if (!e) return null;
  if (e.idempotencia.normalizacion_version !== 1 || e.idempotencia.hash !== hash)
    throw new ErrorReclamo(409,'CLAVE_REUTILIZADA','La clave de atención ya se utilizó con otro contenido');
  return { resultado: resultadoAtencion(id,e), nuevo: false };
}
export async function atenderReclamoAdmin(actor: ActorAdministrativo, id: string, d: AtencionEntrada, clave: string) {
  const hash = await hashAtencion(d);
  const doc = await leer(id); if (!doc) throw noEncontrado();
  const repetida = repeticion(doc,actor.usuario.id,clave,hash,id); if (repetida) return repetida;
  const version = versionAdministrativa(doc); if (version !== d.version) throw conflicto();
  const estado = validarTransicion(doc.estado,d);
  if (eventos(doc).length >= MAX_EVENTOS) throw new ErrorReclamo(409,'HISTORIAL_COMPLETO','El reporte alcanzó el límite de atenciones; no se eliminaron eventos');
  const ahora = new Date();
  const evento: EventoAtencion = { id: crypto.randomUUID(), funcionario_id_clerk: actor.usuario.id,
    funcionario_nombre: [actor.usuario.firstName,actor.usuario.lastName].filter(Boolean).join(' ') || 'Funcionario municipal',
    funcionario_rol: actor.rol, accion: d.accion, estado_anterior: doc.estado, estado_nuevo: estado,
    fecha: ahora.toISOString(), respuesta_publica: d.respuesta_publica ?? null, nota_interna: d.nota_interna ?? null,
    version: version+1, idempotencia: { id: clave, hash, normalizacion_version: 1 } };
  const set = { estado, version_atencion: version+1, fecha_actualizacion: ahora,
    ...(d.respuesta_publica !== undefined ? { respuesta_publica: d.respuesta_publica } : {}),
    ...(['ATENDIDO','RECHAZADO'].includes(estado) && d.accion === 'CAMBIAR_ESTADO' ? { fecha_resolucion: ahora } : {}) };
  // _id + versión + estado + clave ausente: evento y efecto se confirman en un único documento.
  const filtro = { _id: oid(id), estado: doc.estado,
    ...(version === 0 ? { $or: [{ version_atencion: 0 }, { version_atencion: { $exists: false } }] } : { version_atencion: version }),
    historial_atencion: { $not: { $elemMatch: { funcionario_id_clerk: actor.usuario.id, 'idempotencia.id': clave } } },
    [`historial_atencion.${MAX_EVENTOS-1}`]: { $exists: false } };
  let aplicado: boolean;
  try {
    const r = await coleccion.updateOne(filtro,{ $set: set, $push: { historial_atencion: evento } },ESCRITURA);
    if (!r.acknowledged) throw incierto(); aplicado = r.matchedCount === 1;
  } catch { throw incierto(); }
  if (aplicado) return { resultado: resultadoAtencion(id,evento), nuevo: true };
  // Un CAS perdido puede ser precisamente la repetición ganadora; releer antes del conflicto.
  let actual;
  try { actual = await leer(id); } catch { throw incierto(); }
  if (!actual) throw noEncontrado();
  const previa = repeticion(actual,actor.usuario.id,clave,hash,id); if (previa) return previa;
  // Majority puede seguir mostrando la versión anterior a una escritura pendiente.
  // Sin avance visible no hay evidencia de conflicto de versión: conservar la operación.
  if (versionAdministrativa(actual) === d.version && actual.estado === doc.estado) throw incierto();
  throw conflicto();
}
