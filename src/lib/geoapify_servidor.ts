import { createHash } from 'node:crypto';
import { validarConsultaDireccion, type ConsultaDireccion, type DireccionAproximada, type ResultadoDireccion } from '../contratos/direccion_aproximada';

export class ErrorGeocodificacion extends Error {
  constructor(public status: number, public codigo: string, mensaje: string, public reintentarEn?: number) {
    super(mensaje);
    this.name = 'ErrorGeocodificacion';
  }
}
const DIA = 86400000;
const MAX_RESPUESTA = 65536;
const falloRespuesta = () => new ErrorGeocodificacion(502, 'RESPUESTA_GEOCODIFICACION_INVALIDA', 'El servicio devolvió una respuesta inválida');
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= 240 && !/[\u0000-\u001f\u007f]/.test(s) ? s : null;
}
function normalizar(valor: unknown): { direccion: DireccionAproximada | null; datos: string } {
  if (!objeto(valor) || !Array.isArray(valor.results)) throw falloRespuesta();
  if (!valor.results.length) return { direccion: null, datos: '© OpenStreetMap contributors' };
  const p: unknown = valor.results[0];
  if (!objeto(p)) throw falloRespuesta();
  const direccion: DireccionAproximada = {
    calle: texto(p.street),
    numero: typeof p.housenumber === 'number' && Number.isFinite(p.housenumber) ? String(p.housenumber) : texto(p.housenumber),
    colonia: texto(p.suburb) ?? texto(p.neighbourhood),
    localidad: texto(p.city),
    // Geoapify no garantiza que city/county sean un municipio mexicano.
    municipio: null,
    estado: texto(p.state),
    pais: texto(p.country),
  };
  const datos = objeto(p.datasource) ? texto(p.datasource.attribution) : null;
  return { direccion: Object.values(direccion).some(v => v !== null) ? direccion : null,
    datos: datos ?? '© OpenStreetMap contributors' };
}
async function leerRespuesta(respuesta: Response, signal: AbortSignal): Promise<unknown> {
  if (!respuesta.headers.get('content-type')?.toLowerCase().includes('json') ||
    Number(respuesta.headers.get('content-length')) > MAX_RESPUESTA || !respuesta.body) throw falloRespuesta();
  const lector = respuesta.body.getReader();
  const cancelar = () => { void lector.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancelar, { once: true });
  let bytes = 0, contenido = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const parte = await lector.read();
      if (parte.done) break;
      bytes += parte.value.byteLength;
      if (bytes > MAX_RESPUESTA) { cancelar(); throw falloRespuesta(); }
      contenido += decoder.decode(parte.value, { stream: true });
    }
    contenido += decoder.decode();
    return JSON.parse(contenido);
  } catch {
    throw falloRespuesta();
  } finally {
    signal.removeEventListener('abort', cancelar);
    lector.releaseLock();
  }
}
interface Opciones {
  transportar?: typeof fetch;
  clave?: () => string | undefined;
  ahora?: () => number;
  timeoutMs?: number;
  maxCache?: number;
}
/** Estado efímero por proceso. No constituye una cuota distribuida entre réplicas. */
export function crearGeocodificador(opciones: Opciones = {}) {
  const transportar = opciones.transportar ?? ((url, init) => fetch(url, init));
  const clave = opciones.clave ?? (() => process.env.GEOAPIFY_API_KEY);
  const ahora = opciones.ahora ?? Date.now;
  const timeoutMs = Math.min(5000, Math.max(1, opciones.timeoutMs ?? 5000));
  const maxCache = Math.min(500, Math.max(1, opciones.maxCache ?? 500));
  const cache = new Map<string, { vence: number; resultado: ResultadoDireccion }>();
  const pendientes = new Map<string, Promise<ResultadoDireccion>>();
  const ciudadanos = new Map<string, { vence: number; solicitudes: number }>();
  let proxima = 0, bloqueadoHasta = 0, dia = -1, usadasDia = 0, minuto = -1, usadasMinuto = 0;
  const limitado = (segundos: number) => new ErrorGeocodificacion(429, 'LIMITE_GEOCODIFICACION',
    'Se alcanzó el límite temporal de consultas de dirección', Math.max(1, Math.ceil(segundos)));

  async function proveedor(punto: ConsultaDireccion, apiKey: string): Promise<ResultadoDireccion> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const trabajo = (async () => {
        const url = new URL('https://api.geoapify.com/v1/geocode/reverse');
        url.search = new URLSearchParams({ lat: String(punto.latitud), lon: String(punto.longitud),
          lang: 'es', format: 'json', limit: '1', apiKey }).toString();
        // No reenviar cabeceras, identidad, correo ni JWT del ciudadano.
        const r = await transportar(url.toString(), { method: 'GET', headers: { Accept: 'application/json' },
          redirect: 'error', cache: 'no-store', signal: controller.signal });
        if (r.status === 429) {
          const retry = r.headers.get('retry-after');
          const segundos = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - ahora()) / 1000 : 60;
          const espera = Math.min(86400, Math.max(1, Math.ceil(Number.isFinite(segundos) ? segundos : 60)));
          bloqueadoHasta = Math.max(bloqueadoHasta, ahora() + espera * 1000);
          throw new ErrorGeocodificacion(429, 'CUOTA_PROVEEDOR', 'El servicio de direcciones alcanzó su límite temporal', espera);
        }
        if (!r.ok) throw new ErrorGeocodificacion(502, 'ERROR_PROVEEDOR', 'El servicio de direcciones no está disponible');
        return normalizar(await leerRespuesta(r, controller.signal));
      })();
      const normalizada = await Promise.race([trabajo, new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ErrorGeocodificacion(504, 'TIMEOUT_GEOCODIFICACION', 'El servicio de direcciones tardó demasiado'));
          controller.abort();
        }, timeoutMs);
      })]);
      const fecha = ahora(), vence = fecha + (normalizada.direccion ? DIA : 300000);
      return { proveedor: 'geoapify', aproximada: true, direccion: normalizada.direccion,
        consultado_en: new Date(fecha).toISOString(), expira_en: new Date(vence).toISOString(),
        atribucion: { proveedor: 'Geoapify', url: 'https://www.geoapify.com/', datos: normalizada.datos } };
    } catch (error) {
      if (error instanceof ErrorGeocodificacion) throw error;
      // El error original puede incluir la URL, las coordenadas o la clave. No propagar ni registrar.
      throw new ErrorGeocodificacion(502, 'ERROR_PROVEEDOR', 'No se pudo consultar el servicio de direcciones');
    } finally { clearTimeout(timer); controller.abort(); }
  }

  return {
    async consultar(ciudadano: string, entrada: ConsultaDireccion): Promise<ResultadoDireccion> {
      let punto: ConsultaDireccion;
      try { punto = validarConsultaDireccion(entrada); }
      catch { throw new ErrorGeocodificacion(400, 'ENTRADA_INVALIDA', 'Se requiere un punto válido y confirmado'); }
      if (!ciudadano) throw new ErrorGeocodificacion(401, 'SIN_SESION', 'No hay sesión activa');
      const apiKey = clave()?.trim();
      if (!apiKey) throw new ErrorGeocodificacion(503, 'GEOCODIFICACION_NO_CONFIGURADA', 'La consulta de direcciones no está configurada');
      const t = ahora();
      for (const [id, v] of ciudadanos) if (v.vence <= t) ciudadanos.delete(id);
      let uso = ciudadanos.get(ciudadano);
      if (!uso) {
        if (ciudadanos.size >= 1000) throw limitado(60);
        uso = { vence: t + 60000, solicitudes: 0 }; ciudadanos.set(ciudadano, uso);
      }
      if (uso.solicitudes >= 20) throw limitado((uso.vence - t) / 1000);
      uso.solicitudes++;
      const id = createHash('sha256').update(JSON.stringify(['geoapify-v1-es', ciudadano, punto.latitud, punto.longitud])).digest('hex');
      for (const [k, v] of cache) if (v.vence <= t) cache.delete(k);
      const existente = cache.get(id);
      if (existente) {
        cache.delete(id); cache.set(id, existente);
        return structuredClone(existente.resultado);
      }
      const pendiente = pendientes.get(id);
      if (pendiente) return structuredClone(await pendiente);
      if (t < bloqueadoHasta) throw limitado((bloqueadoHasta - t) / 1000);
      const diaActual = Math.floor(t / DIA), minutoActual = Math.floor(t / 60000);
      if (dia !== diaActual) { dia = diaActual; usadasDia = 0; }
      if (minuto !== minutoActual) { minuto = minutoActual; usadasMinuto = 0; }
      if (usadasDia >= 2400) throw limitado(((dia + 1) * DIA - t) / 1000);
      if (usadasMinuto >= 40) throw limitado(((minuto + 1) * 60000 - t) / 1000);
      if (t < proxima || pendientes.size >= 8) throw limitado(1);
      usadasDia++; usadasMinuto++; proxima = t + 250;
      const solicitud = proveedor(punto, apiKey).then(resultado => {
        cache.set(id, { vence: Date.parse(resultado.expira_en), resultado });
        while (cache.size > maxCache) cache.delete(cache.keys().next().value!);
        return resultado;
      }).finally(() => { pendientes.delete(id); });
      pendientes.set(id, solicitud);
      return structuredClone(await solicitud);
    },
  };
}
export const geocodificadorGeoapify = crearGeocodificador();
