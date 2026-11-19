"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import {
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Users,
  Truck,
  MapPin,
  ExternalLink,
  Send,
  Filter,
  Search,
  MessageSquare,
  X,
  FileText,
  UserCheck,
  Phone,
  Mail,
  RefreshCw,
  Eye,
  Check,
  Camera,
} from "lucide-react";

// Sanitiza URLs de fotografías para descartar protocolos locales inseguros como file:///
function sanitizarUrlFotografia(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^file:\/\//i.test(trimmed) || /^file:/i.test(trimmed)) {
    return "";
  }
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return "";
}

interface ItemIncidencia {
  _id: string;
  folio?: string;
  origen: "ciudadano" | "conductor";
  tipo: string;
  titulo?: string;
  descripcion: string;
  ciudadano_nombre?: string;
  ciudadano_telefono?: string;
  ciudadano_email?: string;
  domicilio_referencia?: string;
  fotografia_url?: string;
  rutaId?: any;
  ruta_id?: string | null;
  camionId?: any;
  camion_asignado_id?: any;
  ubicacion: {
    lat: number;
    lng: number;
    direccion?: string;
  };
  prioridad?: "baja" | "media" | "alta" | "critica";
  estado: string; // PENDIENTE | EN_REVISION | ATENDIDO | RECHAZADO | pendiente | en_proceso | resuelto
  solucion_notas?: string;
  notasAdmin?: string;
  reportadoPor?: {
    nombre?: string;
    contacto?: string;
    usuarioId?: string;
  };
  fecha_reporte?: string;
  createdAt: string;
  updatedAt?: string;
}

interface MetricasResumen {
  ciudadanos: {
    pendientes: number;
    en_proceso: number;
    resueltos: number;
    hoy: number;
    total: number;
  };
  conductores: {
    pendientes: number;
    en_proceso: number;
    resueltos: number;
    criticos: number;
    hoy: number;
    total: number;
  };
  global: {
    pendientesTotal: number;
    criticosOperativos: number;
    actividadHoy: number;
    totalHistorico: number;
  };
}

export default function PaginaGestionReportes() {
  // Pestaña principal: "ciudadanos" o "conductores"
  const [pestanaActiva, fijarPestanaActiva] = useState<"ciudadanos" | "conductores">("ciudadanos");

  // Listados de datos
  const [reclamosCiudadanos, fijarReclamosCiudadanos] = useState<ItemIncidencia[]>([]);
  const [reportesConductores, fijarReportesConductores] = useState<ItemIncidencia[]>([]);
  const [metricas, fijarMetricas] = useState<MetricasResumen | null>(null);

  const [cargando, fijarCargando] = useState(true);
  const [recargando, fijarRecargando] = useState(false);
  const [errorCarga, fijarErrorCarga] = useState<string | null>(null);

  // Filtros
  const [filtroEstado, fijarFiltroEstado] = useState<string>("todos");
  const [busqueda, fijarBusqueda] = useState<string>("");

  // Modal de resolución / gestión
  const [itemSeleccionado, fijarItemSeleccionado] = useState<ItemIncidencia | null>(null);
  const [nuevoEstado, fijarNuevoEstado] = useState<string>("en_proceso");
  const [notasResolucion, fijarNotasResolucion] = useState<string>("");
  const [guardando, fijarGuardando] = useState(false);
  const [mensajeExito, fijarMensajeExito] = useState<string>("");

  // Cargar datos en paralelo desde las colecciones con degradación independiente (Promise.allSettled)
  const cargarTodo = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) fijarCargando(true);
      else fijarRecargando(true);
      fijarErrorCarga(null);

      const [pReclamos, pReportes, pResumen] = await Promise.allSettled([
        fetch("/api/reclamos?limite=100", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.exito === false || data.ok === false) {
            throw new Error(data.mensaje || `Error HTTP ${r.status}`);
          }
          return data;
        }),
        fetch("/api/reportes?origen=conductor&limite=100", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.exito === false || data.ok === false) {
            throw new Error(data.mensaje || `Error HTTP ${r.status}`);
          }
          return data;
        }),
        fetch("/api/reportes/resumen", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache" },
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok || data.exito === false || data.ok === false) {
            throw new Error(data.mensaje || `Error HTTP ${r.status}`);
          }
          return data;
        }),
      ]);

      const avisos: string[] = [];

      // Procesar Reclamos Ciudadanos independientemente
      if (pReclamos.status === "fulfilled") {
        fijarReclamosCiudadanos(pReclamos.value.datos || []);
      } else {
        console.warn("[Reportes] Error al obtener reclamos:", pReclamos.reason);
        avisos.push(`Reclamos ciudadanos: ${pReclamos.reason?.message || "Servicio temporalmente inaccesible"}`);
      }

      // Procesar Reportes de Conductores independientemente
      if (pReportes.status === "fulfilled") {
        fijarReportesConductores(pReportes.value.datos || []);
      } else {
        console.warn("[Reportes] Error al obtener reportes:", pReportes.reason);
        avisos.push(`Reportes operativos: ${pReportes.reason?.message || "Servicio temporalmente inaccesible"}`);
      }

      // Procesar Métricas de Resumen independientemente
      if (pResumen.status === "fulfilled") {
        fijarMetricas(pResumen.value.datos);
      }

      if (avisos.length > 0) {
        fijarErrorCarga(`Aviso del sistema: ${avisos.join(" | ")}`);
      }
    } catch (e: any) {
      console.error("[Reportes] Error inesperado:", e);
      fijarErrorCarga("No se pudo conectar con el servidor de reportes.");
    } finally {
      fijarCargando(false);
      fijarRecargando(false);
    }
  }, []);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // Lista activa según la pestaña
  const itemsActivos = useMemo(() => {
    return pestanaActiva === "ciudadanos" ? reclamosCiudadanos : reportesConductores;
  }, [pestanaActiva, reclamosCiudadanos, reportesConductores]);

  // Normalizador de estado para filtrado y badges
  const normalizarEstado = (estadoRaw?: string) => {
    const s = String(estadoRaw || "").toUpperCase();
    if (s === "PENDIENTE") return "pendiente";
    if (s === "EN_REVISION" || s === "EN_PROCESO") return "en_proceso";
    if (s === "ATENDIDO" || s === "RESUELTO") return "resuelto";
    if (s === "RECHAZADO") return "rechazado";
    return s.toLowerCase();
  };

  // Filtrado de la lista activa
  const itemsFiltrados = useMemo(() => {
    return itemsActivos.filter((item) => {
      // Filtro por estado
      if (filtroEstado !== "todos") {
        const estadoNorm = normalizarEstado(item.estado);
        if (estadoNorm !== filtroEstado) return false;
      }

      // Filtro por búsqueda textual
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const texto = `${item.folio || ""} ${item.titulo || ""} ${item.descripcion || ""} ${item.tipo || ""} ${
          item.ciudadano_nombre || item.reportadoPor?.nombre || ""
        } ${item.domicilio_referencia || ""} ${item.camionId?.numero_unidad || item.camion_asignado_id?.numero_unidad || ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [itemsActivos, filtroEstado, busqueda]);

  // Abrir modal de gestión
  const abrirModalGestion = (item: ItemIncidencia) => {
    fijarItemSeleccionado(item);
    const est = normalizarEstado(item.estado);
    fijarNuevoEstado(est === "pendiente" ? "en_proceso" : est);
    fijarNotasResolucion(item.notasAdmin || item.solucion_notas || "");
  };

  // Guardar cambios en el reporte o reclamo
  const guardarGestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemSeleccionado) return;

    try {
      fijarGuardando(true);
      fijarMensajeExito("");

      const esCiudadano = itemSeleccionado.origen === "ciudadano";
      const url = esCiudadano
        ? `/api/reclamos/${itemSeleccionado._id}`
        : `/api/reportes/${itemSeleccionado._id}`;

      // Payload adaptado al modelo correspondiente
      const payload = esCiudadano
        ? {
            estado: nuevoEstado === "resuelto" ? "ATENDIDO" : nuevoEstado === "en_proceso" ? "EN_REVISION" : "PENDIENTE",
            solucion_notas: notasResolucion,
          }
        : {
            estado: nuevoEstado,
            notasAdmin: notasResolucion,
          };

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.exito) {
        fijarMensajeExito("¡Registro actualizado exitosamente!");
        setTimeout(() => {
          fijarItemSeleccionado(null);
          fijarMensajeExito("");
          cargarTodo(true);
        }, 1200);
      } else {
        alert(data.mensaje || "Error al actualizar");
      }
    } catch (err) {
      alert("Error al comunicarse con el servidor.");
    } finally {
      fijarGuardando(false);
    }
  };

  // Traducción amigable de tipo de incidencia
  const obtenerEtiquetaTipo = (tipo: string, origen: "ciudadano" | "conductor") => {
    if (origen === "ciudadano") {
      switch (tipo.toUpperCase()) {
        case "CAMION_NO_PASO":
          return { texto: "El camión no pasó", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
        case "HORARIO_IRREGULAR":
          return { texto: "Horario irregular / Retraso", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
        case "BASURA_TIRADA":
          return { texto: "Basura acumulada / tirada", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" };
        case "MALA_ATENCION":
          return { texto: "Atención del personal", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
        default:
          return { texto: tipo, color: "bg-zinc-800 text-zinc-300 border-zinc-700" };
      }
    } else {
      switch (tipo.toLowerCase()) {
        case "falla_mecanica":
          return { texto: "Falla mecánica", color: "bg-rose-600/30 text-rose-300 border-rose-500/40" };
        case "calle_bloqueada":
          return { texto: "Calle bloqueada / Obstrucción", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
        case "unidad_llena":
          return { texto: "Tolva llena (100%)", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" };
        case "incidente_vial":
          return { texto: "Incidente vial / Tráfico", color: "bg-red-500/20 text-red-300 border-red-500/30" };
        default:
          return { texto: tipo, color: "bg-zinc-800 text-zinc-300 border-zinc-700" };
      }
    }
  };

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>CENTRO DE CONTROL // INCIDENCIAS Y ATENCIÓN CIUDADANA</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            GESTIÓN DE REPORTES Y RECLAMOS
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Monitoreo en tiempo real de reclamos vecinales y reportes operativos emitidos desde las unidades.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => cargarTodo(true)}
            disabled={recargando}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recargando ? "animate-spin text-blue-400" : ""}`} />
            <span>Actualizar</span>
          </button>

          <Link
            href="/dashboard/alertas"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Emitir Alerta Push</span>
          </Link>
        </div>
      </div>

      {/* Alerta de error en carga si ocurriese */}
      {errorCarga && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-mono flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorCarga}</span>
          </div>
          <button
            type="button"
            onClick={() => fijarErrorCarga(null)}
            className="text-zinc-400 hover:text-white p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tarjetas Superiores de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tarjeta 1: Reclamos Ciudadanos Pendientes */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Reclamos Ciudadanos
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            {cargando ? (
              <Skeleton width={60} height={32} />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-white">
                  {metricas?.ciudadanos.pendientes ?? 0}
                </span>
                <span className="text-xs text-amber-400 font-mono">pendientes</span>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              Total histórico: {metricas?.ciudadanos.total ?? reclamosCiudadanos.length}
            </p>
          </div>
        </div>

        {/* Tarjeta 2: Incidentes Críticos de Conductores */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Incidentes Críticos Cabina
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            {cargando ? (
              <Skeleton width={60} height={32} />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-rose-400">
                  {metricas?.conductores.criticos ?? 0}
                </span>
                <span className="text-xs text-rose-300 font-mono">alta / crítica</span>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              Fallas mecánicas o calles bloqueadas
            </p>
          </div>
        </div>

        {/* Tarjeta 3: Actividad de Hoy */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Incidencias Hoy
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            {cargando ? (
              <Skeleton width={60} height={32} />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-white">
                  {metricas?.global.actividadHoy ?? 0}
                </span>
                <span className="text-xs text-blue-400 font-mono">registradas</span>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              Vecinos: {metricas?.ciudadanos.hoy ?? 0} · Choferes: {metricas?.conductores.hoy ?? 0}
            </p>
          </div>
        </div>

        {/* Tarjeta 4: Resueltos / Atendidos */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
              Tasa de Resolución
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            {cargando ? (
              <Skeleton width={60} height={32} />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-emerald-400">
                  {(metricas?.ciudadanos.resueltos ?? 0) + (metricas?.conductores.resueltos ?? 0)}
                </span>
                <span className="text-xs text-emerald-300 font-mono">atendidos</span>
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              Atención municipal efectiva
            </p>
          </div>
        </div>
      </div>

      {/* Pestañas Principales y Barra de Filtros */}
      <div className="space-y-4">
        {/* Selector de Pestañas con Contadores */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fijarPestanaActiva("ciudadanos");
                fijarFiltroEstado("todos");
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                pestanaActiva === "ciudadanos"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 border border-blue-500"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Reclamos Ciudadanos</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  pestanaActiva === "ciudadanos"
                    ? "bg-blue-800 text-blue-100"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {reclamosCiudadanos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                fijarPestanaActiva("conductores");
                fijarFiltroEstado("todos");
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                pestanaActiva === "conductores"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20 border border-amber-500"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Reportes de Conductores / Operativos</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                  pestanaActiva === "conductores"
                    ? "bg-amber-800 text-amber-100"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {reportesConductores.length}
              </span>
            </button>
          </div>

          {/* Filtro de Estado Rápido */}
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
            {[
              { id: "todos", etiqueta: "Todos" },
              { id: "pendiente", etiqueta: "Pendientes" },
              { id: "en_proceso", etiqueta: "En proceso" },
              { id: "resuelto", etiqueta: "Resueltos" },
            ].map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => fijarFiltroEstado(op.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] transition-colors ${
                  filtroEstado === op.id
                    ? "bg-zinc-800 text-white font-bold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {op.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => fijarBusqueda(e.target.value)}
            placeholder={`Buscar por folio, ${
              pestanaActiva === "ciudadanos" ? "nombre del vecino, domicilio o descripción" : "unidad de camión, falla o descripción"
            }...`}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 font-sans focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Lista Principal de Registros */}
      <div className="space-y-3">
        {cargando ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton width={90} height={20} borderRadius={6} />
                    <Skeleton width={180} height={20} borderRadius={6} containerClassName="flex-1" />
                  </div>
                  <Skeleton width={80} height={24} borderRadius={8} />
                </div>
                <Skeleton width="90%" height={14} />
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                  <Skeleton width={120} height={12} />
                  <Skeleton width={140} height={28} borderRadius={8} />
                </div>
              </div>
            ))}
          </div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="py-16 text-center bg-zinc-900 border border-dashed border-zinc-800 rounded-2xl space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 text-zinc-500 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-zinc-400 text-xs font-mono">
              No se encontraron {pestanaActiva === "ciudadanos" ? "reclamos ciudadanos" : "reportes de conductores"} con los filtros actuales.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {itemsFiltrados.map((item) => {
              const estadoNorm = normalizarEstado(item.estado);
              const infoTipo = obtenerEtiquetaTipo(item.tipo, item.origen);
              const coords = item.ubicacion;

              return (
                <div
                  key={item._id}
                  className="p-5 bg-zinc-900 hover:bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl shadow-md transition-all space-y-3.5"
                >
                  {/* Encabezado de la Fila */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* Folio */}
                      <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-white font-mono text-[11px] font-bold border border-zinc-700">
                        {item.folio || `ID-${item._id.slice(-6).toUpperCase()}`}
                      </span>

                      {/* Badge Tipo de Incidencia */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${infoTipo.color}`}>
                        {infoTipo.texto}
                      </span>

                      {/* Prioridad en caso de conductor */}
                      {item.origen === "conductor" && item.prioridad && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider ${
                            item.prioridad === "critica"
                              ? "bg-rose-600 text-white animate-pulse"
                              : item.prioridad === "alta"
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          Prioridad: {item.prioridad}
                        </span>
                      )}
                    </div>

                    {/* Estado Actual */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase ${
                          estadoNorm === "resuelto"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : estadoNorm === "en_proceso"
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        ● {estadoNorm.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Descripción y Contenido */}
                  <div className="space-y-1">
                    {item.titulo && item.titulo !== item.descripcion && (
                      <h3 className="text-white text-sm font-semibold">{item.titulo}</h3>
                    )}
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">{item.descripcion}</p>
                  </div>

                  {/* Datos del Ciudadano / Datos del Conductor y Camión */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-[11px] font-mono">
                    {item.origen === "ciudadano" ? (
                      <>
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">{item.ciudadano_nombre || "Ciudadano"}</span>
                        </div>
                        {item.ciudadano_telefono && (
                          <div className="flex items-center gap-2 text-zinc-300">
                            <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{item.ciudadano_telefono}</span>
                          </div>
                        )}
                        {item.domicilio_referencia && (
                          <div className="flex items-center gap-2 text-zinc-300 col-span-full">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{item.domicilio_referencia}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Truck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>
                            {item.camionId?.numero_unidad
                              ? `Unidad ${item.camionId.numero_unidad} (${item.camionId.matricula || "S/M"})`
                              : "Unidad operativa"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-300">
                          <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{item.reportadoPor?.nombre || "Conductor de turno"}</span>
                        </div>
                        {coords?.direccion && (
                          <div className="flex items-center gap-2 text-zinc-300 col-span-full">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{coords.direccion}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Notas de resolución existentes si las hay */}
                  {(item.notasAdmin || item.solucion_notas) && (
                    <div className="p-2.5 bg-blue-950/20 border border-blue-500/20 rounded-xl text-[11px] font-mono text-blue-200">
                      <strong className="text-blue-300 font-semibold block mb-0.5">Seguimiento / Notas:</strong>
                      <span>{item.notasAdmin || item.solucion_notas}</span>
                    </div>
                  )}

                  {/* Barra Inferior: Fecha y Acciones Rápidas */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80 text-[11px] font-mono">
                    <span className="text-zinc-500">
                      Fecha: {new Date(item.fecha_reporte || item.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Evidencia fotográfica sanitizada (descarta cualquier protocolo file://) */}
                      {item.origen === "ciudadano" && (
                        sanitizarUrlFotografia(item.fotografia_url) ? (
                          <a
                            href={sanitizarUrlFotografia(item.fotografia_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-blue-300 hover:text-white transition-colors border border-zinc-700"
                            title="Ver fotografía adjunta"
                          >
                            <Camera className="w-3 h-3 text-blue-400" />
                            <span>Ver foto</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-zinc-500 font-mono italic px-1">
                            Sin fotografía adjunta
                          </span>
                        )
                      )}

                      {/* Enlace al mapa de coordenadas */}
                      {coords?.lat && coords?.lng && (
                        <a
                          href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                          title="Ver ubicación GPS en Google Maps"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Ver en mapa</span>
                        </a>
                      )}

                      {/* Atajo Inteligente para Conductores: Alerta Push rápida */}
                      {item.origen === "conductor" && (
                        <Link
                          href={`/dashboard/alertas?motivo=${item.tipo}&rutaId=${item.rutaId?._id || item.rutaId || ""}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white font-semibold transition-colors shadow-sm"
                          title="Enviar alerta push inmediata a los vecinos de esta ruta"
                        >
                          <Send className="w-3 h-3" />
                          <span>Alertar a ciudadanos</span>
                        </Link>
                      )}

                      {/* Botón Gestionar / Cambiar Estado */}
                      <button
                        type="button"
                        onClick={() => abrirModalGestion(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors shadow-sm"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Gestionar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Resolución / Gestión */}
      {itemSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                  Gestión de {itemSeleccionado.origen === "ciudadano" ? "Reclamo Ciudadano" : "Reporte de Conductor"}
                </span>
                <h3 className="texto-anton text-lg tracking-wide text-white mt-0.5">
                  FOLIO: {itemSeleccionado.folio || itemSeleccionado._id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fijarItemSeleccionado(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {mensajeExito ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{mensajeExito}</span>
              </div>
            ) : (
              <form onSubmit={guardarGestion} className="space-y-4 text-xs font-sans">
                {/* Evidencia Fotográfica Sanitizada (rechaza protocolos locales como file://) */}
                {itemSeleccionado.origen === "ciudadano" && (
                  <div>
                    <label className="block text-zinc-400 font-mono mb-1 text-[10px] uppercase tracking-wider">
                      Evidencia Fotográfica
                    </label>
                    {sanitizarUrlFotografia(itemSeleccionado.fotografia_url) ? (
                      <div className="rounded-xl overflow-hidden border border-zinc-700 bg-zinc-950 p-2 space-y-2">
                        <img
                          src={sanitizarUrlFotografia(itemSeleccionado.fotografia_url)}
                          alt="Evidencia fotográfica adjunta al reclamo"
                          className="w-full max-h-48 object-cover rounded-lg border border-zinc-800"
                        />
                        <div className="flex justify-end">
                          <a
                            href={sanitizarUrlFotografia(itemSeleccionado.fotografia_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Abrir imagen original</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-500 italic">
                        Sin fotografía adjunta
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">CAMBIAR ESTADO</label>
                  <select
                    value={nuevoEstado}
                    onChange={(e) => fijarNuevoEstado(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="pendiente">Pendiente (Por atender)</option>
                    <option value="en_proceso">En proceso / En revisión</option>
                    <option value="resuelto">Resuelto / Atendido</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    NOTAS DE RESOLUCIÓN O SEGUIMIENTO
                  </label>
                  <textarea
                    value={notasResolucion}
                    onChange={(e) => fijarNotasResolucion(e.target.value)}
                    placeholder="Escribe las acciones realizadas, respuesta al ciudadano o seguimiento del camión..."
                    rows={4}
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => fijarItemSeleccionado(null)}
                    className="px-4 py-2.5 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{guardando ? "Guardando..." : "Guardar Cambios"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
