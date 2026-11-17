"use client";

import { useState, useEffect } from "react";
import Skeleton from "react-loading-skeleton";
import {
  Bell,
  Radio,
  MapPin,
  Clock,
  ShieldAlert,
  Send,
  CheckCircle2,
  Users,
} from "lucide-react";

export default function PaginaMonitorAlertas() {
  const [historial_alertas, fijar_historial_alertas] = useState<any[]>([]);
  const [zonas_activas, fijar_zonas_activas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);

  const cargar_alertas = async () => {
    try {
      fijar_cargando(true);
      const respuesta = await fetch("/api/alertas/ciudadano");
      const datos = await respuesta.json();
      if (datos.exito) {
        fijar_historial_alertas(datos.datos.historial_alertas || []);
        fijar_zonas_activas(datos.datos.zonas_suscritas || []);
      }
    } catch (e) {
      console.error("Error al cargar monitor de alertas:", e);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_alertas();
  }, []);

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-purple-400 mb-1">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>MÓDULO DE GEOLOCALIZACIÓN // MOTOR DE PROXIMIDAD</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            MONITOR DE ALERTAS A CIUDADANOS
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Supervisa el motor de notificaciones push preventivas disparadas por proximidad GPS.
          </p>
        </div>
      </div>

      {/* Métricas del Motor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              ZONAS MONITOREADAS
            </span>
            <MapPin className="w-4 h-4 text-purple-400" />
          </div>
          <div className="texto-anton text-3xl text-white">
            {cargando ? <Skeleton width={60} height={32} /> : zonas_activas.length}
          </div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Puntos de suscripción ciudadana
          </p>
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              RADIO DE COBERTURA ESTÁNDAR
            </span>
            <Radio className="w-4 h-4 text-blue-400" />
          </div>
          <div className="texto-anton text-3xl text-white">400 m</div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Umbral de proximidad geodésica
          </p>
        </div>

        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              ESTADO DEL MOTOR
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="texto-anton text-3xl text-emerald-400">EN LÍNEA</div>
          <p className="text-[11px] text-zinc-500 font-mono">
            Evaluando eventos en tiempo real
          </p>
        </div>
      </div>

      {/* Historial Detallado de Notificaciones Disparadas */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
          <Bell className="w-4 h-4 text-purple-400" />
          <span>LOG DE AVISOS PUSH ENVIADOS A CIUDADANOS</span>
        </h2>

        {cargando ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl flex items-center justify-between text-xs gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton circle width={8} height={8} />
                    <Skeleton width="65%" height={14} containerClassName="flex-1" />
                  </div>
                  <div className="pl-4">
                    <Skeleton width="45%" height={12} containerClassName="flex-1" />
                  </div>
                </div>
                <Skeleton width={110} height={14} />
              </div>
            ))}
          </div>
        ) : historial_alertas.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
            No se han registrado disparos de proximidad recientes. Puedes simular una coordenada desde el módulo de Flota.
          </div>
        ) : (
          <div className="space-y-3">
            {historial_alertas.map((alerta) => (
              <div
                key={alerta._id}
                className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span>{alerta.mensaje}</span>
                  </div>
                  <div className="text-zinc-400 font-mono text-[11px] pl-4">
                    Distancia al domicilio:{" "}
                    <strong className="text-purple-300">
                      {alerta.distancia_metros} metros
                    </strong>{" "}
                    • Camión: {alerta.camion_id?.numero_unidad || "Unidad"}
                  </div>
                </div>

                <div className="text-right font-mono text-[11px] text-zinc-500">
                  {new Date(alerta.fecha_envio).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

