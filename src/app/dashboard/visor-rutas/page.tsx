"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import {
  Layers,
  MapPin,
  Eye,
  Plus,
  Compass,
  ArrowUpRight,
  Filter,
  CheckCircle,
} from "lucide-react";

const VisorCartografico = dynamic(
  () => import("@/componentes/mapas/VisorCartograficoRutas"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[620px] w-full rounded-xl overflow-hidden">
        <Skeleton height={620} borderRadius="0.75rem" />
      </div>
    ),
  }
);

export default function PaginaVisorRutas() {
  const [rutas, fijar_rutas] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [ruta_seleccionada_id, fijar_ruta_seleccionada_id] = useState<string | null>(null);
  const [busqueda, fijar_busqueda] = useState("");

  const cargar_rutas = async () => {
    try {
      fijar_cargando(true);
      const res = await fetch("/api/rutas");
      const data = await res.json();
      if (data.exito) {
        fijar_rutas(data.datos || []);
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

  const rutas_filtradas = rutas.filter((r) => {
    if (!r) return false;
    const nombre = (r.nombre || "").toLowerCase();
    const id = (r.id_ruta || "").toLowerCase();
    const termino = busqueda.toLowerCase().trim();
    if (!termino) return true;
    return nombre.includes(termino) || id.includes(termino);
  });

  const ruta_activa = rutas.find((r) => r._id === ruta_seleccionada_id);

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-blue-400 mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>APARTADO DE MONITOREO // VISOR CARTOGRÁFICO DE RUTAS</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            VISOR DE RUTAS EN GUTIÉRREZ ZAMORA
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Explora las rutas trazadas, enfoca sectores específicos y ajusta el tamaño del mapa según tus necesidades.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/rutas"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Trazar Nueva Ruta</span>
          </Link>
        </div>
      </div>

      {/* Cuadrícula Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Mapa con redimensionador */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
            <VisorCartografico
              rutas={rutas}
              ruta_seleccionada_id={ruta_seleccionada_id}
              al_seleccionar_ruta={fijar_ruta_seleccionada_id}
            />
          </div>
        </div>

        {/* Columna Derecha: Catálogo y Filtro de Rutas */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span>RUTAS DISPONIBLES ({rutas.length})</span>
              </h2>

              {ruta_seleccionada_id && (
                <button
                  onClick={() => fijar_ruta_seleccionada_id(null)}
                  className="text-xs font-mono text-zinc-400 hover:text-white underline"
                >
                  Ver Todas
                </button>
              )}
            </div>

            {/* Buscador de rutas */}
            <div>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => fijar_busqueda(e.target.value)}
                placeholder="Buscar por nombre o ID de ruta..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Detalle si hay una ruta seleccionada */}
            {ruta_activa && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-blue-400 uppercase font-bold">
                    Ruta Enfocada
                  </span>
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: ruta_activa.color_mapa || "#2f63ff" }}
                  />
                </div>
                <div className="font-semibold text-white text-sm">
                  {ruta_activa.nombre}
                </div>
                <p className="text-[11px] text-zinc-300">
                  {ruta_activa.descripcion || "Sin descripción adicional."}
                </p>
                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 pt-1 border-t border-blue-500/20">
                  <span>ID: {ruta_activa.id_ruta}</span>
                  <span className="text-emerald-400 font-bold">
                    {ruta_activa.distancia_estimada_km} km viales
                  </span>
                </div>
              </div>
            )}

            {/* Lista de Rutas */}
            {cargando ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-3 bg-zinc-800/40 border border-zinc-700/40 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton circle width={10} height={10} />
                      <Skeleton width="60%" height={14} containerClassName="flex-1" />
                    </div>
                    <Skeleton width="80%" height={12} />
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-700/30">
                      <Skeleton width={70} height={10} />
                      <Skeleton width={60} height={10} />
                    </div>
                  </div>
                ))}
              </div>
            ) : rutas_filtradas.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
                {rutas.length === 0
                  ? "No hay rutas guardadas aún. Puedes trazar la primera en la sección 'Trazado de Rutas'."
                  : "No se encontraron rutas con ese criterio."}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {rutas_filtradas.map((r) => {
                  const esta_seleccionada = r._id === ruta_seleccionada_id;
                  return (
                    <button
                      key={r._id}
                      type="button"
                      onClick={() =>
                        fijar_ruta_seleccionada_id(
                          esta_seleccionada ? null : r._id
                        )
                      }
                      className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                        esta_seleccionada
                          ? "bg-zinc-800 border-blue-500 shadow-md ring-1 ring-blue-500/50"
                          : "bg-zinc-800/50 border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: r.color_mapa || "#2f63ff" }}
                          />
                          <span className="font-semibold text-white">
                            {r.nombre || "Ruta sin nombre"}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 pl-5">
                          ID: {r.id_ruta || "S/ID"} • {r.distancia_estimada_km || 0} km
                        </div>
                      </div>

                      <Eye
                        className={`w-4 h-4 ${
                          esta_seleccionada ? "text-blue-400" : "text-zinc-500"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

