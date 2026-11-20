import { ErrorReportes, validarReporte, uuidReporte, type AcuseReporte, type EntradaReporte, type crearServicioReportes } from './reportes-r1.ts';
export type EstadoEnvio={fase:'inicial'|'enviando'|'incierto'|'recuperando'|'confirmado'|'rechazado';clave:string|null;acuse:AcuseReporte|null;mensaje:string|null;conContenido:boolean};
type Opciones={obtenerToken:()=>Promise<string|null>;api:Pick<ReturnType<typeof crearServicioReportes>,'crear'|'recuperar'>;guardarClave:(clave:string|null)=>void;claveInicial?:string|null;crearClave?:()=>string};
/** Una instancia por usuario/sesión. El cuerpo original nunca sale de memoria salvo por el POST autorizado. */
export function crearEnvioReporte(o:Opciones){
  let operacion:{clave:string;cuerpo:EntradaReporte|null;incierta:boolean}|null=o.claveInicial&&uuidReporte(o.claveInicial)?{clave:o.claveInicial,cuerpo:null,incierta:true}:null;
  let estado:EstadoEnvio={fase:operacion?'incierto':'inicial',clave:operacion?.clave??null,acuse:null,mensaje:operacion?'Hay un envío pendiente de confirmar. Consulta su resultado.':null,conContenido:false};
  const control = new AbortController();
  let ocupada=false,vigente=true;const listeners=new Set<()=>void>();
  const publicar=(e:Partial<EstadoEnvio>)=>{if(!vigente)return;estado={...estado,...e};listeners.forEach(fn=>fn());};
  const guardar=(clave:string|null)=>{try{o.guardarClave(clave);}catch{/* Mantener en memoria; UI explica el límite de recarga. */}};
  async function ejecutar(recuperar:boolean){
    if(ocupada||!vigente||!operacion||!recuperar&&!operacion.cuerpo)return;
    const actual=operacion;ocupada=true;publicar({fase:recuperar?'recuperando':'enviando',mensaje:null});
    try{
      const token=await o.obtenerToken();if(!token)throw new ErrorReportes(401,'SIN_SESION');if(!vigente)return;
      const acuse=recuperar?await o.api.recuperar(token,actual.clave,control.signal):await o.api.crear(token,actual.cuerpo!,actual.clave,control.signal);
      if(!vigente)return;guardar(null);operacion=null;publicar({fase:'confirmado',clave:null,acuse,conContenido:false,mensaje:null});
    }catch(e){
      if(!vigente)return;const error=e instanceof ErrorReportes?e:new ErrorReportes(0,'RESULTADO_INCIERTO',true);
      if(recuperar||actual.incierta||error.incierto){actual.incierta=true;publicar({fase:'incierto',mensaje:error.message});}
      else{guardar(null);operacion=null;publicar({fase:'rechazado',clave:null,conContenido:false,mensaje:error.message});}
    }finally{ocupada=false;}
  }
  return{
    getSnapshot:()=>estado,
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    enviar(d:EntradaReporte){if(ocupada||operacion||!vigente||estado.fase==='confirmado')return Promise.resolve();const cuerpo=Object.freeze(validarReporte(d));const clave=(o.crearClave??(()=>crypto.randomUUID()))();if(!uuidReporte(clave))throw new ErrorReportes(400,'ENTRADA_INVALIDA');operacion={clave:clave.toLowerCase(),cuerpo,incierta:false};guardar(operacion.clave);publicar({clave:operacion.clave,conContenido:true,acuse:null});return ejecutar(false);},
    reintentar:()=>ejecutar(false),recuperar:()=>ejecutar(true),
    restaurar(clave:string){if(operacion||ocupada||!uuidReporte(clave))return;operacion={clave:clave.toLowerCase(),cuerpo:null,incierta:true};guardar(operacion.clave);publicar({fase:'incierto',clave:operacion.clave,conContenido:false,acuse:null,mensaje:'Consulta la confirmación de esta operación.'});},
    nuevo(){if(operacion||ocupada)return;publicar({fase:'inicial',clave:null,acuse:null,mensaje:null,conContenido:false});},
    limpiar(){vigente=false;control.abort();operacion=null;estado={fase:'inicial',clave:null,acuse:null,mensaje:null,conContenido:false};listeners.clear();},
  };
}
export type EnvioReporte=ReturnType<typeof crearEnvioReporte>;
export async function memoriaOperacionReporte(usuario:string):Promise<{claveInicial:string|null;guardarClave:(clave:string|null)=>void;disponible:boolean}>{
  // No almacenar ID de Clerk, token, teléfono, textos ni coordenadas. Separar cuentas mediante huella técnica.
  try{
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(usuario));const huella=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const key='eco-reporte-operacion:'+huella;const s=sessionStorage;const prueba=key+':prueba';s.setItem(prueba,'1');s.removeItem(prueba);const guardada=s.getItem(key);
    return{claveInicial:uuidReporte(guardada)?guardada:null,guardarClave:clave=>{if(clave)s.setItem(key,clave);else s.removeItem(key);},disponible:true};
  }catch{return{claveInicial:null,guardarClave:()=>{},disponible:false};}
}
