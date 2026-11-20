/** Contratos puros: no importan Clerk, Mongoose ni utilidades de servidor. */
export const CATEGORIAS_RECLAMO = ["CAMION_NO_PASO", "HORARIO_IRREGULAR", "BASURA_TIRADA", "MALA_ATENCION", "OTRO"] as const;
export const ESTADOS_RECLAMO = ["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"] as const;
export type CategoriaReclamo = typeof CATEGORIAS_RECLAMO[number];
export type EstadoReclamo = typeof ESTADOS_RECLAMO[number];
export type CodigoErrorReclamo = "ENTRADA_INVALIDA" | "SIN_SESION" | "ACCESO_DENEGADO" | "CONTRATO_NO_ADMITIDO" |
  "CUERPO_EXCESIVO" | "TIPO_NO_ADMITIDO" | "SERVICIO_NO_DISPONIBLE" | "CUENTA_EN_CONFLICTO" | "CREACION_R1_NO_DISPONIBLE" | "CLAVE_REUTILIZADA" | "RESULTADO_INCIERTO" | "OPERACION_NO_ENCONTRADA" | "INDICE_NO_DISPONIBLE" | "TRANSICION_NO_PERMITIDA" | "VERSION_DESACTUALIZADA" | "RECLAMO_NO_ENCONTRADO" | "HISTORIAL_COMPLETO";
export type RespuestaReclamos<T> = { exito: true; datos: T; mensaje?: string } |
  { exito: false; codigo: CodigoErrorReclamo; mensaje: string };
export type OrigenUbicacionReclamo = "manual" | "gps" | "domicilio";
export interface PuntoReclamo { type: "Point"; coordinates: [number, number] }
export interface CreacionReclamoR1 {
  ciudadano_telefono?: string;
  domicilio_referencia: string;
  descripcion: string;
  ubicacion: PuntoReclamo;
  tipo_incidencia: CategoriaReclamo;
  ruta_id: string | null;
  origen_ubicacion: OrigenUbicacionReclamo;
}
export class ErrorReclamo extends Error {
  constructor(public status: number, public codigo: CodigoErrorReclamo, mensaje: string) { super(mensaje); }
}
type Objeto = Record<string, unknown>;
function objeto(valor: unknown): valor is Objeto { return valor !== null && typeof valor === "object" && !Array.isArray(valor); }
function invalida(): never { throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "Datos de reclamo inválidos o campos no permitidos"); }
function texto(valor: unknown, minimo: number, maximo: number, multilinea = false): string {
  if (typeof valor !== "string") return invalida();
  const normal = valor.normalize("NFC").replace(/\r\n?/g, "\n");
  if ((multilinea ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(normal)) return invalida();
  const limpio = normal.trim();
  const longitud = Array.from(limpio).length;
  if (longitud < minimo || longitud > maximo) return invalida();
  return limpio;
}
export function sonCoordenadasReclamo(valor: unknown): valor is [number, number] {
  return Array.isArray(valor) && valor.length === 2 && typeof valor[0] === "number" && Number.isFinite(valor[0]) && Math.abs(valor[0]) <= 180 &&
    typeof valor[1] === "number" && Number.isFinite(valor[1]) && Math.abs(valor[1]) <= 90;
}
function categoria(valor: unknown): CategoriaReclamo {
  if (typeof valor !== "string" || !(CATEGORIAS_RECLAMO as readonly string[]).includes(valor)) return invalida();
  return valor as CategoriaReclamo;
}
export function validarConsultaReclamosR1(parametros: URLSearchParams): { folio: string | null } {
  const permitidos = ["id", "_id", "folio", "estado", "ruta_id"];
  for (const campo of parametros.keys()) {
    if (!permitidos.includes(campo) || parametros.getAll(campo).length !== 1) return invalida();
  }
  for (const campo of ["id", "_id", "ruta_id"]) {
    if (parametros.has(campo) && !/^[a-fA-F0-9]{24}$/.test(parametros.get(campo)!)) return invalida();
  }
  if (parametros.has("estado") && !(ESTADOS_RECLAMO as readonly string[]).includes(parametros.get("estado")!)) return invalida();
  const folio = parametros.has("folio") ? texto(parametros.get("folio"), 1, 100) : null;
  if (parametros.has("id") && parametros.has("_id") && parametros.get("id")!.toLowerCase() !== parametros.get("_id")!.toLowerCase()) return invalida();
  return { folio };
}
export function validarCreacionReclamoR1(valor: unknown): CreacionReclamoR1 {
  const campos = ["ciudadano_telefono", "domicilio_referencia", "descripcion", "latitud", "longitud", "tipo_incidencia", "ruta_id", "origen_ubicacion", "confirmada"];
  if (!objeto(valor) || valor.confirmada !== true || Object.keys(valor).some(c => !campos.includes(c)) || !sonCoordenadasReclamo([valor.longitud, valor.latitud])) return invalida();
  const salida: CreacionReclamoR1 = {
    domicilio_referencia: texto(valor.domicilio_referencia, 1, 500), descripcion: texto(valor.descripcion, 10, 4000, true),
    ubicacion: { type: "Point", coordinates: [valor.longitud as number, valor.latitud as number] },
    tipo_incidencia: categoria(valor.tipo_incidencia), ruta_id: null, origen_ubicacion: "manual",
  };
  if (Object.hasOwn(valor, "ciudadano_telefono")) {
    const telefono = texto(valor.ciudadano_telefono, 7, 25);
    const digitos = telefono.replace(/\D/g, "").length;
    if (!/^[+\d ()-]+$/.test(telefono) || digitos < 7 || digitos > 15) return invalida();
    salida.ciudadano_telefono = telefono;
  }
  if (valor.ruta_id !== undefined && valor.ruta_id !== null) {
    if (typeof valor.ruta_id !== "string" || !/^[a-fA-F0-9]{24}$/.test(valor.ruta_id)) return invalida();
    salida.ruta_id = valor.ruta_id.toLowerCase();
  }
  if (Object.hasOwn(valor, "origen_ubicacion")) {
    if (!["manual", "gps", "domicilio"].includes(valor.origen_ubicacion as string)) return invalida();
    salida.origen_ubicacion = valor.origen_ubicacion as OrigenUbicacionReclamo;
  }
  return salida;
}

/** Adaptador temporal: conserva defaults, códigos de ruta y campos ignorados seguros. */
export function validarCreacionReclamoHeredado(valor: unknown) {
  if (!objeto(valor) || Object.hasOwn(valor, "ciudadano_id_clerk")) return invalida();
  const numero = (v: unknown): unknown => typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
  const coordenadas = [numero(valor.longitud), numero(valor.latitud)];
  if (!sonCoordenadasReclamo(coordenadas)) return invalida();
  return {
    ciudadano_telefono: texto(valor.ciudadano_telefono, 1, 25), domicilio_referencia: texto(valor.domicilio_referencia, 1, 500),
    latitud: coordenadas[1], longitud: coordenadas[0],
    tipo_incidencia: categoria(valor.tipo_incidencia || "CAMION_NO_PASO"),
    descripcion: texto(valor.descripcion || "Reporte sin descripción adicional.", 1, 4000, true),
    fotografia_url: valor.fotografia_url ? texto(valor.fotografia_url, 1, 2048) : "",
    ruta_id: valor.ruta_id ? texto(valor.ruta_id, 1, 100) : null,
  };
}

export interface ResumenReclamoCiudadano {
  id: string | null; folio: string | null; tipo_incidencia: CategoriaReclamo | null;
  estado: EstadoReclamo | null; fecha_reporte: string | null;
}
export interface DetalleReclamoCiudadano extends ResumenReclamoCiudadano {
  descripcion: string | null; domicilio_referencia: string | null; ubicacion: PuntoReclamo | null;
  ruta_id: string | null; origen_ubicacion: OrigenUbicacionReclamo | null;
  fecha_actualizacion: string | null; fecha_resolucion: string | null;
  respuesta_publica: string | null; version: number;
}
export interface DetalleReclamoAdministrativo extends DetalleReclamoCiudadano {
  contacto: { nombre: string | null; telefono: string | null; correo: string | null };
  propietario_vinculado: boolean;
  solucion_notas_heredada: string | null;
}
function documento(valor: unknown): Objeto {
  if (!objeto(valor)) return {};
  if (typeof valor.toObject === "function") {
    const convertido: unknown = valor.toObject();
    return objeto(convertido) ? convertido : {};
  }
  return valor;
}
function cadena(valor: unknown): string | null { return typeof valor === "string" ? valor : null; }
function identificador(valor: unknown): string | null {
  if (typeof valor === "string") return valor;
  if (objeto(valor) && typeof valor.toHexString === "function") {
    const id: unknown = valor.toHexString(); return typeof id === "string" ? id : null;
  }
  return null;
}
function fecha(valor: unknown): string | null {
  if (!(valor instanceof Date) && typeof valor !== "string") return null;
  const f = new Date(valor); return Number.isFinite(f.getTime()) ? f.toISOString() : null;
}
function punto(valor: unknown): PuntoReclamo | null {
  return objeto(valor) && valor.type === "Point" && sonCoordenadasReclamo(valor.coordinates)
    ? { type: "Point", coordinates: [valor.coordinates[0], valor.coordinates[1]] } : null;
}
export function serializarResumenCiudadano(valor: unknown): ResumenReclamoCiudadano {
  const d = documento(valor);
  return { id: identificador(d._id), folio: cadena(d.folio),
    tipo_incidencia: (CATEGORIAS_RECLAMO as readonly unknown[]).includes(d.tipo_incidencia) ? d.tipo_incidencia as CategoriaReclamo : null,
    estado: (ESTADOS_RECLAMO as readonly unknown[]).includes(d.estado) ? d.estado as EstadoReclamo : null,
    fecha_reporte: fecha(d.fecha_reporte) };
}
export function serializarDetalleCiudadano(valor: unknown): DetalleReclamoCiudadano {
  const d = documento(valor);
  return { ...serializarResumenCiudadano(d), descripcion: cadena(d.descripcion), domicilio_referencia: cadena(d.domicilio_referencia),
    ubicacion: punto(d.ubicacion), ruta_id: cadena(d.ruta_id),
    origen_ubicacion: ["manual", "gps", "domicilio"].includes(d.origen_ubicacion as string) ? d.origen_ubicacion as OrigenUbicacionReclamo : null,
    fecha_actualizacion: fecha(d.fecha_actualizacion), fecha_resolucion: fecha(d.fecha_resolucion),
    respuesta_publica: cadena(d.respuesta_publica), version: Number.isSafeInteger(d.version_atencion) && (d.version_atencion as number) >= 0 ? d.version_atencion as number : 0 };
}
export function serializarDetalleAdministrativo(valor: unknown): DetalleReclamoAdministrativo {
  const d = documento(valor);
  return { ...serializarDetalleCiudadano(d), contacto: { nombre: cadena(d.ciudadano_nombre), telefono: cadena(d.ciudadano_telefono), correo: cadena(d.ciudadano_email) },
    propietario_vinculado: typeof d.ciudadano_id_clerk === "string" && d.ciudadano_id_clerk.length > 0,
    solucion_notas_heredada: cadena(d.solucion_notas) };
}

/** Campos originales exclusivamente. No copiar documentos con spread/toJSON completo. */
export function serializarReclamoHeredado(valor: unknown, vista: "ciudadana" | "administrativa"): Objeto {
  const d = documento(valor); const salida: Objeto = {};
  for (const campo of ["folio", "ciudadano_id_clerk", "ciudadano_nombre", "ciudadano_telefono", "ciudadano_email", "domicilio_referencia", "tipo_incidencia", "descripcion", "fotografia_url", "ruta_id", "estado"]) {
    if (Object.hasOwn(d, campo)) salida[campo] = cadena(d[campo]);
  }
  if (vista === "ciudadana") salida.solucion_notas = "";
  else if (Object.hasOwn(d, "solucion_notas")) salida.solucion_notas = cadena(d.solucion_notas);
  for (const campo of ["_id", "camion_asignado_id"]) if (Object.hasOwn(d, campo)) salida[campo] = identificador(d[campo]);
  for (const campo of ["fecha_reporte", "fecha_resolucion", "fecha_creacion", "fecha_actualizacion"]) if (Object.hasOwn(d, campo)) salida[campo] = fecha(d[campo]);
  if (Object.hasOwn(d, "ubicacion")) salida.ubicacion = punto(d.ubicacion);
  if (typeof d.__v === "number" && Number.isSafeInteger(d.__v)) salida.__v = d.__v;
  return salida;
}

export interface AcuseReclamoR1 { id: string; folio: string; recibido_en: string; estado_inicial: "PENDIENTE" }
export function validarOperacionReclamo(id: unknown): string {
  if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))
    throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "Se requiere un identificador de operación UUID v4");
  return id.toLowerCase();
}
export function serializarAcuseReclamo(valor: unknown): AcuseReclamoR1 {
  const d = documento(valor);
  if (typeof d.id !== "string" || !/^[a-f0-9]{24}$/.test(d.id) || typeof d.folio !== "string" ||
      !/^REC-[A-F0-9-]+$/i.test(d.folio) || typeof d.recibido_en !== "string" || !Number.isFinite(Date.parse(d.recibido_en)) || d.estado_inicial !== "PENDIENTE")
    throw new ErrorReclamo(503, "SERVICIO_NO_DISPONIBLE", "No se pudo recuperar el acuse de la operación");
  return { id: d.id, folio: d.folio, recibido_en: d.recibido_en, estado_inicial: "PENDIENTE" };
}
