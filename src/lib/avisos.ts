import { type PipelineStage } from "mongoose";
import { ModeloAviso } from "@/modelos/Aviso";
import { ModeloLecturaAviso } from "@/modelos/LecturaAviso";
import { ModeloReclamo } from "@/modelos/Reclamo";
import { ModeloDomicilioCiudadano } from "@/modelos/DomicilioCiudadano";
import { conectar_base_datos } from "@/lib/base_datos";
import { ErrorCiudadano } from "@/lib/http_ciudadano";
import { type AvisoCiudadano, type EstadoZona, consulta, crearCursor, leerCursor, huella } from "@/contratos/avisos";

const escritura = { w: "majority" as const };
const tiposEvento = ["CAMBIAR_ESTADO", "RESPONDER"];
const estadosReporte = ["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"];
type Consulta = ReturnType<typeof consulta>;

function corteReportes() {
  const corte = process.env.AVISOS_REPORTES_DESDE;
  if (!corte) return null;
  const fecha = new Date(corte);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString() !== corte) throw new Error("Corte de reportes inválido");
  return fecha;
}
function proyeccionReportes(actor: string, ahora: Date, corte: Date): PipelineStage.FacetPipelineStage[] {
  return [
    { $match: { ciudadano_id_clerk: actor, "historial_atencion.accion": { $in: tiposEvento } } },
    { $project: { historial_atencion: 1 } },
    { $unwind: "$historial_atencion" },
    { $match: {
      "historial_atencion.id": /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,
      $or: [
        { "historial_atencion.accion": "CAMBIAR_ESTADO", "historial_atencion.estado_nuevo": { $in: estadosReporte } },
        { "historial_atencion.accion": "RESPONDER", "historial_atencion.respuesta_publica": { $type: "string", $ne: "" } },
      ],
    } },
    { $project: {
      _id: 0,
      id: { $concat: ["00000000", { $toString: "$_id" },
        { $replaceAll: { input: "$historial_atencion.id", find: "-", replacement: "" } }] },
      tipo: { $literal: "reporte" },
      titulo: { $literal: "Actualización de tu reporte" },
      mensaje: {
        $cond: [{ $eq: ["$historial_atencion.accion", "RESPONDER"] },
          "El municipio respondió a tu reporte.",
          { $switch: { branches: [
            { case: { $eq: ["$historial_atencion.estado_nuevo", "EN_REVISION"] }, then: "Tu reporte está en revisión." },
            { case: { $eq: ["$historial_atencion.estado_nuevo", "ATENDIDO"] }, then: "Tu reporte fue atendido." },
            { case: { $eq: ["$historial_atencion.estado_nuevo", "RECHAZADO"] }, then: "Tu reporte fue rechazado." },
          ], default: "Cambió el estado de tu reporte." } }],
      },
      prioridad: { $literal: "normal" },
      publicado_en: { $convert: { input: "$historial_atencion.fecha", to: "date", onError: null, onNull: null } },
      vigente_hasta: { $literal: null },
      referencia: { tipo: { $literal: "reporte" }, id: { $toString: "$_id" } },
    } },
    { $match: { publicado_en: { $gte: corte, $lte: ahora } } },
  ];
}

function visibles(actor: string, ahora: Date): PipelineStage[] {
  const corte = corteReportes();
  const etapas: PipelineStage[] = [
    { $match: { audiencia: "municipio", estado: "publicado", publicado_en: { $lte: ahora },
      vigente_desde: { $lte: ahora }, $or: [{ vigente_hasta: null }, { vigente_hasta: { $gt: ahora } }] } },
    { $project: { _id: 0, id: "$_id", tipo: 1, titulo: 1, mensaje: 1, prioridad: 1,
      publicado_en: 1, vigente_hasta: 1, referencia: { $literal: null } } },
  ];
  if (corte) etapas.push({ $unionWith: { coll: ModeloReclamo.collection.name, pipeline: proyeccionReportes(actor, ahora, corte) } });
  return etapas;
}

function conLectura(actor: string): PipelineStage.FacetPipelineStage[] {
  return [
    { $lookup: { from: ModeloLecturaAviso.collection.name, let: { aviso: "$id" }, pipeline: [
      { $match: { ciudadano_id_clerk: actor, $expr: { $eq: ["$aviso_id", "$$aviso"] } } },
      { $project: { _id: 0, leido_en: 1 } },
      { $limit: 1 },
    ], as: "lecturas" } },
    { $set: { leido_en: { $ifNull: [{ $first: "$lecturas.leido_en" }, null] } } },
    { $unset: "lecturas" },
  ];
}
async function estadoZona(actor: string): Promise<EstadoZona> {
  return await ModeloDomicilioCiudadano.exists({ ciudadano_id_clerk: actor }) ? "sin_confirmacion" : "sin_domicilio";
}
async function contar(actor: string, ahora: Date) {
  const [resultado] = await ModeloAviso.aggregate<{ total: number }>([
    ...visibles(actor, ahora), ...conLectura(actor), { $match: { leido_en: null } }, { $count: "total" },
  ]).readConcern("majority").read("primary");
  return resultado?.total ?? 0;
}
export async function resumenAvisos(actor: string) {
  await conectar_base_datos();
  const [sin_leer_total, estado_zona] = await Promise.all([contar(actor, new Date()), estadoZona(actor)]);
  return { sin_leer_total, estado_zona };
}
export async function listarAvisos(actor: string, entrada: Consulta) {
  const cursor = leerCursor(entrada.cursor, actor, entrada.filtro);
  await conectar_base_datos();
  const ahora = new Date();
  const estado_zona = await estadoZona(actor);
  if (entrada.filtro === "mi_zona") {
    return { avisos: [], cursor_siguiente: null, sin_leer_total: await contar(actor, ahora), estado_zona };
  }
  const pagina: PipelineStage.FacetPipelineStage[] = [];
  if (entrada.filtro === "sin_leer") pagina.push({ $match: { leido_en: null } });
  if (cursor) pagina.push({ $match: { $or: [
    { publicado_en: { $lt: cursor.publicado_en } },
    { publicado_en: cursor.publicado_en, id: { $lt: cursor.id } },
  ] } });
  pagina.push({ $sort: { publicado_en: -1, id: -1 } }, { $limit: entrada.limite + 1 });
  const [resultado] = await ModeloAviso.aggregate<{ avisos: AvisoCiudadano[]; contador: { total: number }[] }>([
    ...visibles(actor, ahora), ...conLectura(actor),
    { $facet: { avisos: pagina, contador: [{ $match: { leido_en: null } }, { $count: "total" }] } },
  ]).readConcern("majority").read("primary");
  const avisos = resultado.avisos.slice(0, entrada.limite);
  const cursor_siguiente = resultado.avisos.length > entrada.limite
    ? crearCursor(actor, entrada.filtro, avisos[avisos.length - 1]) : null;
  return { avisos, cursor_siguiente, sin_leer_total: resultado.contador[0]?.total ?? 0, estado_zona };
}
export async function marcarLectura(actor: string, id: string) {
  await conectar_base_datos();
  const ahora = new Date();
  const [aviso] = await ModeloAviso.aggregate([
    ...visibles(actor, ahora), { $match: { id } }, { $limit: 1 },
  ]).readConcern("majority").read("primary");
  if (!aviso) throw new ErrorCiudadano(404, "Aviso no disponible", "AVISO_NO_ENCONTRADO");
  const _id = huella(["lectura", actor, id]);
  const filtro = { _id, ciudadano_id_clerk: actor, aviso_id: id };
  try {
    await ModeloLecturaAviso.updateOne(filtro, { $setOnInsert: { leido_en: ahora } }, { upsert: true, setDefaultsOnInsert: false, writeConcern: escritura });
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
  }
  const lectura = await ModeloLecturaAviso.findOne(filtro).read("primary").readConcern("majority").lean();
  if (!lectura) throw new Error("Lectura no confirmada");
  return { id, leido_en: lectura.leido_en, sin_leer_total: await contar(actor, new Date()) };
}
