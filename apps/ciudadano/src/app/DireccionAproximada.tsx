import {createContext,useContext,useCallback,useEffect,useSyncExternalStore} from 'react';
import type {AlmacenDirecciones,EstadoDireccion} from '../servicios/estado-direccion.ts';
import type {PuntoDireccion} from '../servicios/direccion.ts';
export const ContextoDirecciones=createContext<AlmacenDirecciones|null>(null);
const vacio:EstadoDireccion={estado:'inicial',resultado:null,mensaje:null};
export function useDireccionAproximada(punto:PuntoDireccion|null) {
  const almacen=useContext(ContextoDirecciones);
  const lon=punto?.[0],lat=punto?.[1];
  const getSnapshot=useCallback(()=>almacen?.getSnapshot(lon===undefined||lat===undefined?null:[lon,lat])??vacio,[almacen,lon,lat]);
  const subscribe=useCallback((fn:()=>void)=>almacen?.subscribe(fn)??(()=>{}),[almacen]);
  const estado=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
  useEffect(()=>{if(almacen&&lon!==undefined&&lat!==undefined)return almacen.observar([lon,lat]);},[almacen,lon,lat]);
  const reintentar=()=>{if(almacen&&lon!==undefined&&lat!==undefined)void almacen.consultar([lon,lat],true);};
  return {estado,reintentar};
}
export function DireccionPresentacion({estado,reintentar,guardado=false}:{estado:EstadoDireccion;reintentar:()=>void;guardado?:boolean}) {
  const r=estado.resultado,d=r?.direccion;
  const principal=d?.calle?[d.calle,d.numero].filter(Boolean).join(' '):d?.municipio??d?.localidad??(guardado?'Ubicación guardada':'Ubicación seleccionada');
  const zona=[d?.localidad,d?.municipio,d?.estado].filter((v,i,a)=>!!v&&a.indexOf(v)===i&&v!==principal).join(', ');
  return <div className="direccion-aproximada" aria-label="Dirección del punto">
    <p className="domicilio-direccion">{principal}</p>
    {d?.colonia&&<p className="domicilio-localidad">{d.colonia}</p>}
    {zona&&<p className="domicilio-localidad">{zona}</p>}
    {d?<p className="direccion-nota">Dirección aproximada</p>:<p className="domicilio-localidad" role={estado.estado==='cargando'?'status':undefined}>
      {estado.estado==='cargando'?'Consultando dirección aproximada…':estado.mensaje??(estado.estado==='sin_direccion'?'No se encontró una dirección para este punto.':'La dirección no está disponible por ahora.')}
    </p>}
    {!d&&estado.estado!=='cargando'&&<p className="direccion-nota">{guardado?'Tu punto sigue guardado en el mapa.':'Puedes guardar el punto aunque no se encuentre una dirección.'}</p>}
    {(estado.estado==='error'||estado.estado==='inicial')&&<button type="button" className="secundario direccion-reintentar" onClick={reintentar}>Consultar dirección</button>}
    {r&&<p className="direccion-atribucion"><a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> · {r.atribucion.datos}</p>}
  </div>;
}
export function DireccionAproximada({punto,guardado=false}:{punto:PuntoDireccion|null;guardado?:boolean}) {
  const {estado,reintentar}=useDireccionAproximada(punto);
  return <DireccionPresentacion estado={estado} reintentar={reintentar} guardado={guardado}/>;
}
