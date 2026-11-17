import { NextResponse } from "next/server";
import { ErrorAdministrativo } from "./autorizacion";

export class ErrorCiudadano extends ErrorAdministrativo {
  constructor(status: number, mensaje: string, public codigo: string) { super(status, mensaje); }
}
const CABECERAS_PRIVADAS = { "Cache-Control": "private, no-store" };
export const LIMITE_CUERPO_CIUDADANO = 4096;

export function respuesta_ciudadana<T>(datos: T, mensaje: string, status = 200) {
  return NextResponse.json({ exito: true, mensaje, datos }, { status, headers: CABECERAS_PRIVADAS });
}
export function es_conflicto_persistencia(error: unknown): boolean {
  const causa = error as { code?: number; name?: string } | null;
  return causa?.code === 11000 || causa?.name === "VersionError" || causa?.name === "DocumentNotFoundError";
}
export function respuesta_error_ciudadano(error: unknown) {
  const conflicto = es_conflicto_persistencia(error);
  const status = error instanceof ErrorAdministrativo ? error.status : conflicto ? 409 : 503;
  const mensaje = error instanceof ErrorAdministrativo ? error.message : conflicto
    ? "El recurso cambió o ya existe; consulta su estado antes de reintentar"
    : "No se pudo completar la operación; consulta el estado antes de reintentar";
  const codigo = error instanceof ErrorCiudadano ? error.codigo : conflicto ? "CONFLICTO_PERSISTENCIA"
    : status === 401 ? "SIN_SESION" : status === 403 ? "ACCESO_DENEGADO"
      : status === 409 ? "CUENTA_EN_CONFLICTO" : "SERVICIO_NO_DISPONIBLE";
  // No registrar errores Mongo/Mongoose: pueden contener documentos y coordenadas.
  return NextResponse.json({ exito: false, mensaje, codigo }, { status, headers: CABECERAS_PRIVADAS });
}
export function validar_origen_ciudadano(peticion: Request) {
  // El token explícito de la PWA es verificado por Clerk, también mediante el proxy HTTPS.
  if (/^Bearer\s+\S+$/i.test(peticion.headers.get("authorization") || "")) return;
  const origen = peticion.headers.get("origin");
  if (origen && origen !== new URL(peticion.url).origin) {
    throw new ErrorCiudadano(403, "Origen de solicitud no autorizado", "ORIGEN_NO_AUTORIZADO");
  }
}
export function rechazar_parametros_domicilio(peticion: Request) {
  if (new URL(peticion.url).search) throw new ErrorCiudadano(400, "Este recurso no acepta parámetros de consulta", "PARAMETROS_NO_PERMITIDOS");
}
export async function leer_json_ciudadano(peticion: Request): Promise<unknown> {
  const tipo = peticion.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") throw new ErrorCiudadano(415, "Se requiere application/json", "TIPO_NO_ADMITIDO");
  const longitud = peticion.headers.get("content-length");
  if (longitud !== null && !/^\d+$/.test(longitud)) throw new ErrorCiudadano(400, "Tamaño de solicitud inválido", "CUERPO_INVALIDO");
  if (longitud !== null && Number(longitud) > LIMITE_CUERPO_CIUDADANO) throw new ErrorCiudadano(413, "Solicitud demasiado grande", "CUERPO_EXCESIVO");
  if (!peticion.body) throw new ErrorCiudadano(400, "Se requiere un cuerpo JSON", "CUERPO_INVALIDO");
  const lector = peticion.body.getReader();
  const decodificador = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, texto = "";
  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMITE_CUERPO_CIUDADANO) {
        await lector.cancel().catch(() => undefined);
        throw new ErrorCiudadano(413, "Solicitud demasiado grande", "CUERPO_EXCESIVO");
      }
      texto += decodificador.decode(value, { stream: true });
    }
    texto += decodificador.decode();
    return JSON.parse(texto) as unknown;
  } catch (error) {
    if (error instanceof ErrorCiudadano) throw error;
    throw new ErrorCiudadano(400, "JSON inválido", "CUERPO_INVALIDO");
  } finally { lector.releaseLock(); }
}
