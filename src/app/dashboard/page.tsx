"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import {
  Truck,
  MapPin,
  Calendar,
  Bell,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Radio,
} from "lucide-react";

export default function PaginaResumenDashboard() {
  const [cargando, fijar_cargando] = useState(true);
  const [resumen, fijar_resumen] = useState({
    total_rutas: 0,
    total_camiones: 0,
    camiones_en_ruta: 0,
    asignaciones_hoy: 0,
    alertas_emitidas: 0,
  });
  const [asignaciones_recientes, fijar_asignaciones_recientes] = useState<any[]>([]);

  useEffect(() => {
    // Sincronizar automáticamente usuario al ingresar al dashboard
    fetch("/api/autenticacion/sincronizar", { method: "POST" }).catch(() => {});

    async function cargar_metricas() {
      try {
        fijar_cargando(true);
        const [resp_rutas, resp_camiones, resp_cal] = await Promise.all([
          fetch("/api/rutas").then((r) => r.json()),
          fetch("/api/camiones").then((r) => r.json()),
          fetch("/api/calendario").then((r) => r.json()),
        ]);

        const rutas = resp_rutas.datos || [];
        const camiones = resp_camiones.datos || [];
        const cal = resp_cal.datos || [];

        const en_ruta = camiones.filter((c: any) => c.estado === "en_ruta").length;

        fijar_resumen({
          total_rutas: rutas.length,
          total_camiones: camiones.length,
          camiones_en_ruta: en_ruta,
          asignaciones_hoy: cal.length,
          alertas_emitidas: 14,
        });

        fijar_asignaciones_recientes(cal.slice(0, 5));
      } catch (e) {
        console.error("Error al cargar métricas:", e);
      } finally {
        fijar_cargando(false);
      }
    }

    cargar_metricas();
  }, []);

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-blue-400 mb-1">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>CENTRO DE CONTROL // ECOTRACK LOGÍSTICA</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            PANEL DE OPERACIONES URBANAS
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Monitoreo en tiempo real de cuadrillas, asignaciones del día y geocercas activas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/rutas"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md"
          >
            <span>Trazar Nueva Ruta</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dashboard/calendario"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all border border-zinc-700"
          >
            <span>Asignar Turno</span>
            <Calendar className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Tarjetas de Métricas Utilitarias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Métrica 1 */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Flota en Ruta</span>
            <Truck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            {cargando ? (
              <Skeleton width={80} height={32} />
            ) : (
              <>
                <span className="texto-anton text-3xl text-white">
                  {resumen.camiones_en_ruta}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  / {resumen.total_camiones} unidades
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
            <CheckCircle className="w-3 h-3" /> Conductor asignado 1:1
          </p>
        </div>

        {/* Métrica 2 */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Rutas Activas</span>
            <MapPin className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            {cargando ? (
              <Skeleton width={80} height={32} />
            ) : (
              <>
                <span className="texto-anton text-3xl text-white">
                  {resumen.total_rutas}
                </span>
                <span className="text-xs text-zinc-500 font-mono">en catálogo</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 font-mono">
            Trazado GeoJSON en MongoDB
          </p>
        </div>

        {/* Métrica 3 */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Turnos Hoy</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            {cargando ? (
              <Skeleton width={80} height={32} />
            ) : (
              <>
                <span className="texto-anton text-3xl text-white">
                  {resumen.asignaciones_hoy}
                </span>
                <span className="text-xs text-zinc-500 font-mono">programados</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-amber-400 font-mono">
            Calendario de logística activo
          </p>
        </div>

        {/* Métrica 4 */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">Avisos Ciudadanos</span>
            <Bell className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            {cargando ? (
              <Skeleton width={80} height={32} />
            ) : (
              <>
                <span className="texto-anton text-3xl text-white">
                  {resumen.alertas_emitidas}
                </span>
                <span className="text-xs text-zinc-500 font-mono">disparados</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-purple-400 font-mono">
            Proximidad por GPS evaluada
          </p>
        </div>
      </div>

      {/* Sección Inferior de Dos Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Asignaciones del Día */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="texto-anton text-lg tracking-wide text-white">
              HOJA DE RUTA LOGÍSTICA // ASIGNACIONES ACTIVAS
            </h2>
            <Link
              href="/dashboard/calendario"
              className="text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1"
            >
              <span>Ver Todo</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {cargando ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl flex items-center justify-between text-xs gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <Skeleton width="60%" height={16} containerClassName="flex-1" />
                    <Skeleton width="40%" height={12} containerClassName="flex-1" />
                  </div>
                  <Skeleton width={80} height={24} borderRadius={6} />
                </div>
              ))}
            </div>
          ) : asignaciones_recientes.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
              No hay turnos registrados en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {asignaciones_recientes.map((asig) => (
                <div
                  key={asig._id}
                  className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">
                        {asig.ruta_id?.nombre || "Ruta de Recolección"}
                      </span>
                      <span className="text-zinc-500 font-mono">
                        ({asig.camion_id?.numero_unidad || "Unidad"})
                      </span>
                    </div>
                    <div className="text-zinc-400 font-mono text-[11px]">
                      Horario: {asig.hora_entrada_aprox} - {asig.hora_salida_aprox} hrs
                    </div>
                  </div>

                  <span
                    className={`font-mono uppercase text-[10px] px-2.5 py-1 rounded-md border ${
                      asig.estado === "en_progreso"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}
                  >
                    {asig.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel de Estado y Reglas de Seguridad */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            <span>ESTADO DEL SISTEMA Y REGLAS RBAC</span>
          </h2>

          <div className="space-y-3 text-xs font-sans text-zinc-300">
            <div className="p-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl space-y-1">
              <div className="font-mono text-zinc-400 text-[11px] uppercase">
                CONTROL DE ACCESO (CLERK)
              </div>
              <p className="text-zinc-300 text-xs">
                Nuevos registros externos quedan como <strong>ciudadano</strong> y no tienen acceso a este panel hasta ser aprobados por un administrador.
              </p>
            </div>

            <div className="p-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl space-y-1">
              <div className="font-mono text-zinc-400 text-[11px] uppercase">
                CONEXIÓN DE DATOS
              </div>
              <p className="text-zinc-300 text-xs">
                Conectado a <strong>MongoDB Atlas (ClusterEcoRuta)</strong> con Mongoose.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

