import type { ResultadoDireccion, DireccionAproximada } from '../../../../src/contratos/direccion_aproximada.ts';
export type { ResultadoDireccion, DireccionAproximada };
export type PuntoDireccion = readonly [longitud: number, latitud: number];
const API = import.meta.env?.VITE_API_ORIGIN?.trim() || '';
export class ErrorDireccion extends Error {
  status: number;
  codigo: string;
  reintentarEn: number;
  constructor(status: number, codigo: string, reintentarEn = 0) {
    super('No se pudo obtener la dirección aproximada');
    this.name = 'ErrorDireccion';
    this.status=status;this.codigo=codigo;this.reintentarEn=reintentarEn;
  }
}
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.length <= 1000;
function esResultado(v: unknown): v is ResultadoDireccion {
  if (!objeto(v) || v.proveedor !== 'geoapify' || v.aproximada !== true || !texto(v.consultado_en) || !texto(v.expira_en)) return false;
  const consulta = Date.parse(v.consultado_en), expira = Date.parse(v.expira_en);
  if (!Number.isFinite(consulta) || !Number.isFinite(expira) || expira <= Date.now() || expira <= consulta || expira - consulta > 86400000) return false;
  if (!objeto(v.atribucion) || v.atribucion.proveedor !== 'Geoapify' || v.atribucion.url !== 'https://www.geoapify.com/' || !texto(v.atribucion.datos)) return false;
  return v.direccion === null || (objeto(v.direccion) && ['calle','numero','colonia','localidad','municipio','estado','pais'].every(k => v.direccion !== null && objeto(v.direccion) && (v.direccion[k] === null || texto(v.direccion[k]))));
}
export function puntoValido(p: PuntoDireccion): boolean {
  return p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
}
interface Opciones { signal?: AbortSignal; transportar?: typeof fetch; timeoutMs?: number }
export async function consultarDireccion(token: string, punto: PuntoDireccion, opciones: Opciones = {}): Promise<ResultadoDireccion> {
  if (!token.trim()) throw new ErrorDireccion(401, 'SIN_SESION');
  if (!puntoValido(punto)) throw new ErrorDireccion(400, 'ENTRADA_INVALIDA');
  if (opciones.signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelar = () => {};
  try {
    const cancelacion = new Promise<never>((_, reject) => {
      cancelar = () => { reject(new DOMException('Consulta cancelada', 'AbortError')); controller.abort(); };
      opciones.signal?.addEventListener('abort', cancelar, { once: true });
    });
    const trabajo = (async () => {
      const r = await (opciones.transportar ?? fetch)(`${API}/api/ciudadano/direccion-aproximada`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({latitud:punto[1],longitud:punto[0],confirmada:true}), cache:'no-store', signal:controller.signal,
      });
      if (!r.ok) {
        const raw = r.headers.get('retry-after');
        const segundos = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw)-Date.now())/1000 : 60;
        throw new ErrorDireccion(r.status, r.status===429?'CUOTA':'HTTP', r.status===429?Math.min(86400,Math.max(1,Math.ceil(Number.isFinite(segundos)?segundos:60))):0);
      }
      const body: unknown = await r.json();
      if (!objeto(body) || body.exito !== true || !esResultado(body.datos)) throw new ErrorDireccion(502,'RESPUESTA_INVALIDA');
      return body.datos;
    })();
    return await Promise.race([trabajo,cancelacion,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{reject(new ErrorDireccion(0,'TIMEOUT'));controller.abort();},opciones.timeoutMs??8000);
    })]);
  } catch(error) {
    if (error instanceof ErrorDireccion || (error instanceof DOMException && error.name==='AbortError')) throw error;
    throw new ErrorDireccion(0,error instanceof SyntaxError?'RESPUESTA_INVALIDA':'CONEXION');
  } finally { clearTimeout(timer);opciones.signal?.removeEventListener('abort',cancelar);controller.abort(); }
}
