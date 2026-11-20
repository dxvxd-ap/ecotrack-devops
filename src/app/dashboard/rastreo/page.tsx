"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Skeleton from "react-loading-skeleton";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  Filter,
  Gauge,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  Radio,
  RefreshCw,
  Search,
  Truck,
  User,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { clienteFetch, extraerLista } from "@/lib/clienteHttp";
import { useRastreoWebSocket, TelemetriaEnVivo } from "@/lib/useRastreoWebSocket";

// Carga dinámica SSR-safe del mapa Leaflet
const MapaMonitoreoFlota = dynamic(
  () => import("@/componentes/mapas/MapaMonitoreoFlota"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[650px] rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          <Truck className="w-5 h-5 text-emerald-400 absolute" />
        </div>
        <span className="text-xs font-mono text-zinc-400">
          Cargando cartografía satelital y telemetría en tiempo real...
        </span>
      </div>
    ),
  }
);

export default function PaginaRastreoEnVivo() {
  const { isLoaded } = useAuth();
  const [camiones, fijar_camiones] = useState<any[]>([]);
  const [rutas, fijar_rutas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [errorCarga, fijar_errorCarga] = useState<string | null>(null);

  // Estados de interacción
  const [camionSeguidoId, fijar_camionSeguidoId] = useState<string | null>(null);
  const [mostrarRutas, fijar_mostrarRutas] = useState(true);
  const [busqueda, fijar_busqueda] = useState("");
  const [filtroEstado, fijar_filtroEstado] = useState<"todos" | "online" | "detenido" | "offline">("todos");

  // Conexión WebSocket al servidor GPS
  const {
    estadoConexion,
    telemetriaPorCamion,
    ultimoTimestamp,
    reconectarManual,
    urlWs,
  } = useRastreoWebSocket();

  // Carga inicial de datos de la flota y las rutas
  const cargarDatos = async () => {
    try {
      fijar_cargando(true);
      fijar_errorCarga(null);

      const [resCamiones, resRutas] = await Promise.allSettled([
        clienteFetch("/api/camiones"),
        clienteFetch("/api/rutas"),
      ]);

      if (resCamiones.status === "fulfilled") {
        fijar_camiones(extraerLista(resCamiones.value, "camiones"));
      }

      if (resRutas.status === "fulfilled") {
        fijar_rutas(extraerLista(resRutas.value, "rutas"));
      }
    } catch (err: any) {
      console.error("Error al cargar datos de flota/rutas:", err);
      fijar_errorCarga("No se pudo cargar la lista de unidades de flota.");
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    cargarDatos();
  }, [isLoaded]);

  // Calcular métricas en tiempo real combinando camiones con telemetría viva
  const {
    unidadesProcesadas,
    totalEnLinea,
    totalDetenidos,
    totalSinSenal,
  } = useMemo(() => {
    let online = 0;
    let detenidos = 0;
    let sinSenal = 0;

    const ahora = Date.now();

    const unidades = camiones.map((c) => {
      const cId = String(c._id || c.id || "");
      const tele =
        telemetriaPorCamion[cId] ||
        (c.imei ? telemetriaPorCamion[c.imei] : null) ||
        (c.matricula ? telemetriaPorCamion[c.matricula] : null);

      const velocidad = tele?.velocidad_kmh ?? c.ultima_velocidad_kmh ?? 0;
      const rumbo = tele?.rumbo_grados ?? c.rumbo_grados ?? 0;
      const fechaReporte = tele?.timestamp
        ? new Date(tele.timestamp)
        : c.ultima_actualizacion_gps
        ? new Date(c.ultima_actualizacion_gps)
        : null;

      const diffMs = fechaReporte ? ahora - fechaReporte.getTime() : Infinity;
      const estado: "online" | "detenido" | "offline" =
        diffMs > 180000
          ? "offline"
          : velocidad > 1
          ? "online"
          : "detenido";

      if (estado === "online") online++;
      else if (estado === "detenido") detenidos++;
      else sinSenal++;

      return {
        ...c,
        cId,
        velocidadActual: velocidad,
        rumboActual: rumbo,
        fechaReporte,
        estadoConexion: estado,
      };
    });

    return {
      unidadesProcesadas: unidades,
      totalEnLinea: online,
      totalDetenidos: detenidos,
      totalSinSenal: sinSenal,
    };
  }, [camiones, telemetriaPorCamion]);

  // Filtrado de camiones en el panel lateral
  const camionesFiltrados = useMemo(() => {
    return unidadesProcesadas.filter((u) => {
      // Filtro por estado
      if (filtroEstado !== "todos" && u.estadoConexion !== filtroEstado) {
        return false;
      }

      // Filtro por búsqueda
      if (!busqueda.trim()) return true;
      const query = busqueda.toLowerCase().trim();
      const num = (u.numero_unidad || "").toLowerCase();
      const placa = (u.matricula || "").toLowerCase();
      const conductor = (
        u.conductor_asignado_id?.nombre_completo ||
        u.conductor_asignado?.nombre_completo ||
        ""
      ).toLowerCase();
      const imei = (u.imei || u.imei_gps || "").toLowerCase();

      return (
        num.includes(query) ||
        placa.includes(query) ||
        conductor.includes(query) ||
        imei.includes(query)
      );
    });
  }, [unidadesProcesadas, busqueda, filtroEstado]);

  const camionSeguido = unidadesProcesadas.find((u) => u.cId === camionSeguidoId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1720px] mx-auto font-sans">
      {/* Encabezado Principal y Resumen de Estado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                RASTREO DE FLOTA EN TIEMPO REAL
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest">
                  EN VIVO
                </span>
              </h1>
              <p className="text-xs text-zinc-400 font-mono">
                Telemetría satelital GPS // Gutiérrez Zamora, Veracruz
              </p>
            </div>
          </div>
        </div>

        {/* Insignia de Estado del WebSocket y Refresco */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono backdrop-blur transition-all ${
              estadoConexion === "conectado"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : estadoConexion === "reconectando"
                ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                : "bg-rose-950/60 border-rose-500/40 text-rose-300"
            }`}
          >
            {estadoConexion === "conectado" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>WS En Vivo: Conectado</span>
              </>
            ) : estadoConexion === "reconectando" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>Reconectando GPS...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>WS Desconectado</span>
              </>
            )}
          </div>

          <button
            onClick={reconectarManual}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono transition-colors active:scale-95"
            title="Reconectar WebSocket manualmente"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase">Total Unidades</span>
            <div className="text-xl font-bold text-white font-mono mt-0.5">
              {camiones.length}
            </div>
          </div>
          <Truck className="w-6 h-6 text-zinc-500" />
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase">En Ruta / Movimiento</span>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-0.5">
              {totalEnLinea}
            </div>
          </div>
          <Zap className="w-6 h-6 text-emerald-500" />
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase">Detenidos</span>
            <div className="text-xl font-bold text-amber-400 font-mono mt-0.5">
              {totalDetenidos}
            </div>
          </div>
          <Gauge className="w-6 h-6 text-amber-500" />
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-mono text-zinc-400 uppercase">Sin Señal / Offline</span>
            <div className="text-xl font-bold text-zinc-400 font-mono mt-0.5">
              {totalSinSenal}
            </div>
          </div>
          <WifiOff className="w-6 h-6 text-zinc-600" />
        </div>
      </div>

      {/* Cuadrícula Principal: Mapa en Vivo + Panel de Control */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Mapa Cartográfico Unificado (8 de 12 columnas en escritorio) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {cargando ? (
            <div className="w-full h-[650px] rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
              <span className="text-xs font-mono text-zinc-400">
                Sincronizando flota y rutas en mapa...
              </span>
            </div>
          ) : (
            <MapaMonitoreoFlota
              rutas={rutas}
              camiones={camiones}
              telemetriaEnVivo={telemetriaPorCamion}
              camionSeguidoId={camionSeguidoId}
              alSeleccionarCamion={(id) => fijar_camionSeguidoId(id)}
              mostrarRutas={mostrarRutas}
              alCambiarMostrarRutas={(m) => fijar_mostrarRutas(m)}
              alturaInicialPx={660}
            />
          )}

          {/* Barra de estado inferior del mapa */}
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>En ruta (&gt;1 km/h)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Detenido</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
                <span>Sin señal</span>
              </div>
            </div>

            <div>
              {ultimoTimestamp ? (
                <span>Último paquete GPS: {ultimoTimestamp.toLocaleTimeString()}</span>
              ) : (
                <span>Esperando telemetría...</span>
              )}
            </div>
          </div>
        </div>

        {/* Panel Lateral de Unidades de Flota (4 de 12 columnas en escritorio) */}
        <div className="lg:col-span-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 p-4 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Panel de Flota ({camionesFiltrados.length})
              </h2>
            </div>

            {camionSeguidoId && (
              <button
                onClick={() => fijar_camionSeguidoId(null)}
                className="text-[11px] font-mono text-blue-400 hover:text-blue-300 underline"
              >
                Ver todos
              </button>
            )}
          </div>

          {/* Buscador de Unidades */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar unidad, placa, conductor..."
              value={busqueda}
              onChange={(e) => fijar_busqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
            />
          </div>

          {/* Filtros de Estado */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono">
            {(["todos", "online", "detenido", "offline"] as const).map((estado) => (
              <button
                key={estado}
                onClick={() => fijar_filtroEstado(estado)}
                className={`flex-1 py-1.5 rounded-lg capitalize transition-colors ${
                  filtroEstado === estado
                    ? "bg-zinc-800 text-white font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {estado === "todos"
                  ? "Todos"
                  : estado === "online"
                  ? "En Ruta"
                  : estado === "detenido"
                  ? "Detenido"
                  : "Offline"}
              </button>
            ))}
          </div>

          {/* Lista Compacta de Camiones */}
          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {cargando ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                    <Skeleton height={20} className="mb-2" />
                    <Skeleton height={14} width="60%" />
                  </div>
                ))}
              </div>
            ) : camionesFiltrados.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-zinc-950/40 border border-zinc-800/60">
                <Truck className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-400 font-mono">
                  No se encontraron unidades con los filtros seleccionados.
                </p>
              </div>
            ) : (
              camionesFiltrados.map((camion) => {
                const esSeguido = camion.cId === camionSeguidoId;
                const conductorNombre =
                  camion.conductor_asignado_id?.nombre_completo ||
                  camion.conductor_asignado?.nombre_completo ||
                  "Sin conductor asignado";

                return (
                  <div
                    key={camion.cId}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      esSeguido
                        ? "bg-blue-950/40 border-blue-500/60 shadow-lg"
                        : "bg-zinc-950/60 hover:bg-zinc-900 border-zinc-800/80"
                    }`}
                    onClick={() => fijar_camionSeguidoId(esSeguido ? null : camion.cId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            camion.estadoConexion === "online"
                              ? "bg-emerald-400 animate-pulse"
                              : camion.estadoConexion === "detenido"
                              ? "bg-amber-400"
                              : "bg-zinc-600"
                          }`}
                        />
                        <span className="text-sm font-bold text-white font-mono uppercase">
                          {camion.numero_unidad || `Unidad ${camion.cId.slice(-4)}`}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {camion.matricula || "S/P"}
                        </span>
                      </div>

                      {/* Botón Seguir */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fijar_camionSeguidoId(esSeguido ? null : camion.cId);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-tight transition-all ${
                          esSeguido
                            ? "bg-blue-600 text-white shadow-md active:scale-95"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                        }`}
                      >
                        {esSeguido ? "Siguiendo" : "Seguir"}
                      </button>
                    </div>

                    {/* Información adicional del conductor y telemetría */}
                    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-zinc-500 block text-[9px]">CONDUCTOR</span>
                        <span className="text-zinc-300 truncate block">
                          {conductorNombre}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-zinc-500 block text-[9px]">VELOCIDAD</span>
                        <span
                          className={`font-bold ${
                            camion.velocidadActual > 0 ? "text-emerald-400" : "text-zinc-400"
                          }`}
                        >
                          {camion.velocidadActual} km/h
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>IMEI: {camion.imei || camion.imei_gps || "No vinculado"}</span>
                      <span>
                        {camion.fechaReporte
                          ? camion.fechaReporte.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "Sin telemetría"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
