"use client";

import { useState, useEffect, useCallback } from "react";
import Skeleton from "react-loading-skeleton";
import { useAuth } from "@clerk/nextjs";
import { clienteFetch, extraerLista } from "@/lib/clienteHttp";
import {
  Calendar as IconoCalendario,
  Clock,
  Plus,
  Play,
  CheckCircle,
  Truck,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Info,
  CalendarCheck,
  Ban,
} from "lucide-react";

export default function PaginaCalendarioLogistica() {
  const { isLoaded } = useAuth();
  const [asignaciones, fijar_asignaciones] = useState<any[]>([]);
  const [camiones, fijar_camiones] = useState<any[]>([]);
  const [rutas, fijar_rutas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [modal_abierto, fijar_modal_abierto] = useState(false);
  const [guardando, fijar_guardando] = useState(false);

  // Fecha activa (por defecto hoy en formato YYYY-MM-DD)
  const fecha_hoy = new Date().toISOString().split("T")[0];
  const [fecha_activa, fijar_fecha_activa] = useState(fecha_hoy);

  // Formulario de excepción / asignación
  const [formulario, fijar_formulario] = useState({
    id_existente: "",
    ruta_id: "",
    fecha: fecha_hoy,
    camion_id: "",
    hora_entrada_aprox: "07:00",
    hora_salida_aprox: "13:00",
    es_anulacion: false,
    motivo_excepcion: "",
    notas: "",
  });

  const cargar_catalogos = async () => {
    try {
      const [res_cam, res_rut] = await Promise.allSettled([
        clienteFetch("/api/camiones"),
        clienteFetch("/api/rutas"),
      ]);

      if (res_cam.status === "fulfilled") {
        fijar_camiones(extraerLista(res_cam.value, "camiones"));
      }
      if (res_rut.status === "fulfilled") {
        fijar_rutas(extraerLista(res_rut.value, "rutas"));
      }
    } catch (e) {
      console.error("Error al cargar catálogos de logística:", e);
    }
  };

  const cargar_turnos_fecha = useCallback(async (fecha: string) => {
    try {
      fijar_cargando(true);
      const res = await clienteFetch(`/api/calendario?fecha=${fecha}`);
      fijar_asignaciones(extraerLista(res, "calendario"));
    } catch (e) {
      console.error("Error al cargar turnos para la fecha:", e);
    } finally {
      fijar_cargando(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    cargar_catalogos();
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    cargar_turnos_fecha(fecha_activa);
  }, [isLoaded, fecha_activa, cargar_turnos_fecha]);

  const cambiar_dia = (delta: number) => {
    const d = new Date(fecha_activa + "T12:00:00");
    d.setDate(d.getDate() + delta);
    fijar_fecha_activa(d.toISOString().split("T")[0]);
  };

  const formatear_fecha_legible = (f: string) => {
    try {
      const d = new Date(f + "T12:00:00");
      return d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return f;
    }
  };

  const abrir_modal_ajuste = (asig?: any) => {
    if (asig) {
      const rutaId = typeof asig.ruta_id === "object" ? asig.ruta_id?._id : asig.ruta_id;
      const camionId =
        typeof asig.camion_id === "object" && asig.camion_id?._id
          ? asig.camion_id._id
          : asig.camion_id || "";

      fijar_formulario({
        id_existente: asig._id?.startsWith("proy_") ? "" : asig._id,
        ruta_id: rutaId || "",
        fecha: fecha_activa,
        camion_id: camionId?.startsWith("camion_titular_") ? "" : camionId,
        hora_entrada_aprox: asig.hora_entrada_aprox || "07:00",
        hora_salida_aprox: asig.hora_salida_aprox || "13:00",
        es_anulacion: !!asig.es_anulacion,
        motivo_excepcion: asig.motivo_excepcion || "",
        notas: asig.notas || "",
      });
    } else {
      fijar_formulario({
        id_existente: "",
        ruta_id: rutas[0]?._id || "",
        fecha: fecha_activa,
        camion_id: camiones[0]?._id || "",
        hora_entrada_aprox: "07:00",
        hora_salida_aprox: "13:00",
        es_anulacion: false,
        motivo_excepcion: "",
        notas: "",
      });
    }
    fijar_modal_abierto(true);
  };

  const guardar_ajuste_o_excepcion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulario.ruta_id) {
      alert("Por favor selecciona una ruta.");
      return;
    }

    try {
      fijar_guardando(true);
      const res = await fetch("/api/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruta_id: formulario.ruta_id,
          fecha: formulario.fecha || fecha_activa,
          camion_id: formulario.es_anulacion ? null : formulario.camion_id || null,
          hora_entrada_aprox: formulario.hora_entrada_aprox,
          hora_salida_aprox: formulario.hora_salida_aprox,
          estado: formulario.es_anulacion ? "cancelado" : "programado",
          es_anulacion: formulario.es_anulacion,
          motivo_excepcion: formulario.motivo_excepcion,
          notas: formulario.notas,
          tipo_asignacion: "excepcion_dia",
        }),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_modal_abierto(false);
        cargar_turnos_fecha(fecha_activa);
      } else {
        alert(data.mensaje || "Error al guardar el ajuste");
      }
    } catch (e) {
      alert("Error de red al guardar");
    } finally {
      fijar_guardando(false);
    }
  };

  const restaurar_turno_oficial = async (id: string) => {
    if (
      !confirm(
        "¿Deseas eliminar la excepción registrada para este día y restaurar la proyección del turno oficial recurrente?"
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/calendario?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.exito) {
        cargar_turnos_fecha(fecha_activa);
      } else {
        alert(data.mensaje || "Error al restaurar");
      }
    } catch (e) {
      alert("Error de red al restaurar");
    }
  };

  const actualizar_estado_asignacion = async (
    id_asignacion: string,
    nuevo_estado: string,
    asig_completa?: any
  ) => {
    try {
      const res = await fetch("/api/calendario", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id_asignacion,
          estado: nuevo_estado,
          camion_id:
            typeof asig_completa?.camion_id === "object"
              ? asig_completa?.camion_id?._id
              : asig_completa?.camion_id,
        }),
      });
      const data = await res.json();
      if (data.exito) {
        cargar_turnos_fecha(fecha_activa);
      }
    } catch (e) {
      console.error("Error al actualizar estado:", e);
    }
  };

  // Métricas rápidas del día
  const turnos_oficiales = asignaciones.filter(
    (a) => a.tipo_asignacion === "base_recurrente" && !a.es_anulacion
  ).length;
  const turnos_excepciones = asignaciones.filter(
    (a) => a.tipo_asignacion === "excepcion_dia" && !a.es_anulacion
  ).length;
  const turnos_suspendidos = asignaciones.filter(
    (a) => a.es_anulacion || a.estado === "cancelado"
  ).length;

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1">
            <IconoCalendario className="w-3.5 h-3.5" />
            <span>MÓDULO DE LOGÍSTICA // CALENDARIO DE TURNOS INTELIGENTE</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            PLANIFICACIÓN AUTOMATIZADA Y EXCEPCIONES
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Turnos proyectados automáticamente según la programación de cada ruta, con soporte para
            excepciones y suspensiones de fecha.
          </p>
        </div>

        <button
          onClick={() => abrir_modal_ajuste()}
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Excepción o Turno Extra</span>
        </button>
      </div>

      {/* Selector y Navegación de Fecha */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => cambiar_dia(-1)}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
            title="Día anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <input
            type="date"
            value={fecha_activa}
            onChange={(e) => fijar_fecha_activa(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
          />

          <button
            onClick={() => cambiar_dia(1)}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
            title="Día siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => fijar_fecha_activa(fecha_hoy)}
            className="text-xs font-mono px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
          >
            Hoy
          </button>

          <span className="text-xs font-mono text-zinc-400 capitalize hidden sm:inline-block ml-2">
            ({formatear_fecha_legible(fecha_activa)})
          </span>
        </div>

        {/* Resumen de Métricas */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Sparkles className="w-3 h-3" />
            <span>Oficiales: {turnos_oficiales}</span>
          </span>
          {turnos_excepciones > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <AlertTriangle className="w-3 h-3" />
              <span>Ajustes: {turnos_excepciones}</span>
            </span>
          )}
          {turnos_suspendidos > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20">
              <Ban className="w-3 h-3" />
              <span>Suspendidos: {turnos_suspendidos}</span>
            </span>
          )}
        </div>
      </div>

      {/* Lista de Turnos y Proyecciones */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
            <span>TURNOS PROGRAMADOS // {fecha_activa}</span>
            <span className="text-xs font-mono font-normal text-zinc-400">
              ({asignaciones.length} {asignaciones.length === 1 ? "recorrido" : "recorridos"})
            </span>
          </h2>
        </div>

        {cargando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="p-5 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-3.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <Skeleton width={85} height={18} borderRadius={6} />
                  <Skeleton width={70} height={18} borderRadius={6} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton circle width={16} height={16} />
                    <Skeleton width="75%" height={14} containerClassName="flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton circle width={16} height={16} />
                    <Skeleton width="60%" height={14} containerClassName="flex-1" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton circle width={14} height={14} />
                    <Skeleton width="45%" height={12} containerClassName="flex-1" />
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-700/50">
                  <Skeleton height={32} borderRadius={8} />
                </div>
              </div>
            ))}
          </div>
        ) : asignaciones.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl space-y-2">
            <p>No hay recolección oficial programada para este día de la semana.</p>
            <p className="text-[11px] text-zinc-600">
              Puedes configurar los días de recolección en el Catálogo de Rutas o registrar un turno extra
              arriba.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {asignaciones.map((asig) => {
              const es_proyeccion = asig.tipo_asignacion === "base_recurrente";
              const es_excepcion = asig.tipo_asignacion === "excepcion_dia";
              const es_suspendido = asig.es_anulacion || asig.estado === "cancelado";

              return (
                <div
                  key={asig._id}
                  className={`p-5 rounded-xl space-y-3.5 text-xs transition-all border ${
                    es_suspendido
                      ? "bg-rose-950/15 border-rose-900/40 opacity-80"
                      : es_excepcion
                      ? "bg-amber-950/15 border-amber-800/40"
                      : "bg-zinc-800/60 border-zinc-700/60"
                  }`}
                >
                  {/* Encabezado de la tarjeta */}
                  <div className="flex items-center justify-between gap-2">
                    {es_suspendido ? (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        <span>RECORRIDO SUSPENDIDO</span>
                      </span>
                    ) : es_excepcion ? (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>EXCEPCIÓN DEL DÍA</span>
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>TURNO OFICIAL RECURRENTE</span>
                      </span>
                    )}

                    <span
                      className={`font-mono uppercase text-[10px] px-2 py-0.5 rounded border ${
                        asig.estado === "en_progreso"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse font-bold"
                          : asig.estado === "completado"
                          ? "bg-zinc-700/30 text-zinc-400 border-zinc-600/30"
                          : asig.estado === "cancelado"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      {asig.estado}
                    </span>
                  </div>

                  {/* Datos del Turno */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-white font-semibold">
                      <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div>{asig.ruta_id?.nombre || "Ruta No Definida"}</div>
                        <div className="text-[10px] font-mono font-normal text-zinc-400">
                          {asig.ruta_id?.id_ruta ? `ID: ${asig.ruta_id.id_ruta}` : ""}{" "}
                          {asig.ruta_id?.distancia_estimada_km
                            ? `• ${asig.ruta_id.distancia_estimada_km} km de calles`
                            : ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-zinc-300">
                      <Truck className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>
                        {asig.camion_id?.numero_unidad ? (
                          <>
                            <strong className="text-white">
                              Unidad {asig.camion_id.numero_unidad}
                            </strong>{" "}
                            • {asig.camion_id.modelo || ""} ({asig.camion_id.matricula || "S/M"})
                          </>
                        ) : (
                          <span className="text-zinc-400 italic">
                            Sin camión asignado (rotativo)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {asig.hora_entrada_aprox} - {asig.hora_salida_aprox} hrs
                      </span>
                    </div>
                  </div>

                  {/* Motivo de Excepción / Suspensión */}
                  {asig.motivo_excepcion && (
                    <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-300 text-[11px] flex items-start gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <span className="font-semibold block font-mono text-[10px] uppercase text-amber-400">
                          Motivo del Ajuste:
                        </span>
                        <span>{asig.motivo_excepcion}</span>
                      </div>
                    </div>
                  )}

                  {asig.notas && (
                    <p className="text-[11px] text-zinc-400 italic bg-zinc-900/60 p-2 rounded border border-zinc-800 font-mono">
                      "{asig.notas}"
                    </p>
                  )}

                  {/* Botones de Acción */}
                  <div className="pt-2 border-t border-zinc-700/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrir_modal_ajuste(asig)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-mono border border-zinc-700 transition-colors"
                        title="Modificar camión, horario o suspender este día"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Ajustar este día</span>
                      </button>

                      {es_excepcion && (
                        <button
                          onClick={() => restaurar_turno_oficial(asig._id)}
                          className="inline-flex items-center justify-center gap-1 py-1.5 px-2 bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 rounded-lg text-[11px] font-mono border border-zinc-700 transition-colors"
                          title="Restaurar a turno oficial recurrente"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restaurar</span>
                        </button>
                      )}
                    </div>

                    {!es_suspendido && (
                      <div className="flex items-center gap-2">
                        {asig.estado === "programado" && (
                          <button
                            onClick={() =>
                              actualizar_estado_asignacion(asig._id, "en_progreso", asig)
                            }
                            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] py-1.5 rounded-lg transition-all font-semibold"
                          >
                            <Play className="w-3 h-3" />
                            <span>Iniciar Recolección</span>
                          </button>
                        )}

                        {asig.estado === "en_progreso" && (
                          <button
                            onClick={() =>
                              actualizar_estado_asignacion(asig._id, "completado", asig)
                            }
                            className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[11px] py-1.5 rounded-lg transition-all font-semibold"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Marcar Finalizada</span>
                          </button>
                        )}

                        {asig.estado === "completado" && (
                          <div className="text-[11px] text-zinc-500 font-mono text-center w-full py-1">
                            ✓ Turno concluido satisfactoriamente
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal para Ajustar Turno / Registrar Excepción */}
      {modal_abierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="texto-anton text-xl tracking-wide text-white">
                  AJUSTAR TURNO // EXCEPCIÓN DEL DÍA
                </h3>
                <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                  Los cambios aplicarán únicamente para la fecha {formulario.fecha}.
                </p>
              </div>
              <button
                onClick={() => fijar_modal_abierto(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardar_ajuste_o_excepcion} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">RUTA</label>
                <select
                  value={formulario.ruta_id}
                  onChange={(e) => fijar_formulario({ ...formulario, ruta_id: e.target.value })}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="">-- Seleccionar ruta --</option>
                  {rutas.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.nombre} (ID: {r.id_ruta}) - {r.distancia_estimada_km} km
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">FECHA DE APLICACIÓN</label>
                <input
                  type="date"
                  value={formulario.fecha}
                  onChange={(e) => fijar_formulario({ ...formulario, fecha: e.target.value })}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Casilla para anular / suspender el día */}
              <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formulario.es_anulacion}
                    onChange={(e) =>
                      fijar_formulario({ ...formulario, es_anulacion: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-rose-500 bg-zinc-900 border-zinc-700 focus:ring-rose-500"
                  />
                  <span className="font-mono text-zinc-200 font-semibold text-xs">
                    Suspender / anular recorrido para este día específico
                  </span>
                </label>
                {formulario.es_anulacion && (
                  <p className="text-[11px] text-rose-400 pl-6">
                    El servicio se marcará como suspendido para los ciudadanos y operadores en esta fecha,
                    sin alterar la programación oficial recurrente.
                  </p>
                )}
              </div>

              {!formulario.es_anulacion ? (
                <>
                  <div>
                    <label className="block text-zinc-400 font-mono mb-1">
                      CAMIÓN ASIGNADO (UNIDAD SUSTITUTA O TITULAR)
                    </label>
                    <select
                      value={formulario.camion_id}
                      onChange={(e) =>
                        fijar_formulario({ ...formulario, camion_id: e.target.value })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                    >
                      <option value="">-- Sin camión fijo (asignación rotativa) --</option>
                      {camiones.map((c) => (
                        <option key={c._id} value={c._id}>
                          Unidad {c.numero_unidad} - {c.modelo} ({c.matricula}) [{c.estado}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 font-mono mb-1">HORA ENTRADA</label>
                      <input
                        type="time"
                        value={formulario.hora_entrada_aprox}
                        onChange={(e) =>
                          fijar_formulario({
                            ...formulario,
                            hora_entrada_aprox: e.target.value,
                          })
                        }
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 font-mono mb-1">HORA SALIDA</label>
                      <input
                        type="time"
                        value={formulario.hora_salida_aprox}
                        onChange={(e) =>
                          fijar_formulario({
                            ...formulario,
                            hora_salida_aprox: e.target.value,
                          })
                        }
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-mono mb-1">
                      MOTIVO DE LA EXCEPCIÓN / AJUSTE (OPCIONAL)
                    </label>
                    <input
                      type="text"
                      value={formulario.motivo_excepcion}
                      onChange={(e) =>
                        fijar_formulario({ ...formulario, motivo_excepcion: e.target.value })
                      }
                      placeholder="Ej: Camión titular en mantenimiento preventivo, turno de refuerzo..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-rose-400 font-mono mb-1">
                    MOTIVO DE LA SUSPENSIÓN (REQUERIDO)
                  </label>
                  <select
                    value={formulario.motivo_excepcion}
                    onChange={(e) =>
                      fijar_formulario({ ...formulario, motivo_excepcion: e.target.value })
                    }
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-rose-500 font-mono mb-2"
                  >
                    <option value="">-- Selecciona el motivo --</option>
                    <option value="Camión titular en taller de mantenimiento">
                      Camión titular en taller de mantenimiento
                    </option>
                    <option value="Feriado oficial / Sin servicio programado">
                      Feriado oficial / Sin servicio programado
                    </option>
                    <option value="Cierre de vialidades / Obras públicas">
                      Cierre de vialidades / Obras públicas
                    </option>
                    <option value="Condiciones meteorológicas adversas">
                      Condiciones meteorológicas adversas
                    </option>
                    <option value="Falta de personal operativo / Contingencia">
                      Falta de personal operativo / Contingencia
                    </option>
                    <option value="Otro motivo extraordinario">Otro motivo extraordinario</option>
                  </select>

                  <input
                    type="text"
                    value={formulario.motivo_excepcion}
                    onChange={(e) =>
                      fijar_formulario({ ...formulario, motivo_excepcion: e.target.value })
                    }
                    placeholder="O escribe un motivo detallado..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOTAS OPERATIVAS O INSTRUCCIONES
                </label>
                <textarea
                  value={formulario.notas}
                  onChange={(e) => fijar_formulario({ ...formulario, notas: e.target.value })}
                  rows={2}
                  placeholder="Ej: Conductor informado, cobertura asignada a sector oeste..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fijar_modal_abierto(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className={`px-5 py-2 text-white rounded-xl font-mono text-xs font-semibold uppercase transition-colors ${
                    formulario.es_anulacion
                      ? "bg-rose-600 hover:bg-rose-500"
                      : "bg-amber-600 hover:bg-amber-500"
                  }`}
                >
                  {guardando
                    ? "Guardando..."
                    : formulario.es_anulacion
                    ? "Confirmar Suspensión"
                    : "Guardar Excepción"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
