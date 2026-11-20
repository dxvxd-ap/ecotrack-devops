import { NextResponse } from "next/server";
import { ErrorAdministrativo } from "./autorizacion";
import { ErrorReclamo } from "@/contratos/reclamos";
import type { CodigoErrorReclamo } from "@/contratos/reclamos";

export const LIMITE_JSON_RECLAMOS = 16 * 1024;
const CABECERAS = { "Cache-Control": "private, no-store", Vary: "EcoTrack-Contrato" };
export function negociarContratoReclamos(peticion: Request): "heredado" | "r1" {
  const contrato = peticion.headers.get("EcoTrack-Contrato");
  if (contrato === null) return "heredado";
  if (contrato === "reclamos-r1") return "r1";
  throw new ErrorReclamo(400, "CONTRATO_NO_ADMITIDO", "Contrato de reclamos no admitido");
}
export function respuestaReclamos(datos: unknown, mensaje?: string, status = 200) {
  return NextResponse.json({ exito: true, datos, ...(mensaje ? { mensaje } : {}) }, { status, headers: CABECERAS });
}
export function errorReclamos(error: unknown) {
  const causa = error as { code?: number; name?: string } | null;
  const status = error instanceof ErrorReclamo || error instanceof ErrorAdministrativo ? error.status
    : causa?.code === 11000 ? 409 : ["SyntaxError", "ValidationError", "CastError"].includes(causa?.name || "") ? 400 : 503;
  const codigos: Partial<Record<number, CodigoErrorReclamo>> = { 400: "ENTRADA_INVALIDA", 401: "SIN_SESION", 403: "ACCESO_DENEGADO", 409: "CUENTA_EN_CONFLICTO", 413: "CUERPO_EXCESIVO", 415: "TIPO_NO_ADMITIDO" };
  const codigo = error instanceof ErrorReclamo ? error.codigo : codigos[status] || "SERVICIO_NO_DISPONIBLE";
  // No devolver mensajes de Mongoose/Clerk ni registrar cuerpos o datos personales.
  const mensaje = error instanceof ErrorReclamo ? error.message : status === 401 ? "Se requiere una sesión activa"
    : status === 403 ? "No tienes acceso a esta operación" : status === 400 ? "Datos de entrada inválidos"
      : status === 409 ? "La cuenta o el registro requieren revisión" : "No se pudo completar la operación";
  return NextResponse.json({ exito: false, codigo, mensaje }, { status, headers: CABECERAS });
}
export async function leerJsonReclamos(peticion: Request): Promise<unknown> {
  if (peticion.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ErrorReclamo(415, "TIPO_NO_ADMITIDO", "Se requiere application/json");
  const longitud = peticion.headers.get("content-length");
  if (longitud !== null && !/^\d+$/.test(longitud)) throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "Tamaño de solicitud inválido");
  if (longitud !== null && Number(longitud) > LIMITE_JSON_RECLAMOS) throw new ErrorReclamo(413, "CUERPO_EXCESIVO", "Solicitud demasiado grande");
  if (!peticion.body) throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "Se requiere un cuerpo JSON");
  const lector = peticion.body.getReader(); const decodificador = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0; let texto = "";
  try {
    while (true) {
      const { value, done } = await lector.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMITE_JSON_RECLAMOS) {
        await lector.cancel().catch(() => undefined);
        throw new ErrorReclamo(413, "CUERPO_EXCESIVO", "Solicitud demasiado grande");
      }
      texto += decodificador.decode(value, { stream: true });
    }
    texto += decodificador.decode(); return JSON.parse(texto) as unknown;
  } catch (error) {
    if (error instanceof ErrorReclamo) throw error;
    throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "JSON inválido");
  } finally { lector.releaseLock(); }
}
