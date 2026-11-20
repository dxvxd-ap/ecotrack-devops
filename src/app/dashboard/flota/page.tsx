"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import {
  Truck,
  UserCheck,
  Plus,
  Radio,
  Gauge,
  Navigation,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Pencil,
  X,
} from "lucide-react";

export default function PaginaGestionFlota() {
  const [camiones, fijar_camiones] = useState<any[]>([]);
  const [conductores, fijar_conductores] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [guardando_camion, fijar_guardando_camion] = useState(false);
  const [guardando_conductor, fijar_guardando_conductor] = useState(false);
  const [simulando_gps, fijar_simulando_gps] = useState(false);
  const [notificacion, fijar_notificacion] = useState("");

  // Modal y formulario de edición de camión
  const [camion_a_editar, fijar_camion_a_editar] = useState<any | null>(null);
  const [form_edicion, fijar_form_edicion] = useState({
    id: "",
    matricula: "",
    numero_unidad: "",
    modelo: "",
    capacidad_toneladas: "8",
    conductor_asignado_id: "",
    estado: "disponible",
    imei: "",
  });
  const [actualizando_camion, fijar_actualizando_camion] = useState(false);

  // Formularios
  const [form_camion, fijar_form_camion] = useState({
    matricula: "",
    numero_unidad: "",
    modelo: "",
    capacidad_toneladas: "8",
    conductor_asignado_id: "",
    imei: "",
  });

  const [form_conductor, fijar_form_conductor] = useState({
    nombre_completo: "",
    numero_licencia: "",
    telefono: "",
  });

  // Simulador GPS
  const [telemetria, fijar_telemetria] = useState({
    camion_id: "",
    latitud: "19.4326",
    longitud: "-99.1332",
    velocidad_kmh: "32",
  });

  const cargar_datos = async () => {
    try {
      fijar_cargando(true);
      const [res_cam, res_cond] = await Promise.all([
        fetch("/api/camiones").then((r) => r.json()),
        fetch("/api/conductores").then((r) => r.json()),
      ]);

      if (res_cam.exito) {
        fijar_camiones(res_cam.datos || []);
        if (res_cam.datos?.length > 0 && !telemetria.camion_id) {
          fijar_telemetria((prev) => ({ ...prev, camion_id: res_cam.datos[0]._id }));
        }
      }
      if (res_cond.exito) fijar_conductores(res_cond.datos || []);
    } catch (e) {
      console.error("Error al cargar flota:", e);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_datos();
  }, []);

  const abrir_edicion = (c: any) => {
    fijar_camion_a_editar(c);
    fijar_form_edicion({
      id: c._id,
      matricula: c.matricula || "",
      numero_unidad: c.numero_unidad || "",
      modelo: c.modelo || "",
      capacidad_toneladas: String(c.capacidad_toneladas || 8),
      conductor_asignado_id: c.conductor_asignado_id?._id || c.conductor_asignado_id || "",
      estado: c.estado || "disponible",
      imei: c.imei || c.imei_gps || "",
    });
  };

  const actualizar_camion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_actualizando_camion(true);
      const res = await fetch("/api/camiones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form_edicion),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_camion_a_editar(null);
        fijar_notificacion("Unidad de camión actualizada exitosamente.");
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al actualizar camión");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      fijar_actualizando_camion(false);
    }
  };

  const registrar_camion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_guardando_camion(true);
      const res = await fetch("/api/camiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form_camion),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_form_camion({
          matricula: "",
          numero_unidad: "",
          modelo: "",
          capacidad_toneladas: "8",
          conductor_asignado_id: "",
          imei: "",
        });
        fijar_notificacion("Unidad de camión agregada a la flota.");
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al registrar camión");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      fijar_guardando_camion(false);
    }
  };

  const registrar_conductor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_guardando_conductor(true);
      const res = await fetch("/api/conductores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form_conductor),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_form_conductor({ nombre_completo: "", numero_licencia: "", telefono: "" });
        fijar_notificacion("Conductor registrado exitosamente.");
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al registrar conductor");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      fijar_guardando_conductor(false);
    }
  };

  const enviar_ping_gps = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_simulando_gps(true);
      const res = await fetch("/api/alertas/simular-gps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camion_id: telemetria.camion_id,
          latitud: Number(telemetria.latitud),
          longitud: Number(telemetria.longitud),
          velocidad_kmh: Number(telemetria.velocidad_kmh),
        }),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_notificacion(
          `Ping GPS emitido exitosamente. Alertas disparadas a ciudadanos: ${data.datos.total_alertas}`
        );
        cargar_datos();
      }
    } catch (e) {
      alert("Error al simular ping GPS");
    } finally {
      fijar_simulando_gps(false);
    }
  };

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
            <Truck className="w-3.5 h-3.5" />
            <span>MÓDULO DE FLOTA // ASIGNACIÓN ESTRICTA 1 A 1</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            GESTIÓN DE CAMIONES Y CONDUCTORES
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Administra vehículos recolectores, asignación unívoca de operador y telemetría satelital.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/conductor"
            target="_blank"
            className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Terminal Cabina / Reportar Incidente ↗</span>
          </Link>
        </div>
      </div>

      {notificacion && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center gap-2 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notificacion}</span>
        </div>
      )}

      {/* Grid Principal: Listados y Simulador GPS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Listado de Camiones */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="texto-anton text-lg tracking-wide text-white flex items-center justify-between">
              <span>UNIDADES ACTIVAS EN PARQUE VEHICULAR ({camiones.length})</span>
            </h2>

            {cargando ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <Skeleton width={80} height={18} />
                      <Skeleton width={60} height={20} borderRadius={4} />
                    </div>
                    <Skeleton width="50%" height={14} />
                    <Skeleton width="70%" height={12} />
                    <div className="p-2 bg-zinc-900/60 rounded border border-zinc-700/40 flex items-center justify-between">
                      <Skeleton width={90} height={12} />
                      <Skeleton width={110} height={12} />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <Skeleton width={120} height={10} />
                      <Skeleton width={60} height={10} />
                    </div>
                  </div>
                ))}
              </div>
            ) : camiones.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                No hay unidades registradas en la flota.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {camiones.map((c) => (
                <div
                  key={c._id}
                  className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      {c.numero_unidad}
                    </span>
                    <span
                      className={`font-mono uppercase text-[10px] px-2 py-0.5 rounded border ${
                        c.estado === "en_ruta"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse font-bold"
                          : "bg-zinc-700/30 text-zinc-300 border-zinc-600/30"
                      }`}
                    >
                      {c.estado}
                    </span>
                  </div>

                  <div className="text-zinc-300 font-sans">
                    <strong>Modelo:</strong> {c.modelo}
                  </div>
                  <div className="text-zinc-400 font-mono text-[11px]">
                    Matrícula: {c.matricula} • Capacidad: {c.capacidad_toneladas} Tons
                  </div>

                  <div className="p-2 bg-zinc-900/60 rounded border border-zinc-700/40 text-[11px] text-zinc-300 flex items-center justify-between">
                    <span className="text-zinc-500 font-mono">CONDUCTOR 1:1:</span>
                    <strong className="text-cyan-400">
                      {c.conductor_asignado_id?.nombre_completo || "Sin asignar"}
                    </strong>
                  </div>

                  <div className="p-2 bg-zinc-900/60 rounded border border-zinc-700/40 text-[11px] text-zinc-300 flex items-center justify-between">
                    <span className="text-zinc-500 font-mono flex items-center gap-1.5">
                      <Radio className="w-3 h-3 text-cyan-400" />
                      <span>GPS (IMEI):</span>
                    </span>
                    {c.imei || c.imei_gps ? (
                      <span className="font-mono text-emerald-400 font-semibold tracking-wider">
                        {c.imei || c.imei_gps}
                      </span>
                    ) : (
                      <span className="font-mono text-zinc-500 text-[10px] italic">
                        Sin GPS asignado
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {c.ultima_latitud ? (
                      <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-2">
                        <span>GPS: [{c.ultima_latitud.toFixed(4)}, {c.ultima_longitud.toFixed(4)}]</span>
                        <span className="text-blue-400">{c.ultima_velocidad_kmh} km/h</span>
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-zinc-600">Sin fix de ubicación</div>
                    )}
                    <button
                      type="button"
                      onClick={() => abrir_edicion(c)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-700/40 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors text-[11px] font-mono border border-zinc-600/30"
                    >
                      <Pencil className="w-3 h-3 text-cyan-400" />
                      <span>Editar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Listado de Conductores */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="texto-anton text-lg tracking-wide text-white">
              CONDUCTORES REGISTRADOS ({conductores.length})
            </h2>

            {cargando ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-zinc-800/40 border border-zinc-700/40 rounded-xl flex items-center justify-between text-xs gap-3"
                  >
                    <div className="space-y-1.5 flex-1">
                      <Skeleton width="60%" height={14} containerClassName="flex-1" />
                      <Skeleton width="80%" height={12} containerClassName="flex-1" />
                    </div>
                    <Skeleton width={65} height={20} borderRadius={4} />
                  </div>
                ))}
              </div>
            ) : conductores.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                No hay conductores registrados.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {conductores.map((cond) => (
                  <div
                    key={cond._id}
                    className="p-3.5 bg-zinc-800/40 border border-zinc-700/40 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-white">{cond.nombre_completo}</div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        Lic: {cond.numero_licencia} • Tel: {cond.telefono}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                      {cond.camion_asignado_id ? "Asignado" : "Disponible"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Formularios de Registro y Telemetría */}
        <div className="lg:col-span-4 space-y-6">
          {/* Simulador GPS Satelital */}
          <div className="bg-zinc-900 border border-cyan-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Simulador GPS Satelital</span>
            </div>
            <h3 className="texto-anton text-lg tracking-wide text-white">
              EMITIR PING DE UBICACIÓN
            </h3>
            <p className="text-xs text-zinc-400 font-sans">
              Envía una coordenada en tiempo real para probar el cálculo de proximidad y el disparo de alertas push a ciudadanos.
            </p>

            <form onSubmit={enviar_ping_gps} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">CAMIÓN A TRANSMITIR</label>
                <select
                  value={telemetria.camion_id}
                  onChange={(e) =>
                    fijar_telemetria({ ...telemetria, camion_id: e.target.value })
                  }
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                >
                  {camiones.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.numero_unidad} ({c.matricula})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">LATITUD</label>
                  <input
                    type="number"
                    step="any"
                    value={telemetria.latitud}
                    onChange={(e) =>
                      fijar_telemetria({ ...telemetria, latitud: e.target.value })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">LONGITUD</label>
                  <input
                    type="number"
                    step="any"
                    value={telemetria.longitud}
                    onChange={(e) =>
                      fijar_telemetria({ ...telemetria, longitud: e.target.value })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">VELOCIDAD (KM/H)</label>
                <input
                  type="number"
                  value={telemetria.velocidad_kmh}
                  onChange={(e) =>
                    fijar_telemetria({ ...telemetria, velocidad_kmh: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={simulando_gps || !telemetria.camion_id}
                className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-mono font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md text-xs uppercase"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{simulando_gps ? "Enviando..." : "Emitir Ping Telemetría"}</span>
              </button>
            </form>
          </div>

          {/* Formulario Nuevo Camión */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="texto-anton text-lg tracking-wide text-white">
              REGISTRAR NUEVO CAMIÓN
            </h3>
            <form onSubmit={registrar_camion} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">NÚMERO DE UNIDAD</label>
                <input
                  type="text"
                  value={form_camion.numero_unidad}
                  onChange={(e) =>
                    fijar_form_camion({ ...form_camion, numero_unidad: e.target.value })
                  }
                  required
                  placeholder="Ej: UNIDAD-305"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">MATRÍCULA / PLACA</label>
                <input
                  type="text"
                  value={form_camion.matricula}
                  onChange={(e) =>
                    fijar_form_camion({ ...form_camion, matricula: e.target.value })
                  }
                  required
                  placeholder="Ej: ECO-305-CDMX"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">MODELO Y MARCA</label>
                <input
                  type="text"
                  value={form_camion.modelo}
                  onChange={(e) =>
                    fijar_form_camion({ ...form_camion, modelo: e.target.value })
                  }
                  required
                  placeholder="Ej: International WorkStar Compactador"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">ASIGNAR CONDUCTOR (1:1)</label>
                <select
                  value={form_camion.conductor_asignado_id}
                  onChange={(e) =>
                    fijar_form_camion({
                      ...form_camion,
                      conductor_asignado_id: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                >
                  <option value="">-- Sin Conductor Asignado --</option>
                  {conductores.map((cond) => (
                    <option key={cond._id} value={cond._id}>
                      {cond.nombre_completo} ({cond.numero_licencia})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  IMEI DEL GPS (15 DÍGITOS)
                </label>
                <input
                  type="text"
                  value={form_camion.imei}
                  onChange={(e) =>
                    fijar_form_camion({
                      ...form_camion,
                      imei: e.target.value.replace(/\D/g, "").slice(0, 15),
                    })
                  }
                  maxLength={15}
                  placeholder="Ej. 869706062867504"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                />
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                  Identificador Coban TK303F para telemetría TCP en tiempo real.
                </span>
              </div>

              <button
                type="submit"
                disabled={guardando_camion}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-mono font-semibold py-2.5 px-4 rounded-xl text-xs uppercase"
              >
                {guardando_camion ? "Guardando..." : "Guardar Camión"}
              </button>
            </form>
          </div>

          {/* Formulario Nuevo Conductor */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="texto-anton text-lg tracking-wide text-white">
              REGISTRAR NUEVO CONDUCTOR
            </h3>
            <form onSubmit={registrar_conductor} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">NOMBRE COMPLETO</label>
                <input
                  type="text"
                  value={form_conductor.nombre_completo}
                  onChange={(e) =>
                    fijar_form_conductor({
                      ...form_conductor,
                      nombre_completo: e.target.value,
                    })
                  }
                  required
                  placeholder="Nombre y Apellidos"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">NÚMERO DE LICENCIA</label>
                <input
                  type="text"
                  value={form_conductor.numero_licencia}
                  onChange={(e) =>
                    fijar_form_conductor({
                      ...form_conductor,
                      numero_licencia: e.target.value,
                    })
                  }
                  required
                  placeholder="LIC-FEDERAL-9921"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">TELÉFONO DE CONTACTO</label>
                <input
                  type="text"
                  value={form_conductor.telefono}
                  onChange={(e) =>
                    fijar_form_conductor({ ...form_conductor, telefono: e.target.value })
                  }
                  required
                  placeholder="+52 55 0000 0000"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={guardando_conductor}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-mono font-semibold py-2.5 px-4 rounded-xl text-xs uppercase border border-zinc-700"
              >
                {guardando_conductor ? "Guardando..." : "Guardar Conductor"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal de Edición de Camión */}
      {camion_a_editar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                  Actualización de Unidad
                </span>
                <h3 className="texto-anton text-lg tracking-wide text-white mt-0.5">
                  EDITAR {form_edicion.numero_unidad || "CAMIÓN"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => fijar_camion_a_editar(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={actualizar_camion} className="space-y-3.5 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">NÚMERO DE UNIDAD</label>
                  <input
                    type="text"
                    value={form_edicion.numero_unidad}
                    onChange={(e) =>
                      fijar_form_edicion({ ...form_edicion, numero_unidad: e.target.value })
                    }
                    required
                    placeholder="Ej: UNIDAD-305"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">MATRÍCULA / PLACA</label>
                  <input
                    type="text"
                    value={form_edicion.matricula}
                    onChange={(e) =>
                      fijar_form_edicion({ ...form_edicion, matricula: e.target.value })
                    }
                    required
                    placeholder="Ej: ECO-305-CDMX"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">MODELO Y MARCA</label>
                <input
                  type="text"
                  value={form_edicion.modelo}
                  onChange={(e) =>
                    fijar_form_edicion({ ...form_edicion, modelo: e.target.value })
                  }
                  required
                  placeholder="Ej: International WorkStar Compactador"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  IMEI DEL GPS (15 DÍGITOS)
                </label>
                <input
                  type="text"
                  value={form_edicion.imei}
                  onChange={(e) =>
                    fijar_form_edicion({
                      ...form_edicion,
                      imei: e.target.value.replace(/\D/g, "").slice(0, 15),
                    })
                  }
                  maxLength={15}
                  placeholder="Ej. 869706062867504"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                />
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                  Identificador físico Coban TK303F para rastreo satelital TCP.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">ESTADO OPERATIVO</label>
                  <select
                    value={form_edicion.estado}
                    onChange={(e) =>
                      fijar_form_edicion({ ...form_edicion, estado: e.target.value })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value="disponible">Disponible (Base)</option>
                    <option value="en_ruta">En ruta de recolección</option>
                    <option value="en_mantenimiento">En mantenimiento</option>
                    <option value="fuera_servicio">Fuera de servicio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">CAPACIDAD (TONS)</label>
                  <input
                    type="number"
                    value={form_edicion.capacidad_toneladas}
                    onChange={(e) =>
                      fijar_form_edicion({ ...form_edicion, capacidad_toneladas: e.target.value })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">ASIGNAR CONDUCTOR (1:1)</label>
                <select
                  value={form_edicion.conductor_asignado_id}
                  onChange={(e) =>
                    fijar_form_edicion({
                      ...form_edicion,
                      conductor_asignado_id: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono"
                >
                  <option value="">-- Sin Conductor Asignado --</option>
                  {conductores.map((cond) => (
                    <option key={cond._id} value={cond._id}>
                      {cond.nombre_completo} ({cond.numero_licencia})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => fijar_camion_a_editar(null)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actualizando_camion}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-mono font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white transition-colors shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{actualizando_camion ? "Guardando..." : "Guardar Cambios"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

