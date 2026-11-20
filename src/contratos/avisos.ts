import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ErrorCiudadano } from "@/lib/http_ciudadano";

export const filtros = ["todos", "sin_leer", "mi_zona"] as const;
export const prioridades = ["normal", "alta", "urgente"] as const;
export const tipos = ["comunicado", "cambio_ruta", "retraso", "suspension"] as const;
export const audiencias = ["municipio", "ruta"] as const;
export type Filtro = typeof filtros[number];
export type EstadoZona = "sin_domicilio" | "sin_confirmacion";
export type AvisoCiudadano = {
  id: string;
  tipo: typeof tipos[number] | "reporte";
  titulo: string;
  mensaje: string;
  prioridad: typeof prioridades[number];
  publicado_en: Date | string;
  vigente_hasta: Date | string | null;
  leido_en: Date | string | null;
  referencia: { tipo: "reporte" | "ruta"; id: string } | null;
};

export function invalido(mensaje = "Entrada de avisos inválida"): never {
  throw new ErrorCiudadano(400, mensaje, "ENTRADA_INVALIDA");
}
export function huella(valor: unknown) {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}
export function identificador(valor: string) {
  if (!/^[a-f0-9]{64}$/.test(valor)) invalido("Identificador de aviso inválido");
  return valor;
}
export function claveOperacion(req: Request) {
  const clave = req.headers.get("Idempotency-Key")?.toLowerCase();
  if (!clave || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(clave)) invalido("Se requiere Idempotency-Key UUID");
  return clave;
}
export function consulta(params: URLSearchParams, opciones: readonly string[] = filtros) {
  const permitidos = new Set(["filtro", "limite", "cursor"]);
  for (const campo of params.keys()) {
    if (!permitidos.has(campo) || params.getAll(campo).length !== 1) invalido();
  }
  const filtro = params.get("filtro") ?? "todos";
  const limite = params.get("limite") ?? "20";
  const cursor = params.get("cursor");
  if (!opciones.includes(filtro) || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limite) ||
    (cursor !== null && !/^[A-Za-z0-9_-]{1,400}$/.test(cursor))) invalido();
  return { filtro, limite: Number(limite), cursor };
}
type Posicion = { publicado_en: Date | string; id: string };
function firmaCursor(actor: string, filtro: string, fecha: string, id: string) {
  const secreto = process.env.CLERK_SECRET_KEY;
  if (!secreto) throw new Error("Falta la clave del servidor para firmar cursores");
  return createHmac("sha256", secreto).update(JSON.stringify(["avisos-v1", actor, filtro, fecha, id])).digest("hex");
}
export function crearCursor(actor: string, filtro: string, posicion: Posicion) {
  const fecha = new Date(posicion.publicado_en).toISOString();
  const firma = firmaCursor(actor, filtro, fecha, posicion.id);
  return Buffer.from(JSON.stringify([firma, fecha, posicion.id])).toString("base64url");
}
export function leerCursor(cursor: string | null, actor: string, filtro: string) {
  if (cursor === null) return null;
  let partes: unknown;
  try {
    partes = JSON.parse(Buffer.from(cursor, "base64url").toString());
  } catch { return invalido("Cursor de avisos inválido"); }
  if (!Array.isArray(partes) || partes.length !== 3 || typeof partes[0] !== "string" ||
    !/^[a-f0-9]{64}$/.test(partes[0]) || typeof partes[1] !== "string" || typeof partes[2] !== "string") {
    invalido("Cursor de avisos inválido");
  }
  const [firma, fecha, id] = partes;
  const publicado_en = new Date(fecha);
  if (!Number.isFinite(publicado_en.getTime()) || publicado_en.toISOString() !== fecha ||
    !timingSafeEqual(Buffer.from(firma, "hex"), Buffer.from(firmaCursor(actor, filtro, fecha, id), "hex"))) {
    invalido("Cursor de avisos inválido");
  }
  return { publicado_en, id: identificador(id) };
}
function objeto(valor: unknown, campos: string[]): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor) ||
    Object.keys(valor).some(campo => !campos.includes(campo))) invalido();
  return valor as Record<string, unknown>;
}
function opcion<T extends string>(valor: unknown, opciones: readonly T[]): T {
  if (typeof valor !== "string" || !opciones.includes(valor as T)) invalido();
  return valor as T;
}
function texto(valor: unknown, maximo: number) {
  if (typeof valor !== "string" || !valor.trim() || valor.trim().length > maximo) invalido();
  return valor.trim();
}
function fecha(valor: unknown) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(valor)) invalido();
  const iso = valor.length === 20 ? valor.replace("Z", ".000Z") : valor;
  const dato = new Date(iso);
  if (!Number.isFinite(dato.getTime()) || dato.toISOString() !== iso) invalido();
  return dato;
}
export function borrador(valor: unknown) {
  const d = objeto(valor, ["tipo", "audiencia", "ruta_id", "titulo", "mensaje", "prioridad", "vigente_desde", "vigente_hasta"]);
  const tipo = opcion(d.tipo, tipos);
  const audiencia = opcion(d.audiencia, audiencias);
  const ruta_id = d.ruta_id ?? null;
  if (audiencia === "ruta" ? typeof ruta_id !== "string" || !/^[a-f0-9]{24}$/.test(ruta_id) : ruta_id !== null) invalido();
  const vigente_desde = fecha(d.vigente_desde);
  const vigente_hasta = fecha(d.vigente_hasta);
  if (vigente_desde && vigente_hasta && vigente_desde >= vigente_hasta) invalido();
  return { tipo, audiencia, ruta_id: ruta_id as string | null, titulo: texto(d.titulo, 120),
    mensaje: texto(d.mensaje, 800), prioridad: opcion(d.prioridad, prioridades), vigente_desde, vigente_hasta };
}
export function cambio(valor: unknown) {
  const d = objeto(valor, ["accion", "version", "borrador"]);
  if (typeof d.version !== "number" || !Number.isInteger(d.version) || d.version < 0 || d.version > 100) invalido();
  const accion = opcion(d.accion, ["editar", "publicar", "retirar"] as const);
  if (accion !== "editar" && "borrador" in d) invalido();
  return { accion, version: d.version, borrador: accion === "editar" ? borrador(d.borrador) : null };
}
