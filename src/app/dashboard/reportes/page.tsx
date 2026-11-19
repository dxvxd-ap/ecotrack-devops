"use client";

import { useState, useEffect, useMemo } from "react";
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
  Radio,
  Phone,
} from "lucide-react";

interface Reporte {
  _id: string;
  origen: "ciudadano" | "conductor";
  tipo: string;
  titulo: string;
  descripcion: string;
  rutaId?: {
    _id: string;
    nombre: string;
    id_ruta: string;
    color_mapa?: string;
  } | null;
  camionId?: {
    _id: string;
    numero_unidad: string;
    modelo: string;
    matricula: string;
    estado: string;
  } | null;
  ubicacion: {
    lat: number;
    lng: number;
    direccion?: string;
  };
  prioridad: "baja" | "media" | "alta" | "critica";
  estado: "pendiente" | "en_proceso" | "resuelto";
  reportadoPor?: {
    nombre?: string;
    contacto?: string;
    usuarioId?: string;
  };
  notasAdmin?: string;
  createdAt: string;
  updatedAt: string;
}

export default function PaginaGestionReportes() {
  const [reportes, fijarReportes] = useState<Reporte[]>([]);
  const [cargando, fijarCargando] = useState(true);

  // Filtros
  const [pestanaActiva, fijarPestanaActiva] = useState<"todos" | "conductores" | "ciudadanos">("todos");
  const [filtroEstado, fijarFiltroEstado] = useState<string>("todos");
  const [busqueda, fijarBusqueda] = useState<string>("");

  // Modal de resolución / gestión
  const [reporteSeleccionado, fijarReporteSeleccionado] = useState<Reporte | null>(null);
  const [nuevoEstado, fijarNuevoEstado] = useState<"pendiente" | "en_proceso" | "resuelto">("en_proceso");
  const [notasResolucion, fijarNotasResolucion] = useState<string>("");
  const [guardando, fijarGuardando] = useState(false);

  // Cargar reportes desde la API
  const cargarReportes = async () => {
    try {
      fijarCargando(true);
      const res = await fetch("/api/reportes?limite=100");
      const data = await res.json();
      if (data.exito) {
        fijarReportes(data.datos || []);
      }
    } catch (e) {
      console.error("Error al cargar reportes:", e);
    } finally {
      fijarCargando(false);
    }
  };

  useEffect(() => {
    cargarReportes();
  }, []);

  // Métricas calculadas para las tarjetas superiores
  const metricas = useMemo(() => {
    const pendientes = reportes.filter((r) => r.estado === "pendiente").length;
    const criticosConductores = reportes.filter(
      (r) =>
        r.origen === "conductor" &&
        (r.prioridad === "critica" || r.prioridad === "alta") &&
        r.estado !== "resuelto"
    ).length;

    const hoyStr = new Date().toISOString().split("T")[0];
    const ciudadanosHoy = reportes.filter(
      (r) => r.origen === "ciudadano" && r.createdAt.startsWith(hoyStr)
    ).length;

    return { pendientes, criticosConductores, ciudadanosHoy };
  }, [reportes]);

  // Filtrado de la lista
  const reportesFiltrados = useMemo(() => {
    return reportes.filter((r) => {
      // Filtro por pestaña de origen
      if (pestanaActiva === "conductores" && r.origen !== "conductor") return false;
      if (pestanaActiva === "ciudadanos" && r.origen !== "ciudadano") return false;

      // Filtro por estado
      if (filtroEstado !== "todos" && r.estado !== filtroEstado) return false;

      // Filtro por búsqueda textual
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const texto = `${r.titulo} ${r.descripcion} ${r.tipo} ${r.reportadoPor?.nombre || ""} ${
          r.rutaId?.nombre || ""
        } ${r.camionId?.numero_unidad || ""}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [reportes, pestanaActiva, filtroEstado, busqueda]);

  // Abrir modal de gestión
  const abrirModalGestion = (reporte: Reporte) => {
    fijarReporteSeleccionado(reporte);
    fijarNuevoEstado(reporte.estado === "pendiente" ? "en_proceso" : reporte.estado);
    fijarNotasResolucion(reporte.notasAdmin || "");
  };

  // Guardar cambios en el reporte
  const guardarGestionReporte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reporteSeleccionado) return;

    try {
      fijarGuardando(true);
      const res = await fetch(`/api/reportes/${reporteSeleccionado._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: nuevoEstado,
          notasAdmin: notasResolucion,
        }),
      });

      const data = await res.json();
      if (data.exito) {
        fijarReporteSeleccionado(null);
        await cargarReportes();
      } else {
        alert(data.mensaje || "Error al actualizar el reporte.");
      }
    } catch (e) {
      alert("Error de red al actualizar reporte.");
    } finally {
      fijarGuardando(false);
    }
  };

  const formatearTipo = (tipo: string) => {
    const mapaTipos: Record<string, string> = {
      no_paso_camion: "No pasó el camión",
      retraso: "Retraso en recolección",
      basura_acumulada: "Basura acumulada en esquina",
      falla_mecanica: "Falla mecánica de unidad",
      incidente_vial: "Incidente vial / Choque",
      calle_bloqueada: "Calle cerrada u obstruida",
      unidad_llena: "Capacidad de tolva al 100%",
      otro: "Otro incidente",
    };
    return mapaTipos[tipo] || tipo.replace(/_/g, " ");
  };

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-rose-400 mb-1">
            <AlertOctagon className="w-3.5 h-3.5 animate-pulse" />
            <span>MÓDULO DE ATENCIÓN OPERATIVA // INCIDENCIAS Y CIUDADANÍA</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            GESTIÓN DE REPORTES E INCIDENTES
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Supervisión y resolución de fallas reportadas por conductores y reportes vecinales en tiempo real.
          </p>
        </div>

        <button
          onClick={cargarReportes}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded-lg border border-zinc-700 transition-colors self-start md:self-auto"
        >
          <Radio className="w-3.5 h-3.5 text-blue-400" />
          <span>Actualizar Lista</span>
        </button>
      </div>

      {/* Tarjetas de Resumen Superior */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Métrica 1: Pendientes */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              REPORTES PENDIENTES
            </span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="texto-anton text-3xl text-white flex items-center">
            {cargando ? (
              <Skeleton width={60} height={32} containerClassName="flex-1" />
            ) : (
              <span className={metricas.pendientes > 0 ? "text-amber-400" : "text-white"}>
                {metricas.pendientes}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Requieren atención o asignación
          </p>
        </div>

        {/* Métrica 2: Críticos Conductores */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              INCIDENTES CRÍTICOS EN FLOTA
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="texto-anton text-3xl text-white flex items-center">
            {cargando ? (
              <Skeleton width={60} height={32} containerClassName="flex-1" />
            ) : (
              <span className={metricas.criticosConductores > 0 ? "text-rose-400" : "text-white"}>
                {metricas.criticosConductores}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Fallas mecánicas o vías bloqueadas
          </p>
        </div>

        {/* Métrica 3: Ciudadanos Hoy */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              AVISOS CIUDADANOS (HOY)
            </span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="texto-anton text-3xl text-white flex items-center">
            {cargando ? (
              <Skeleton width={60} height={32} containerClassName="flex-1" />
            ) : (
              metricas.ciudadanosHoy
            )}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Reportes generados desde la app móvil
          </p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Pestañas de Origen */}
        <div className="flex items-center p-1 bg-zinc-800/80 rounded-xl border border-zinc-700/60 text-xs font-mono">
          <button
            onClick={() => fijarPestanaActiva("todos")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              pestanaActiva === "todos"
                ? "bg-zinc-700 text-white font-bold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Todos ({reportes.length})
          </button>
          <button
            onClick={() => fijarPestanaActiva("conductores")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              pestanaActiva === "conductores"
                ? "bg-amber-600/90 text-white font-bold shadow-sm"
                : "text-zinc-400 hover:text-amber-400"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Conductores ({reportes.filter((r) => r.origen === "conductor").length})</span>
          </button>
          <button
            onClick={() => fijarPestanaActiva("ciudadanos")}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              pestanaActiva === "ciudadanos"
                ? "bg-blue-600/90 text-white font-bold shadow-sm"
                : "text-zinc-400 hover:text-blue-400"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Ciudadanos ({reportes.filter((r) => r.origen === "ciudadano").length})</span>
          </button>
        </div>

        {/* Filtro de Estado y Caja de Búsqueda */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={filtroEstado}
              onChange={(e) => fijarFiltroEstado(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="resuelto">Resuelto</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => fijarBusqueda(e.target.value)}
              placeholder="Buscar por título, ruta..."
              className="bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Lista de Reportes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span>REPORTES REGISTRADOS ({reportesFiltrados.length})</span>
          </h2>
        </div>

        {cargando ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-5 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <Skeleton width={120} height={18} borderRadius={6} />
                  <Skeleton width={80} height={18} borderRadius={6} />
                </div>
                <Skeleton width="50%" height={16} />
                <Skeleton width="85%" height={12} />
                <div className="pt-2 border-t border-zinc-700/40 flex justify-between">
                  <Skeleton width={100} height={12} />
                  <Skeleton width={90} height={24} borderRadius={6} />
                </div>
              </div>
            ))}
          </div>
        ) : reportesFiltrados.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl space-y-1">
            <p>No se encontraron reportes con los filtros seleccionados.</p>
            <p className="text-[11px] text-zinc-600">
              Los nuevos reportes de conductores o ciudadanos aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reportesFiltrados.map((rep) => {
              const esConductor = rep.origen === "conductor";
              const esCritico =
                rep.prioridad === "critica" || (esConductor && rep.tipo === "falla_mecanica");

              return (
                <div
                  key={rep._id}
                  className={`p-5 rounded-xl border transition-all text-xs space-y-3.5 ${
                    esCritico && rep.estado !== "resuelto"
                      ? "bg-rose-950/20 border-rose-800/50 shadow-md"
                      : esConductor
                      ? "bg-amber-950/15 border-amber-800/40"
                      : "bg-zinc-800/50 border-zinc-700/60"
                  }`}
                >
                  {/* Encabezado de la Tarjeta */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* Badge de Origen */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border ${
                          esConductor
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        }`}
                      >
                        {esConductor ? <Truck className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                        <span>{esConductor ? "CONDUCTOR" : "CIUDADANO"}</span>
                      </span>

                      {/* Tipo de Reporte */}
                      <span className="font-mono text-zinc-300 font-semibold text-[11px]">
                        {formatearTipo(rep.tipo)}
                      </span>

                      {/* Prioridad */}
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                          rep.prioridad === "critica"
                            ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                            : rep.prioridad === "alta"
                            ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                            : rep.prioridad === "media"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-zinc-700/20 text-zinc-400 border-zinc-700/40"
                        }`}
                      >
                        {rep.prioridad}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Estado */}
                      <span
                        className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase border ${
                          rep.estado === "resuelto"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : rep.estado === "en_proceso"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {rep.estado === "en_proceso" ? "En Proceso" : rep.estado}
                      </span>

                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Título y Descripción */}
                  <div className="space-y-1">
                    <h3 className="text-white text-sm font-semibold tracking-wide">
                      {rep.titulo}
                    </h3>
                    <p className="text-zinc-300 text-xs leading-relaxed">
                      {rep.descripcion}
                    </p>
                  </div>

                  {/* Metadatos: Ruta, Camión, Ubicación y Reportante */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-zinc-700/40 text-[11px] font-mono text-zinc-400">
                    {rep.rutaId ? (
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: rep.rutaId.color_mapa || "#2f63ff" }}
                        />
                        <span className="text-white font-semibold truncate">
                          {rep.rutaId.nombre}
                        </span>
                      </div>
                    ) : (
                      <div className="text-zinc-500 italic">Sin ruta específica</div>
                    )}

                    {rep.camionId ? (
                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <Truck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>
                          Unidad {rep.camionId.numero_unidad} ({rep.camionId.matricula})
                        </span>
                      </div>
                    ) : (
                      <div className="text-zinc-500 italic">Sin camión asignado</div>
                    )}

                    {rep.ubicacion && (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <a
                          href={`https://www.google.com/maps?q=${rep.ubicacion.lat},${rep.ubicacion.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline flex items-center gap-1 truncate"
                          title="Abrir ubicación en el mapa"
                        >
                          <span>{rep.ubicacion.direccion || `${rep.ubicacion.lat.toFixed(4)}, ${rep.ubicacion.lng.toFixed(4)}`}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    )}

                    {rep.reportadoPor?.nombre && (
                      <div className="flex items-center gap-1.5 text-zinc-300 truncate">
                        <UserCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="truncate">
                          {rep.reportadoPor.nombre}
                          {rep.reportadoPor.contacto ? ` (${rep.reportadoPor.contacto})` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Nota de Resolución Administrativa (si existe) */}
                  {rep.notasAdmin && (
                    <div className="p-2.5 bg-zinc-900/80 rounded-lg border border-zinc-700/60 text-[11px] space-y-0.5">
                      <span className="font-mono text-zinc-400 uppercase text-[9px] font-bold block">
                        Nota de Seguimiento / Resolución:
                      </span>
                      <p className="text-zinc-200">{rep.notasAdmin}</p>
                    </div>
                  )}

                  {/* Barra de Acciones */}
                  <div className="pt-2 border-t border-zinc-700/50 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => abrirModalGestion(rep)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-mono font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Gestionar Estado</span>
                    </button>

                    {/* Atajo Inteligente para Conductores con Incidentes */}
                    {(esConductor || rep.tipo === "falla_mecanica" || rep.tipo === "incidente_vial") && (
                      <Link
                        href={`/dashboard/alertas?motivo=${
                          rep.tipo === "falla_mecanica" ? "falla_camion" : "retraso"
                        }&rutaId=${rep.rutaId?._id || ""}&titulo=${encodeURIComponent(
                          `Aviso en ruta ${rep.rutaId?.nombre || ""}: ${rep.titulo}`
                        )}&mensaje=${encodeURIComponent(
                          `Se informa a los ciudadanos de este sector que la unidad presenta un retraso debido a: ${rep.descripcion}. Nuestro equipo ya trabaja para atender la recolección.`
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-lg text-xs font-mono font-semibold border border-amber-500/30 transition-colors"
                        title="Crear y precargar una notificación push para los ciudadanos de esta ruta"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Alerta a Ciudadanos de Esta Ruta ↗</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Gestión de Estado y Resolución */}
      {reporteSeleccionado && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="texto-anton text-xl tracking-wide text-white">
                  GESTIONAR REPORTE // RESOLUCIÓN
                </h3>
                <p className="text-[11px] font-mono text-zinc-400">
                  ID: {reporteSeleccionado._id}
                </p>
              </div>
              <button
                onClick={() => fijarReporteSeleccionado(null)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={guardarGestionReporte} className="space-y-4 text-xs font-sans">
              <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/50 space-y-1">
                <span className="font-semibold text-white block">
                  {reporteSeleccionado.titulo}
                </span>
                <p className="text-zinc-300 text-[11px]">
                  {reporteSeleccionado.descripcion}
                </p>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  ESTADO DEL REPORTE
                </label>
                <select
                  value={nuevoEstado}
                  onChange={(e) =>
                    fijarNuevoEstado(e.target.value as "pendiente" | "en_proceso" | "resuelto")
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value="pendiente">Pendiente (Sin iniciar)</option>
                  <option value="en_proceso">En Proceso (Cuadrilla o soporte asignado)</option>
                  <option value="resuelto">Resuelto (Atendido y finalizado)</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOTAS DE RESOLUCIÓN O SEGUIMIENTO
                </label>
                <textarea
                  value={notasResolucion}
                  onChange={(e) => fijarNotasResolucion(e.target.value)}
                  rows={3}
                  placeholder="Ej: Se envió unidad de apoyo para concluir el tramo restante. Taller mecánico informó cambio de refacción..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fijarReporteSeleccionado(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-mono text-xs font-semibold uppercase transition-colors"
                >
                  {guardando ? "Guardando..." : "Guardar Resolución"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
