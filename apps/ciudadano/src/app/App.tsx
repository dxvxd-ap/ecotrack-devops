import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Bell, ChevronDown, ChevronUp, House, Leaf, LocateFixed, MapPin, MessageSquare, RefreshCw, Route, Truck, UserRound, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Mapa } from '../mapas/Mapa.tsx';
import { configurar, type ColeccionRutas } from '../servicios/contratos.ts';
import { cargarDatosMapa, datosVisibles, permitirDemo, type DatosMapa } from '../servicios/datos-mapa.ts';
import { posicionParaMapa } from '../servicios/posicion.ts';
import { useDomicilioSesion } from './DomicilioSesion.tsx';
import { Cuenta } from './Cuenta.tsx';
import { Reportes } from './Reportes.tsx';
import { Avisos, type SesionAvisos } from './Avisos.tsx';
import { ConsejosEcologicos } from './ConsejosEcologicos.tsx';
import { inicializarNotificacionesPush } from '../servicios/push.ts';

export type Tema = 'light' | 'dark' | 'auto';

const sinRutas: ColeccionRutas = { type: 'FeatureCollection', features: [] };
const tabs = [{ id: 'inicio', texto: 'Inicio', Icono: House }, { id: 'avisos', texto: 'Avisos', Icono: Bell }, { id: 'reportes', texto: 'Reportes', Icono: MessageSquare }, { id: 'cuenta', texto: 'Cuenta', Icono: UserRound }] as const;
type Tab = typeof tabs[number]['id'];

type PropsApp = { clerkConfigurado: boolean; tema?: Tema; temaResuelto?: 'light' | 'dark' };
export function App(props: PropsApp) {
  return props.clerkConfigurado ? <AppConClerk {...props} /> : <AppContenido {...props} sesion={null} />;
}

function AppConClerk(props: PropsApp) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const sesion = isLoaded && isSignedIn && userId && sessionId
    ? { clave: JSON.stringify([userId, sessionId]), obtenerToken: getToken } : null;
  return <AppContenido {...props} sesion={sesion} cargandoSesion={!isLoaded} />;
}

function AppContenido({ clerkConfigurado, tema, temaResuelto = 'light', sesion, cargandoSesion = false }:
  PropsApp & { sesion: SesionAvisos | null; cargandoSesion?: boolean }) {
  const { domicilio } = useDomicilioSesion();
  const [tab, setTab] = useState<Tab>('inicio');
  const demoPermitida = permitirDemo({ desarrollo: import.meta.env.DEV, habilitada: import.meta.env.VITE_ENABLE_DEV_TOOLS, android: __ANDROID_BUILD__ });
  const [demoSolicitada, setDemo] = useState(false);
  const demo = demoPermitida && demoSolicitada;
  const [datosMapa, setDatosMapa] = useState<DatosMapa>({ demostracion: false, rutas: sinRutas, vehiculos: [] });
  const { rutas, vehiculos } = datosVisibles(datosMapa, demo);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [falloRutas, setFalloRutas] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [intento, setIntento] = useState(0);
  const [expandido, setExpandido] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [ubicacion, setUbicacion] = useState<[number, number] | null>(null);
  const [recentro, setRecentro] = useState(0);
  const [localizando, setLocalizando] = useState(false);
  const [lecturaUbicacion, setLecturaUbicacion] = useState<{ precisionMetros: number; timestamp: number } | null>(null);
  const [contador, setContador] = useState<{ clave: string; total: number | null } | null>(null);
  const publicarContador = useCallback((clave: string, total: number | null) => setContador({ clave, total }), []);
  const avisosSinLeer = contador?.clave === sesion?.clave ? contador?.total ?? 0 : 0;
  const [reporteAviso, setReporteAviso] = useState<{ clave: string; id: string } | null>(null);
  const claveSesion = sesion?.clave;
  const [perfilSincronizado, setPerfilSincronizado] = useState<string>();
  const alSincronizar = useCallback(() => setPerfilSincronizado(claveSesion), [claveSesion]);
  useLayoutEffect(() => {
    setContador(actual => actual?.clave === claveSesion ? actual : null);
    setReporteAviso(actual => actual?.clave === claveSesion ? actual : null);
    setPerfilSincronizado(actual => actual === claveSesion ? actual : undefined);
  }, [claveSesion]);
  const rutaDisponible = (id: string) => !demo && !datosMapa.demostracion && rutas.features.some(r => r.properties.idPersistido === id);

  // Keep Cuenta mounted to preserve state across tab switches
  const [cuentaMontada, setCuentaMontada] = useState(false);
  const [reportesMontados, setReportesMontados] = useState(false);

  // Activate mounts on first visit to preserve state across tab switches
  useEffect(() => {
    if (tab === 'cuenta') setCuentaMontada(true);
    if (tab === 'reportes') setReportesMontados(true);
  }, [tab]);

  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change); window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);

  // Inicialización de Notificaciones Push al iniciar la app
  useEffect(() => {
    if (!demo) {
      const ids = rutas.features.map(r => r.properties.id);
      void inicializarNotificacionesPush(ids);
    }
  }, [demo, rutas.features.length]);

  useEffect(() => {
    const controller = new AbortController();
    setDatosMapa({ demostracion: demo, rutas: sinRutas, vehiculos: [] }); setError(null); setFalloRutas(false); setSeleccion(null);
    setCargando(true);
    void (async () => {
      try {
        const api = demo ? '' : configurar({ android: __ANDROID_BUILD__, api: import.meta.env.VITE_API_ORIGIN?.trim() }).api;
        const datos = await cargarDatosMapa({ origen: api, signal: controller.signal, demostracion: demo });
        if (!controller.signal.aborted) { setDatosMapa(datos); setSeleccion(datos.rutas.features[0]?.properties.id || null); }
      } catch {
        if (!controller.signal.aborted) { setFalloRutas(true); setError('No pudimos consultar las rutas de recolección. Inténtalo de nuevo en unos momentos.'); }
      } finally { if (!controller.signal.aborted) setCargando(false); }
    })();
    return () => controller.abort();
  }, [demo, intento]);

  async function localizar() {
    setLocalizando(true); setError(null);
    try {
      let p: { coords: { longitude: number; latitude: number; accuracy: number }; timestamp: number };
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      } else {
        if (!window.isSecureContext) throw new Error();
        p = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }));
      }
      const lectura = posicionParaMapa(p);
      setUbicacion(lectura.coordenadas); setLecturaUbicacion(lectura); setRecentro(v => v + 1);
    } catch { setError('No pudimos obtener tu ubicación. Revisa el permiso en Safari y abre el enlace seguro; puedes seguir explorando.'); }
    finally { setLocalizando(false); }
  }

  const rutaElegida = rutas.features.find(r => r.properties.id === seleccion);
  const estadoRutas = cargando || datosMapa.demostracion !== demo ? 'Buscando rutas de recolección…' : falloRutas ? 'Rutas no disponibles por ahora' : rutas.features.length ? `${rutas.features.length} ${rutas.features.length === 1 ? 'ruta disponible' : 'rutas disponibles'}` : 'Todavía no hay rutas disponibles';
  return <main className="app">
    <div className="vista-mapa" hidden={tab === 'reportes' || tab === 'cuenta' || tab === 'avisos'}>
      <Mapa rutas={rutas} vehiculos={vehiculos} ubicacion={ubicacion} recentrar={recentro} seleccion={seleccion} onSeleccionar={setSeleccion} visible={tab === 'inicio'} expandido={expandido} tema={temaResuelto} domicilio={domicilio?.ubicacion.coordinates ?? null} />
      <header className="cabecera isla"><a className="marca" href={`${import.meta.env.BASE_URL}index.html`} aria-label="EcoTrack inicio"><Leaf size={25} /><span>Eco<span>Track</span></span></a><span className="municipio"><MapPin size={13} /> Gutiérrez Zamora</span><button className="icono" aria-label="Abrir cuenta" onClick={() => setTab('cuenta')}><UserRound size={20}/></button></header>
      <div className="estado-servicio isla"><span className={`punto ${!online ? 'sin-red' : ''}`} /><span>{!online ? 'Sin conexión · la información puede estar desactualizada' : demo ? 'Demostración · datos simulados' : 'Rutas de recolección'}</span></div>
      <div className="herramientas"><button className="icono isla" aria-label="Obtener mi ubicación" disabled={localizando} onClick={() => void localizar()}><LocateFixed size={22} /></button><button className="icono isla" aria-label="Recentrar mapa" onClick={() => setRecentro(v => v + 1)}><MapPin size={21}/></button></div>
      <div className="stack-vertical">
        {!expandido && <ConsejosEcologicos expandidoRutas={expandido} />}
        <section className={`resumen isla ${expandido ? 'expandido' : ''}`} aria-label="Información de rutas">
          <button className="resumen-toggle" aria-expanded={expandido} aria-controls="detalles-rutas" onClick={() => setExpandido(v => !v)}>
            <span className="emblema"><Truck size={23}/></span><span className="titulo-ruta"><span className="eyebrow">{demo ? 'RECORRIDO SIMULADO' : 'RECOLECCIÓN EN TU ZONA'}</span><strong>{rutaElegida?.properties.nombre || 'Tu ciudad, más cerca'}</strong><span className="estado-rutas" role="status">{estadoRutas}</span></span>{expandido ? <ChevronDown size={21}/> : <ChevronUp size={21}/>}<span className="sr-only">{expandido ? 'Ocultar detalles' : 'Ver rutas y detalles'}</span>
          </button>
          <div id="detalles-rutas" className="contenido-rutas" hidden={!expandido}>
            <p className="descripcion">{demo ? 'Este recorrido y vehículo son simulados. No representan el servicio municipal.' : 'Elige una ruta para ver su recorrido y los detalles de recolección.'}</p>
            {lecturaUbicacion && <p className="nota" role="status">Tu ubicación se obtuvo a las {new Date(lecturaUbicacion.timestamp).toLocaleTimeString('es-MX')}, con una precisión aproximada de ±{lecturaUbicacion.precisionMetros} m.</p>}
            <div className="lista-rutas" aria-label="Rutas disponibles">{rutas.features.map(r => <button className="ruta-item" key={r.properties.id} aria-pressed={seleccion === r.properties.id} onClick={() => setSeleccion(r.properties.id)}><span style={{ background: r.properties.color }}/><strong>{r.properties.nombre}</strong><Route size={17}/></button>)}</div>
            {rutaElegida && <article className="detalle-ruta" aria-label="Detalles de la ruta seleccionada"><h2>{rutaElegida.properties.nombre}</h2><p>{rutaElegida.properties.descripcion || 'Consulta los avisos municipales para conocer los horarios de esta ruta.'}</p><div className="metricas"><span>{rutaElegida.properties.distanciaKm ? `${rutaElegida.properties.distanciaKm} km` : 'Distancia no publicada'}</span><span>{rutaElegida.properties.duracionMin ? `${rutaElegida.properties.duracionMin} min estimados` : 'Duración no publicada'}</span></div></article>}
            <div className="acciones"><button className="primario" disabled={cargando} onClick={() => { setDemo(false); setIntento(v => v + 1); }}><RefreshCw size={16}/>{cargando ? 'Consultando…' : 'Actualizar rutas'}</button>{demoPermitida && <button className="secundario" aria-pressed={demo} onClick={() => setDemo(v => !v)}>{demo ? 'Salir de demo' : 'Ver demostración'}</button>}</div>
            <p className="nota">{demo ? 'Modo de demostración. Ninguna posición es real.' : 'La ubicación de los camiones todavía no está disponible.'}</p>
          </div>
        </section>
      </div>
    </div>
    <div hidden={tab !== 'cuenta'}>{cuentaMontada && <Cuenta configurada={clerkConfigurado} tema={tema} temaMapa={temaResuelto} alSincronizar={alSincronizar} />}</div>
    <div hidden={tab !== 'reportes'}>
      {reportesMontados && <Reportes
        configurada={clerkConfigurado}
        tema={temaResuelto}
        activo={tab === 'reportes'}
        destinoAviso={reporteAviso?.clave === claveSesion ? reporteAviso ?? undefined : undefined}
        irCuenta={() => setTab('cuenta')}
        rutas={demo || datosMapa.demostracion ? [] : rutas.features.flatMap(({ properties }) =>
          properties.idPersistido ? [{ id: properties.idPersistido, nombre: properties.nombre }] : [])}
      />}
    </div>
    <Avisos perfilSincronizado={!!claveSesion && perfilSincronizado === claveSesion} configurada={clerkConfigurado} cargandoSesion={cargandoSesion} sesion={sesion} activo={tab === 'avisos'}
      online={online} onContadorCambio={publicarContador} irInicio={() => setTab('inicio')} irCuenta={() => setTab('cuenta')}
      abrirReporte={id => { if (sesion) { setReporteAviso({ clave: sesion.clave, id }); setTab('reportes'); } }}
      rutaDisponible={rutaDisponible} abrirRuta={id => {
        if (rutaDisponible(id)) { setSeleccion(id); setExpandido(true); setTab('inicio'); }
      }} />
    {error && <div className="aviso-flotante" role="alert"><p>{error}</p><button className="icono" aria-label="Cerrar aviso" onClick={() => setError(null)}><X size={18}/></button></div>}
    <nav className="navegacion isla" aria-label="Navegación principal">{tabs.map(({ id, texto, Icono }) => (
      <button key={id} aria-current={tab === id ? 'page' : undefined}
        aria-label={id === 'avisos' && avisosSinLeer > 0 ? `Avisos, ${avisosSinLeer > 99 ? '99+' : avisosSinLeer} sin leer` : undefined}
        onClick={() => setTab(id)}>
        <Icono size={21} />
        {id === 'avisos' && avisosSinLeer > 0 && (
          <span className="avisos-contador-nav" aria-hidden="true">
            {avisosSinLeer > 99 ? '99+' : avisosSinLeer}
          </span>
        )}
        <span>{texto}</span>
      </button>
    ))}</nav>
  </main>;
}
