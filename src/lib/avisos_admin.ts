import { ModeloAviso } from "@/modelos/Aviso";
import { ModeloRuta } from "@/modelos/Ruta";
import { conectar_base_datos } from "@/lib/base_datos";
import { ErrorCiudadano } from "@/lib/http_ciudadano";
import { borrador, cambio, consulta, crearCursor, huella, leerCursor } from "@/contratos/avisos";

type Borrador = ReturnType<typeof borrador>;
type Cambio = ReturnType<typeof cambio>;
type Documento = NonNullable<Awaited<ReturnType<typeof cargar>>>;
const escritura = { w: "majority" as const };
const maximoEdiciones = 98;

function cargar(id: string) {
  return ModeloAviso.findById(id).select("+operaciones").read("primary").readConcern("majority").lean();
}
function dto(doc: Documento) {
  const { _id, tipo, audiencia, ruta_id, titulo, mensaje, prioridad, vigente_desde, vigente_hasta,
    publicado_en, creado_en, retirado_en, estado, version } = doc;
  return { id: _id, tipo, audiencia, ruta_id, titulo, mensaje, prioridad, vigente_desde, vigente_hasta,
    publicado_en, creado_en, retirado_en, estado, version };
}
type Operacion = { actor: string; clave: string; hash: string; respuesta: ReturnType<typeof dto> };
function conflicto(codigo: string, mensaje: string): never {
  throw new ErrorCiudadano(409, mensaje, codigo);
}
function repeticion(doc: Documento, actor: string, clave: string, hash: string) {
  const op = (doc.operaciones as Operacion[]).find(item => item.actor === actor && item.clave === clave);
  if (!op) return null;
  if (op.hash !== hash) conflicto("CLAVE_REUTILIZADA", "La clave ya se usó con otra entrada");
  return { aviso: op.respuesta, repetida: true };
}
async function validarRuta(ruta: string | null | undefined) {
  if (ruta && !await ModeloRuta.exists({ _id: ruta })) {
    throw new ErrorCiudadano(400, "La ruta indicada no existe", "RUTA_NO_ENCONTRADA");
  }
}
export async function crearAviso(actor: string, clave: string, entrada: Borrador) {
  await conectar_base_datos();
  const _id = "10000000" + huella(["crear-aviso", actor, clave]).slice(8);
  const hash = huella(["crear", entrada]);
  const existente = await cargar(_id);
  if (existente) return repeticion(existente, actor, clave, hash) ?? conflicto("CONFLICTO_PERSISTENCIA", "El aviso ya existe");
  await validarRuta(entrada.ruta_id);
  const doc = new ModeloAviso({ ...entrada, _id, creado_en: new Date(), creado_por: actor, estado: "borrador", version: 0 });
  const aviso = dto(doc.toObject());
  doc.operaciones = [{ actor, clave, hash, respuesta: aviso }];
  try {
    await doc.save({ w: escritura.w });
    return { aviso, repetida: false };
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const ganador = await cargar(_id);
    const repetida = ganador && repeticion(ganador, actor, clave, hash);
    if (repetida) return repetida;
    throw new Error("El resultado de la creación todavía no se pudo confirmar");
  }
}
export async function editarAviso(actor: string, id: string, clave: string, entrada: Cambio) {
  await conectar_base_datos();
  const doc = await cargar(id);
  if (!doc) throw new ErrorCiudadano(404, "Aviso no encontrado", "AVISO_NO_ENCONTRADO");
  const hash = huella(["cambiar", entrada]);
  const previa = repeticion(doc, actor, clave, hash);
  if (previa) return previa;
  if (doc.version !== entrada.version) conflicto("VERSION_DESACTUALIZADA", "Consulta la versión actual del aviso");
  if (doc.estado !== (entrada.accion === "retirar" ? "publicado" : "borrador")) {
    conflicto("TRANSICION_INVALIDA", "La acción no corresponde al estado del aviso");
  }

  const ahora = new Date();
  let cambios: Partial<Documento> = { version: doc.version + 1 };
  if (entrada.accion === "editar" && entrada.borrador) {
    if (doc.version >= maximoEdiciones) conflicto("LIMITE_EDICIONES", "El borrador alcanzó el límite de ediciones");
    await validarRuta(entrada.borrador.ruta_id);
    cambios = { ...cambios, ...entrada.borrador };
  } else if (entrada.accion === "publicar") {
    await validarRuta(doc.ruta_id);
    const inicio = doc.vigente_desde && doc.vigente_desde > ahora ? doc.vigente_desde : ahora;
    if (doc.vigente_hasta && doc.vigente_hasta <= inicio) conflicto("VIGENCIA_VENCIDA", "El fin de vigencia debe ser posterior al inicio de publicación");
    cambios = { ...cambios, estado: "publicado", publicado_en: ahora, publicado_por: actor, vigente_desde: inicio };
  } else {
    cambios = { ...cambios, estado: "retirado", retirado_en: ahora, retirado_por: actor };
  }
  const aviso = dto({ ...doc, ...cambios });
  const resultado = await ModeloAviso.updateOne({ _id: id, version: doc.version },
    { $set: cambios, $push: { operaciones: { actor, clave, hash, respuesta: aviso } } },
    { runValidators: true, writeConcern: escritura });
  if (resultado.matchedCount === 1) return { aviso, repetida: false };
  const actual = await cargar(id);
  const repetida = actual && repeticion(actual, actor, clave, hash);
  if (repetida) return repetida;
  if (!actual || actual.version === doc.version) throw new Error("El cambio todavía no se pudo confirmar");
  return conflicto("VERSION_DESACTUALIZADA", "Consulta la versión actual del aviso");
}
export async function detalleAviso(id: string) {
  await conectar_base_datos();
  const doc = await cargar(id);
  if (!doc) throw new ErrorCiudadano(404, "Aviso no encontrado", "AVISO_NO_ENCONTRADO");
  return dto(doc);
}
export async function listarAvisosAdmin(actor: string, entrada: ReturnType<typeof consulta>) {
  const posicion = leerCursor(entrada.cursor, actor, "admin:" + entrada.filtro);
  await conectar_base_datos();
  const docs = await ModeloAviso.find({
    ...(entrada.filtro === "todos" ? {} : { estado: entrada.filtro }),
    ...(posicion ? { $or: [
      { creado_en: { $lt: posicion.publicado_en } },
      { creado_en: posicion.publicado_en, _id: { $lt: posicion.id } },
    ] } : {}),
  }).sort({ creado_en: -1, _id: -1 }).limit(entrada.limite + 1).read("primary").readConcern("majority").lean();
  const avisos = docs.slice(0, entrada.limite).map(dto);
  const ultimo = avisos[avisos.length - 1];
  return { avisos, cursor_siguiente: docs.length > entrada.limite ?
    crearCursor(actor, "admin:" + entrada.filtro, { publicado_en: ultimo.creado_en, id: ultimo.id }) : null };
}
