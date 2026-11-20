import { configurar } from './contratos.ts';
export const CATEGORIAS_REPORTES = { CAMION_NO_PASO:'El camión no pasó', HORARIO_IRREGULAR:'Horario irregular', BASURA_TIRADA:'Basura en la vía pública', MALA_ATENCION:'Mala atención', OTRO:'Otra incidencia' } as const;
export const ESTADOS_REPORTES = { PENDIENTE:'Pendiente', EN_REVISION:'En revisión', ATENDIDO:'Atendido', RECHAZADO:'Rechazado' } as const;
export type CategoriaReporte=keyof typeof CATEGORIAS_REPORTES;
export type EstadoReporte=keyof typeof ESTADOS_REPORTES;
export type PuntoReporte={latitud:number;longitud:number;origen_ubicacion:'manual'|'gps'|'domicilio';confirmada:true};
export type EntradaReporte=PuntoReporte & {tipo_incidencia:CategoriaReporte;descripcion:string;domicilio_referencia:string;ciudadano_telefono?:string;ruta_id:string|null};
export type ResumenReporte={id:string|null;folio:string|null;tipo_incidencia:CategoriaReporte|null;estado:EstadoReporte|null;fecha_reporte:string|null};
export type DetalleReporte=ResumenReporte & {descripcion:string|null;domicilio_referencia:string|null;ubicacion:{type:'Point';coordinates:[number,number]}|null;ruta_id:string|null;origen_ubicacion:PuntoReporte['origen_ubicacion']|null;respuesta_publica:string|null;fecha_actualizacion:string|null;fecha_resolucion:string|null;version:number};
export type AcuseReporte={id:string;folio:string;recibido_en:string;estado_inicial:'PENDIENTE'};
export class ErrorReportes extends Error {
  readonly status:number;readonly codigo:string;readonly incierto:boolean;
  constructor(status:number,codigo:string,incierto=false){super(mensajeReporte(codigo));this.name='ErrorReportes';this.status=status;this.codigo=codigo;this.incierto=incierto;}
}
export function mensajeReporte(codigo:string):string {
  const mensajes:Record<string,string>={CUENTA_NO_CIUDADANA:'Esta sesión no tiene acceso a las funciones ciudadanas. Puedes consultar el mapa o usar una cuenta ciudadana.',SIN_SESION:'Tu sesión terminó. Entra de nuevo desde Cuenta.',ACCESO_DENEGADO:'Esta función requiere una cuenta ciudadana autorizada.',CUENTA_EN_CONFLICTO:'Revisa y sincroniza tu perfil desde Cuenta antes de continuar.',INDICE_NO_DISPONIBLE:'El municipio todavía no tiene habilitado el registro de reportes. Inténtalo más tarde.',CREACION_R1_NO_DISPONIBLE:'El registro de reportes aún no está habilitado.',ENTRADA_INVALIDA:'Revisa los datos y confirma la ubicación del reporte.',CUERPO_EXCESIVO:'El reporte supera el tamaño permitido. Reduce el texto.',CLAVE_REUTILIZADA:'La operación ya tiene otro contenido. Consulta su confirmación antes de continuar.',OPERACION_NO_ENCONTRADA:'Todavía no hay una confirmación visible. Esto no demuestra que el envío haya fallado.',RESULTADO_INCIERTO:'No pudimos confirmar el envío. Conservamos la misma operación para consultar o reintentar sin duplicarla.'};
  return mensajes[codigo]||'No pudimos consultar el servicio municipal. Revisa la conexión e inténtalo de nuevo.';
}
export function coordenadasReporte(lat:unknown,lon:unknown):boolean {return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
export function uuidReporte(v:unknown):v is string {return typeof v==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(v);}
const objeto=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const idValido=(v:unknown):v is string=>typeof v==='string'&&/^[a-f\d]{24}$/i.test(v);
const invalido=():never=>{throw new ErrorReportes(400,'ENTRADA_INVALIDA');};
function texto(v:unknown,min:number,max:number,multilinea=false):string {
  if(typeof v!=='string')return invalido();const n=v.normalize('NFC').replace(/\r\n?/g,'\n');
  if((multilinea?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(n))return invalido();
  const s=n.trim(),l=Array.from(s).length;if(l<min||l>max)return invalido();return s;
}
export function validarReporte(v:unknown):EntradaReporte {
  const campos=['tipo_incidencia','descripcion','domicilio_referencia','ciudadano_telefono','latitud','longitud','origen_ubicacion','confirmada','ruta_id'];
  if(!objeto(v)||Object.keys(v).some(k=>!campos.includes(k))||v.confirmada!==true||!coordenadasReporte(v.latitud,v.longitud)||typeof v.tipo_incidencia!=='string'||!Object.hasOwn(CATEGORIAS_REPORTES,v.tipo_incidencia))return invalido();
  const origen=Object.hasOwn(v,'origen_ubicacion')?v.origen_ubicacion:'manual';if(!['manual','gps','domicilio'].includes(origen as string))return invalido();
  const r:EntradaReporte={tipo_incidencia:v.tipo_incidencia as CategoriaReporte,descripcion:texto(v.descripcion,10,4000,true),domicilio_referencia:texto(v.domicilio_referencia,1,500),latitud:v.latitud as number,longitud:v.longitud as number,origen_ubicacion:origen as PuntoReporte['origen_ubicacion'],confirmada:true,ruta_id:null};
  if(Object.hasOwn(v,'ciudadano_telefono')){const t=texto(v.ciudadano_telefono,7,25),digitos=t.replace(/\D/g,'').length;if(!/^[+\d ()-]+$/.test(t)||digitos<7||digitos>15)return invalido();r.ciudadano_telefono=t;}
  if(v.ruta_id!==undefined&&v.ruta_id!==null){if(!idValido(v.ruta_id))return invalido();r.ruta_id=v.ruta_id.toLowerCase();}
  if(new TextEncoder().encode(JSON.stringify(r)).byteLength>16384)throw new ErrorReportes(413,'CUERPO_EXCESIVO');
  return r;
}
const cadena=(v:unknown)=>typeof v==='string'?v:null;
const fecha=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
function resumen(v:unknown):ResumenReporte {
  if(!objeto(v)||!(v.id===null||idValido(v.id))||!Object.hasOwn(v,'folio')||!Object.hasOwn(v,'estado'))throw new ErrorReportes(502,'RESPUESTA_INVALIDA');
  return{id:cadena(v.id),folio:cadena(v.folio),estado:typeof v.estado==='string'&&Object.hasOwn(ESTADOS_REPORTES,v.estado)?v.estado as EstadoReporte:null,tipo_incidencia:typeof v.tipo_incidencia==='string'&&Object.hasOwn(CATEGORIAS_REPORTES,v.tipo_incidencia)?v.tipo_incidencia as CategoriaReporte:null,fecha_reporte:fecha(v.fecha_reporte)};
}
function detalle(v:unknown):DetalleReporte {
  const s=resumen(v);if(!objeto(v)||!Object.hasOwn(v,'respuesta_publica')||!Number.isSafeInteger(v.version)||(v.version as number)<0)throw new ErrorReportes(502,'RESPUESTA_INVALIDA');
  const p=v.ubicacion;const punto=objeto(p)&&p.type==='Point'&&Array.isArray(p.coordinates)&&p.coordinates.length===2&&coordenadasReporte(p.coordinates[1],p.coordinates[0])?{type:'Point' as const,coordinates:[p.coordinates[0],p.coordinates[1]] as [number,number]}:null;
  return{...s,descripcion:cadena(v.descripcion),domicilio_referencia:cadena(v.domicilio_referencia),ubicacion:punto,ruta_id:cadena(v.ruta_id),origen_ubicacion:['manual','gps','domicilio'].includes(v.origen_ubicacion as string)?v.origen_ubicacion as PuntoReporte['origen_ubicacion']:null,respuesta_publica:cadena(v.respuesta_publica),fecha_actualizacion:fecha(v.fecha_actualizacion),fecha_resolucion:fecha(v.fecha_resolucion),version:v.version as number};
}
function acuse(v:unknown):AcuseReporte {
  if(!objeto(v)||!idValido(v.id)||typeof v.folio!=='string'||!/^REC-[a-f\d-]+$/i.test(v.folio)||!fecha(v.recibido_en)||v.estado_inicial!=='PENDIENTE')throw new ErrorReportes(502,'RESPUESTA_INVALIDA',true);
  return{id:v.id,folio:v.folio,recibido_en:v.recibido_en as string,estado_inicial:'PENDIENTE'};
}
export function crearServicioReportes({origen,transportar=fetch,timeoutMs=12000}:{origen?:string;transportar?:typeof fetch;timeoutMs?:number}={}) {
  const base=origen??configurar({android:typeof __ANDROID_BUILD__!=='undefined'&&__ANDROID_BUILD__,api:import.meta.env?.VITE_API_ORIGIN?.trim()}).api;
  async function pedir(token:string,path:string,method='GET',body?:EntradaReporte,clave?:string,signal?:AbortSignal):Promise<unknown>{
    if(!token.trim())throw new ErrorReportes(401,'SIN_SESION');const envio=method==='POST',control=new AbortController();
    const abortar=()=>control.abort();signal?.addEventListener('abort',abortar,{once:true});if(signal?.aborted)control.abort();const timer=setTimeout(abortar,timeoutMs);
    try{
      const r=await transportar(base+path,{method,cache:'no-store',credentials:'omit',signal:control.signal,headers:{Authorization:`Bearer ${token}`,'EcoTrack-Contrato':'reclamos-r1',...(envio?{'Content-Type':'application/json','Idempotency-Key':clave!}:{})},...(envio?{body:JSON.stringify(body)}:{})});
      let b:unknown;try{b=await r.json();}catch{throw new ErrorReportes(r.status,'RESPUESTA_INVALIDA',envio);}
      if(!r.ok){const codigo=objeto(b)&&typeof b.codigo==='string'?b.codigo:'SERVICIO_NO_DISPONIBLE';throw new ErrorReportes(r.status,codigo,envio&&(codigo==='RESULTADO_INCIERTO'||codigo==='CLAVE_REUTILIZADA'||r.status>=500&&codigo!=='INDICE_NO_DISPONIBLE'&&codigo!=='CREACION_R1_NO_DISPONIBLE'));}
      if(!objeto(b)||b.exito!==true||!Object.hasOwn(b,'datos')||envio&&![200,201].includes(r.status))throw new ErrorReportes(r.status,'RESPUESTA_INVALIDA',envio);
      return b.datos;
    }catch(e){if(e instanceof ErrorReportes)throw e;throw new ErrorReportes(0,envio?'RESULTADO_INCIERTO':'ERROR_RED',envio);}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abortar);}
  }
  return{
    async verificarAcceso(token:string,signal?:AbortSignal):Promise<[number,number]|null>{const d=await pedir(token,'/api/ciudadano/domicilio','GET',undefined,undefined,signal);if(d===null)return null;if(objeto(d)&&objeto(d.ubicacion)&&d.ubicacion.type==='Point'&&Array.isArray(d.ubicacion.coordinates)&&d.ubicacion.coordinates.length===2&&coordenadasReporte(d.ubicacion.coordinates[1],d.ubicacion.coordinates[0]))return[d.ubicacion.coordinates[0],d.ubicacion.coordinates[1]];throw new ErrorReportes(502,'RESPUESTA_INVALIDA');},
    async crear(token:string,d:EntradaReporte,clave:string,signal?:AbortSignal){if(!uuidReporte(clave))return invalido();return acuse(await pedir(token,'/api/v1/reclamos','POST',validarReporte(d),clave.toLowerCase(),signal));},
    async listar(token:string,signal?:AbortSignal){const d=await pedir(token,'/api/v1/reclamos','GET',undefined,undefined,signal);if(!Array.isArray(d))throw new ErrorReportes(502,'RESPUESTA_INVALIDA');return d.map(resumen);},
    async detalle(token:string,id:string,signal?:AbortSignal){if(!idValido(id))return invalido();const d=await pedir(token,'/api/v1/reclamos?id='+id.toLowerCase(),'GET',undefined,undefined,signal);if(!Array.isArray(d)||d.length>1)throw new ErrorReportes(502,'RESPUESTA_INVALIDA');return d.length?detalle(d[0]):null;},
    async recuperar(token:string,clave:string,signal?:AbortSignal){if(!uuidReporte(clave))return invalido();return acuse(await pedir(token,'/api/v1/reclamos/operaciones/'+clave.toLowerCase(),'GET',undefined,undefined,signal));},
  };
}
