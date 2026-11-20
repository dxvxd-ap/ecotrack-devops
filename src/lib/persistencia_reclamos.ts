import { ModeloReclamo } from '@/modelos/Reclamo';
import { ModeloRuta } from '@/modelos/Ruta';
import { ErrorReclamo, serializarAcuseReclamo } from '@/contratos/reclamos';
import type { CreacionReclamoR1 } from '@/contratos/reclamos';
import type { ActorCiudadano } from './autorizacion_ciudadana';
import { indicesReclamosDisponibles } from './indices_reclamos';

const CONTRATO = 'reclamos-r1';
const VERSION = 1;
const LECTURA = { readPreference: 'primary' as const, readConcern: { level: 'majority' as const }, maxTimeMS: 5000 };
const ESCRITURA = { writeConcern: { w: 'majority' as const, j: true, wtimeout: 5000 } };
export async function hashReclamoR1(d: CreacionReclamoR1): Promise<string> {
  // Tupla cerrada, orden estable, sin timestamps, identidad ni clave. Ausente y null de ruta equivalentes.
  const canonico = JSON.stringify([CONTRATO, VERSION, d.domicilio_referencia, d.descripcion,
    d.ubicacion.coordinates, d.tipo_incidencia, d.ruta_id, d.origen_ubicacion, d.ciudadano_telefono ?? null]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
function filtro(propietario: string, id: string) {
  return { ciudadano_id_clerk: propietario, contrato_creacion: CONTRATO, 'operacion.id': id };
}
async function buscar(propietario: string, id: string) {
  return ModeloReclamo.collection.findOne(filtro(propietario, id), LECTURA);
}
function incierto(): never {
  throw new ErrorReclamo(503, 'RESULTADO_INCIERTO', 'No se confirmó el resultado. Conserva la misma operación y consulta su acuse o reintenta con la misma clave y contenido.');
}
function repeticion(doc: NonNullable<Awaited<ReturnType<typeof buscar>>>, hash: string) {
  if (doc.operacion?.normalizacion_version !== VERSION || doc.operacion.hash !== hash)
    throw new ErrorReclamo(409, 'CLAVE_REUTILIZADA', 'La clave de operación ya se utilizó con otro contenido');
  return { acuse: serializarAcuseReclamo(doc.operacion.acuse), nuevo: false };
}
export async function recuperarAcuseReclamo(propietario: string, id: string) {
  const doc = await buscar(propietario, id);
  if (!doc) throw new ErrorReclamo(404, 'OPERACION_NO_ENCONTRADA', 'No se encontró un acuse visible. Conserva la operación; su ausencia no confirma que una escritura pendiente haya fallado.');
  return serializarAcuseReclamo(doc.operacion?.acuse);
}
export async function persistirReclamoR1(actor: ActorCiudadano, d: CreacionReclamoR1, id: string) {
  const hash = await hashReclamoR1(d);
  let indices: unknown;
  try { indices = await ModeloReclamo.collection.indexes(); } catch { indices = []; }
  if (!indicesReclamosDisponibles(indices)) throw new ErrorReclamo(503, 'INDICE_NO_DISPONIBLE', 'La creación de reportes no está disponible; no se intentó insertar');
  const existente = await buscar(actor.usuario.id, id);
  if (existente) return repeticion(existente, hash);
  if (d.ruta_id && !await ModeloRuta.findOne({ _id: d.ruta_id, activa: true }).lean())
    throw new ErrorReclamo(400, 'ENTRADA_INVALIDA', 'La ruta indicada no está disponible');
  for (let intento = 0; intento < 3; intento++) {
    const folio = `REC-${crypto.randomUUID()}`;
    const doc = new ModeloReclamo({ ...d, contrato_creacion: CONTRATO, ciudadano_id_clerk: actor.usuario.id,
      ciudadano_nombre: [actor.usuario.firstName, actor.usuario.lastName].filter(Boolean).join(' ') || 'Ciudadano EcoTrack',
      ciudadano_email: actor.correo, folio, estado: 'PENDIENTE', fecha_reporte: new Date(),
    });
    const acuse = { id: String(doc._id), folio, recibido_en: doc.fecha_reporte.toISOString(), estado_inicial: 'PENDIENTE' as const };
    doc.operacion = { id, hash, normalizacion_version: VERSION, acuse };
    // Validación local antes del punto de resultado incierto. collection.insertOne evita hooks/autoIndex nuevos.
    await doc.validate();
    const datos = doc.toObject();
    const ahora = new Date();
    Object.assign(datos, { fecha_creacion: ahora, fecha_actualizacion: ahora });
    try {
      const resultado = await ModeloReclamo.collection.insertOne(datos, ESCRITURA);
      if (!resultado.acknowledged) return incierto();
      return { acuse: serializarAcuseReclamo(acuse), nuevo: true };
    } catch (error) {
      const e = error as { code?: number; keyPattern?: Record<string, number> };
      if (e.code === 11000) {
        if (JSON.stringify(e.keyPattern) === JSON.stringify({ ciudadano_id_clerk: 1, 'operacion.id': 1 })) {
          // Una carrera solo se confirma mediante lectura majority, nunca desde keyValue o el mensaje del error.
          try { const previo = await buscar(actor.usuario.id, id); if (previo) return repeticion(previo, hash); }
          catch (lectura) { if (lectura instanceof ErrorReclamo) throw lectura; }
          return incierto();
        }
        if (JSON.stringify(e.keyPattern) === JSON.stringify({ folio: 1 })) continue;
      }
      return incierto();
    }
  }
  throw new ErrorReclamo(503, 'SERVICIO_NO_DISPONIBLE', 'No se pudo reservar un folio; conserva la misma operación para reintentar');
}
