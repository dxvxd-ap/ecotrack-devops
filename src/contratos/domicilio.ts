/** Contratos compartidos: sin Mongoose, Clerk ni dependencias de servidor. */
export type TipoSeleccionDomicilio = "gps" | "manual";
export const ESTADOS_ASIGNACION_DOMICILIO = [
  "pendiente", "asignada", "ambigua", "sin_evidencia", "sin_cobertura", "requiere_revision",
] as const;
export type EstadoAsignacionDomicilio = typeof ESTADOS_ASIGNACION_DOMICILIO[number];

export interface PuntoDomicilio {
  type: "Point";
  coordinates: [number, number]; // [longitud, latitud], grados WGS84
}

export interface RegistroDomicilio {
  latitud: number;
  longitud: number;
  tipo_seleccion: TipoSeleccionDomicilio;
  confirmada: true;
}
export interface ActualizacionDomicilio extends RegistroDomicilio { version: number }
export interface RecalculoDomicilio { version: number }

interface EvidenciaAsignacion<Fecha> {
  fecha_evaluacion: Fecha;
  version_politica: string;
  huella_catalogo: string;
  motivo: string;
}

/** IdRuta/Fecha permiten compartir invariantes entre persistencia y JSON. */
export type AsignacionDomicilio<IdRuta = string, Fecha = string> =
  | {
    estado: "pendiente";
    ruta_id: null;
    metodo: null;
    fecha_evaluacion: null;
    version_politica: null;
    huella_catalogo: null;
    motivo: null;
  }
  | (EvidenciaAsignacion<Fecha> & {
    estado: "asignada";
    ruta_id: IdRuta;
    metodo: "cobertura_oficial" | "revision_administrativa";
  })
  | (EvidenciaAsignacion<Fecha> & {
    estado: Exclude<EstadoAsignacionDomicilio, "pendiente" | "asignada">;
    ruta_id: null;
    metodo: null;
  });

/** Respuesta privada propia: no necesita exponer el identificador del propietario. */
export interface DomicilioCiudadanoDTO {
  ubicacion: PuntoDomicilio;
  tipo_seleccion: TipoSeleccionDomicilio;
  fecha_confirmacion: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  version: number;
  asignacion: AsignacionDomicilio;
}

export interface RutaAsignadaDTO {
  ruta_id: string; // _id MongoDB serializado, nunca un identificador local ruta_*
  id_ruta: string;
  nombre: string;
}
/** Los candidatos son informativos; nunca ocupan asignacion.ruta_id. */
export interface RutaCandidataDTO {
  ruta_id: string;
  id_ruta: string;
  nombre: string;
  distancia_metros: number;
}
export type RutaDomicilioDTO =
  | { asignacion: Extract<AsignacionDomicilio, { estado: "asignada" }>; ruta: RutaAsignadaDTO }
  | { asignacion: Exclude<AsignacionDomicilio, { estado: "asignada" }>; ruta: null };

export type RespuestaDomicilio<T> =
  | { exito: true; datos: T; mensaje?: string }
  | { exito: false; mensaje: string; codigo: string };
export type RespuestaConsultaDomicilio = RespuestaDomicilio<DomicilioCiudadanoDTO | null>;
export type RespuestaGuardarDomicilio = RespuestaDomicilio<DomicilioCiudadanoDTO>;
export type RespuestaRutaDomicilio = RespuestaDomicilio<RutaDomicilioDTO>;

export function esVersionDomicilio(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
}

export function sonCoordenadasDomicilio(valor: unknown): valor is [number, number] {
  return Array.isArray(valor) && valor.length === 2 &&
    typeof valor[0] === "number" && Number.isFinite(valor[0]) && Math.abs(valor[0]) <= 180 &&
    typeof valor[1] === "number" && Number.isFinite(valor[1]) && Math.abs(valor[1]) <= 90;
}

function cuerpoEstricto(valor: unknown, campos: readonly string[]): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor) ||
    Object.keys(valor).some(campo => !campos.includes(campo)) ||
    campos.some(campo => !Object.hasOwn(valor, campo))) {
    throw new Error("El cuerpo contiene campos ausentes o no permitidos");
  }
  return valor as Record<string, unknown>;
}

function seleccionConfirmada(cuerpo: Record<string, unknown>): RegistroDomicilio {
  if (!sonCoordenadasDomicilio([cuerpo.longitud, cuerpo.latitud]) ||
    (cuerpo.tipo_seleccion !== "gps" && cuerpo.tipo_seleccion !== "manual") || cuerpo.confirmada !== true) {
    throw new Error("Se requiere una ubicación válida y confirmada explícitamente");
  }
  return { latitud: cuerpo.latitud as number, longitud: cuerpo.longitud as number,
    tipo_seleccion: cuerpo.tipo_seleccion, confirmada: true };
}

const CAMPOS_REGISTRO = ["latitud", "longitud", "tipo_seleccion", "confirmada"] as const;
export function validarRegistroDomicilio(valor: unknown): RegistroDomicilio {
  return seleccionConfirmada(cuerpoEstricto(valor, CAMPOS_REGISTRO));
}
export function validarActualizacionDomicilio(valor: unknown): ActualizacionDomicilio {
  const cuerpo = cuerpoEstricto(valor, [...CAMPOS_REGISTRO, "version"]);
  if (!esVersionDomicilio(cuerpo.version)) throw new Error("Versión de domicilio inválida");
  return { ...seleccionConfirmada(cuerpo), version: cuerpo.version };
}
export function validarRecalculoDomicilio(valor: unknown): RecalculoDomicilio {
  const cuerpo = cuerpoEstricto(valor, ["version"]);
  if (!esVersionDomicilio(cuerpo.version)) throw new Error("Versión de domicilio inválida");
  return { version: cuerpo.version };
}
