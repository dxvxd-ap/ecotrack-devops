const API_DEFAULT = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_ORIGIN) || '';

let apiOverride: string | null = null;

export function __setApiOverride(url: string | null): void {
  apiOverride = url;
}

function getApiBase(): string {
  return apiOverride ?? API_DEFAULT;
}

export type TipoSeleccionDomicilio = 'gps' | 'manual';

export interface PuntoDomicilio {
  type: 'Point';
  coordinates: [number, number];
}

export interface DomicilioDTO {
  ubicacion: PuntoDomicilio;
  tipo_seleccion: TipoSeleccionDomicilio;
  fecha_confirmacion: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  version: number;
  asignacion: AsignacionDomicilio;
}

export interface AsignacionDomicilio {
  estado: 'pendiente' | 'asignada' | 'ambigua' | 'sin_evidencia' | 'sin_cobertura' | 'requiere_revision';
  ruta_id: string | null;
  metodo: 'cobertura_oficial' | 'revision_administrativa' | null;
  fecha_evaluacion: string | null;
  version_politica: string | null;
  huella_catalogo: string | null;
  motivo: string | null;
}

export interface RegistroDomicilio {
  latitud: number;
  longitud: number;
  tipo_seleccion: TipoSeleccionDomicilio;
  confirmada: true;
}

export interface ActualizacionDomicilio extends RegistroDomicilio {
  version: number;
}

type RespuestaExito<T> = { exito: true; datos: T; mensaje?: string };
type RespuestaError = { exito: false; mensaje: string; codigo: string };
type RespuestaAPI<T> = RespuestaExito<T> | RespuestaError;

export class ErrorDomicilio extends Error {
  public readonly status: number;
  public readonly codigo: string;

  constructor(status: number, message: string, codigo: string) {
    super(message);
    this.name = 'ErrorDomicilio';
    this.status = status;
    this.codigo = codigo;
  }
}

export class ErrorConflictoVersion extends ErrorDomicilio {
  constructor(message: string) {
    super(409, message, 'VERSION_CONFLICTIVA');
    this.name = 'ErrorConflictoVersion';
  }
}

export class ErrorDomicilioExistente extends ErrorDomicilio {
  constructor(message: string) {
    super(409, message, 'DOMICILIO_EXISTENTE');
    this.name = 'ErrorDomicilioExistente';
  }
}

export class ErrorDomicilioNoEncontrado extends ErrorDomicilio {
  constructor(message: string) {
    super(404, message, 'DOMICILIO_NO_ENCONTRADO');
    this.name = 'ErrorDomicilioNoEncontrado';
  }
}

export class ErrorEntradaInvalida extends ErrorDomicilio {
  constructor(message: string) {
    super(400, message, 'ENTRADA_INVALIDA');
    this.name = 'ErrorEntradaInvalida';
  }
}

export class ErrorSinSesion extends ErrorDomicilio {
  constructor(message: string) {
    super(401, message, 'SIN_SESION');
    this.name = 'ErrorSinSesion';
  }
}

export class ErrorAccesoDenegado extends ErrorDomicilio {
  constructor(message: string) {
    super(403, message, 'ACCESO_DENEGADO');
    this.name = 'ErrorAccesoDenegado';
  }
}

export class ErrorServicioNoDisponible extends ErrorDomicilio {
  constructor(message: string) {
    super(503, message, 'SERVICIO_NO_DISPONIBLE');
    this.name = 'ErrorServicioNoDisponible';
  }
}

function validarCoordenadas(latitud: number, longitud: number): void {
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    throw new ErrorEntradaInvalida('Latitud y longitud deben ser números finitos');
  }
  if (latitud < -90 || latitud > 90) {
    throw new ErrorEntradaInvalida('Latitud fuera de rango [-90, 90]');
  }
  if (longitud < -180 || longitud > 180) {
    throw new ErrorEntradaInvalida('Longitud fuera de rango [-180, 180]');
  }
}

async function hacerPeticion<T>(
  endpoint: string,
  opciones: RequestInit,
  token: string
): Promise<T> {
  const url = `${getApiBase()}${endpoint}`;
  const headers = new Headers(opciones.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { ...opciones, headers });
  } catch (error) {
    throw new ErrorDomicilio(0, 'Error de red al contactar el servidor', 'ERROR_RED');
  }

  let datos: unknown;
  try {
    datos = await respuesta.json();
  } catch {
    throw new ErrorDomicilio(respuesta.status, 'Respuesta inválida del servidor', 'RESPUESTA_INVALIDA');
  }

  if (!respuesta.ok) {
    const error = datos as RespuestaError;
    const mensaje = error?.mensaje || 'Error desconocido';
    const codigo = error?.codigo || 'ERROR_DESCONOCIDO';

    switch (respuesta.status) {
      case 400:
        throw new ErrorEntradaInvalida(mensaje);
      case 401:
        throw new ErrorSinSesion(mensaje);
      case 403:
        throw new ErrorAccesoDenegado(mensaje);
      case 404:
        throw new ErrorDomicilioNoEncontrado(mensaje);
      case 409:
        if (codigo === 'VERSION_CONFLICTIVA') {
          throw new ErrorConflictoVersion(mensaje);
        }
        if (codigo === 'DOMICILIO_EXISTENTE') {
          throw new ErrorDomicilioExistente(mensaje);
        }
        throw new ErrorDomicilio(409, mensaje, codigo);
      case 413:
      case 415:
        throw new ErrorEntradaInvalida(mensaje);
      case 503:
        throw new ErrorServicioNoDisponible(mensaje);
      default:
        throw new ErrorDomicilio(respuesta.status, mensaje, codigo);
    }
  }

  const exito = datos as RespuestaExito<T>;
  if (!exito.exito || exito.datos === undefined) {
    throw new ErrorDomicilio(respuesta.status, 'Respuesta del servidor malformada', 'RESPUESTA_INVALIDA');
  }
  return exito.datos;
}

export async function consultarDomicilio(token: string): Promise<DomicilioDTO | null> {
  if (!token || token.trim() === '') {
    throw new ErrorSinSesion('Token de autenticación requerido');
  }

  return hacerPeticion<DomicilioDTO | null>(
    '/api/ciudadano/domicilio',
    { method: 'GET' },
    token
  );
}

export async function crearDomicilio(
  token: string,
  datos: RegistroDomicilio
): Promise<DomicilioDTO> {
  if (!token || token.trim() === '') {
    throw new ErrorSinSesion('Token de autenticación requerido');
  }

  validarCoordenadas(datos.latitud, datos.longitud);

  if (datos.tipo_seleccion !== 'gps' && datos.tipo_seleccion !== 'manual') {
    throw new ErrorEntradaInvalida('tipo_seleccion debe ser "gps" o "manual"');
  }
  if (datos.confirmada !== true) {
    throw new ErrorEntradaInvalida('El domicilio debe ser confirmado explícitamente');
  }

  return hacerPeticion<DomicilioDTO>(
    '/api/ciudadano/domicilio',
    { method: 'POST', body: JSON.stringify(datos) },
    token
  );
}

export async function actualizarDomicilio(
  token: string,
  datos: ActualizacionDomicilio
): Promise<DomicilioDTO> {
  if (!token || token.trim() === '') {
    throw new ErrorSinSesion('Token de autenticación requerido');
  }

  validarCoordenadas(datos.latitud, datos.longitud);

  if (datos.tipo_seleccion !== 'gps' && datos.tipo_seleccion !== 'manual') {
    throw new ErrorEntradaInvalida('tipo_seleccion debe ser "gps" o "manual"');
  }
  if (datos.confirmada !== true) {
    throw new ErrorEntradaInvalida('El domicilio debe ser confirmado explícitamente');
  }
  if (!Number.isInteger(datos.version) || datos.version < 0) {
    throw new ErrorEntradaInvalida('Versión de domicilio inválida');
  }

  return hacerPeticion<DomicilioDTO>(
    '/api/ciudadano/domicilio',
    { method: 'PUT', body: JSON.stringify(datos) },
    token
  );
}