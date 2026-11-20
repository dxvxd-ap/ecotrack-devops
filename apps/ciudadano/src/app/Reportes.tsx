import { useAuth, useUser } from '@clerk/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Bell, CheckCircle2, ChevronLeft, Plus, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { crearServicioReportes, CATEGORIAS_REPORTES, ESTADOS_REPORTES, ErrorReportes, validarReporte, uuidReporte, type ResumenReporte, type DetalleReporte, type CategoriaReporte, type PuntoReporte } from '../servicios/reportes-r1.ts';
import { crearEnvioReporte, memoriaOperacionReporte, type EnvioReporte } from '../servicios/envio-reporte.ts';
import { UbicacionReporte } from './UbicacionReporte.tsx';
import './reportes.css';

type Props={configurada:boolean;tema:'light'|'dark';activo:boolean;irCuenta:()=>void;rutas:{id:string;nombre:string}[]};
const fecha=(f:string|null)=>f?new Date(f).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'Fecha no disponible';
const etiquetaEstado=(estado:ResumenReporte['estado'])=>estado?ESTADOS_REPORTES[estado]:'Estado no disponible';
function Encabezado(){return <header className="reportes-cabecera"><span className="reportes-emblema"><Bell size={24} aria-hidden="true"/></span><p className="eyebrow">REPORTES CIUDADANOS</p><h1>Tu reporte hace la diferencia.</h1><p>Cuéntanos qué ocurre y consulta la respuesta del municipio.</p></header>;}
export function Reportes(props:Props){return <section className="reportes-panel" aria-label="Reportes ciudadanos"><Encabezado/>{props.configurada?<ReportesSesion {...props}/>:<div className="reportes-tarjeta isla"><h2>Acceso pendiente</h2><p>El acceso ciudadano todavía no está disponible en esta instalación.</p><button className="secundario" onClick={props.irCuenta}>Ir a Cuenta</button></div>}</section>;}
function ReportesSesion(props:Props){
  const {isLoaded,isSignedIn,user}=useUser();const {getToken,sessionId}=useAuth();
  if(!isLoaded)return <p role="status">Comprobando tu sesión…</p>;
  if(!isSignedIn||!user)return <div className="reportes-tarjeta isla"><ShieldCheck aria-hidden="true"/><h2>Tu cuenta, tus reportes</h2><p>Inicia sesión para enviar una incidencia y consultar únicamente tus reportes.</p><button className="primario" onClick={props.irCuenta}>Iniciar sesión desde Cuenta</button></div>;
  return <AccesoReportes key={`${user.id}:${sessionId}`} {...props} usuario={user.id} obtenerToken={getToken}/>;
}
function AccesoReportes(props:Props&{usuario:string;obtenerToken:()=>Promise<string|null>}){
  const tokenRef=useRef(props.obtenerToken);tokenRef.current=props.obtenerToken;
  const api=useMemo(()=>crearServicioReportes(),[]);
  const [acceso,setAcceso]=useState<{envio:EnvioReporte;domicilio:[number,number]|null;persistencia:boolean}|null>(null),[error,setError]=useState<ErrorReportes|null>(null),[intento,setIntento]=useState(0);
  useLayoutEffect(()=>{
    let vigente=true,envio:EnvioReporte|undefined;const c=new AbortController();setError(null);setAcceso(null);
    void(async()=>{try{
      const token=await tokenRef.current();if(!token)throw new ErrorReportes(401,'SIN_SESION');if(!vigente)return;
      // Este GET autoriza ciudadanía/perfil en servidor; null significa sin domicilio, no falta de acceso.
      const domicilio=await api.verificarAcceso(token,c.signal);const memoria=await memoriaOperacionReporte(props.usuario);if(!vigente)return;
      envio=crearEnvioReporte({api,obtenerToken:()=>tokenRef.current(),...memoria});setAcceso({envio,domicilio,persistencia:memoria.disponible});
    }catch(e){if(vigente)setError(e instanceof ErrorReportes ? e : new ErrorReportes(0,'ERROR_RED'));}})();
    return()=>{vigente=false;c.abort();envio?.limpiar();};
  },[api,props.usuario,intento]);
  if (error) {
    const reintentar = error.status === 0 || error.status >= 500 || [408, 429].includes(error.status);
    return <div className="reportes-tarjeta isla" role="alert">
      <h2>No pudimos abrir tus reportes</h2>
      <p>{error.message}</p>
      {error.codigo === 'CUENTA_EN_CONFLICTO' && <p className="reporte-ayuda">Si es tu primera visita, sincroniza tu perfil desde Cuenta.</p>}
      <div className="reporte-acciones">
        {reintentar && <button className="secundario" onClick={() => setIntento(i => i + 1)}>Volver a intentar</button>}
        <button className="primario" onClick={props.irCuenta}>Revisar Cuenta</button>
      </div>
    </div>;
  }
  if(!acceso)return <p role="status">Preparando tus reportes…</p>;
  return <PanelReportes {...props} api={api} obtenerToken={()=>tokenRef.current()} {...acceso}/>;
}
export function PanelReportes({api,envio,obtenerToken,domicilio,persistencia,tema,activo,rutas,irCuenta}:{api:ReturnType<typeof crearServicioReportes>;envio:EnvioReporte;obtenerToken:()=>Promise<string|null>;domicilio:[number,number]|null;persistencia:boolean}&Pick<Props,'tema'|'activo'|'rutas'|'irCuenta'>){
  const estado=useSyncExternalStore(envio.subscribe,envio.getSnapshot,envio.getSnapshot);
  const [vista,setVista]=useState<'lista'|'nuevo'>(estado.clave?'nuevo':'lista'),[reportes,setReportes]=useState<ResumenReporte[]>([]),[cargando,setCargando]=useState(true),[errorLista,setErrorLista]=useState<string|null>(null),[intento,setIntento]=useState(0);
  const [seleccion,setSeleccion]=useState<string|null>(null),[detalle,setDetalle]=useState<DetalleReporte|null>(null),[cargandoDetalle,setCargandoDetalle]=useState(false),[errorDetalle,setErrorDetalle]=useState<string|null>(null);
  const tokenRef=useRef(obtenerToken);tokenRef.current=obtenerToken;
  const [codigo,setCodigo]=useState(''),[errorCodigo,setErrorCodigo]=useState(false),[formularioVersion,setFormularioVersion]=useState(0),[formularioMontado,setFormularioMontado]=useState(vista==='nuevo');
  useEffect(()=>{if(vista==='nuevo')setFormularioMontado(true);},[vista]);
  useLayoutEffect(()=>{
    const c=new AbortController();let vigente=true;setCargando(true);setErrorLista(null);
    void(async()=>{try{const t=await tokenRef.current();if(!t)throw new ErrorReportes(401,'SIN_SESION');if(!vigente)return;const d=await api.listar(t,c.signal);if(vigente)setReportes(d);}catch(e){if(vigente){setReportes([]);setErrorLista(e instanceof ErrorReportes?e.message:'No pudimos consultar tus reportes.');}}finally{if(vigente)setCargando(false);}})();
    return()=>{vigente=false;c.abort();};
  },[api,intento,estado.acuse]);
  useLayoutEffect(()=>{
    if(!seleccion){setDetalle(null);return;}const c=new AbortController();let vigente=true;setDetalle(null);setErrorDetalle(null);setCargandoDetalle(true);
    void(async()=>{try{const t=await tokenRef.current();if(!t)throw new ErrorReportes(401,'SIN_SESION');if(!vigente)return;const d=await api.detalle(t,seleccion,c.signal);if(vigente){setDetalle(d);if(!d)setErrorDetalle('Este reporte no está disponible para tu cuenta.');}}catch(e){if(vigente)setErrorDetalle(e instanceof ErrorReportes?e.message:'No pudimos consultar el detalle.');}finally{if(vigente)setCargandoDetalle(false);}})();return()=>{vigente=false;c.abort();};
  },[api,seleccion]);
  useEffect(()=>{if(!estado.clave||estado.fase==='confirmado')return;const antes=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',antes);return()=>window.removeEventListener('beforeunload',antes);},[estado.clave,estado.fase]);
  const bloqueado=['enviando','recuperando'].includes(estado.fase);
  return <>
    <div className="reportes-vistas" aria-label="Vista de reportes"><button className="secundario" aria-pressed={vista==='lista'} onClick={()=>setVista('lista')}>Mis reportes</button><button className="primario" aria-pressed={vista==='nuevo'} onClick={()=>{setVista('nuevo');if(estado.fase==='confirmado'){setFormularioVersion(v=>v+1);envio.nuevo();}}}><Plus size={17} aria-hidden="true"/>{estado.clave?'Envío pendiente':'Nuevo reporte'}</button></div>
    {vista==='lista'?<>
      {seleccion?<article className="reportes-tarjeta isla" aria-label="Detalle de mi reporte"><button className="reporte-volver" onClick={()=>setSeleccion(null)}><ChevronLeft size={17} aria-hidden="true"/>Volver a mis reportes</button>{cargandoDetalle?<p role="status">Consultando detalle…</p>:errorDetalle?<p role="alert">{errorDetalle}</p>:detalle&&<><p className="eyebrow">{detalle.folio??'Folio no disponible'}</p><h2>{detalle.tipo_incidencia?CATEGORIAS_REPORTES[detalle.tipo_incidencia]:'Reporte ciudadano'}</h2><p className={`reporte-estado estado-${detalle.estado??'sin-estado'}`}>{etiquetaEstado(detalle.estado)}</p><p className="reporte-ayuda">{fecha(detalle.fecha_reporte)}</p><h3>Lo que reportaste</h3><p className="reporte-texto">{detalle.descripcion??'Descripción no disponible'}</p><p className="reporte-texto"><strong>Referencia:</strong> {detalle.domicilio_referencia??'No disponible'}</p>{detalle.ubicacion&&<p className="reporte-ayuda">Punto confirmado: {detalle.ubicacion.coordinates[1].toFixed(5)}, {detalle.ubicacion.coordinates[0].toFixed(5)}</p>}<div className="reporte-respuesta"><h3>Respuesta del municipio</h3><p className="reporte-texto">{detalle.respuesta_publica||'Todavía no hay una respuesta pública. Puedes volver a consultar más adelante.'}</p></div></>}</article>:<>
        <div className="reportes-subtitulo"><h2>Mis reportes</h2><button className="reporte-volver" disabled={cargando} onClick={()=>setIntento(v=>v+1)}><RefreshCw size={16} aria-hidden="true"/>Actualizar</button></div>
        {cargando?<p role="status">Consultando tus reportes…</p>:errorLista?<div className="reportes-tarjeta isla" role="alert"><p>{errorLista}</p><button className="secundario" onClick={()=>setIntento(v=>v+1)}>Reintentar consulta</button></div>:!reportes.length?<div className="reportes-tarjeta reportes-vacio isla"><Bell size={30} aria-hidden="true"/><h2>Aún no tienes reportes</h2><p>Cuando envíes una incidencia, aquí podrás seguir su estado y leer la respuesta municipal.</p><button className="primario" onClick={()=>setVista('nuevo')}>Crear mi primer reporte</button></div>:<><ul className="reportes-lista">{reportes.map((r,i)=><li key={r.id??i}><button className="reportes-tarjeta isla" disabled={!r.id} onClick={()=>setSeleccion(r.id)}><span className="reporte-folio">{r.folio??'Sin folio'}</span><strong>{r.tipo_incidencia?CATEGORIAS_REPORTES[r.tipo_incidencia]:'Categoría no disponible'}</strong><span className={`reporte-estado estado-${r.estado??'sin-estado'}`}>{etiquetaEstado(r.estado)}</span><span className="reporte-ayuda">{fecha(r.fecha_reporte)}</span><span className="reporte-enlace">Ver detalle y respuesta</span></button></li>)}</ul><p className="reporte-ayuda">Se muestran hasta los 100 reportes más recientes de tu cuenta.</p></>}
      </>}
    </>:estado.fase==='confirmado'&&estado.acuse?<div className="reportes-tarjeta reporte-exito isla" role="status"><CheckCircle2 size={38} aria-hidden="true"/><h2>Tu reporte quedó registrado</h2><p>Conserva tu folio para identificarlo:</p><strong className="reporte-folio-confirmado">{estado.acuse.folio}</strong><p className="reporte-ayuda">Recibido el {fecha(estado.acuse.recibido_en)}. El municipio lo revisará.</p><div className="reporte-acciones"><button className="primario" onClick={()=>{setVista('lista');setSeleccion(estado.acuse!.id);}}>Ver mi reporte</button><button className="secundario" onClick={()=>{setFormularioVersion(v=>v+1);envio.nuevo();}}>Crear otro reporte</button></div></div>:estado.clave?<div className="reportes-tarjeta isla" aria-live="polite"><h2>{bloqueado?(estado.fase==='enviando'?'Enviando tu reporte…':'Consultando confirmación…'):'Vamos a comprobar tu envío'}</h2><p>{estado.mensaje||'Espera sin cerrar esta pantalla. No necesitas volver a pulsar Enviar.'}</p><p className="reporte-ayuda">No crees otro reporte para recuperar este envío. Consultaremos la misma operación.</p><label>Código para recuperar esta operación<input className="reporte-codigo" readOnly value={estado.clave} onFocus={e=>e.target.select()}/></label><div className="reporte-acciones"><button className="primario" disabled={bloqueado} onClick={()=>void envio.recuperar()}>Consultar confirmación</button>{estado.conContenido&&<button className="secundario" disabled={bloqueado} onClick={()=>void envio.reintentar()}>Reintentar el mismo envío</button>}</div>{!estado.conContenido&&<p className="reporte-ayuda">Después de recargar no conservamos el contenido ni la ubicación. Solo podemos consultar el acuse; no reenviar sin los datos originales. Si todavía no aparece, vuelve a consultar y revisa Mis reportes.</p>}<button className="reporte-volver" onClick={irCuenta}>Revisar mi sesión en Cuenta</button></div>:null}
    <div hidden={vista!=='nuevo'||!!estado.clave||estado.fase==='confirmado'}>{formularioMontado&&<FormularioReporte key={formularioVersion} tema={tema} visible={activo&&vista==='nuevo'&&!estado.clave&&estado.fase!=='confirmado'} domicilio={domicilio} rutas={rutas} onEnviar={d=>envio.enviar(d)} mensaje={estado.fase==='rechazado'?estado.mensaje:null}/>}</div>
    {vista==='nuevo'&&!estado.clave&&estado.fase!=='confirmado'&&<>
      <p className="reporte-ayuda">{persistencia?'Si recargas, conservaremos solo el código de operación en esta pestaña para consultar su confirmación.':'Este navegador no permite conservar el código tras recargar. Copia el código si el resultado queda pendiente y mantén la pantalla abierta.'} No guardamos el formulario, teléfono ni ubicación en el almacenamiento del navegador.</p>
      <details className="reportes-recuperacion"><summary>Recuperar un envío con su código</summary><label htmlFor="reporte-codigo">Código de operación</label><input id="reporte-codigo" value={codigo} onChange={e=>{setCodigo(e.target.value);setErrorCodigo(false);}} autoCapitalize="none" autoCorrect="off"/>{errorCodigo&&<p role="alert">Revisa el código UUID completo de tu operación.</p>}<button className="secundario" onClick={()=>{if(!uuidReporte(codigo)){setErrorCodigo(true);return;}envio.restaurar(codigo);void envio.recuperar();}}>Consultar envío anterior</button></details>
    </>}
  </>;
}
function FormularioReporte({tema,visible,domicilio,rutas,onEnviar,mensaje}:{tema:'light'|'dark';visible:boolean;domicilio:[number,number]|null;rutas:Props['rutas'];onEnviar:(d:ReturnType<typeof validarReporte>)=>Promise<void>;mensaje:string|null}){
  const [categoria,setCategoria]=useState<CategoriaReporte|' '>(' '),[descripcion,setDescripcion]=useState(''),[referencia,setReferencia]=useState(''),[telefono,setTelefono]=useState(''),[ruta,setRuta]=useState(''),[punto,setPunto]=useState<PuntoReporte|null>(null),[errores,setErrores]=useState<Record<string,string>>({});
  const resumen=useRef<HTMLDivElement>(null);useEffect(()=>{if(Object.keys(errores).length)resumen.current?.focus();},[errores]);
  async function enviar(e:FormEvent){e.preventDefault();const errores:Record<string,string>={};
    if(categoria===' ')errores['reporte-categoria']='Elige un tipo de incidencia.';
    if(Array.from(descripcion.trim()).length<10||Array.from(descripcion.trim()).length>4000)errores['reporte-descripcion']='Describe lo ocurrido con entre 10 y 4000 caracteres.';
    if(!referencia.trim()||Array.from(referencia.trim()).length>500)errores['reporte-referencia']='Escribe una referencia de hasta 500 caracteres.';
    if(telefono.trim()&&(!/^[+\d ()-]+$/.test(telefono.trim())||telefono.replace(/\D/g,'').length<7||telefono.replace(/\D/g,'').length>15||telefono.trim().length>25))errores['reporte-telefono']='Revisa el teléfono: de 7 a 15 dígitos, sin letras.';
    if(!punto)errores['reporte-ubicacion']='Elige el punto y confirma explícitamente la ubicación.';
    if(Object.keys(errores).length){setErrores(errores);return;}
    try{const d=validarReporte({...punto,tipo_incidencia:categoria,descripcion,domicilio_referencia:referencia,...(telefono.trim()?{ciudadano_telefono:telefono}:{}),ruta_id:rutas.some(r=>r.id===ruta)?ruta:null});setErrores({});await onEnviar(d);}catch(e){setErrores({'reporte-descripcion':e instanceof ErrorReportes?e.message:'No pudimos iniciar el envío. Abre EcoTrack desde su enlace seguro e inténtalo de nuevo.'});}
  }
  const error=(id:string)=>errores[id]?<p id={id+'-error'} className="reporte-error">{errores[id]}</p>:null;
  return <form className="reportes-tarjeta reporte-formulario isla" onSubmit={e=>void enviar(e)} noValidate><h2>Cuéntanos qué ocurrió</h2><p className="reporte-ayuda">No necesitas registrar un domicilio ni agregar fotografías.</p>{mensaje&&<p role="alert" className="reporte-error">{mensaje}</p>}
    {Object.keys(errores).length>0&&<div className="reporte-resumen-errores" role="alert" tabIndex={-1} ref={resumen}><h3>Revisa estos datos</h3><ul>{Object.entries(errores).map(([id,m])=><li key={id}><a href={'#'+id}>{m}</a></li>)}</ul></div>}
    <label htmlFor="reporte-categoria">Tipo de incidencia</label><select id="reporte-categoria" value={categoria} aria-invalid={!!errores['reporte-categoria']} aria-describedby="reporte-categoria-error" onChange={e=>setCategoria(e.target.value as CategoriaReporte|' ')}><option value=" ">Selecciona una opción</option>{Object.entries(CATEGORIAS_REPORTES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>{error('reporte-categoria')}
    <label htmlFor="reporte-descripcion">Descripción</label><textarea id="reporte-descripcion" rows={4} value={descripcion} aria-invalid={!!errores['reporte-descripcion']} aria-describedby="reporte-descripcion-ayuda reporte-descripcion-error" onChange={e=>setDescripcion(e.target.value)}/><p id="reporte-descripcion-ayuda" className="reporte-ayuda">Explica lo ocurrido sin incluir datos personales innecesarios. Entre 10 y 4000 caracteres.</p>{error('reporte-descripcion')}
    <label htmlFor="reporte-referencia">Referencia del lugar</label><input id="reporte-referencia" value={referencia} aria-invalid={!!errores['reporte-referencia']} aria-describedby="reporte-referencia-error" placeholder="Por ejemplo: frente al parque, junto a la entrada" onChange={e=>setReferencia(e.target.value)}/>{error('reporte-referencia')}
    <label htmlFor="reporte-telefono">Teléfono <span className="reporte-ayuda">(opcional)</span></label><input id="reporte-telefono" type="tel" autoComplete="tel" value={telefono} aria-invalid={!!errores['reporte-telefono']} aria-describedby="reporte-telefono-error" onChange={e=>setTelefono(e.target.value)}/>{error('reporte-telefono')}
    <UbicacionReporte tema={tema} visible={visible} domicilio={domicilio} onConfirmar={setPunto}/>{error('reporte-ubicacion')}
    <label htmlFor="reporte-ruta">Ruta <span className="reporte-ayuda">(opcional)</span></label><select id="reporte-ruta" value={ruta} onChange={e=>setRuta(e.target.value)}><option value="">No indicar una ruta</option>{rutas.filter(r=>/^[a-f\d]{24}$/i.test(r.id)).map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select><p className="reporte-ayuda">Indicar una ruta no confirma que cubra este punto. No asignaremos una automáticamente.</p>
    <button type="submit" className="primario reporte-enviar"><Send size={18} aria-hidden="true"/>Enviar reporte</button>
  </form>;
}
