"use client";

import { puedeEditarGeometria } from "@/lib/rutas_mapa";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Map,
  Plus,
  Trash2,
  Undo2,
  Save,
  Palette,
  Compass,
  AlertCircle,
  CheckCircle2,
  Navigation,
  Route as IconoRuta,
  Edit2,
  X,
} from "lucide-react";

// Importar mapa dinámicamente sin SSR para Leaflet
const MapaRutas = dynamic(
  () => import("@/componentes/mapas/MapaRutasInteractivo"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[550px] w-full bg-zinc-900 animate-pulse rounded-xl flex items-center justify-center font-mono text-xs text-zinc-500">
        Cargando mapa cartográfico de Gutiérrez Zamora, Ver...
      </div>
    ),
  }
);

// Calcular distancia geográfica total en km de la polilínea completa
function calcular_distancia_geometria_km(puntos: [number, number][]): number {
  if (puntos.length < 2) return 0;
  let total = 0;
  const rad = (g: number) => (g * Math.PI) / 180;

  for (let i = 0; i < puntos.length - 1; i++) {
    const [lat1, lon1] = puntos[i];
    const [lat2, lon2] = puntos[i + 1];
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += 6371 * c;
  }
  return Number(total.toFixed(2));
}

export default function PaginaGestionRutas() {
  const [rutas, fijar_rutas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [guardando, fijar_guardando] = useState(false);
  const [modo_dibujo, fijar_modo_dibujo] = useState(false);
  const [ajustar_a_calles, fijar_ajustar_a_calles] = useState(true); // Activo por defecto
  const [mensaje_notificacion, fijar_mensaje_notificacion] = useState("");

  // Estado del trazado
  const [puntos_clave, fijar_puntos_clave] = useState<[number, number][]>([]);
  const [coordenadas_detalle, fijar_coordenadas_detalle] = useState<[number, number][]>([]);
  const [nombre_ruta, fijar_nombre_ruta] = useState("");
  const [id_ruta, fijar_id_ruta] = useState("");
  const [descripcion_ruta, fijar_descripcion_ruta] = useState("");
  const [color_seleccionado, fijar_color_seleccionado] = useState("#2f63ff");

  // Estado de edición de ruta existente
  const [ruta_en_edicion, fijar_ruta_en_edicion] = useState<any>(null);

  const colores_disponibles = [
    { nombre: "Cobalto", hex: "#2f63ff" },
    { nombre: "Esmeralda", hex: "#10b981" },
    { nombre: "Ámbar", hex: "#f59e0b" },
    { nombre: "Púrpura", hex: "#8b5cf6" },
    { nombre: "Carmesí", hex: "#ef4444" },
  ];

  const cargar_rutas = async () => {
    try {
      fijar_cargando(true);
      const respuesta = await fetch("/api/rutas");
      const datos = await respuesta.json();
      if (datos.exito) {
        fijar_rutas(datos.datos || []);
      }
    } catch (e) {
      console.error("Error al cargar rutas:", e);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_rutas();
  }, []);

  const distancia_calculada_km = calcular_distancia_geometria_km(coordenadas_detalle);

  const manejar_actualizacion_trazado = (
    nuevas_coords: [number, number][],
    claves: [number, number][],
    _distancia: number
  ) => {
    fijar_coordenadas_detalle(nuevas_coords);
    fijar_puntos_clave(claves);
  };

  const deshacer_ultimo_punto = () => {
    if (puntos_clave.length <= 1) {
      limpiar_trazado_actual();
      return;
    }
    // Quitar el último punto clave y reiniciar el detalle
    fijar_puntos_clave((prev) => prev.slice(0, -1));
    fijar_coordenadas_detalle((prev) => prev.slice(0, Math.max(1, Math.floor(prev.length * 0.7))));
  };

  const limpiar_trazado_actual = () => {
    fijar_puntos_clave([]);
    fijar_coordenadas_detalle([]);
    fijar_nombre_ruta("");
    fijar_id_ruta("");
    fijar_descripcion_ruta("");
    fijar_color_seleccionado("#2f63ff");
    fijar_ruta_en_edicion(null);
    fijar_modo_dibujo(false);
  };

  const iniciar_edicion_ruta = (r: any) => {
    if (!puedeEditarGeometria(r.trazado_geojson)) {
      fijar_mensaje_notificacion("Esta ruta se conserva sin cambios. El editor solo permite LineString de dos dimensiones; no permite editar MultiLineString ni unir sus segmentos.");
      return;
    }
    fijar_ruta_en_edicion(r);
    fijar_id_ruta(r.id_ruta || "");
    fijar_nombre_ruta(r.nombre || "");
    fijar_descripcion_ruta(r.descripcion || "");
    fijar_color_seleccionado(r.color_mapa || "#2f63ff");

    // Convertir de GeoJSON [lon, lat] a [lat, lon] para Leaflet
    if (r.trazado_geojson?.coordinates && Array.isArray(r.trazado_geojson.coordinates)) {
      const coords_lat_lng: [number, number][] = r.trazado_geojson.coordinates.map(
        ([lon, lat]: [number, number]) => [lat, lon]
      );
      fijar_coordenadas_detalle(coords_lat_lng);
      // Para puntos clave, usar el inicio y fin o una muestra representativa
      if (coords_lat_lng.length > 0) {
        fijar_puntos_clave([
          coords_lat_lng[0],
          ...(coords_lat_lng.length > 2 ? [coords_lat_lng[Math.floor(coords_lat_lng.length / 2)]] : []),
          coords_lat_lng[coords_lat_lng.length - 1],
        ]);
      }
    }

    fijar_modo_dibujo(true);
    fijar_mensaje_notificacion(`Modo edición activado para "${r.nombre}". Puedes ajustar puntos en el mapa o editar los datos.`);
  };

  const guardar_nueva_ruta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ruta_en_edicion && !puedeEditarGeometria(ruta_en_edicion.trazado_geojson)) {
      alert("No se guardaron cambios: esta geometría no puede editarse sin perder información.");
      return;
    }

    if (coordenadas_detalle.length < 2) {
      alert("Debes marcar al menos dos puntos en el mapa para trazar la ruta por las calles.");
      return;
    }

    try {
      fijar_guardando(true);
      fijar_mensaje_notificacion("");

      // Formato GeoJSON: [longitud, latitud]
      const coordenadas_geojson = coordenadas_detalle.map(([lat, lon]) => [lon, lat]);

      const payload = {
        _id: ruta_en_edicion?._id,
        id_ruta: id_ruta.trim() || `RUTA-GZ-${Date.now().toString().slice(-4)}`,
        nombre: nombre_ruta.trim(),
        descripcion: descripcion_ruta.trim(),
        trazado_geojson: {
          type: "LineString",
          coordinates: coordenadas_geojson,
        },
        color_mapa: color_seleccionado,
        distancia_estimada_km: distancia_calculada_km,
        duracion_estimada_min: Math.round(distancia_calculada_km * 12),
      };

      const es_edicion = Boolean(ruta_en_edicion);
      const respuesta = await fetch("/api/rutas", {
        method: es_edicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resultado = await respuesta.json();
      if (resultado.exito) {
        fijar_mensaje_notificacion(
          es_edicion
            ? "¡Ruta actualizada exitosamente con su nuevo trazado y datos!"
            : "¡Ruta adaptada a las calles y registrada exitosamente!"
        );
        limpiar_trazado_actual();
        cargar_rutas();
      } else {
        alert(resultado.mensaje || "Error al guardar la ruta");
      }
    } catch (error) {
      alert("Error al procesar la ruta");
    } finally {
      fijar_guardando(false);
    }
  };

  const eliminar_ruta = async (id_documento: string) => {
    if (!confirm("¿Deseas eliminar esta ruta del catálogo?")) return;
    try {
      const respuesta = await fetch(`/api/rutas?id=${id_documento}`, {
        method: "DELETE",
      });
      const res = await respuesta.json();
      if (res.exito) {
        cargar_rutas();
      }
    } catch (e) {
      alert("Error al eliminar la ruta");
    }
  };

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
            <Compass className="w-3.5 h-3.5" />
            <span>GUTIÉRREZ ZAMORA, VER. // TRAZADO CARTOGRÁFICO INTELIGENTE</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            TRAZADO Y ADAPTACIÓN A CALLES
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Haz clic en los puntos clave y el sistema trazará la ruta adaptada automáticamente a las calles reales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fijar_modo_dibujo(!modo_dibujo)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono font-semibold transition-all shadow-md ${
              modo_dibujo
                ? "bg-amber-600 text-white hover:bg-amber-500"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{modo_dibujo ? "Finalizar / Salir" : "Iniciar Trazado de Calles"}</span>
          </button>
        </div>
      </div>

      {mensaje_notificacion && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center gap-2 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4" />
          <span>{mensaje_notificacion}</span>
        </div>
      )}

      {/* Cuadrícula Principal: Mapa y Panel de Herramientas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Mapa Interactivo */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
            <MapaRutas
              rutas_existentes={rutas}
              coordenadas_trazado={coordenadas_detalle}
              al_cambiar_coordenadas={manejar_actualizacion_trazado}
              puntos_clave={puntos_clave}
              color_activo={color_seleccionado}
              modo_dibujo={modo_dibujo}
              ajustar_a_calles={ajustar_a_calles}
              al_cambiar_ajuste_calles={fijar_ajustar_a_calles}
            />

            {/* Barra de Controles Rápidos del Mapa */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs font-mono">
              <div className="flex items-center gap-4">
                <span className="text-zinc-400">
                  Paradas marcadas: <strong className="text-white">{puntos_clave.length}</strong>
                </span>
                <span className="text-zinc-400">
                  Vértices de calle: <strong className="text-white">{coordenadas_detalle.length}</strong>
                </span>
                <span className="text-zinc-400">
                  Distancia vial: <strong className="text-blue-400">{distancia_calculada_km} km</strong>
                </span>
              </div>

              {puntos_clave.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={deshacer_ultimo_punto}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Deshacer Parada</span>
                  </button>
                  <button
                    onClick={limpiar_trazado_actual}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpiar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Formulario de Guardado y Catálogo */}
        <div className="lg:col-span-4 space-y-6">
          {modo_dibujo ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
                <div>
                  <span className={`text-[10px] font-mono uppercase tracking-widest flex items-center gap-1.5 ${
                    ruta_en_edicion ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    <IconoRuta className="w-3.5 h-3.5" />
                    <span>{ruta_en_edicion ? "Actualizando Ruta Existente" : "Enrutamiento Activo"}</span>
                  </span>
                  <h2 className="texto-anton text-lg tracking-wide text-white mt-1">
                    {ruta_en_edicion ? `EDITAR: ${ruta_en_edicion.nombre}` : "GUARDAR RUTA VIAL"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={limpiar_trazado_actual}
                  className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
                  title="Cancelar y cerrar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={guardar_nueva_ruta} className="space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    CÓDIGO DE RUTA (ÚNICO)
                  </label>
                  <input
                    type="text"
                    value={id_ruta}
                    onChange={(e) => fijar_id_ruta(e.target.value)}
                    placeholder="Ej: RUTA-GZ-GALEANA"
                    required
                    disabled={Boolean(ruta_en_edicion)}
                    className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono uppercase focus:outline-none focus:border-blue-500 ${
                      ruta_en_edicion ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  />
                  {ruta_en_edicion && (
                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                      El código de ruta no es editable.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    NOMBRE DE LA RUTA
                  </label>
                  <input
                    type="text"
                    value={nombre_ruta}
                    onChange={(e) => fijar_nombre_ruta(e.target.value)}
                    placeholder="Ej: Ruta Galeana - Ribera del Río"
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1">
                    DESCRIPCIÓN DE RECORRIDO
                  </label>
                  <textarea
                    value={descripcion_ruta}
                    onChange={(e) => fijar_descripcion_ruta(e.target.value)}
                    placeholder="Calles comprendidas, horarios sugeridos y observaciones..."
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono mb-1.5 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    <span>COLOR EN EL MAPA</span>
                  </label>
                  <div className="flex gap-2">
                    {colores_disponibles.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => fijar_color_seleccionado(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          color_seleccionado === c.hex
                            ? "border-white scale-110 shadow-lg"
                            : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        title={c.nombre}
                      />
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/50 space-y-1 font-mono text-[11px] text-zinc-300">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Paradas:</span>
                    <span>{puntos_clave.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Distancia vial:</span>
                    <span className="text-emerald-400 font-bold">{distancia_calculada_km} km</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={guardando || coordenadas_detalle.length < 2}
                  className={`w-full flex items-center justify-center gap-2 disabled:opacity-50 text-white font-mono font-semibold py-3 px-4 rounded-xl transition-all shadow-md text-xs uppercase ${
                    ruta_en_edicion
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-emerald-600 hover:bg-emerald-500"
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {guardando
                      ? "Guardando..."
                      : ruta_en_edicion
                      ? "Guardar Cambios de la Ruta"
                      : "Guardar Ruta"}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="texto-anton text-lg tracking-wide text-white">
                  RUTAS REGISTRADAS ({rutas.length})
                </h2>
              </div>

              {rutas.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                  No hay rutas en el catálogo. Pulsa "Iniciar Trazado de Calles" arriba.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {rutas.map((r) => (
                    <div
                      key={r._id || r.id_ruta}
                      className="p-4 bg-zinc-800/60 border border-zinc-700/60 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: r.color_mapa || "#2f63ff" }}
                          />
                          <span className="font-semibold text-white">
                            {r.nombre || "Ruta sin nombre"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => iniciar_edicion_ruta(r)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-400 hover:text-white px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-700"
                            title="Editar ruta y modificar trazado"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => eliminar_ruta(r._id)}
                            className="text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors p-1 rounded-lg"
                            title="Eliminar ruta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-400 line-clamp-2">
                        {r.descripcion || "Sin descripción"}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-700/40">
                        <span>ID: {r.id_ruta || "S/ID"}</span>
                        <span>{r.distancia_estimada_km || 0} km de calles</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
