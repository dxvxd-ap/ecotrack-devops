"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Skeleton from "react-loading-skeleton";
import {
  Bell,
  Send,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Wrench,
  Radio,
  Clock,
  Sparkles,
  RefreshCw,
  Layers,
  Wifi,
  Battery,
  ShieldCheck,
} from "lucide-react";

interface AlertaHistorial {
  _id: string;
  titulo: string;
  mensaje: string;
  motivo: "dia_festivo" | "suspension_ruta" | "falla_camion" | "retraso" | "aviso_general";
  alcance: "todas_las_rutas" | "ruta_especifica";
  rutaId?: {
    _id: string;
    nombre: string;
    id_ruta: string;
    color_mapa?: string;
  } | null;
  enviadosCount: number;
  createdAt: string;
}

interface Ruta {
  _id: string;
  nombre: string;
  id_ruta: string;
  color_mapa?: string;
}

function ContenidoAlertas() {
  const searchParams = useSearchParams();

  // Estados del Formulario
  const [titulo, fijarTitulo] = useState("");
  const [mensaje, fijarMensaje] = useState("");
  const [motivo, fijarMotivo] = useState<
    "dia_festivo" | "suspension_ruta" | "falla_camion" | "retraso" | "aviso_general"
  >("aviso_general");
  const [alcance, fijarAlcance] = useState<"todas_las_rutas" | "ruta_especifica">("todas_las_rutas");
  const [rutaId, fijarRutaId] = useState("");

  // Datos del sistema
  const [rutas, fijarRutas] = useState<Ruta[]>([]);
  const [historial, fijarHistorial] = useState<AlertaHistorial[]>([]);
  const [cargandoHistorial, fijarCargandoHistorial] = useState(true);
  const [enviando, fijarEnviando] = useState(false);
  const [resultadoEnvio, fijarResultadoEnvio] = useState<{
    exito: boolean;
    mensaje: string;
    enviadosCount: number;
  } | null>(null);

  // Cargar rutas y alertas frescas sin caché
  const cargarDatos = async () => {
    try {
      fijarCargandoHistorial(true);
      const [resRutas, resAlertas] = await Promise.all([
        fetch("/api/rutas", { cache: "no-store", headers: { "Cache-Control": "no-cache" } }).then((r) => r.json()),
        fetch("/api/alertas?limite=50", { cache: "no-store", headers: { "Cache-Control": "no-cache" } }).then((r) => r.json()),
      ]);

      if (resRutas.exito) {
        fijarRutas(resRutas.datos || []);
      }
      if (resAlertas.exito) {
        fijarHistorial(resAlertas.datos || []);
      }
    } catch (e) {
      console.error("Error al cargar datos de alertas:", e);
    } finally {
      fijarCargandoHistorial(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Prellenar si viene desde un atajo (Query Params de Reportes)
  useEffect(() => {
    const pMotivo = searchParams.get("motivo");
    const pRutaId = searchParams.get("rutaId");
    const pTitulo = searchParams.get("titulo");
    const pMensaje = searchParams.get("mensaje");

    if (pTitulo) fijarTitulo(decodeURIComponent(pTitulo));
    if (pMensaje) fijarMensaje(decodeURIComponent(pMensaje));

    if (pMotivo) {
      if (pMotivo === "falla_mecanica" || pMotivo === "falla_camion") {
        fijarMotivo("falla_camion");
        if (!pTitulo) fijarTitulo("Aviso de Retraso en Cuadrilla de Recolección");
        if (!pMensaje) {
          fijarMensaje(
            "La unidad de recolección en tu sector presenta un retraso técnico imprevisto. El equipo de soporte atiende la incidencia para reanudar el recorrido a la brevedad."
          );
        }
      } else if (pMotivo === "calle_bloqueada" || pMotivo === "suspension_ruta") {
        fijarMotivo("suspension_ruta");
        if (!pTitulo) fijarTitulo("Suspensión Temporal de Ruta por Vía Obstruida");
        if (!pMensaje) {
          fijarMensaje(
            "Debido a obras viales u obstrucciones imprevistas en la calle, la unidad no podrá transitar temporalmente por este tramo. Se informará cuando se despeje."
          );
        }
      } else if (pMotivo === "unidad_llena" || pMotivo === "retraso" || pMotivo === "incidente_vial") {
        fijarMotivo("retraso");
        if (!pTitulo) fijarTitulo("Aviso de Retraso en Horario de Servicio");
        if (!pMensaje) {
          fijarMensaje(
            "La cuadrilla de recolección presenta un breve desfase en el itinerario regular de recolección. Agradecemos su comprensión y paciencia."
          );
        }
      } else if (pMotivo === "dia_festivo") {
        fijarMotivo("dia_festivo");
        if (!pTitulo) fijarTitulo("Aviso: Suspensión de Servicio por Día Festivo");
        if (!pMensaje) {
          fijarMensaje(
            "Estimado ciudadano, con motivo del día festivo oficial, el servicio de recolección de residuos se suspenderá hoy. Se reanudará el próximo día hábil."
          );
        }
      } else if (
        ["dia_festivo", "suspension_ruta", "falla_camion", "retraso", "aviso_general"].includes(pMotivo)
      ) {
        fijarMotivo(pMotivo as any);
      }
    }

    if (pRutaId) {
      fijarAlcance("ruta_especifica");
      fijarRutaId(pRutaId);
    }
  }, [searchParams]);

  // Plantillas rápidas de 1 clic
  const aplicarPlantilla = (tipo: "festivo" | "falla" | "restablecido" | "suspension") => {
    fijarResultadoEnvio(null);
    if (tipo === "festivo") {
      fijarMotivo("dia_festivo");
      fijarAlcance("todas_las_rutas");
      fijarTitulo("Aviso: Suspensión de Servicio por Día Festivo");
      fijarMensaje(
        "Estimado ciudadano, con motivo del día festivo oficial, el servicio de recolección de residuos se suspenderá hoy. Se reanudará con normalidad el próximo día hábil."
      );
    } else if (tipo === "falla") {
      fijarMotivo("falla_camion");
      fijarAlcance("ruta_especifica");
      fijarTitulo("Aviso de Retraso en Cuadrilla de Recolección");
      fijarMensaje(
        "La unidad de recolección en tu sector presenta un retraso técnico imprevisto. Nuestro equipo de soporte ya atiende la incidencia para reanudar el recorrido a la brevedad."
      );
    } else if (tipo === "restablecido") {
      fijarMotivo("aviso_general");
      fijarAlcance("ruta_especifica");
      fijarTitulo("Servicio de Recolección Restablecido");
      fijarMensaje(
        "Te informamos que la unidad recolectora ha reanudado su recorrido habitual por tu sector. Agradecemos tu paciencia y colaboración."
      );
    } else if (tipo === "suspension") {
      fijarMotivo("suspension_ruta");
      fijarAlcance("ruta_especifica");
      fijarTitulo("Suspensión Temporal por Vía Obstruida / Clima");
      fijarMensaje(
        "Debido a obras viales o condiciones meteorológicas adversas, la unidad no podrá transitar temporalmente por este tramo. Mantendremos informada a la comunidad."
      );
    }
  };

  // Enviar alerta y notificaciones push
  const manejarEnvioAlerta = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim() || !mensaje.trim()) {
      alert("Por favor completa el título y el mensaje de la alerta.");
      return;
    }

    if (alcance === "ruta_especifica" && !rutaId) {
      alert("Debes seleccionar la ruta específica a la que deseas enviar el aviso.");
      return;
    }

    const confirmar = confirm(
      `¿Confirmas el envío de esta notificación push a ${
        alcance === "todas_las_rutas"
          ? "TODOS los ciudadanos registrados"
          : "los vecinos de la ruta seleccionada"
      }?`
    );
    if (!confirmar) return;

    try {
      fijarEnviando(true);
      fijarResultadoEnvio(null);

      const respuesta = await fetch("/api/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          mensaje: mensaje.trim(),
          motivo,
          alcance,
          rutaId: alcance === "ruta_especifica" ? rutaId : null,
        }),
      });

      const datos = await respuesta.json();
      if (datos.exito) {
        fijarResultadoEnvio({
          exito: true,
          mensaje: datos.mensaje,
          enviadosCount: datos.enviadosCount || 0,
        });

        // Limpiar campos principales
        fijarTitulo("");
        fijarMensaje("");
        await cargarDatos();
      } else {
        alert(datos.mensaje || "Error al emitir la alerta.");
      }
    } catch (error) {
      alert("Error de conexión al enviar la notificación.");
    } finally {
      fijarEnviando(false);
    }
  };

  // Nombre de la ruta seleccionada para la vista previa
  const rutaSeleccionadaObj = useMemo(() => {
    return rutas.find((r) => r._id === rutaId);
  }, [rutas, rutaId]);

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-purple-400 mb-1">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>MÓDULO DE COMUNICACIÓN // MOTOR DE NOTIFICACIONES PUSH</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            CENTRO DE ALERTAS Y NOTIFICACIONES PUSH
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Emite notificaciones en tiempo real a los teléfonos móviles de los ciudadanos (iOS / Android / PWA).
          </p>
        </div>

        <button
          onClick={cargarDatos}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono rounded-lg border border-zinc-700 transition-colors self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
          <span>Actualizar Historial</span>
        </button>
      </div>

      {/* Grid de Dos Columnas: Formulario de Emisión + Simulador Smartphone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Columna Izquierda: Formulario y Plantillas (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-purple-400" />
                <span>NUEVA NOTIFICACIÓN PUSH A CIUDADANOS</span>
              </h2>
            </div>

            {/* Plantillas Rápidas de 1 Clic */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Plantillas Rápidas Oficiales:</span>
              </span>
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => aplicarPlantilla("festivo")}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg border border-zinc-700 transition-all flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>Día Festivo (Sin servicio)</span>
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPlantilla("falla")}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg border border-zinc-700 transition-all flex items-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>Falla / Retraso en ruta</span>
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPlantilla("restablecido")}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg border border-zinc-700 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Servicio restablecido</span>
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPlantilla("suspension")}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg border border-zinc-700 transition-all flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Suspensión Temporal</span>
                </button>
              </div>
            </div>

            {/* Formulario */}
            <form onSubmit={manejarEnvioAlerta} className="space-y-4 text-xs font-sans">
              {/* Título */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-zinc-400 font-mono">TÍTULO DEL AVISO</label>
                  <span className="text-[10px] font-mono text-zinc-500">{titulo.length}/60</span>
                </div>
                <input
                  type="text"
                  maxLength={60}
                  value={titulo}
                  onChange={(e) => fijarTitulo(e.target.value)}
                  placeholder="Ej: Retraso en recolección por contingencia técnica"
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:outline-none focus:border-purple-500 font-mono text-xs"
                />
              </div>

              {/* Mensaje */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-zinc-400 font-mono">CUERPO DEL MENSAJE (NOTIFICACIÓN PUSH)</label>
                  <span className="text-[10px] font-mono text-zinc-500">{mensaje.length}/180</span>
                </div>
                <textarea
                  maxLength={180}
                  rows={3}
                  value={mensaje}
                  onChange={(e) => fijarMensaje(e.target.value)}
                  placeholder="Escribe el mensaje claro y conciso que el ciudadano leerá en la pantalla bloqueada de su teléfono..."
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Motivo y Alcance en 2 columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">MOTIVO DE LA ALERTA</label>
                  <select
                    value={motivo}
                    onChange={(e) => fijarMotivo(e.target.value as any)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  >
                    <option value="aviso_general">Aviso General</option>
                    <option value="dia_festivo">Día Festivo / Feriado</option>
                    <option value="falla_camion">Falla Mecánica de Unidad</option>
                    <option value="retraso">Retraso en Horario</option>
                    <option value="suspension_ruta">Suspensión de Recorrido</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">ALCANCE DE DIFUSIÓN</label>
                  <select
                    value={alcance}
                    onChange={(e) => fijarAlcance(e.target.value as any)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
                  >
                    <option value="todas_las_rutas">Todos los ciudadanos (General)</option>
                    <option value="ruta_especifica">Solo una ruta específica</option>
                  </select>
                </div>
              </div>

              {/* Selector de Ruta (si aplica) */}
              {alcance === "ruta_especifica" && (
                <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700 space-y-1">
                  <label className="block text-zinc-300 font-mono text-[11px]">
                    SELECCIONAR RUTA OBJETIVO:
                  </label>
                  <select
                    value={rutaId}
                    onChange={(e) => fijarRutaId(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500 text-xs"
                  >
                    <option value="">-- Elige la ruta a notificar --</option>
                    {rutas.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.nombre} (ID: {r.id_ruta})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    Solo los teléfonos que hayan marcado interés en esta ruta o que tengan suscripción abierta recibirán el aviso.
                  </p>
                </div>
              )}

              {/* Banner de Resultado de Envío */}
              {resultadoEnvio && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-mono flex items-start gap-2.5 ${
                    resultadoEnvio.exito
                      ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
                      : "bg-rose-950/30 border-rose-800 text-rose-300"
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">Notificación Procesada:</span>
                    <p>{resultadoEnvio.mensaje}</p>
                    <span className="text-[10px] text-emerald-400 block pt-1">
                      Dispositivos impactados: <strong>{resultadoEnvio.enviadosCount}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Botón de Envío */}
              <button
                type="submit"
                disabled={enviando || !titulo.trim() || !mensaje.trim()}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-mono font-semibold py-3 px-4 rounded-xl transition-all shadow-md text-xs uppercase"
              >
                <Send className="w-4 h-4" />
                <span>
                  {enviando ? "Transmitiendo a Expo / Dispositivos..." : "Enviar Notificación Ahora"}
                </span>
              </button>
            </form>
          </div>
        </div>

        {/* Columna Derecha: Vista Previa en Pantalla de Celular (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="texto-anton text-sm tracking-wider text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-400" />
                <span>VISTA PREVIA EN PANTALLA DE BLOQUEO</span>
              </span>
              <span className="text-[10px] font-mono text-zinc-500">iOS / Android Push</span>
            </div>

            {/* Mockup de Teléfono Celular */}
            <div className="mx-auto max-w-[280px] sm:max-w-[310px] bg-zinc-950 border-4 border-zinc-800 rounded-[38px] p-3 shadow-2xl relative overflow-hidden font-sans">
              {/* Barra Superior / Notch del celular */}
              <div className="flex items-center justify-between px-3 pt-1 pb-2 text-[10px] font-mono text-zinc-400 border-b border-zinc-900">
                <span>09:41</span>
                <div className="w-16 h-3.5 bg-zinc-900 rounded-full" />
                <div className="flex items-center gap-1.5">
                  <Wifi className="w-2.5 h-2.5" />
                  <Battery className="w-3 h-3" />
                </div>
              </div>

              {/* Fondo del smartphone con reloj bloqueado */}
              <div className="py-6 text-center space-y-0.5">
                <span className="text-[11px] text-zinc-400 font-mono capitalize">
                  {new Date().toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <div className="text-3xl font-light text-zinc-200 tracking-tight font-mono">
                  09:41
                </div>
              </div>

              {/* Notificación Push Flotante */}
              <div className="bg-zinc-900/95 border border-zinc-700/80 rounded-2xl p-3 shadow-xl backdrop-blur-md space-y-1.5 text-left transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-md bg-blue-600 flex items-center justify-center text-[9px] font-black text-white">
                      E
                    </div>
                    <span className="text-[10px] font-bold tracking-wider text-zinc-200 uppercase font-mono">
                      ECOTRACK
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500">ahora</span>
                </div>

                <div className="space-y-0.5">
                  <h4 className="text-[11px] font-bold text-white line-clamp-1">
                    {titulo.trim() || "Título de la notificación"}
                  </h4>
                  <p className="text-[10px] text-zinc-300 leading-snug line-clamp-3">
                    {mensaje.trim() || "Aquí se visualizará el mensaje de texto transmitido al teléfono del ciudadano en tiempo real..."}
                  </p>
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-zinc-800 text-[9px] font-mono text-zinc-400">
                  <span className="capitalize">
                    Motivo: {motivo.replace(/_/g, " ")}
                  </span>
                  <span>
                    {alcance === "todas_las_rutas"
                      ? "General"
                      : rutaSeleccionadaObj?.nombre || "Ruta fija"}
                  </span>
                </div>
              </div>

              <div className="py-8 text-center">
                <div className="w-24 h-1 bg-zinc-800 rounded-full mx-auto" />
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 font-mono text-center">
              Diseño adaptativo para notificaciones nativas en segundo plano.
            </p>
          </div>
        </div>
      </div>

      {/* Historial de Alertas Enviadas */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-purple-400" />
            <span>HISTORIAL DE ALERTAS TRANSMITIDAS ({historial.length})</span>
          </h2>
        </div>

        {cargandoHistorial ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-2 text-xs"
              >
                <div className="flex justify-between">
                  <Skeleton width={140} height={16} />
                  <Skeleton width={90} height={16} />
                </div>
                <Skeleton width="80%" height={12} />
              </div>
            ))}
          </div>
        ) : historial.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl space-y-1">
            <p>No se han registrado alertas en el historial.</p>
            <p className="text-[11px] text-zinc-600">
              Usa el formulario superior para emitir una notificación a los ciudadanos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {historial.map((alerta) => (
              <div
                key={alerta._id}
                className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl space-y-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    <span className="font-semibold text-white text-xs">
                      {alerta.titulo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono uppercase bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {alerta.motivo.replace(/_/g, " ")}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20">
                      {alerta.alcance === "todas_las_rutas"
                        ? "Todas las rutas"
                        : alerta.rutaId?.nombre || "Ruta específica"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{alerta.enviadosCount} entregadas</span>
                    </span>
                    <span>{new Date(alerta.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-zinc-300 text-xs leading-relaxed pl-4">
                  {alerta.mensaje}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaginaMonitorAlertas() {
  return (
    <Suspense
      fallback={
        <div className="p-8 space-y-4">
          <Skeleton height={40} width={300} />
          <Skeleton height={200} />
        </div>
      }
    >
      <ContenidoAlertas />
    </Suspense>
  );
}
