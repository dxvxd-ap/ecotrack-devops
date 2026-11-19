"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Truck,
  AlertTriangle,
  MapPin,
  Send,
  CheckCircle2,
  Clock,
  ArrowLeft,
  RefreshCw,
  Gauge,
  Navigation,
  ShieldAlert,
  Wrench,
  Ban,
  PackageCheck,
  HelpCircle,
  X,
  PhoneCall,
} from "lucide-react";

interface Camion {
  _id: string;
  numero_unidad: string;
  matricula: string;
  modelo?: string;
  capacidad_toneladas?: number;
  estado?: string;
}

interface Ruta {
  _id: string;
  nombre: string;
  color?: string;
  distanciaKm?: number;
  duracionMin?: number;
}

interface IncidenteReciente {
  _id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  prioridad: string;
  estado: string;
  createdAt: string;
  notasAdmin?: string;
}

const OPCIONES_INCIDENTE = [
  {
    id: "falla_mecanica",
    etiqueta: "Falla Mecánica",
    descripcion: "Avería de motor, frenos, neumáticos o sistema hidráulico",
    icono: Wrench,
    prioridad: "critica",
    colorBorde: "border-red-500",
    colorFondo: "bg-red-500/10",
    colorTexto: "text-red-400",
  },
  {
    id: "calle_bloqueada",
    etiqueta: "Calle bloqueada / Accidente",
    descripcion: "Obstrucción vial, obras, manifestación o choque vehicular",
    icono: Ban,
    prioridad: "alta",
    colorBorde: "border-amber-500",
    colorFondo: "bg-amber-500/10",
    colorTexto: "text-amber-400",
  },
  {
    id: "unidad_llena",
    etiqueta: "Camión lleno (Tolva al 100%)",
    descripcion: "Capacidad máxima alcanzada; requiere traslado al tiradero/estación",
    icono: PackageCheck,
    prioridad: "media",
    colorBorde: "border-blue-500",
    colorFondo: "bg-blue-500/10",
    colorTexto: "text-blue-400",
  },
  {
    id: "otro",
    etiqueta: "Otro incidente",
    descripcion: "Problemas con vecinos, animales, lluvia extrema o eventualidades",
    icono: HelpCircle,
    prioridad: "media",
    colorBorde: "border-zinc-500",
    colorFondo: "bg-zinc-800",
    colorTexto: "text-zinc-300",
  },
] as const;

type TipoIncidente = typeof OPCIONES_INCIDENTE[number]["id"];

export default function PaginaVistaConductor() {
  const [camiones, setCamiones] = useState<Camion[]>([]);
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  // Unidad y ruta seleccionada
  const [camionSeleccionadoId, setCamionSeleccionadoId] = useState<string>("");
  const [rutaSeleccionadaId, setRutaSeleccionadaId] = useState<string>("");
  const [nombreConductor, setNombreConductor] = useState<string>("");

  // Telemetría GPS en tiempo real
  const [coordsGPS, setCoordsGPS] = useState<{ lat: number; lng: number } | null>(null);
  const [precisionGPS, setPrecisionGPS] = useState<number | null>(null);
  const [obteniendoGPS, setObteniendoGPS] = useState(false);
  const [horaActual, setHoraActual] = useState("");

  // Modal de reporte
  const [modalAbierto, setModalAbierto] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoIncidente>("falla_mecanica");
  const [tituloReporte, setTituloReporte] = useState("Falla mecánica en unidad de ruta");
  const [descripcionReporte, setDescripcionReporte] = useState("");
  const [direccionReporte, setDireccionReporte] = useState("");
  const [enviandoReporte, setEnviandoReporte] = useState(false);
  const [reporteEnviadoExito, setReporteEnviadoExito] = useState(false);
  const [errorReporte, setErrorReporte] = useState<string | null>(null);

  // Historial de incidentes reportados en la sesión
  const [incidentesHoy, setIncidentesHoy] = useState<IncidenteReciente[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Reloj en tiempo real
  useEffect(() => {
    const actualizarReloj = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    actualizarReloj();
    const interval = setInterval(actualizarReloj, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cargar camiones y rutas
  useEffect(() => {
    async function inicializar() {
      try {
        setCargandoDatos(true);
        const [resCamiones, resRutas] = await Promise.all([
          fetch("/api/camiones").then((r) => r.json()).catch(() => ({ exito: false, datos: [] })),
          fetch("/api/rutas").then((r) => r.json()).catch(() => ({ exito: false, rutas: [] })),
        ]);

        const listaCamiones = resCamiones.datos || [];
        const listaRutas = resRutas.rutas || (resRutas.datos ? resRutas.datos : []);

        setCamiones(listaCamiones);
        setRutas(listaRutas);

        // Recuperar preferencia de local storage si existe
        const camionPrevio = localStorage.getItem("ecotrack_conductor_camion_id");
        const rutaPrevia = localStorage.getItem("ecotrack_conductor_ruta_id");
        const conductorPrevio = localStorage.getItem("ecotrack_conductor_nombre");

        if (camionPrevio && listaCamiones.some((c: Camion) => c._id === camionPrevio)) {
          setCamionSeleccionadoId(camionPrevio);
        } else if (listaCamiones.length > 0) {
          setCamionSeleccionadoId(listaCamiones[0]._id);
        }

        if (rutaPrevia && listaRutas.some((r: Ruta) => r._id === rutaPrevia)) {
          setRutaSeleccionadaId(rutaPrevia);
        } else if (listaRutas.length > 0) {
          setRutaSeleccionadaId(listaRutas[0]._id);
        }

        if (conductorPrevio) {
          setNombreConductor(conductorPrevio);
        }
      } finally {
        setCargandoDatos(false);
      }
    }

    inicializar();
    capturarGPS();
  }, []);

  // Guardar selecciones en localStorage
  useEffect(() => {
    if (camionSeleccionadoId) {
      localStorage.setItem("ecotrack_conductor_camion_id", camionSeleccionadoId);
      cargarHistorialIncidentes(camionSeleccionadoId);
    }
  }, [camionSeleccionadoId]);

  useEffect(() => {
    if (rutaSeleccionadaId) {
      localStorage.setItem("ecotrack_conductor_ruta_id", rutaSeleccionadaId);
    }
  }, [rutaSeleccionadaId]);

  useEffect(() => {
    if (nombreConductor) {
      localStorage.setItem("ecotrack_conductor_nombre", nombreConductor);
    }
  }, [nombreConductor]);

  // Cargar incidentes recientes de la unidad
  async function cargarHistorialIncidentes(camionId: string) {
    if (!camionId) return;
    try {
      setCargandoHistorial(true);
      const res = await fetch(`/api/reportes?origen=conductor&camionId=${camionId}&limite=5`);
      const datos = await res.json();
      if (datos.exito && datos.reportes) {
        setIncidentesHoy(datos.reportes);
      }
    } catch {
      // Silencioso
    } finally {
      setCargandoHistorial(false);
    }
  }

  // Capturar coordenadas GPS
  function capturarGPS() {
    setObteniendoGPS(true);
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoordsGPS({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setPrecisionGPS(Math.round(pos.coords.accuracy));
          setObteniendoGPS(false);
        },
        () => {
          // Coordenadas por defecto Gutiérrez Zamora
          setCoordsGPS({ lat: 20.4514, lng: -97.0886 });
          setPrecisionGPS(null);
          setObteniendoGPS(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setCoordsGPS({ lat: 20.4514, lng: -97.0886 });
      setObteniendoGPS(false);
    }
  }

  function seleccionarOpcionIncidente(op: typeof OPCIONES_INCIDENTE[number]) {
    setTipoSeleccionado(op.id);
    const camionActual = camiones.find((c) => c._id === camionSeleccionadoId);
    const etiquetaUnidad = camionActual ? `Unidad ${camionActual.numero_unidad}` : "Unidad";

    if (op.id === "falla_mecanica") {
      setTituloReporte(`Falla mecánica en ${etiquetaUnidad}`);
    } else if (op.id === "calle_bloqueada") {
      setTituloReporte(`Calle bloqueada / Obstrucción vial (${etiquetaUnidad})`);
    } else if (op.id === "unidad_llena") {
      setTituloReporte(`Camión lleno (Tolva al 100%) - ${etiquetaUnidad}`);
    } else {
      setTituloReporte(`Incidente operativo en ${etiquetaUnidad}`);
    }
  }

  async function enviarIncidente(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcionReporte.trim()) {
      setErrorReporte("Por favor añade una breve descripción de lo ocurrido.");
      return;
    }

    try {
      setEnviandoReporte(true);
      setErrorReporte(null);

      const opcion = OPCIONES_INCIDENTE.find((o) => o.id === tipoSeleccionado);
      const prioridad = opcion?.prioridad || "alta";

      const payload = {
        origen: "conductor",
        tipo: tipoSeleccionado,
        titulo: tituloReporte.trim(),
        descripcion: descripcionReporte.trim(),
        rutaId: rutaSeleccionadaId || undefined,
        camionId: camionSeleccionadoId || undefined,
        prioridad,
        ubicacion: {
          lat: coordsGPS?.lat ?? 20.4514,
          lng: coordsGPS?.lng ?? -97.0886,
          direccion: direccionReporte.trim() || "Posición GPS de cabina",
        },
        reportadoPor: {
          nombre: nombreConductor.trim() || "Conductor en Turno",
          contacto: "Cabina de Unidad",
        },
      };

      const res = await fetch("/api/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.exito) {
        throw new Error(data.mensaje || "Error al registrar el reporte");
      }

      setReporteEnviadoExito(true);
      setDescripcionReporte("");
      if (camionSeleccionadoId) {
        cargarHistorialIncidentes(camionSeleccionadoId);
      }
    } catch (err: any) {
      setErrorReporte(err.message || "Error al transmitir el incidente a la base.");
    } finally {
      setEnviandoReporte(false);
    }
  }

  const camionActual = camiones.find((c) => c._id === camionSeleccionadoId);
  const rutaActual = rutas.find((r) => r._id === rutaSeleccionadaId);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col selection:bg-amber-500 selection:text-black">
      {/* Barra superior de cabina */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-30 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-mono transition-colors p-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60"
            title="Ir al Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">DASHBOARD</span>
          </Link>
          <div className="h-5 w-px bg-zinc-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="texto-anton text-base sm:text-lg tracking-wider text-white">
              CABINA CONDUCTOR // ECOTRACK
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-mono text-emerald-400 font-bold">{horaActual}</div>
            <div className="text-[10px] font-mono text-zinc-400">Gutiérrez Zamora, Ver.</div>
          </div>
          <div className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            <span>{camionActual ? `UNIDAD ${camionActual.numero_unidad}` : "SIN ASIGNAR"}</span>
          </div>
        </div>
      </header>

      {/* Contenedor central - Optimizado para tablets / smartphones en soporte de cabina */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Selector de Unidad y Ruta */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs font-mono">
            {/* Camión */}
            <div>
              <label className="block text-zinc-400 mb-1.5 uppercase font-bold flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-400" />
                <span>Camión Asignado</span>
              </label>
              <select
                value={camionSeleccionadoId}
                onChange={(e) => setCamionSeleccionadoId(e.target.value)}
                disabled={cargandoDatos}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white font-sans focus:outline-none focus:border-amber-500 font-semibold"
              >
                {camiones.map((c) => (
                  <option key={c._id} value={c._id}>
                    Unidad {c.numero_unidad} ({c.matricula}) {c.modelo ? `- ${c.modelo}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Ruta */}
            <div>
              <label className="block text-zinc-400 mb-1.5 uppercase font-bold flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-blue-400" />
                <span>Ruta en Curso</span>
              </label>
              <select
                value={rutaSeleccionadaId}
                onChange={(e) => setRutaSeleccionadaId(e.target.value)}
                disabled={cargandoDatos}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white font-sans focus:outline-none focus:border-blue-500 font-semibold"
              >
                {rutas.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Conductor */}
            <div>
              <label className="block text-zinc-400 mb-1.5 uppercase font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Nombre Conductor</span>
              </label>
              <input
                type="text"
                placeholder="Nombre del operador"
                value={nombreConductor}
                onChange={(e) => setNombreConductor(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white font-sans focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Telemetría GPS */}
          <div className="mt-4 pt-3.5 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-400">GPS Cabina:</span>
              <span className="text-white font-semibold">
                {coordsGPS ? `${coordsGPS.lat.toFixed(5)}, ${coordsGPS.lng.toFixed(5)}` : "Adquiriendo señal..."}
              </span>
              {precisionGPS && (
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                  ±{precisionGPS}m
                </span>
              )}
            </div>

            <button
              onClick={capturarGPS}
              disabled={obteniendoGPS}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors border border-zinc-700/60 text-[11px]"
            >
              <RefreshCw className={`w-3 h-3 ${obteniendoGPS ? "animate-spin" : ""}`} />
              <span>{obteniendoGPS ? "Actualizando GPS..." : "Refrescar GPS"}</span>
            </button>
          </div>
        </section>

        {/* BOTÓN PROMINENTE DE REPORTAR INCIDENTE (ACCESO RÁPIDO PARA CABINA) */}
        <section className="bg-gradient-to-br from-red-950/60 via-zinc-900 to-zinc-900 border-2 border-red-600/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-mono uppercase tracking-wider font-bold">
              <ShieldAlert className="w-4 h-4 animate-bounce" />
              <span>Canal de Emergencia y Operaciones</span>
            </div>
            <h2 className="texto-anton text-2xl sm:text-3xl tracking-wide text-white">
              ¿SURGIÓ UN IMPREVISTO EN TU RUTA?
            </h2>
            <p className="text-zinc-300 text-xs sm:text-sm font-sans">
              Notifica instantáneamente al Centro de Control municipal sobre fallas mecánicas, calles cerradas o tolva llena para reorganizar la logística y alertar a la ciudadanía.
            </p>
          </div>

          <button
            onClick={() => {
              setModalAbierto(true);
              setReporteEnviadoExito(false);
              setErrorReporte(null);
            }}
            className="w-full sm:w-auto px-8 py-5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-2xl font-black text-base sm:text-lg tracking-wider uppercase font-mono shadow-xl hover:shadow-red-500/25 transition-all transform active:scale-95 flex items-center justify-center gap-3 shrink-0 border border-red-400/30"
          >
            <AlertTriangle className="w-6 h-6 animate-pulse" />
            <span>REPORTAR INCIDENTE</span>
          </button>
        </section>

        {/* Resumen del Recorrido Actual */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-blue-400" />
                <span>Ruta Asignada</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                En Progreso
              </span>
            </div>
            <div className="texto-anton text-xl text-white">
              {rutaActual ? rutaActual.nombre : "Sin ruta asignada"}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800 text-xs font-mono">
              <div className="text-zinc-400">
                Distancia estimada:{" "}
                <span className="text-white font-bold">
                  {rutaActual?.distanciaKm ? `${rutaActual.distanciaKm} km` : "N/D"}
                </span>
              </div>
              <div className="text-zinc-400">
                Tiempo promedio:{" "}
                <span className="text-white font-bold">
                  {rutaActual?.duracionMin ? `${rutaActual.duracionMin} min` : "N/D"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-400" />
                <span>Ficha de la Unidad</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                Operativa
              </span>
            </div>
            <div className="texto-anton text-xl text-white">
              {camionActual ? `UNIDAD ${camionActual.numero_unidad} • ${camionActual.matricula}` : "Selecciona una unidad"}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800 text-xs font-mono">
              <div className="text-zinc-400">
                Capacidad:{" "}
                <span className="text-white font-bold">
                  {camionActual?.capacidad_toneladas ? `${camionActual.capacidad_toneladas} Tons` : "8 Tons"}
                </span>
              </div>
              <div className="text-zinc-400">
                Operador:{" "}
                <span className="text-white font-bold">
                  {nombreConductor || "No especificado"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Historial de Incidentes Reportados en la jornada */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>INCIDENTES REPORTADOS HOY</span>
            </h3>
            {camionSeleccionadoId && (
              <button
                onClick={() => cargarHistorialIncidentes(camionSeleccionadoId)}
                className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${cargandoHistorial ? "animate-spin" : ""}`} />
                <span>Actualizar</span>
              </button>
            )}
          </div>

          {incidentesHoy.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
              No hay incidentes reportados para esta unidad hoy. ¡Buen viaje!
            </div>
          ) : (
            <div className="space-y-3">
              {incidentesHoy.map((inc) => (
                <div
                  key={inc._id}
                  className="p-3.5 bg-zinc-800/80 border border-zinc-700/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                          inc.prioridad === "critica"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : inc.prioridad === "alta"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {inc.prioridad}
                      </span>
                      <strong className="text-white text-sm">{inc.titulo}</strong>
                    </div>
                    <p className="text-zinc-300 font-sans">{inc.descripcion}</p>
                    {inc.notasAdmin && (
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-[11px] font-mono mt-1">
                        <strong>Respuesta de Base:</strong> {inc.notasAdmin}
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 font-mono text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        inc.estado === "resuelto"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : inc.estado === "en_proceso"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {inc.estado.toUpperCase()}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(inc.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL PARA REPORTAR INCIDENTE (OPCIONES SEGÚN REQUERIMIENTO 3) */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            {/* Cabecera del modal */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
              <div className="flex items-center gap-2 text-red-400 font-mono text-xs font-bold uppercase">
                <AlertTriangle className="w-4 h-4" />
                <span>Transmisión de Incidente de Cabina</span>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-5 sm:p-6 space-y-6">
              {reporteEnviadoExito ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h3 className="texto-anton text-2xl text-white tracking-wide">
                    ¡INCIDENTE REGISTRADO CON ÉXITO!
                  </h3>
                  <p className="text-zinc-300 text-xs sm:text-sm font-sans max-w-md mx-auto">
                    El Centro de Control y Despacho ya recibió la alerta con tu ubicación GPS y los datos de la unidad.
                  </p>
                  <button
                    onClick={() => {
                      setModalAbierto(false);
                      setReporteEnviadoExito(false);
                    }}
                    className="mt-4 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs font-bold uppercase rounded-xl transition-colors"
                  >
                    Cerrar y volver a la cabina
                  </button>
                </div>
              ) : (
                <form onSubmit={enviarIncidente} className="space-y-5">
                  {/* Selector de 4 opciones requeridas */}
                  <div className="space-y-2">
                    <label className="block text-zinc-400 font-mono text-xs uppercase font-bold">
                      1. Tipo de Incidente (Selecciona una opción)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {OPCIONES_INCIDENTE.map((op) => {
                        const Icono = op.icono;
                        const esSeleccionado = tipoSeleccionado === op.id;
                        return (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => seleccionarOpcionIncidente(op)}
                            className={`p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                              esSeleccionado
                                ? `${op.colorBorde} ${op.colorFondo} ring-2 ring-offset-2 ring-offset-zinc-900 ring-red-500/50`
                                : "border-zinc-800 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            <div className={`p-2 rounded-xl bg-zinc-900 shrink-0 ${op.colorTexto}`}>
                              <Icono className="w-5 h-5" />
                            </div>
                            <div className="space-y-0.5">
                              <div className={`font-bold text-xs font-sans ${esSeleccionado ? "text-white" : "text-zinc-300"}`}>
                                {op.etiqueta}
                              </div>
                              <div className="text-[11px] text-zinc-500 leading-tight">
                                {op.descripcion}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Título y descripción */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-zinc-400 font-mono text-xs uppercase font-bold mb-1">
                        Título de la alerta
                      </label>
                      <input
                        type="text"
                        value={tituloReporte}
                        onChange={(e) => setTituloReporte(e.target.value)}
                        required
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-sans text-xs focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 font-mono text-xs uppercase font-bold mb-1">
                        Detalles o causa (¿Qué sucedió?)
                      </label>
                      <textarea
                        rows={3}
                        value={descripcionReporte}
                        onChange={(e) => setDescripcionReporte(e.target.value)}
                        required
                        placeholder="Ej. Ponchadura de llanta trasera derecha en Av. Hidalgo esquina con Morelos. Se requiere apoyo de taller..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-sans text-xs focus:outline-none focus:border-red-500 placeholder:text-zinc-600"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 font-mono text-xs uppercase font-bold mb-1">
                        Referencia o Dirección vial (Opcional)
                      </label>
                      <input
                        type="text"
                        value={direccionReporte}
                        onChange={(e) => setDireccionReporte(e.target.value)}
                        placeholder="Ej: Av. 5 de Mayo frente al parque central"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-sans text-xs focus:outline-none focus:border-red-500 placeholder:text-zinc-600"
                      />
                    </div>
                  </div>

                  {/* Resumen de telemetría a enviar */}
                  <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-2xl text-[11px] font-mono space-y-1.5 text-zinc-400">
                    <div className="flex items-center justify-between text-zinc-300">
                      <span>UNIDAD ASIGNADA:</span>
                      <strong className="text-amber-400">
                        {camionActual ? `Unidad ${camionActual.numero_unidad} (${camionActual.matricula})` : "No seleccionada"}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-zinc-300">
                      <span>RUTA EN RECORRIDO:</span>
                      <strong className="text-blue-400">{rutaActual ? rutaActual.nombre : "Sin ruta"}</strong>
                    </div>
                    <div className="flex items-center justify-between text-zinc-300">
                      <span>COORDENADAS GPS:</span>
                      <strong className="text-emerald-400">
                        {coordsGPS ? `[${coordsGPS.lat.toFixed(5)}, ${coordsGPS.lng.toFixed(5)}]` : "Detectando..."}
                      </strong>
                    </div>
                  </div>

                  {errorReporte && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
                      {errorReporte}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setModalAbierto(false)}
                      className="w-1/3 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs uppercase font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={enviandoReporte}
                      className="w-2/3 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl font-mono text-xs uppercase font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>{enviandoReporte ? "Transmitiendo a base..." : "Enviar a Centro de Control"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
