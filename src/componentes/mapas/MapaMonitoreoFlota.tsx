"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Compass,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  Radio,
  Truck,
  User,
  X,
  Zap,
} from "lucide-react";
import { segmentosRuta, normalizarRuta } from "@/lib/rutas_mapa";
import { TelemetriaEnVivo } from "@/lib/useRastreoWebSocket";

const COORDENADAS_GUTIERREZ_ZAMORA: [number, number] = [20.4514, -97.0886];

interface PropsMapaMonitoreoFlota {
  rutas: any[];
  camiones: any[];
  telemetriaEnVivo: Record<string, TelemetriaEnVivo>;
  camionSeguidoId: string | null;
  alSeleccionarCamion: (id: string | null) => void;
  mostrarRutas: boolean;
  alCambiarMostrarRutas: (mostrar: boolean) => void;
  alturaInicialPx?: number;
}

interface EstadoAnimacion {
  marker: any;
  posActual: [number, number];
  posOrigen: [number, number];
  posDestino: [number, number];
  rumboActual: number;
  rumboDestino: number;
  tiempoInicio: number;
  duracionMs: number;
  animFrameId?: number;
}

function interpolarAngulo(inicio: number, fin: number, t: number): number {
  let diff = (fin - inicio) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;
  return (inicio + diff * t + 360) % 360;
}

function obtenerRumboTexto(grados: number): string {
  const direcciones = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const indice = Math.round(((grados % 360) / 45)) % 8;
  return direcciones[indice];
}

export default function MapaMonitoreoFlota({
  rutas,
  camiones,
  telemetriaEnVivo,
  camionSeguidoId,
  alSeleccionarCamion,
  mostrarRutas,
  alCambiarMostrarRutas,
  alturaInicialPx = 650,
}: PropsMapaMonitoreoFlota) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const capaRutasRef = useRef<any>(null);
  const capaCamionesRef = useRef<any>(null);
  const polilineasRutasRef = useRef<Map<string, any[]>>(new Map());
  const animacionesCamionesRef = useRef<Map<string, EstadoAnimacion>>(new Map());

  // Refs de estado para callbacks asíncronos y animaciones
  const camionSeguidoRef = useRef<string | null>(camionSeguidoId);
  useEffect(() => {
    camionSeguidoRef.current = camionSeguidoId;
  }, [camionSeguidoId]);

  const [mapaListo, fijar_mapaListo] = useState(false);
  const [alturaMapa, fijar_alturaMapa] = useState(alturaInicialPx);
  const [esPantallaCompleta, fijar_esPantallaCompleta] = useState(false);

  // Invalidate map size cuando cambia altura o fullscreen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapaRef.current) {
        mapaRef.current.invalidateSize();
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [alturaMapa, esPantallaCompleta]);

  // Inicializar Leaflet de forma SSR-safe
  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      if (!contenedorRef.current || mapaRef.current) return;

      try {
        const moduloLeaflet = await import("leaflet");
        const L = moduloLeaflet.default || moduloLeaflet;
        LRef.current = L;

        if (cancelado || !contenedorRef.current || mapaRef.current) return;

        const mapa = L.map(contenedorRef.current, {
          center: COORDENADAS_GUTIERREZ_ZAMORA,
          zoom: 14,
          zoomControl: false, // Ubicaremos los controles personalizados
        });

        // Tiles OpenStreetMap estándar de alta velocidad
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap // Gutiérrez Zamora, Ver.',
          maxZoom: 19,
        }).addTo(mapa);

        // Control de zoom en esquina inferior derecha
        L.control.zoom({ position: "bottomright" }).addTo(mapa);

        capaRutasRef.current = L.layerGroup().addTo(mapa);
        capaCamionesRef.current = L.layerGroup().addTo(mapa);

        mapaRef.current = mapa;
        fijar_mapaListo(true);
      } catch (err) {
        console.error("Error al inicializar mapa Leaflet:", err);
      }
    }

    inicializar();

    return () => {
      cancelado = true;
      // Cancelar todas las animaciones activas
      animacionesCamionesRef.current.forEach((anim) => {
        if (anim.animFrameId) cancelAnimationFrame(anim.animFrameId);
      });
      animacionesCamionesRef.current.clear();
      polilineasRutasRef.current.clear();

      if (mapaRef.current) {
        try {
          mapaRef.current.remove();
        } catch {
          // Ignorar fallo de desmontaje
        }
        mapaRef.current = null;
        fijar_mapaListo(false);
      }
    };
  }, []);

  // Función para crear el icono SVG personalizado de cada camión
  const crearIconoCamion = useCallback(
    (
      numeroUnidad: string,
      rumbo: number,
      esSeguido: boolean,
      estadoConexion: "online" | "detenido" | "offline",
      velocidadKmh: number
    ) => {
      const L = LRef.current;
      if (!L) return null;

      const colorBorde = esSeguido
        ? "#3b82f6"
        : estadoConexion === "online"
        ? "#10b981"
        : estadoConexion === "detenido"
        ? "#f59e0b"
        : "#71717a";

      const colorFondo = esSeguido ? "#1e3a8a" : "#18181b";

      const haloPulse =
        estadoConexion === "online"
          ? `<span class="absolute -inset-1.5 rounded-full bg-emerald-500/30 animate-ping"></span>`
          : esSeguido
          ? `<span class="absolute -inset-2 rounded-full bg-blue-500/40 animate-pulse"></span>`
          : "";

      const html = `
        <div class="relative flex flex-col items-center justify-center cursor-pointer select-none group" style="width: 46px; height: 52px;">
          ${haloPulse}
          <!-- Contenedor del icono con rotación según heading -->
          <div class="relative w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-transform duration-300"
               style="background-color: ${colorFondo}; border: 2.5px solid ${colorBorde}; transform: rotate(${rumbo}deg); box-shadow: 0 4px 14px rgba(0,0,0,0.45);">
            <!-- Flecha de proa indicadora de rumbo -->
            <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px]"
                 style="border-b-color: ${colorBorde};"></div>
            <!-- SVG Camión -->
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="${esSeguido ? '#93c5fd' : '#f4f4f5'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>
          </div>

          <!-- Etiqueta de Número de Unidad -->
          <div class="mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold tracking-tight shadow text-white"
               style="background-color: ${colorBorde}; line-height: 1.15; border: 1px solid rgba(255,255,255,0.25);">
            ${numeroUnidad || "U"}
          </div>
        </div>
      `;

      return L.divIcon({
        className: "marcador-camion-flota",
        html,
        iconSize: [46, 52],
        iconAnchor: [23, 26],
        popupAnchor: [0, -28],
      });
    },
    []
  );

  // Renderizar o actualizar capas de rutas
  useEffect(() => {
    if (!mapaListo || !mapaRef.current || !capaRutasRef.current || !LRef.current) return;
    const L = LRef.current;
    const capaRutas = capaRutasRef.current;

    // Limpiar polilíneas previas
    capaRutas.clearLayers();
    polilineasRutasRef.current.clear();

    if (!mostrarRutas) return;

    // Determinar si hay un camión seguido para resaltar su ruta
    const camionSeguido = camiones.find(
      (c) => String(c._id) === camionSeguidoId || String(c.id) === camionSeguidoId
    );
    const rutaAsignadaId = camionSeguido?.ruta_asignada_id || null;

    rutas.forEach((rawRuta) => {
      const rutaNorm = normalizarRuta(rawRuta);
      if (!rutaNorm) return;

      const tramos = segmentosRuta(rutaNorm);
      if (tramos.length === 0) return;

      const esRutaDelCamionSeguido =
        camionSeguidoId &&
        (rutaNorm._id === rutaAsignadaId ||
          rutaNorm.id_ruta === rutaAsignadaId ||
          rutaNorm.camionAsignadoId === camionSeguidoId);

      const colorBase = rutaNorm.color_mapa || "#10b981";
      const opacidad = camionSeguidoId
        ? esRutaDelCamionSeguido
          ? 0.95
          : 0.25
        : 0.65;
      const grosor = esRutaDelCamionSeguido ? 7 : 4;

      const polilineasDeRuta: any[] = [];

      tramos.forEach((tramo) => {
        const polyline = L.polyline(tramo, {
          color: colorBase,
          weight: grosor,
          opacity: opacidad,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(capaRutas);

        polyline.bindPopup(`
          <div style="font-family: sans-serif; min-width: 190px; color: #111;">
            <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: ${colorBase};">
              ${rutaNorm.nombre}
            </div>
            <div style="font-size: 11px; color: #666; margin-bottom: 4px;">ID: ${rutaNorm.id_ruta}</div>
            <div style="font-size: 11px; margin-bottom: 2px;">
              <strong>Distancia:</strong> ${rutaNorm.distancia_estimada_km || 0} km
            </div>
            <div style="font-size: 11px; margin-bottom: 2px;">
              <strong>Duración est.:</strong> ${rutaNorm.duracion_estimada_min || 0} min
            </div>
            ${
              rutaNorm.descripcion
                ? `<div style="font-size: 10px; color: #555; margin-top: 4px;">${rutaNorm.descripcion}</div>`
                : ""
            }
          </div>
        `);

        polilineasDeRuta.push(polyline);
      });

      if (rutaNorm._id) {
        polilineasRutasRef.current.set(String(rutaNorm._id), polilineasDeRuta);
      }
    });
  }, [mapaListo, rutas, mostrarRutas, camionSeguidoId, camiones]);

  // Actualizar e interpolar marcadores de camiones suavemente en tiempo real
  useEffect(() => {
    if (!mapaListo || !mapaRef.current || !capaCamionesRef.current || !LRef.current) return;
    const L = LRef.current;
    const mapa = mapaRef.current;
    const capaCamiones = capaCamionesRef.current;

    const idsPresentes = new Set<string>();

    camiones.forEach((camion) => {
      const cId = String(camion._id || camion.id || "");
      if (!cId) return;
      idsPresentes.add(cId);

      // Buscar telemetría en vivo de WebSocket o usar datos de DB
      const tele =
        telemetriaEnVivo[cId] ||
        (camion.imei ? telemetriaEnVivo[camion.imei] : null) ||
        (camion.matricula ? telemetriaEnVivo[camion.matricula] : null);

      // Determinar lat, lng, velocidad, rumbo
      let targetLat = tele?.latitud ?? camion.ultima_latitud;
      let targetLng = tele?.longitud ?? camion.ultima_longitud;
      const velocidad = tele?.velocidad_kmh ?? camion.ultima_velocidad_kmh ?? 0;
      const targetRumbo = tele?.rumbo_grados ?? camion.rumbo_grados ?? 0;
      const fechaActualizacion = tele?.timestamp
        ? new Date(tele.timestamp)
        : camion.ultima_actualizacion_gps
        ? new Date(camion.ultima_actualizacion_gps)
        : null;

      // Fallback si la unidad no tiene coordenadas aún: posicionar en base Gutiérrez Zamora
      if (
        targetLat === undefined ||
        targetLng === undefined ||
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLng)
      ) {
        targetLat = COORDENADAS_GUTIERREZ_ZAMORA[0];
        targetLng = COORDENADAS_GUTIERREZ_ZAMORA[1];
      }

      // Determinar estado de conectividad
      const ahora = Date.now();
      const diffMs = fechaActualizacion ? ahora - fechaActualizacion.getTime() : Infinity;
      const estadoConexion: "online" | "detenido" | "offline" =
        diffMs > 180000 // más de 3 minutos sin reporte
          ? "offline"
          : velocidad > 1
          ? "online"
          : "detenido";

      const esSeguido = cId === camionSeguidoId;
      const numeroUnidad = camion.numero_unidad || `U-${cId.slice(-2).toUpperCase()}`;

      let animacion = animacionesCamionesRef.current.get(cId);

      // Generar popup informativo
      const conductorNombre =
        camion.conductor_asignado_id?.nombre_completo ||
        camion.conductor_asignado?.nombre_completo ||
        "Sin conductor asignado";

      const contenidoPopup = `
        <div style="font-family: sans-serif; min-width: 220px; color: #111;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; margin-bottom: 6px;">
            <strong style="font-size: 14px; text-transform: uppercase; color: #09090b;">UNIDAD ${numeroUnidad}</strong>
            <span style="font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; background-color: ${
              estadoConexion === "online" ? "#d1fae5" : estadoConexion === "detenido" ? "#fef3c7" : "#f4f4f5"
            }; color: ${
              estadoConexion === "online" ? "#065f46" : estadoConexion === "detenido" ? "#92400e" : "#52525b"
            };">
              ${estadoConexion === "online" ? "EN RUTA" : estadoConexion === "detenido" ? "DETENIDO" : "SIN SEÑAL"}
            </span>
          </div>
          <div style="font-size: 11px; color: #3f3f46; line-height: 1.5;">
            <div><strong>Placa:</strong> ${camion.matricula || "S/P"}</div>
            <div><strong>Conductor:</strong> ${conductorNombre}</div>
            <div><strong>Velocidad:</strong> ${velocidad} km/h</div>
            <div><strong>Rumbo:</strong> ${targetRumbo}° (${obtenerRumboTexto(targetRumbo)})</div>
            <div><strong>IMEI GPS:</strong> ${camion.imei || camion.imei_gps || "No vinculado"}</div>
            <div style="color: #71717a; font-size: 10px; margin-top: 4px;">
              ${fechaActualizacion ? `Último reporte: ${fechaActualizacion.toLocaleTimeString()}` : "Sin telemetría"}
            </div>
          </div>
        </div>
      `;

      if (!animacion) {
        // Crear nuevo marcador Leaflet con posición inicial
        const icono = crearIconoCamion(numeroUnidad, targetRumbo, esSeguido, estadoConexion, velocidad);
        const marker = L.marker([targetLat, targetLng], {
          icon: icono,
          zIndexOffset: esSeguido ? 1000 : 500,
        }).addTo(capaCamiones);

        marker.bindPopup(contenidoPopup);

        marker.on("click", () => {
          alSeleccionarCamion(cId);
        });

        animacion = {
          marker,
          posActual: [targetLat, targetLng],
          posOrigen: [targetLat, targetLng],
          posDestino: [targetLat, targetLng],
          rumboActual: targetRumbo,
          rumboDestino: targetRumbo,
          tiempoInicio: performance.now(),
          duracionMs: 2500,
        };

        animacionesCamionesRef.current.set(cId, animacion);
      } else {
        // Actualizar popup y zIndex
        animacion.marker.setPopupContent(contenidoPopup);
        animacion.marker.setZIndexOffset(esSeguido ? 1000 : 500);

        // Si la posición o rumbo cambió, iniciar interpolación lineal con requestAnimationFrame
        const distLat = Math.abs(animacion.posDestino[0] - targetLat);
        const distLng = Math.abs(animacion.posDestino[1] - targetLng);
        const cambioPosicion = distLat > 0.00001 || distLng > 0.00001;
        const cambioRumbo = Math.abs(animacion.rumboDestino - targetRumbo) > 1;

        if (cambioPosicion || cambioRumbo) {
          if (animacion.animFrameId) {
            cancelAnimationFrame(animacion.animFrameId);
          }

          animacion.posOrigen = [...animacion.posActual] as [number, number];
          animacion.posDestino = [targetLat, targetLng];
          animacion.rumboDestino = targetRumbo;
          animacion.tiempoInicio = performance.now();
          animacion.duracionMs = 2500; // ~2.5 segundos de deslizamiento fluido

          const animRef = animacion;

          function animarPaso(ahora: number) {
            const lapso = ahora - animRef.tiempoInicio;
            const t = Math.min(1, Math.max(0, lapso / animRef.duracionMs));

            // Interpolación lineal latitud y longitud
            const latInterp =
              animRef.posOrigen[0] + (animRef.posDestino[0] - animRef.posOrigen[0]) * t;
            const lngInterp =
              animRef.posOrigen[1] + (animRef.posDestino[1] - animRef.posOrigen[1]) * t;
            animRef.posActual = [latInterp, lngInterp];
            animRef.marker.setLatLng([latInterp, lngInterp]);

            // Interpolación angular del rumbo
            const rumboInterp = interpolarAngulo(
              animRef.rumboActual,
              animRef.rumboDestino,
              t
            );
            animRef.rumboActual = rumboInterp;

            // Actualizar icono con el nuevo rumbo e icono
            const iconoActualizado = crearIconoCamion(
              numeroUnidad,
              rumboInterp,
              cId === camionSeguidoRef.current,
              estadoConexion,
              velocidad
            );
            if (iconoActualizado) {
              animRef.marker.setIcon(iconoActualizado);
            }

            // Modo seguimiento: centrar cámara suavemente sobre el camión seguido
            if (cId === camionSeguidoRef.current && mapaRef.current) {
              mapaRef.current.panTo([latInterp, lngInterp], { animate: false });
            }

            if (t < 1) {
              animRef.animFrameId = requestAnimationFrame(animarPaso);
            }
          }

          animacion.animFrameId = requestAnimationFrame(animarPaso);
        } else {
          // Solo actualizar icono si cambió el estado o selección
          const iconoActualizado = crearIconoCamion(
            numeroUnidad,
            animacion.rumboActual,
            esSeguido,
            estadoConexion,
            velocidad
          );
          if (iconoActualizado) {
            animacion.marker.setIcon(iconoActualizado);
          }
        }
      }
    });

    // Limpiar marcadores de camiones eliminados
    animacionesCamionesRef.current.forEach((anim, id) => {
      if (!idsPresentes.has(id)) {
        if (anim.animFrameId) cancelAnimationFrame(anim.animFrameId);
        capaCamiones.removeLayer(anim.marker);
        animacionesCamionesRef.current.delete(id);
      }
    });
  }, [
    mapaListo,
    camiones,
    telemetriaEnVivo,
    camionSeguidoId,
    alSeleccionarCamion,
    crearIconoCamion,
  ]);

  // Al cambiar la unidad seguida, enfocar con flyTo la primera vez
  useEffect(() => {
    if (!mapaListo || !mapaRef.current || !camionSeguidoId) return;

    const anim = animacionesCamionesRef.current.get(camionSeguidoId);
    if (anim && anim.posActual) {
      mapaRef.current.flyTo(anim.posActual, 16, { animate: true, duration: 1.2 });
      anim.marker.openPopup();
    }
  }, [camionSeguidoId, mapaListo]);

  // Re-encuadrar toda la flota en pantalla
  const verTodaLaFlota = () => {
    if (!mapaRef.current || !LRef.current) return;
    const L = LRef.current;
    const mapa = mapaRef.current;

    // Desactivar seguimiento para dar libertad de paneo
    alSeleccionarCamion(null);

    const puntos: [number, number][] = [];
    animacionesCamionesRef.current.forEach((anim) => {
      if (anim.posActual && Number.isFinite(anim.posActual[0])) {
        puntos.push(anim.posActual);
      }
    });

    if (puntos.length > 0) {
      const bounds = L.latLngBounds(puntos);
      mapa.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else {
      mapa.flyTo(COORDENADAS_GUTIERREZ_ZAMORA, 14, { animate: true });
    }
  };

  const camionSeguido = camiones.find(
    (c) => String(c._id) === camionSeguidoId || String(c.id) === camionSeguidoId
  );

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 transition-all ${
        esPantallaCompleta ? "fixed inset-0 z-50 rounded-none border-none" : ""
      }`}
      style={{ height: esPantallaCompleta ? "100vh" : `${alturaMapa}px` }}
    >
      {/* Contenedor del Mapa Leaflet */}
      <div ref={contenedorRef} className="w-full h-full z-0" />

      {/* Barra de Controles Superiores Flotantes */}
      <div className="absolute top-4 left-4 right-4 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Indicador de Modo y Estado */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {camionSeguidoId && camionSeguido ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-950/90 border border-blue-500/40 text-blue-200 backdrop-blur shadow-xl text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              <span>Siguiendo:</span>
              <strong className="text-white uppercase font-bold">
                {camionSeguido.numero_unidad || "Unidad"} ({camionSeguido.matricula || "S/P"})
              </strong>
              <button
                onClick={() => alSeleccionarCamion(null)}
                className="ml-2 p-1 rounded-md bg-blue-900/60 hover:bg-blue-800 text-blue-200 hover:text-white transition-colors"
                title="Dejar de seguir"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-zinc-300 backdrop-blur shadow-xl text-xs font-mono">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Panorama General: Flota Completa</span>
            </div>
          )}
        </div>

        {/* Botonera de Herramientas Rápidas del Mapa */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Botón Ver Toda la Flota */}
          <button
            onClick={verTodaLaFlota}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/85 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-mono shadow-xl backdrop-blur transition-all active:scale-95"
            title="Ajustar cámara a todos los camiones activos"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Ver toda la flota</span>
          </button>

          {/* Interruptor Mostrar/Ocultar Rutas */}
          <button
            onClick={() => alCambiarMostrarRutas(!mostrarRutas)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono shadow-xl backdrop-blur transition-all active:scale-95 ${
              mostrarRutas
                ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900/85 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Activar o desactivar visibilidad de rutas en el mapa"
          >
            {mostrarRutas ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Rutas ({rutas.length})</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                <span>Rutas Ocultas</span>
              </>
            )}
          </button>

          {/* Pantalla Completa */}
          <button
            onClick={() => fijar_esPantallaCompleta(!esPantallaCompleta)}
            className="p-2 rounded-xl bg-zinc-900/85 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 shadow-xl backdrop-blur transition-all active:scale-95"
            title={esPantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {esPantallaCompleta ? (
              <Minimize2 className="w-4 h-4 text-amber-400" />
            ) : (
              <Maximize2 className="w-4 h-4 text-zinc-400" />
            )}
          </button>
        </div>
      </div>

      {/* Banner flotante de aviso si está en modo seguimiento */}
      {camionSeguidoId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] pointer-events-auto">
          <button
            onClick={() => alSeleccionarCamion(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border border-blue-500/50 shadow-2xl backdrop-blur text-xs font-mono transition-all hover:scale-105 active:scale-95"
          >
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            <span>Seguimiento continuo activo —</span>
            <span className="text-blue-400 font-bold underline">Dejar de seguir / Ver todos</span>
          </button>
        </div>
      )}
    </div>
  );
}
