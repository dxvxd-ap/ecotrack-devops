import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapaGL } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, MapPin } from 'lucide-react';
import { posicionParaMapa } from '../servicios/posicion.ts';
import { coordenadasReporte, type PuntoReporte } from '../servicios/reportes-r1.ts';

type Props={tema:'light'|'dark';visible:boolean;domicilio:[number,number]|null;onConfirmar:(p:PuntoReporte|null)=>void};
/** Selección independiente: reutiliza el patrón centro/marcador y posicionParaMapa; nunca guarda domicilios. */
export function UbicacionReporte({tema,visible,domicilio,onConfirmar}:Props){
  const contenedor=useRef<HTMLDivElement>(null),mapa=useRef<MapaGL|null>(null),cambio=useRef(onConfirmar);cambio.current=onConfirmar;
  const origen=useRef<PuntoReporte['origen_ubicacion']>('manual'),montado=useRef(true),coordenadas=useRef<[number,number]>([-97.0886,20.4514]);
  const [centro,setCentro]=useState<[number,number]>(coordenadas.current),[confirmada,setConfirmada]=useState(false),[gps,setGps]=useState(false),[moviendo,setMoviendo]=useState(false),[error,setError]=useState<string|null>(null),[sinMapa,setSinMapa]=useState(false),[precision,setPrecision]=useState<number|null>(null);
  const [lat,setLat]=useState('20.4514'),[lon,setLon]=useState('-97.0886');
  const validas=lat.trim()!==''&&lon.trim()!==''&&/^-?\d+(?:\.\d+)?$/.test(lat)&&/^-?\d+(?:\.\d+)?$/.test(lon)&&coordenadasReporte(Number(lat),Number(lon));
  const aplicada=validas&&Number(lat)===centro[1]&&Number(lon)===centro[0];
  const invalidar=()=>{setConfirmada(false);cambio.current(null);};
  const aplicar=(p:[number,number])=>{coordenadas.current=p;setCentro(p);setLat(String(p[1]));setLon(String(p[0]));};
  useEffect(()=>{
    montado.current=true;let m:MapaGL|undefined;
    try{
      const estilo=import.meta.env.VITE_MAP_STYLE_URL?.trim()||(tema==='dark'?'https://tiles.openfreemap.org/styles/dark':'https://tiles.openfreemap.org/styles/liberty');const u=new URL(estilo);if(u.protocol!=='https:'||u.username||u.password)throw Error();
      m=new maplibregl.Map({container:contenedor.current!,style:estilo,center:coordenadas.current,zoom:16,attributionControl:false});mapa.current=m;
      m.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
      m.on('movestart',e=>{setMoviendo(true);if(e.originalEvent){invalidar();origen.current='manual';setPrecision(null);}});
      m.on('moveend',()=>{if(!m)return;const c=m.getCenter();const anterior=coordenadas.current;const cambioPunto=Math.abs(c.lng-anterior[0])>1e-7||Math.abs(c.lat-anterior[1])>1e-7;if(cambioPunto&&coordenadasReporte(c.lat,c.lng)){invalidar();aplicar([c.lng,c.lat]);}setMoviendo(false);});
      m.on('error',()=>{if(montado.current)setSinMapa(true);});
    }catch{setSinMapa(true);}
    return()=>{montado.current=false;mapa.current=null;m?.remove();};
    // El punto y la confirmación viven en este selector; cambios de tema no recrean ni recentran el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{const estilo=import.meta.env.VITE_MAP_STYLE_URL?.trim()||(tema==='dark'?'https://tiles.openfreemap.org/styles/dark':'https://tiles.openfreemap.org/styles/liberty');try{mapa.current?.setStyle(estilo);}catch{setSinMapa(true);}},[tema]);
  useEffect(()=>{if(visible)mapa.current?.resize();},[visible]);
  function elegir(p:[number,number],tipo:PuntoReporte['origen_ubicacion']){invalidar();origen.current=tipo;aplicar(p);mapa.current?.jumpTo({center:p});}
  async function localizar(){if(gps)return;invalidar();setGps(true);setError(null);
    try{if(!window.isSecureContext||!navigator.geolocation)throw Error();const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0}));if(!montado.current)return;const lectura=posicionParaMapa(p);elegir(lectura.coordenadas,'gps');setPrecision(lectura.precisionMetros);}
    catch{if(montado.current)setError('No pudimos obtener tu ubicación. Puedes elegir el punto en el mapa o escribir las coordenadas.');}finally{if(montado.current)setGps(false);}
  }
  return <fieldset className="reporte-ubicacion" id="reporte-ubicacion" aria-describedby="ubicacion-ayuda">
    <legend><MapPin size={18} aria-hidden="true"/> ¿Dónde ocurrió?</legend>
    <p id="ubicacion-ayuda" className="reporte-ayuda">Mueve el mapa hasta el lugar de la incidencia y confirma el punto. Esta ubicación es independiente de tu domicilio.</p>
    <div className="reporte-mapa"><div ref={contenedor} className="reporte-mapa-canvas" aria-label="Mapa para elegir el lugar del reporte"/><span className="reporte-pin" aria-hidden="true"><MapPin size={32}/></span></div>
    {sinMapa&&<p className="reporte-ayuda" role="status">El mapa no está disponible por ahora. Puedes usar GPS o escribir las coordenadas.</p>}
    <div className="reporte-acciones"><button type="button" className="secundario" disabled={gps} onClick={()=>void localizar()}><LocateFixed size={17} aria-hidden="true"/>{gps?'Buscando ubicación…':'Usar mi ubicación'}</button>{domicilio&&<button type="button" className="secundario" disabled={gps} onClick={()=>{setPrecision(null);elegir([...domicilio],'domicilio');}}>Usar punto de mi domicilio</button>}</div>
    {error&&<p className="reporte-error" role="alert">{error}</p>}
    <p className="reporte-ayuda" aria-live="polite">Punto: {centro[1].toFixed(5)}, {centro[0].toFixed(5)}{precision!==null?` · precisión aproximada ±${precision} m`:''}</p>
    <details><summary>Escribir coordenadas manualmente</summary><div className="reporte-coordenadas"><label>Latitud<input inputMode="decimal" value={lat} onChange={e=>{invalidar();origen.current='manual';setLat(e.target.value);}}/></label><label>Longitud<input inputMode="decimal" value={lon} onChange={e=>{invalidar();origen.current='manual';setLon(e.target.value);}}/></label><button type="button" className="secundario" disabled={!validas||gps} onClick={()=>{setPrecision(null);elegir([Number(lon),Number(lat)],'manual');}}>Ubicar coordenadas</button></div></details>
    {validas&&!aplicada&&<p className="reporte-ayuda" role="status">Pulsa «Ubicar coordenadas» para revisar ese punto en el mapa antes de confirmarlo.</p>}
    <label className="reporte-confirmar"><input type="checkbox" checked={confirmada} disabled={gps||moviendo||!aplicada} onChange={e=>{const si=e.target.checked;setConfirmada(si);if(si){const p:[number,number]=[Number(lon),Number(lat)];aplicar(p);cambio.current({longitud:p[0],latitud:p[1],origen_ubicacion:origen.current,confirmada:true});}else cambio.current(null);}}/><span>Confirmo que el punto corresponde al lugar de la incidencia</span></label>
  </fieldset>;
}
