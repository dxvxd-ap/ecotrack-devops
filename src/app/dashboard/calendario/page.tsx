"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";

export default function PaginaCalendarioLogistica() {
  const [asignaciones, fijar_asignaciones] = useState<any[]>([]);
  const [camiones, fijar_camiones] = useState<any[]>([]);
  const [rutas, fijar_rutas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [modal_abierto, fijar_modal_abierto] = useState(false);
  const [guardando, fijar_guardando] = useState(false);

  // Fecha seleccionada (por defecto hoy en formato YYYY-MM-DD)
  const fecha_hoy = new Date().toISOString().split("T")[0];
  const [fecha_activa, fijar_fecha_activa] = useState(fecha_hoy);

  // Formulario de asignación
  const [formulario, fijar_formulario] = useState({
    camion_id: "",
    ruta_id: "",
    fecha: fecha_hoy,
    hora_entrada_aprox: "07:00",
    hora_salida_aprox: "15:00",
    notas: "",
  });

  const cargar_datos = async () => {
    try {
      fijar_cargando(true);
      const [res_asig, res_cam, res_rut] = await Promise.all([
        fetch("/api/calendario").then((r) => r.json()),
        fetch("/api/camiones").then((r) => r.json()),
        fetch("/api/rutas").then((r) => r.json()),
      ]);

      if (res_asig.exito) fijar_asignaciones(res_asig.datos || []);
      if (res_cam.exito) {
        fijar_camiones(res_cam.datos || []);
        if (res_cam.datos?.length > 0 && !formulario.camion_id) {
          fijar_formulario((prev) => ({ ...prev, camion_id: res_cam.datos[0]._id }));
        }
      }
      if (res_rut.exito) {
        fijar_rutas(res_rut.datos || []);
        if (res_rut.datos?.length > 0 && !formulario.ruta_id) {
          fijar_formulario((prev) => ({ ...prev, ruta_id: res_rut.datos[0]._id }));
        }
      }
    } catch (e) {
      console.error("Error al cargar logística:", e);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_datos();
  }, []);

  const crear_asignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulario.camion_id || !formulario.ruta_id) {
      alert("Por favor selecciona un camión y una ruta.");
      return;
    }

    try {
      fijar_guardando(true);
      const res = await fetch("/api/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formulario),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_modal_abierto(false);
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al crear la asignación");
      }
    } catch (e) {
      alert("Error de red al guardar");
    } finally {
      fijar_guardando(false);
    }
  };

  const actualizar_estado_asignacion = async (
    id_asignacion: string,
    nuevo_estado: string
  ) => {
    try {
      const res = await fetch("/api/calendario", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id_asignacion, estado: nuevo_estado }),
      });
      const data = await res.json();
      if (data.exito) {
        cargar_datos();
      }
    } catch (e) {
      console.error("Error al actualizar estado:", e);
    }
  };

  const asignaciones_filtradas = asignaciones.filter(
    (a) => a.fecha === fecha_activa
  );

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1">
            <IconoCalendario className="w-3.5 h-3.5" />
            <span>MÓDULO DE LOGÍSTICA // CALENDARIO DE TURNOS</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            PLANIFICACIÓN SEMANAL Y MENSUAL
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Asigna unidades a rutas específicas con horarios de entrada y salida programados.
          </p>
        </div>

        <button
          onClick={() => {
            fijar_formulario((prev) => ({ ...prev, fecha: fecha_activa }));
            fijar_modal_abierto(true);
          }}
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Asignación de Turno</span>
        </button>
      </div>

      {/* Selector de Fecha */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-zinc-400">FECHA OPERATIVA:</label>
          <input
            type="date"
            value={fecha_activa}
            onChange={(e) => fijar_fecha_activa(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={() => fijar_fecha_activa(fecha_hoy)}
            className="text-xs font-mono text-amber-400 hover:underline"
          >
            Hoy ({fecha_hoy})
          </button>
        </div>

        <div className="text-xs font-mono text-zinc-400">
          Turnos para este día:{" "}
          <strong className="text-white">{asignaciones_filtradas.length}</strong>
        </div>
      </div>

      {/* Lista de Asignaciones para la fecha activa */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
          <span>TURNOS REGISTRADOS PARA: {fecha_activa}</span>
        </h2>

        {asignaciones_filtradas.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
            No hay camiones programados para esta fecha. Pulsa "Nueva Asignación de Turno" para planificar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {asignaciones_filtradas.map((asig) => (
              <div
                key={asig._id}
                className="p-5 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-3.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-zinc-400 uppercase">
                    ID: {asig._id.slice(-6)}
                  </span>
                  <span
                    className={`font-mono uppercase text-[10px] px-2 py-0.5 rounded border ${
                      asig.estado === "en_progreso"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse font-bold"
                        : asig.estado === "completado"
                        ? "bg-zinc-700/30 text-zinc-400 border-zinc-600/30"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}
                  >
                    {asig.estado}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>{asig.ruta_id?.nombre || "Ruta No Definida"}</span>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-300">
                    <Truck className="w-4 h-4 text-blue-400" />
                    <span>
                      {asig.camion_id?.numero_unidad || "Unidad"} • Matrícula:{" "}
                      {asig.camion_id?.matricula || "S/M"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {asig.hora_entrada_aprox} - {asig.hora_salida_aprox} hrs
                    </span>
                  </div>
                </div>

                {asig.notas && (
                  <p className="text-[11px] text-zinc-400 italic bg-zinc-900/40 p-2 rounded border border-zinc-800">
                    "{asig.notas}"
                  </p>
                )}

                {/* Acciones de Estado */}
                <div className="pt-2 border-t border-zinc-700/50 flex items-center justify-between gap-2">
                  {asig.estado === "programado" && (
                    <button
                      onClick={() =>
                        actualizar_estado_asignacion(asig._id, "en_progreso")
                      }
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] py-2 rounded-lg transition-all"
                    >
                      <Play className="w-3 h-3" />
                      <span>Iniciar Recolección</span>
                    </button>
                  )}

                  {asig.estado === "en_progreso" && (
                    <button
                      onClick={() =>
                        actualizar_estado_asignacion(asig._id, "completado")
                      }
                      className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[11px] py-2 rounded-lg transition-all"
                    >
                      <CheckCircle className="w-3 h-3" />
                      <span>Marcar Finalizada</span>
                    </button>
                  )}

                  {asig.estado === "completado" && (
                    <div className="text-[11px] text-zinc-500 font-mono text-center w-full">
                      ✓ Turno cerrado satisfactoriamente
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal para Crear Asignación */}
      {modal_abierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="texto-anton text-xl tracking-wide text-white">
                NUEVA ASIGNACIÓN DE RECOLECCIÓN
              </h3>
              <button
                onClick={() => fijar_modal_abierto(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={crear_asignacion} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  SELECCIONAR CAMIÓN (UNIDAD)
                </label>
                <select
                  value={formulario.camion_id}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, camion_id: e.target.value })
                  }
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  {camiones.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.numero_unidad} - {c.modelo} ({c.matricula}) [Estado: {c.estado}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  SELECCIONAR RUTA
                </label>
                <select
                  value={formulario.ruta_id}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, ruta_id: e.target.value })
                  }
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  {rutas.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.nombre} (ID: {r.id_ruta}) - {r.distancia_estimada_km} km
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  FECHA DE ASIGNACIÓN
                </label>
                <input
                  type="date"
                  value={formulario.fecha}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, fecha: e.target.value })
                  }
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    HORA ENTRADA APROX.
                  </label>
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
                  <label className="block text-zinc-400 font-mono mb-1">
                    HORA SALIDA APROX.
                  </label>
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
                  NOTAS OPERATIVAS O INSTRUCCIONES
                </label>
                <textarea
                  value={formulario.notas}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, notas: e.target.value })
                  }
                  rows={2}
                  placeholder="Ej: Turno prioritario, recolección de contenedores comerciales..."
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
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-mono text-xs font-semibold uppercase"
                >
                  {guardando ? "Guardando..." : "Confirmar Turno"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

