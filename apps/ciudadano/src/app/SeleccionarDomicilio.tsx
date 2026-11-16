import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapaGL } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { DomicilioDTO, TipoSeleccionDomicilio } from '../servicios/domicilio.ts';
import { useDireccionAproximada, DireccionPresentacion } from './DireccionAproximada.tsx';
import { posicionParaMapa } from '../servicios/posicion.ts';

const ESTILO_CLARO = 'https://tiles.openfreemap.org/styles/liberty';
const ESTILO_OSCURO = 'https://tiles.openfreemap.org/styles/dark';

type Tema = 'light' | 'dark' | 'auto';
type ModoVista = 'seleccionando' | 'revizando' | 'guardando' | 'confirmado' | 'error';

export interface CentroPunto {
  latitud: number;
  longitud: number;
  tipo_seleccion: TipoSeleccionDomicilio;
  confirmada: true;
}

export interface Props {
  domicilioExistente?: DomicilioDTO | null;
  onConfirmar: (punto: CentroPunto) => void | Promise<void>;
  onCancelado: () => void;
  onGuardado: () => void;
  tema: Tema;
}

function resolverEstilo(tema: Tema): string {
  const envStyle = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  if (envStyle) return envStyle;
  if (tema === 'dark') return ESTILO_OSCURO;
  if (tema === 'light') return ESTILO_CLARO;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return ESTILO_OSCURO;
  return ESTILO_CLARO;
}

function esCoordenadaValida(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90
    && lon >= -180 && lon <= 180;
}

function centroDesdeDto(dto?: DomicilioDTO | null): [number, number] {
  if (dto && dto.ubicacion && Array.isArray(dto.ubicacion.coordinates)) {
    const coords = dto.ubicacion.coordinates;
    const lon = coords[0];
    const lat = coords[1];
    if (esCoordenadaValida(lat, lon)) return [lon, lat];
  }
  return [-97.0886, 20.4514];
}

export function SeleccionarDomicilio({ domicilioExistente, onConfirmar, onCancelado, onGuardado, tema }: Props) {
  const centroInicial = centroDesdeDto(domicilioExistente);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaGL | null>(null);
  const movimientoActivoRef = useRef(false);
  const modoRef = useRef<ModoVista>('seleccionando');
  const tipoSeleccionRef = useRef<TipoSeleccionDomicilio>(
    domicilioExistente?.tipo_seleccion || 'manual'
  );
  const centroRef = useRef<[number, number]>(centroInicial);
  // Coordenadas confirmadas al entrar en modo revizando (inmutables hasta reeditar)
  const centroConfirmadoRef = useRef<[number, number] | null>(null);
  // Evita cambiar tipo a manual cuando flyTo se dispara tras obtener GPS
  const volandoRef = useRef(false);

  const [centro, setCentro] = useState<[number, number]>(centroInicial);
  const [modo, setModo] = useState<ModoVista>('seleccionando');
  const direccionSeleccionada=useDireccionAproximada(['revizando','guardando','confirmado'].includes(modo)?centroConfirmadoRef.current:null);
  const [cargandoGPS, setCargandoGPS] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const [tipoSeleccion, setTipoSeleccion] = useState<TipoSeleccionDomicilio>(
    domicilioExistente?.tipo_seleccion || 'manual'
  );
  const [guardando, setGuardando] = useState(false);

  const estilo = resolverEstilo(tema);
  const estiloActualRef = useRef(estilo);

  // Sincronizar centro desde props si existe domicilio
  useEffect(() => {
    if (modoRef.current !== 'seleccionando') return;
    const c = centroDesdeDto(domicilioExistente);
    if (c[0] !== centroRef.current[0] || c[1] !== centroRef.current[1]) {
      setCentro(c);
      centroRef.current = c;
    }
    if (domicilioExistente?.tipo_seleccion) {
      setTipoSeleccion(domicilioExistente.tipo_seleccion);
      tipoSeleccionRef.current = domicilioExistente.tipo_seleccion;
    }
  }, [domicilioExistente]);

  // Inicialización del mapa
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let instance: MapaGL | undefined;

    try {
      const url = new URL(estilo);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Estilo no permitido');

      instance = new maplibregl.Map({
        container,
        style: estilo,
        center: centroInicial as [number, number],
        zoom: 16,
        attributionControl: false,
        interactive: true,
      });

      mapaRef.current = instance;

      instance.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>',
        }),
        'bottom-right'
      );

      // Centro del mapa como referencia para el marcador visual
      const actualizarCentroMapa = () => {
        // Solo actualizar centro en modo 'seleccionando'
        if (modoRef.current !== 'seleccionando') return;
        const c = instance?.getCenter();
        if (!c) return;
        const nuevoCentro: [number, number] = [c.lng, c.lat];
        if (esCoordenadaValida(nuevoCentro[1], nuevoCentro[0])) {
          setCentro(nuevoCentro);
          centroRef.current = nuevoCentro;
        }
      };

      // Cambiar a manual cuando el usuario mueve el mapa tras usar GPS
      // volandoRef evita que flyTo programático después de GPS dispare este cambio
      instance.on('movestart', () => {
        if (volandoRef.current) return;
        if (modoRef.current !== 'seleccionando') return;
        movimientoActivoRef.current = true;
        if (tipoSeleccionRef.current === 'gps') {
          setTipoSeleccion('manual');
          tipoSeleccionRef.current = 'manual';
        }
      });

      instance.on('moveend', () => {
        if (modoRef.current !== 'seleccionando') return;
        movimientoActivoRef.current = false;
        actualizarCentroMapa();
      });

      // Mostrar error si el mapa falla
      instance.on('error', () => {
        // Silencioso; el estado de carga del mapa se maneja con la lista de capas
      });

    } catch {
      setErrorMensaje('No pudimos abrir el mapa en este dispositivo.');
      modoRef.current = 'error';
      setModo('error');
    }

    return () => {
      mapaRef.current = null;
      instance?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapaRef.current || estiloActualRef.current === estilo) return;
    estiloActualRef.current = estilo;
    mapaRef.current.setStyle(estilo);
  }, [estilo]);

  // Actualizar interactividad del mapa según el modo
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const interactivo = modo === 'seleccionando';
    for (const handler of [mapa.dragPan, mapa.scrollZoom, mapa.boxZoom, mapa.dragRotate, mapa.keyboard, mapa.doubleClickZoom, mapa.touchZoomRotate, mapa.touchPitch]) {
      if (interactivo) handler.enable(); else handler.disable();
    }
    // En modo revizando/guardando/confirmado, deshabilitar zoom/pan pero mantener el marcador visible
  }, [modo]);

  async function manejarUbicacion() {
    if (cargandoGPS) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMensaje('Este navegador no soporta geolocalización.');
      setModo('error');
      modoRef.current = 'error';
      return;
    }

    setCargandoGPS(true);
    setErrorMensaje(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      });

      if (modoRef.current !== 'seleccionando') return;
      const lectura = posicionParaMapa(pos);
      const nuevoCentro: [number, number] = lectura.coordenadas;

      if (!esCoordenadaValida(nuevoCentro[1], nuevoCentro[0])) {
        throw new Error('Posición inválida recibida del dispositivo.');
      }

      setCentro(nuevoCentro);
      centroRef.current = nuevoCentro;
      setTipoSeleccion('gps');
      tipoSeleccionRef.current = 'gps';

      if (mapaRef.current) {
        volandoRef.current = true;
        mapaRef.current.flyTo({ center: nuevoCentro as [number, number], zoom: 16, duration: 800 });
        setTimeout(() => { volandoRef.current = false; }, 1000);
      }
    } catch {
      setErrorMensaje('No se pudo obtener tu ubicación. Usa el mapa para elegir manualmente.');
      modoRef.current = 'error';
      setModo('error');
    } finally {
      setCargandoGPS(false);
    }
  }

  function entrarRevizar() {
    if (cargandoGPS || movimientoActivoRef.current || volandoRef.current) return;
    const [lon, lat] = centroRef.current;
    if (!esCoordenadaValida(lat, lon)) {
      setErrorMensaje('Las coordenadas seleccionadas no son válidas.');
      modoRef.current = 'error';
      setModo('error');
      return;
    }
    // Capturar coordenadas confirmadas (inmutables hasta reeditar)
    centroConfirmadoRef.current = [lon, lat];
    modoRef.current = 'revizando';
    setModo('revizando');
  }

  async function confirmarSeleccion() {
    // Usar coordenadas confirmadas en revizando, no el centro actual del mapa
    if (modoRef.current !== 'revizando') return;
    const confirmado = centroConfirmadoRef.current;
    if (!confirmado) {
      setErrorMensaje('No hay coordenadas confirmadas. Vuelve a seleccionar.');
      modoRef.current = 'error';
      setModo('error');
      return;
    }
    const [lon, lat] = confirmado;
    const punto: CentroPunto = {
      latitud: lat,
      longitud: lon,
      tipo_seleccion: tipoSeleccion,
      confirmada: true,
    };
    setGuardando(true);
    modoRef.current = 'guardando';
    setModo('guardando');
    try {
      await onConfirmar(punto);
      modoRef.current = 'confirmado';
      setModo('confirmado');
    } catch {
      setErrorMensaje('No pudimos guardar tu domicilio. Revisa el aviso de tu cuenta e inténtalo de nuevo.');
      modoRef.current = 'error';
      setModo('error');
    } finally {
      setGuardando(false);
    }
  }

  function reeditar() {
    // Liberar coordenadas confirmadas al volver a editar
    centroConfirmadoRef.current = null;
    modoRef.current = 'seleccionando';
    setModo('seleccionando');
    setErrorMensaje(null);
  }

  function cancelar() {
    centroConfirmadoRef.current = null;
    onCancelado();
  }

  return (
    <div className="selector-domicilio" role="dialog" aria-modal="true" aria-labelledby="selector-titulo">
      {/* Mapa ocupa toda la pantalla */}
      <div className="selector-mapa-contenedor">
        <div ref={containerRef} className="selector-mapa" />
        {/* Marcador visual fijo en el centro */}
        <div className="selector-marcador-central" aria-hidden="true">
          <span className="selector-marcador-punto" />
          <span className="selector-marcador-anillo" />
        </div>

        {modo === 'error' && errorMensaje && (
          <div className="selector-aviso isla" role="alert">
            <p>{errorMensaje}</p>
            <button onClick={reeditar}>Aceptar</button>
          </div>
        )}
      </div>

      {/* Panel inferior con acciones */}
      <div className="selector-panel isla">
        {modo === 'seleccionando' && (
          <>
            <div className="selector-cabecera">
              <h1 id="selector-titulo">Elige tu domicilio</h1>
              <p className="selector-descripcion">
                Mueve el mapa y centra el marcador en tu dirección. Luego confirma.
              </p>
            </div>

            <div className="selector-coord">
              <details className="direccion-detalles"><summary>Coordenadas seleccionadas</summary>
              <code className="selector-coord-texto">
                {centro[1].toFixed(5)}, {centro[0].toFixed(5)}
              </code></details>
              <span className={`selector-tipo-etiqueta ${tipoSeleccion === 'gps' ? 'gps' : 'manual'}`}>
                {tipoSeleccion === 'gps' ? '📍 Ubicación GPS' : '📌 Selección manual'}
              </span>
            </div>

            <div className="selector-botones">
              <button
                className="secundario selector-btn-gps"
                onClick={manejarUbicacion}
                disabled={cargandoGPS}
                aria-busy={cargandoGPS}
              >
                {cargandoGPS ? 'Localizando…' : 'Usar mi ubicación'}
              </button>
              <button
                className="primario"
                onClick={entrarRevizar}
                disabled={movimientoActivoRef.current}
                aria-label="Confirmar la ubicación marcada en el centro del mapa"
              >
                Confirmar ubicación
              </button>
              <button
                className="selector-btn-cancel"
                onClick={cancelar}
                aria-label="Cancelar y volver atrás"
              >
                Cancelar
              </button>
            </div>

            <p className="selector-nota">
              No se guardará nada hasta que confirmes explícitamente.
            </p>
          </>
        )}

        {modo === 'revizando' && (
          <>
            <div className="selector-cabecera">
              <h1 id="selector-titulo">Confirma tu domicilio</h1>
              <p className="selector-descripcion">
                Revisa que el punto marcado sea correcto. Puedes editarlo si necesitas cambiarlo.
              </p>
            </div>

            <div className="selector-resumen isla">
              <DireccionPresentacion {...direccionSeleccionada} />
              <details className="direccion-detalles"><summary>Detalles del punto</summary>
                <code>{centroConfirmadoRef.current?.[1].toFixed(5)}, {centroConfirmadoRef.current?.[0].toFixed(5)}</code>
                <p>{tipoSeleccion === 'gps' ? 'Selección GPS' : 'Selección manual'}</p>
              </details>
              <p className="selector-confirmada">✓ Confirmado por ti</p>
            </div>

            <div className="selector-botones">
              <button className="secundario" onClick={reeditar}>
                Corregir en el mapa
              </button>
              <button className="primario" onClick={confirmarSeleccion}>
                Guardar domicilio
              </button>
              <button className="selector-btn-cancel" onClick={cancelar}>
                Cancelar
              </button>
            </div>

            <p className="selector-nota">
              Al guardar se enviará este punto al municipio para su evaluación.
            </p>
          </>
        )}

        {modo === 'guardando' && (
          <>
            <div className="selector-cabecera">
              <h1 id="selector-titulo">Guardando domicilio…</h1>
              <p className="selector-descripcion">
                Enviando tu punto al municipio. No cierres esta pantalla.
              </p>
            </div>
            <div className="selector-exito isla">

            </div>
            <div className="selector-botones">
              <button className="primario" disabled aria-busy="true">
                Guardando…
              </button>
              <button className="selector-btn-cancel" onClick={cancelar}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {modo === 'confirmado' && (
          <>
            <div className="selector-cabecera">
              <h1 id="selector-titulo">Domicilio registrado</h1>
            </div>
            <div className="selector-exito isla">
              <p>Tu domicilio ha sido guardado correctamente.</p>

            </div>
            <button className="primario" onClick={onGuardado}>
              Continuar
            </button>
          </>
        )}

        {modo === 'error' && errorMensaje && (
          <>
            <div className="selector-cabecera">
              <h1 id="selector-titulo">Error</h1>
            </div>
            <div className="selector-aviso isla" role="alert">
              <p>{errorMensaje}</p>
            </div>
            <div className="selector-botones">
              <button className="secundario" onClick={reeditar}>Reintentar</button>
              <button className="selector-btn-cancel" onClick={cancelar}>Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}