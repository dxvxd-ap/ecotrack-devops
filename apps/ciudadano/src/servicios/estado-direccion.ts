import { consultarDireccion, ErrorDireccion, puntoValido, type PuntoDireccion, type ResultadoDireccion } from './direccion.ts';
export interface EstadoDireccion {
  estado: 'inicial' | 'cargando' | 'lista' | 'sin_direccion' | 'error';
  resultado: ResultadoDireccion | null;
  mensaje: string | null;
}
const INICIAL: EstadoDireccion = {estado:'inicial',resultado:null,mensaje:null};
const SATURADO: EstadoDireccion = {estado:'error',resultado:null,mensaje:'Hay demasiadas consultas abiertas. Cierra el selector e inténtalo de nuevo.'};
type Registro = {estado:EstadoDireccion; usos:number; revision:number; control?:AbortController; pendiente?:Promise<void>; expiracion?:ReturnType<typeof setTimeout>};
function mensaje(error: unknown) {
  if (!(error instanceof ErrorDireccion)) return 'No pudimos consultar la dirección. Revisa tu conexión.';
  if (error.status===401) return 'Necesitas una sesión activa para consultar la dirección.';
  if (error.status===429) return 'Se alcanzó el límite de consultas. Espera antes de volver a intentar.';
  if (error.status===503) return 'La consulta de direcciones no está disponible por ahora.';
  if (error.codigo==='TIMEOUT' || error.status===504) return 'La consulta de dirección tardó demasiado.';
  return 'No pudimos obtener la dirección aproximada.';
}
/** Una instancia por sesión. Los resultados solo describen su punto exacto. */
export function crearEstadoDireccion(obtenerToken:()=>Promise<string|null>, consultar:typeof consultarDireccion=consultarDireccion, ahora=Date.now) {
  const registros=new Map<string,Registro>(),listeners=new Set<()=>void>();
  let bloqueadoHasta=0;
  const clave=(p:PuntoDireccion)=>JSON.stringify(p);
  const emitir=()=>listeners.forEach(fn=>fn());
  function cancelar(r:Registro) { r.revision++;r.control?.abort();r.pendiente=undefined;r.control=undefined;clearTimeout(r.expiracion); }
  function registro(p:PuntoDireccion):Registro|null {
    const k=clave(p);let r=registros.get(k);
    if(!r){
      if(registros.size>=32){const viejo=[...registros].find(([,v])=>v.usos===0);if(!viejo)return null;cancelar(viejo[1]);registros.delete(viejo[0]);}
      r={estado:INICIAL,usos:0,revision:0};registros.set(k,r);
    }
    return r;
  }
  function vigente(r:Registro) { return !!r.estado.resultado && Date.parse(r.estado.resultado.expira_en)>ahora(); }
  function caducar(r:Registro) {
    clearTimeout(r.expiracion);
    if(!r.usos || !r.estado.resultado)return;
    const demora=Math.max(1,Date.parse(r.estado.resultado.expira_en)-ahora());
    r.expiracion=setTimeout(()=>{r.estado=INICIAL;emitir();},demora);
    r.expiracion.unref?.();
  }
  function iniciar(p:PuntoDireccion,forzar=false):Promise<void> {
    if(!puntoValido(p))return Promise.resolve();
    const r=registro(p);if(!r)return Promise.resolve();
    if(r.pendiente)return r.pendiente;
    if(vigente(r)){caducar(r);return Promise.resolve();}
    if(r.estado.estado==='error'&&!forzar)return Promise.resolve();
    if(ahora()<bloqueadoHasta){r.estado={estado:'error',resultado:null,mensaje:mensaje(new ErrorDireccion(429,'CUOTA'))};emitir();return Promise.resolve();}
    const rev=++r.revision,control=new AbortController();r.control=control;
    r.estado={estado:'cargando',resultado:null,mensaje:null};emitir();
    let timer:ReturnType<typeof setTimeout>|undefined;
    const cancelacion=new Promise<never>((_,reject)=>control.signal.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true}));
    const trabajo=(async()=>{
      const token=await obtenerToken();if(control.signal.aborted)throw new DOMException('Cancelado','AbortError');
      if(!token)throw new ErrorDireccion(401,'SIN_SESION');
      return consultar(token,p,{signal:control.signal});
    })();
    r.pendiente=Promise.race([trabajo,cancelacion,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{reject(new ErrorDireccion(0,'TIMEOUT'));control.abort();},10000);
    })]).then(resultado=>{
      if(r.revision!==rev)return;
      if(Date.parse(resultado.expira_en)<=ahora())throw new ErrorDireccion(502,'RESPUESTA_INVALIDA');
      r.estado={estado:resultado.direccion?'lista':'sin_direccion',resultado,mensaje:null};caducar(r);emitir();
    }).catch(error=>{
      if(r.revision!==rev || (error instanceof DOMException&&error.name==='AbortError'))return;
      if(error instanceof ErrorDireccion&&error.status===429)bloqueadoHasta=Math.max(bloqueadoHasta,ahora()+Math.max(1,error.reintentarEn||60)*1000);
      r.estado={estado:'error',resultado:null,mensaje:mensaje(error)};emitir();
    }).finally(()=>{clearTimeout(timer);if(r.revision===rev){r.pendiente=undefined;r.control=undefined;}});
    return r.pendiente;
  }
  return {
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    getSnapshot(p:PuntoDireccion|null):EstadoDireccion {
      if(!p)return INICIAL;
      const r=registros.get(clave(p));if(!r)return INICIAL;
      return r.estado.resultado&&!vigente(r)?INICIAL:r.estado;
    },
    consultar:iniciar,
    observar(p:PuntoDireccion) {
      const r=registro(p);if(!r)return()=>{};
      r.usos++;void iniciar(p);caducar(r);
      return()=>{r.usos=Math.max(0,r.usos-1);if(!r.usos){clearTimeout(r.expiracion);queueMicrotask(()=>{
        if(!r.usos&&r.pendiente){cancelar(r);r.estado=INICIAL;emitir();}
      });}};
    },
    limpiar(){for(const r of registros.values())cancelar(r);registros.clear();bloqueadoHasta=0;emitir();},
  };
}
export type AlmacenDirecciones=ReturnType<typeof crearEstadoDireccion>;
