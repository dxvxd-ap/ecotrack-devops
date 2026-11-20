import { configurar } from './contratos.ts';

export const TIPOS_AVISO = ['comunicado', 'cambio_ruta', 'retraso', 'suspension', 'reporte'] as const;
export const PRIORIDADES_AVISO = ['normal', 'alta', 'urgente'] as const;
export type TipoAviso = typeof TIPOS_AVISO[number];
export type PrioridadAviso = typeof PRIORIDADES_AVISO[number];

export interface ReferenciaAviso {
  tipo: 'reporte' | 'ruta';
  id: string;
}

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  titulo: string;
  mensaje: string;
  prioridad: PrioridadAviso;
  publicado_en: string;
  vigente_hasta: string | null;
  leido_en: string | null;
  referencia: ReferenciaAviso | null;
}

export interface ResumenAvisos {
  sin_leer_total: number;
  estado_zona: 'sin_domicilio' | 'sin_confirmacion';
}

export interface ListaAvisos {
  avisos: Aviso[];
  cursor_siguiente: string | null;
  sin_leer_total: number;
  estado_zona: 'sin_domicilio' | 'sin_confirmacion';
}

export type FiltroAvisos = 'todos' | 'sin_leer' | 'mi_zona';

export class ErrorAvisos extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly incierto: boolean;

  constructor(status: number, codigo: string, incierto = false) {
    super(mensajeAviso(codigo));
    this.name = 'ErrorAvisos';
    this.status = status;
    this.codigo = codigo;
    this.incierto = incierto;
  }
}

function mensajeAviso(codigo: string): string {
  const mensajes: Record<string, string> = {
    ENTRADA_INVALIDA: 'Revisa los parámetros e inténtalo de nuevo.',
    AVISO_NO_ENCONTRADO: 'El aviso no está disponible.',
    SIN_SESION: 'Tu sesión terminó. Entra de nuevo desde Cuenta.',
    ACCESO_DENEGADO: 'Esta función requiere una cuenta ciudadana autorizada.',
    CUENTA_EN_CONFLICTO: 'Revisa y sincroniza tu perfil desde Cuenta antes de continuar.',
    VERSION_DESACTUALIZADA: 'La información cambió. Actualiza la lista para ver la versión actual.',
    VIGENCIA_VENCIDA: 'Este aviso ya no está vigente.',
    SERVICIO_NO_DISPONIBLE: 'El servicio municipal no está disponible. Inténtalo de nuevo más tarde.',
    CUENTA_NO_CIUDADANA: 'Esta función requiere una cuenta ciudadana.',
    RESULTADO_INCIERTO: 'No se confirmó la lectura. Consulta el estado antes de intentarlo de nuevo.',
    RESPUESTA_INVALIDA: 'El servicio devolvió una respuesta inválida.',
    ERROR_RED: 'No pudimos conectar con el servicio. Revisa tu conexión.',
  };
  return mensajes[codigo] || 'No pudimos consultar el servicio municipal. Revisa la conexión e inténtalo de nuevo.';
}

function idValido(v: unknown): v is string {
  return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
}

function fechaAvisoValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor)) return false;
  const fecha = new Date(valor);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString() === valor;
}
function contadorValido(valor: unknown) {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0;
}
function referenciaValida(valor: unknown): valor is ReferenciaAviso {
  if (!valor || typeof valor !== 'object') return false;
  const { tipo, id } = valor as Record<string, unknown>;
  return (tipo === 'reporte' || tipo === 'ruta') && typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);
}

function avisoValido(v: unknown): v is Aviso {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    idValido(a.id) &&
    typeof a.tipo === 'string' &&
    TIPOS_AVISO.includes(a.tipo as TipoAviso) &&
    typeof a.titulo === 'string' &&
    typeof a.mensaje === 'string' &&
    typeof a.prioridad === 'string' &&
    PRIORIDADES_AVISO.includes(a.prioridad as PrioridadAviso) &&
    fechaAvisoValida(a.publicado_en) &&
    (a.vigente_hasta === null || fechaAvisoValida(a.vigente_hasta)) &&
    (a.leido_en === null || fechaAvisoValida(a.leido_en)) &&
    (a.referencia === null || referenciaValida(a.referencia))
  );
}

function listaValida(v: unknown): v is ListaAvisos {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    Array.isArray(l.avisos) &&
    l.avisos.every(avisoValido) &&
    (l.cursor_siguiente === null || (typeof l.cursor_siguiente === 'string' && /^[A-Za-z0-9_-]{1,400}$/.test(l.cursor_siguiente))) &&
    contadorValido(l.sin_leer_total) &&
    typeof l.estado_zona === 'string' &&
    ['sin_domicilio', 'sin_confirmacion'].includes(l.estado_zona)
  );
}

function resumenValido(v: unknown): v is ResumenAvisos {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return contadorValido(r.sin_leer_total) && typeof r.estado_zona === 'string' && ['sin_domicilio', 'sin_confirmacion'].includes(r.estado_zona);
}

function marcadoValido(v: unknown): v is { id: string; leido_en: string; sin_leer_total: number } {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return idValido(m.id) && fechaAvisoValida(m.leido_en) && contadorValido(m.sin_leer_total);
}

const TIEMPO_SOLICITUD = 12000;

export async function obtenerTokenAvisos(obtener: () => Promise<string | null>, signal: AbortSignal, timeoutMs = TIEMPO_SOLICITUD) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelar: (() => void) | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      cancelar = () => reject(new ErrorAvisos(0, 'ERROR_RED'));
      if (signal.aborted) return cancelar();
      signal.addEventListener('abort', cancelar, { once: true });
      timer = setTimeout(cancelar, timeoutMs);
      obtener().then(token => {
        if (!token) reject(new ErrorAvisos(401, 'SIN_SESION'));
        else resolve(token);
      }, reject);
    });
  } finally {
    clearTimeout(timer);
    if (cancelar) signal.removeEventListener('abort', cancelar);
  }
}

export function crearServicioAvisos({ origen, transportar = fetch, timeoutMs = TIEMPO_SOLICITUD }: { origen?: string; transportar?: typeof fetch; timeoutMs?: number } = {}) {
  const base = origen ?? configurar({ android: typeof __ANDROID_BUILD__ !== 'undefined' && __ANDROID_BUILD__, api: import.meta.env?.VITE_API_ORIGIN?.trim() }).api;

  async function pedir<T>(token: string, path: string, method = 'GET', signal?: AbortSignal): Promise<T> {
    const mutacion = method !== 'GET';
    if (signal?.aborted) throw new ErrorAvisos(0, 'ERROR_RED');
    if (!token.trim()) throw new ErrorAvisos(401, 'SIN_SESION');
    const control = new AbortController();
    const abortar = () => control.abort();
    signal?.addEventListener('abort', abortar, { once: true });
    const timer = setTimeout(abortar, timeoutMs);
    try {
      const r = await transportar(base + path, {
        method,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: control.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (control.signal.aborted) throw new Error('Solicitud cancelada');
      let b: unknown;
      try { b = await r.json(); } catch { throw new ErrorAvisos(r.status, 'RESPUESTA_INVALIDA', mutacion && (r.ok || r.status >= 500 || r.status === 408)); }
      if (control.signal.aborted) throw new Error('Solicitud cancelada');
      if (!r.ok) {
        const codigo = typeof b === 'object' && b !== null && typeof (b as Record<string, unknown>).codigo === 'string' ? (b as Record<string, unknown>).codigo as string : 'SERVICIO_NO_DISPONIBLE';
        throw new ErrorAvisos(r.status, codigo, mutacion && (r.status >= 500 || r.status === 408));
      }
      if (typeof b !== 'object' || b === null || (b as Record<string, unknown>).exito !== true || !Object.hasOwn(b, 'datos')) {
        throw new ErrorAvisos(r.status, 'RESPUESTA_INVALIDA', mutacion);
      }
      return (b as Record<string, unknown>).datos as T;
    } catch (e) {
      if (e instanceof ErrorAvisos) throw e;
      throw new ErrorAvisos(0, method !== 'GET' ? 'RESULTADO_INCIERTO' : 'ERROR_RED', method !== 'GET');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortar);
    }
  }

  return {
    async resumen(token: string, signal?: AbortSignal): Promise<ResumenAvisos> {
      const d = await pedir<unknown>(token, '/api/ciudadano/avisos/resumen', 'GET', signal);
      if (!resumenValido(d)) throw new ErrorAvisos(502, 'RESPUESTA_INVALIDA');
      return d;
    },
    async listar(token: string, filtro: FiltroAvisos = 'todos', limite = 20, cursor: string | null = null, signal?: AbortSignal): Promise<ListaAvisos> {
      const params = new URLSearchParams({ filtro, limite: String(limite) });
      if (cursor) params.set('cursor', cursor);
      const d = await pedir<unknown>(token, `/api/ciudadano/avisos?${params.toString()}`, 'GET', signal);
      if (!listaValida(d)) throw new ErrorAvisos(502, 'RESPUESTA_INVALIDA');
      return d;
    },
    async marcarLectura(token: string, id: string, signal?: AbortSignal): Promise<{ id: string; leido_en: string; sin_leer_total: number }> {
      if (!idValido(id)) throw new ErrorAvisos(400, 'ENTRADA_INVALIDA');
      const d = await pedir<unknown>(token, `/api/ciudadano/avisos/${id}/lectura`, 'PUT', signal);
      if (!marcadoValido(d) || d.id !== id) throw new ErrorAvisos(502, 'RESPUESTA_INVALIDA', true);
      return d;
    },
  };
}

export type ServicioAvisos = ReturnType<typeof crearServicioAvisos>;