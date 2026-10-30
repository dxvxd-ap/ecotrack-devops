"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  Bell,
  MapPin,
  Radio,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Send,
  Navigation,
} from "lucide-react";

export default function PaginaPortalCiudadano() {
  const [cargando, fijar_cargando] = useState(true);
  const [zonas, fijar_zonas] = useState<any[]>([]);
  const [historial, fijar_historial] = useState<any[]>([]);
  const [guardando, fijar_guardando] = useState(false);
  const [mensaje_estado, fijar_mensaje_estado] = useState("");

  // Formulario de suscripción con ubicación en Gutiérrez Zamora, Veracruz
  const [formulario, fijar_formulario] = useState({
    etiqueta_zona: "Mi Domicilio",
    direccion_texto: "Av. Manuel Ávila Camacho 102, Centro, Gutiérrez Zamora, Ver.",
    latitud: "20.4514",
    longitud: "-97.0886",
    radio_cobertura_metros: "400",
  });

  const cargar_datos = async () => {
    try {
      fijar_cargando(true);
      const respuesta = await fetch("/api/alertas/ciudadano");
      const datos = await respuesta.json();
      if (datos.exito) {
        fijar_zonas(datos.datos.zonas_suscritas || []);
        fijar_historial(datos.datos.historial_alertas || []);
      }
    } catch (error) {
      console.error("Error al cargar alertas del ciudadano:", error);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_datos();
  }, []);

  const manejar_envio_formulario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_guardando(true);
      fijar_mensaje_estado("");

      const respuesta = await fetch("/api/alertas/ciudadano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formulario),
      });

      const resultado = await respuesta.json();
      if (resultado.exito) {
        fijar_mensaje_estado("¡Zona de alerta registrada correctamente!");
        cargar_datos();
      } else {
        fijar_mensaje_estado(resultado.mensaje || "Error al registrar");
      }
    } catch (error: any) {
      fijar_mensaje_estado("Error de conexión al guardar");
    } finally {
      fijar_guardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      {/* Cabecera */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs font-mono transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>INICIO</span>
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-500 animate-pulse" />
            <h1 className="texto-anton text-lg tracking-wide">
              PORTAL CIUDADANO // ALERTAS DE RECOLECCIÓN
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Suscripción Espacial Activa
          </span>
          <UserButton />
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Columna Izquierda: Formulario de Registro Espacial */}
          <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <div className="flex items-center gap-2 text-blue-400 text-xs font-mono mb-1 uppercase tracking-wider">
                <MapPin className="w-3.5 h-3.5" />
                <span>Geolocalización de tu Casa</span>
              </div>
              <h2 className="texto-anton text-xl tracking-wide text-white">
                SUSCRIBIR MI UBICACIÓN
              </h2>
              <p className="text-xs text-zinc-400 font-sans mt-1">
                Recibirás una alerta cuando el camión de recolección entre en tu radio de proximidad.
              </p>
            </div>

            <form onSubmit={manejar_envio_formulario} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOMBRE DE REFERENCIA
                </label>
                <input
                  type="text"
                  value={formulario.etiqueta_zona}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, etiqueta_zona: e.target.value })
                  }
                  required
                  placeholder="Ej: Mi Casa, Local Familiar"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  DIRECCIÓN TEXTUAL
                </label>
                <input
                  type="text"
                  value={formulario.direccion_texto}
                  onChange={(e) =>
                    fijar_formulario({ ...formulario, direccion_texto: e.target.value })
                  }
                  required
                  placeholder="Calle, Número y Colonia"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    LATITUD
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formulario.latitud}
                    onChange={(e) =>
                      fijar_formulario({ ...formulario, latitud: e.target.value })
                    }
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    LONGITUD
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formulario.longitud}
                    onChange={(e) =>
                      fijar_formulario({ ...formulario, longitud: e.target.value })
                    }
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono text-[11px] text-zinc-400 mb-1">
                  <span>RADIO DE AVISO (METROS)</span>
                  <span className="text-blue-400 font-bold">{formulario.radio_cobertura_metros} m</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="1000"
                  step="50"
                  value={formulario.radio_cobertura_metros}
                  onChange={(e) =>
                    fijar_formulario({
                      ...formulario,
                      radio_cobertura_metros: e.target.value,
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {mensaje_estado && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono">
                  {mensaje_estado}
                </div>
              )}

              <button
                type="submit"
                disabled={guardando}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md font-mono uppercase tracking-wider text-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{guardando ? "Guardando..." : "Guardar Ubicación"}</span>
              </button>
            </form>
          </div>

          {/* Columna Derecha: Zonas Registradas e Historial de Notificaciones */}
          <div className="lg:col-span-7 space-y-6">
            {/* Zonas Registradas */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h3 className="texto-anton text-lg tracking-wide text-white mb-4 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-emerald-400" />
                <span>TUS ZONAS MONITOREADAS</span>
              </h3>

              {zonas.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                  No tienes zonas de monitoreo registradas aún. Registra tu casa con el formulario.
                </div>
              ) : (
                <div className="space-y-3">
                  {zonas.map((z) => (
                    <div
                      key={z._id}
                      className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {z.etiqueta_zona}
                        </div>
                        <div className="text-zinc-400 text-xs font-sans mt-0.5">
                          {z.direccion_texto}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-1">
                          Coords: [{z.latitud.toFixed(4)}, {z.longitud.toFixed(4)}] • Radio: {z.radio_cobertura_metros}m
                        </div>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                        Activa
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historial de Alertas Push */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h3 className="texto-anton text-lg tracking-wide text-white mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-400" />
                <span>HISTORIAL DE AVISOS RECIBIDOS</span>
              </h3>

              {historial.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                  Aún no se han disparado alertas de proximidad en tu área.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {historial.map((item) => (
                    <div
                      key={item._id}
                      className="p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-purple-300 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <Bell className="w-3.5 h-3.5 text-purple-400" />
                          {item.mensaje}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {new Date(item.fecha_envio).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono pl-5">
                        Distancia calculada: {item.distancia_metros} metros de tu domicilio
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

