import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapaGL } from 'maplibre-gl';
import type { ColeccionRutas, Vehiculo } from '../servicios/contratos.ts';
import 'maplibre-gl/dist/maplibre-gl.css';
import { crearFlecha } from './flecha.ts';
import { ContextoDirecciones } from '../app/DireccionAproximada.tsx';
import { DireccionCasa } from './DireccionCasa.tsx';
import { limitesRuta } from '../servicios/rutas.ts';

const ESTILO_CLARO = 'https://tiles.openfreemap.org/styles/liberty';
const ESTILO_OSCURO = 'https://tiles.openfreemap.org/styles/dark';
const vacio = { type: 'FeatureCollection' as const, features: [] };

type Tema = 'light' | 'dark' | 'auto';

function resolverEstilo(tema: Tema): string {
  const envStyle = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (envStyle) return envStyle;
  if (tema === 'dark') return ESTILO_OSCURO;
  if (tema === 'light') return ESTILO_CLARO;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return ESTILO_OSCURO;
  return ESTILO_CLARO;
}

interface Props {
  rutas: ColeccionRutas;
  vehiculos: Vehiculo[];
  ubicacion: [number, number] | null;
  domicilio: [number, number] | null;
  recentrar: number;
  seleccion: string | null;
  onSeleccionar: (id: string) => void;
  visible: boolean;
  expandido: boolean;
  tema: Tema;
}

function inicializarCapas(instance: MapaGL) {
  const capasPersonalizadas = ['rutas-borde', 'rutas-linea', 'rutas-flechas', 'vehiculos-puntos', 'ubicacion-punto'];
  const fuentesPersonalizadas = ['rutas', 'vehiculos', 'ubicacion'];
  for (const id of capasPersonalizadas) {
    if (instance.getLayer(id)) instance.removeLayer(id);
  }
  for (const id of fuentesPersonalizadas) {
    if (instance.getSource(id)) instance.removeSource(id);
  }
  if (instance.hasImage('flecha')) instance.removeImage('flecha');

  instance.addSource('rutas', { type: 'geojson', data: vacio });
  instance.addLayer({ id: 'rutas-borde', type: 'line', source: 'rutas', paint: { 'line-color': '#fff', 'line-width': 9, 'line-opacity': 0.9 } });
  instance.addLayer({ id: 'rutas-linea', type: 'line', source: 'rutas', paint: { 'line-color': ['get', 'color'], 'line-width': 5 } });
  instance.addImage('flecha', crearFlecha());
  instance.addLayer({ id: 'rutas-flechas', type: 'symbol', source: 'rutas', layout: {
    'symbol-placement': 'line', 'symbol-spacing': 100, 'icon-image': 'flecha', 'icon-size': 0.65,
    'icon-rotation-alignment': 'map', 'icon-keep-upright': false, 'icon-allow-overlap': false,
  } });
  instance.addSource('vehiculos', { type: 'geojson', data: vacio });
  instance.addLayer({ id: 'vehiculos-puntos', type: 'circle', source: 'vehiculos', paint: { 'circle-radius': 10, 'circle-color': '#1F5F8C', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  instance.addSource('ubicacion', { type: 'geojson', data: vacio });
  instance.addLayer({ id: 'ubicacion-punto', type: 'circle', source: 'ubicacion', paint: { 'circle-radius': 7, 'circle-color': '#2563EB', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
}

function sincronizarCapas(m: MapaGL, { rutas, vehiculos, ubicacion, seleccion }: { rutas: ColeccionRutas; vehiculos: Vehiculo[]; ubicacion: [number, number] | null; seleccion: string | null }) {
  (m.getSource('rutas') as GeoJSONSource | undefined)?.setData(rutas as Parameters<GeoJSONSource['setData']>[0]);
  (m.getSource('vehiculos') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: vehiculos.map(v => ({ type: 'Feature', properties: { id: v.id }, geometry: { type: 'Point', coordinates: [v.longitud, v.latitud] } })) });
  (m.getSource('ubicacion') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: ubicacion ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ubicacion } }] : [] });
  if (m.getLayer('rutas-linea')) {
    m.setPaintProperty('rutas-linea', 'line-width', seleccion ? ['case', ['==', ['get', 'id'], seleccion], 6, 3] : 5);
    m.setPaintProperty('rutas-linea', 'line-opacity', seleccion ? ['case', ['==', ['get', 'id'], seleccion], 1, 0.4] : 1);
  }
}

export function Mapa({ rutas, vehiculos, ubicacion, domicilio, recentrar, seleccion, onSeleccionar, visible, expandido, tema }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const direcciones = useContext(ContextoDirecciones);
  const [casaAbierta, setCasaAbierta] = useState<{ almacen: typeof direcciones; longitud: number; latitud: number } | null>(null);
  const cerrarCasa = useCallback(() => setCasaAbierta(null), []);
  const casa = useRef<maplibregl.Marker | null>(null);
  const datosRef = useRef({ rutas, vehiculos, ubicacion, seleccion });
  datosRef.current = { rutas, vehiculos, ubicacion, seleccion };
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const estiloActualRef = useRef<string | null>(null);
  const estilo = resolverEstilo(tema);
  const seleccionarRef = useRef(onSeleccionar);
  seleccionarRef.current = onSeleccionar;

  // Inicialización del mapa (solo al montar o reintentar)
  useEffect(() => {
    if (!container.current) return;
    let instance: MapaGL | undefined;
    setError(null); setListo(false);
    try {
      if (estilo) {
        const url = new URL(estilo);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Estilo no permitido');
      }
      instance = new maplibregl.Map({
        container: container.current, style: estilo,
        center: [-97.0886, 20.4514], zoom: 14.7, attributionControl: false,
      });
      mapa.current = instance;
      estiloActualRef.current = estilo;
      instance.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>' }), 'bottom-right');
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('error', () => setError('No pudimos cargar una parte del mapa. Revisa tu conexión e inténtalo de nuevo.'));
      instance.on('click', 'rutas-linea', e => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') seleccionarRef.current(id);
      });
      instance.on('mouseenter', 'rutas-linea', () => { if (instance) instance.getCanvas().style.cursor = 'pointer'; });
      instance.on('mouseleave', 'rutas-linea', () => { if (instance) instance.getCanvas().style.cursor = ''; });
      instance.on('style.load', () => {
        if (!instance) return;
        inicializarCapas(instance);
        sincronizarCapas(instance, datosRef.current);
        setListo(true);
      });
    } catch {
      setError('No pudimos abrir el mapa en este dispositivo. Puedes consultar las rutas en la lista.');
    }
    return () => { casa.current?.remove(); casa.current = null; mapa.current = null; estiloActualRef.current = null; instance?.remove(); };
  }, [intento]);

  // setStyle conserva cámara e instancia; style.load restaura los datos más recientes.
  useEffect(() => {
    if (!listo || !mapa.current || estiloActualRef.current === estilo) return;
    estiloActualRef.current = estilo;
    mapa.current.setStyle(estilo);
  }, [estilo, listo]);

  useEffect(() => {
    const m = mapa.current;
    if (listo && m?.isStyleLoaded()) sincronizarCapas(m, datosRef.current);
  }, [listo, rutas, vehiculos, ubicacion, seleccion]);

  const longitudCasa = domicilio?.[0];
  const latitudCasa = domicilio?.[1];
  useLayoutEffect(() => {
    const m = mapa.current;
    if (!m || longitudCasa === undefined || latitudCasa === undefined || !Number.isFinite(longitudCasa) || !Number.isFinite(latitudCasa) || Math.abs(longitudCasa) > 180 || Math.abs(latitudCasa) > 90) {
      casa.current?.remove(); casa.current = null;
      return;
    }
    if (!casa.current) {
      const elemento = document.createElement('button');
      elemento.type = 'button';
      elemento.className = 'marcador-domicilio';
      elemento.setAttribute('aria-label', 'Tu domicilio guardado');
      elemento.title = 'Tu domicilio guardado';
      // SVG estático local; sin HTML ni datos provenientes de usuarios/proveedores.
      elemento.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z"/></svg>';
      casa.current = new maplibregl.Marker({ element: elemento, anchor: 'bottom' }).setLngLat([longitudCasa, latitudCasa]).addTo(m);
    } else casa.current.setLngLat([longitudCasa, latitudCasa]);
    const elemento = casa.current.getElement();
    const abrir = (evento: MouseEvent) => {
      evento.stopPropagation();
      setCasaAbierta({ almacen: direcciones, longitud: longitudCasa, latitud: latitudCasa });
    };
    elemento.addEventListener('click', abrir);
    return () => elemento.removeEventListener('click', abrir);
  }, [listo, longitudCasa, latitudCasa, direcciones]);

  useEffect(() => {
    if (!listo || !mapa.current) return;
    if (mapa.current.isStyleLoaded()) sincronizarCapas(mapa.current, datosRef.current);
    const ruta = rutas.features.find(r => r.properties.id === seleccion);
    if (ruta && visible) {
      const alto = container.current?.clientHeight || 700;
      const ancho = container.current?.clientWidth || 390;
      const lateral = ancho >= 760 || (ancho >= 600 && alto <= 500);
      mapa.current.fitBounds(limitesRuta(ruta), { padding: lateral
        ? { top: 85, bottom: 40, left: ancho >= 760 && alto > 500 ? 470 : 385, right: 35 }
        : { top: Math.min(150, alto * 0.2), bottom: Math.min(alto * (expandido ? 0.55 : 0.3), expandido ? 460 : 230), left: 35, right: 55 }, maxZoom: 16.5, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450 });
    }
  }, [listo, seleccion, rutas, visible, expandido]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => mapa.current?.resize());
    const observer = new ResizeObserver(() => mapa.current?.resize());
    if (container.current) observer.observe(container.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [visible]);

  useEffect(() => {
    if (listo && mapa.current && recentrar > 0) mapa.current.easeTo({ center: ubicacion || [-97.0886, 20.4514], zoom: 15, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 });
  }, [listo, recentrar, ubicacion]);

  return <>
    {visible && mapa.current && casaAbierta && casaAbierta.almacen === direcciones &&
      casaAbierta.longitud === longitudCasa && casaAbierta.latitud === latitudCasa &&
      <DireccionCasa mapa={mapa.current} punto={[casaAbierta.longitud, casaAbierta.latitud]} cerrar={cerrarCasa} />}
    <div ref={container} className="mapa" data-testid="mapa" aria-label="Mapa de recolección de Gutiérrez Zamora" />
    <span className={listo ? 'sr-only' : 'mapa-estado'} data-testid="mapa-estado" role="status">{listo ? 'Mapa listo' : 'Cargando mapa…'}</span>
    {error && <div className="mapa-error" role="alert">{error}<button onClick={() => setIntento(v => v + 1)}>Reintentar mapa</button></div>}
  </>;
}
